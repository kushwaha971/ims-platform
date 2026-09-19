"""Email as the identity, mobile as a profile field (DEC-010).

The unit level of what `test_passwords.py` asserts through the API: the
normaliser, the masker, the unique index, and the proposition that nothing
outside the profile still needs a merchant to have a phone number.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.db import IntegrityError, transaction

from apps.platform_app.email import InvalidEmail, is_valid_email, mask_email, normalise_email

pytestmark = pytest.mark.django_db


# ── Normalisation ────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "raw",
    [
        "ramesh@example.com",
        "Ramesh@Example.com",
        "  RAMESH@EXAMPLE.COM  ",
        "ramesh@EXAMPLE.com",
    ],
)
def test_every_accepted_spelling_normalises_to_one(raw: str) -> None:
    """One `platform_user` per address means one spelling, as with the mobile."""
    assert normalise_email(raw) == "ramesh@example.com"


@pytest.mark.parametrize(
    "raw",
    ["", "   ", None, "not-an-email", "a@", "@b.com", "a b@example.com", "ramesh@", 12345],
)
def test_a_value_that_is_not_an_address_is_refused(raw: Any) -> None:
    with pytest.raises(InvalidEmail):
        normalise_email(raw)


def test_an_address_over_the_column_width_is_refused() -> None:
    """Part 21 §21.3.1: `varchar(254)`. A value the column cannot hold is not valid."""
    too_long = f"{'a' * 250}@example.com"
    assert len(too_long) > 254
    with pytest.raises(InvalidEmail):
        normalise_email(too_long)


def test_is_valid_email_is_the_boolean_of_the_same_rule() -> None:
    assert is_valid_email(" Ramesh@Example.com ") is True
    assert is_valid_email("nope") is False


@pytest.mark.parametrize(
    ("raw", "masked"),
    [
        ("ramesh@example.com", "r****h@example.com"),
        ("ab@example.com", "a…@example.com"),
        ("a@example.com", "a…@example.com"),
        ("not-an-address", "…"),
    ],
)
def test_masking_keeps_the_domain_and_hides_the_person(raw: str, masked: str) -> None:
    """Part 26 §26.9 R9.3. The domain is what tells the owner which mailbox it was."""
    assert mask_email(raw) == masked


# ── The unique index ─────────────────────────────────────────────────────────


def test_two_users_cannot_share_an_address(db: Any) -> None:
    from apps.platform_app.models import User

    User.objects.create_user(email="shared@example.com", password="Kirana1234", full_name="A")
    with pytest.raises(IntegrityError), transaction.atomic():
        User.objects.create_user(email="shared@example.com", password="Kirana1234", full_name="B")


def test_the_manager_lower_cases_before_the_index_sees_it(db: Any) -> None:
    """Case-insensitive uniqueness, obtained by normalising rather than by a citext."""
    from apps.platform_app.models import User

    created = User.objects.create_user(
        email="  MiXeD@Example.COM ", password="Kirana1234", full_name="A"
    )
    assert created.email == "mixed@example.com"
    with pytest.raises(IntegrityError), transaction.atomic():
        User.objects.create_user(email="mixed@example.com", password="Kirana1234", full_name="B")


def test_the_natural_key_lookup_is_case_insensitive(db: Any) -> None:
    """`manage.py` and Django's own machinery go through `get_by_natural_key`."""
    from apps.platform_app.models import User

    user = User.objects.create_user(
        email="natural@example.com", password="Kirana1234", full_name="A"
    )
    assert User.objects.get_by_natural_key(" Natural@Example.com ") == user


def test_email_is_the_username_field(db: Any) -> None:
    from apps.platform_app.models import User

    assert User.USERNAME_FIELD == "email"
    assert "mobile" not in User.REQUIRED_FIELDS


# ── Mobile is optional everywhere ────────────────────────────────────────────


def test_a_user_needs_no_mobile(db: Any) -> None:
    from apps.platform_app.models import User

    user = User.objects.create_user(
        email="nomobile@example.com", password="Kirana1234", full_name="No Phone"
    )
    assert user.mobile is None
    assert str(user) == "No Phone <nomobile@example.com>"


def test_a_blank_mobile_is_stored_as_null_not_as_an_empty_string(db: Any) -> None:
    """Two empty strings collide under a unique index; two NULLs do not."""
    from apps.platform_app.models import User

    first = User.objects.create_user(
        email="blank1@example.com", password="Kirana1234", full_name="A", mobile=""
    )
    second = User.objects.create_user(
        email="blank2@example.com", password="Kirana1234", full_name="B", mobile=""
    )
    assert first.mobile is None and second.mobile is None


def test_two_users_cannot_share_a_mobile_when_they_have_one(db: Any) -> None:
    """The number stopped being the identifier; it did not stop identifying."""
    from apps.platform_app.models import User

    User.objects.create_user(
        email="one@example.com", password="Kirana1234", full_name="A", mobile="+919876543210"
    )
    with pytest.raises(IntegrityError), transaction.atomic():
        User.objects.create_user(
            email="two@example.com", password="Kirana1234", full_name="B", mobile="+919876543210"
        )


def test_a_merchant_with_no_mobile_can_create_a_business(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    """PLT-03 BR-6 defaults `tenant.phone` to the owner's number; there may be none."""
    from django.urls import reverse

    from apps.platform_app.models import Tenant, User

    owner = User.objects.create_user(
        email="phoneless@example.com", password="Kirana1234", full_name="Phoneless"
    )
    client, _member = api_as(tenant, user=owner)
    response = client.post(
        reverse("v1:tenant-create"),
        {"name": "Phoneless Stores", "business_type": "retail", "state_code": "27"},
        format="json",
        HTTP_IDEMPOTENCY_KEY="phoneless-1",
    )
    assert response.status_code == 201, response.content
    created = Tenant.objects.get(pk=response.json()["data"]["tenant"]["id"])
    assert created.phone == ""


def test_the_session_payload_carries_both_and_marks_mobile_optional(
    auth_client: Any, user: Any
) -> None:
    """The frontend reads `user.email` as the identity and `user.mobile` as a field."""
    from apps.platform_app.selectors.session_payload import user_block

    block = user_block(user)
    assert block["email"] == user.email
    assert block["mobile"] == user.mobile

    user.mobile = None
    user.save(update_fields=["mobile"])
    assert user_block(user)["mobile"] is None
    assert user_block(user)["email"] == user.email


# ── The retired OTP path still produces a valid row ──────────────────────────


def test_an_otp_created_account_gets_a_synthetic_unroutable_address(db: Any) -> None:
    """`email` is NOT NULL, and an OTP sign-up has no address to put in it.

    RFC 2606 §2 reserves `.invalid` so that such a value can never be delivered
    to by accident. The account is reachable by OTP and by nothing else, which
    is the honest description of an account whose only proof is a phone number.
    """
    from apps.platform_app.services.auth import get_or_create_user, synthetic_email_for

    assert synthetic_email_for("+919876543210") == "919876543210@mobile.invalid"
    user, is_new = get_or_create_user(mobile="+919876543210")
    assert is_new is True
    assert user.email == "919876543210@mobile.invalid"
    assert user.mobile == "+919876543210"
    assert not user.has_usable_password()

    again, is_new_again = get_or_create_user(mobile="+919876543210")
    assert (again.pk, is_new_again) == (user.pk, False)
