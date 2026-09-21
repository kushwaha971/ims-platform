"""Owner-issued temporary credentials (DEC-012).

There is no mail provider and none is being paid for until the platform earns,
so an owner adds staff by creating the account and passing the password on by
hand. Each rule below is one that is cheap to pin now and expensive to discover
from a merchant.
"""

from __future__ import annotations

import datetime as dt
import re
from typing import Any

import pytest
from django.utils import timezone

from apps.common.constants import RoleCode
from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation
from apps.platform_app.constants import MembershipStatus
from apps.platform_app.models import AuditLog
from apps.platform_app.services import credentials, passwords


def _ctx(user: Any, tenant: Any) -> Ctx:
    return Ctx(actor=user, tenant=tenant, request_id="test-request")


# ── the generator ────────────────────────────────────────────────────────────


def test_generated_passwords_come_from_a_csprng_not_the_mersenne_twister() -> None:
    """BrandHub's `temp_password_utils` draws from `random`. This must not.

    `random.choice` is the Mersenne Twister: a deterministic sequence whose
    internal state is recoverable from enough outputs, and which two processes
    seeded alike produce identically. For shuffling that is fine; for minting a
    credential it means the passwords are predictable in principle.

    This asserts the module never reaches for `random`, because the failure is
    invisible at runtime — the output looks exactly as random as the real
    thing — and a later edit that "simplifies" the import would reintroduce it
    silently.
    """
    import inspect

    source = inspect.getsource(credentials)
    assert "import secrets" in source
    assert not re.search(r"^import random|^from random", source, re.MULTILINE)


def test_generated_password_has_no_characters_that_look_like_each_other() -> None:
    """It is read off one phone and typed into another by somebody who did not choose it.

    `I`/`l`/`1` and `O`/`0` are the whole reason a merchant reports "the
    password you sent does not work". They are excluded by construction rather
    than by luck, so this samples enough draws to catch a regression in the
    alphabet.
    """
    for _ in range(60):
        value = credentials.generate_temp_password()
        assert not set(value) & set("IlO01")
        assert re.fullmatch(r"[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}", value)


def test_generated_password_always_satisfies_the_products_own_policy(
    tenant: Any, user: Any
) -> None:
    """A generator that can emit a password its own policy refuses is a 500 waiting.

    `passwords.validate()` requires a letter and a digit. The generator draws
    from an alphabet containing both but does not *guarantee* both in any one
    draw, so it re-draws — and this is what proves the re-draw is right rather
    than merely present.
    """
    for _ in range(60):
        value = credentials.generate_temp_password()
        assert any(c.isalpha() for c in value)
        assert any(c.isdigit() for c in value)
        passwords.validate(user=user, password=value)


def test_two_calls_never_agree() -> None:
    assert len({credentials.generate_temp_password() for _ in range(500)}) == 500


# ── creating a member ────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_create_member_returns_the_password_once_and_stores_only_its_hash(
    tenant: Any, user: Any, system_roles: dict
) -> None:
    """The plaintext exists in the return value and nowhere else.

    BrandHub keeps it Fernet-encrypted so an admin can read it back. That is the
    one part of the pattern deliberately not copied: `regenerate()` gives the
    same outcome without a decryptable password at rest, and without the
    `cryptography` dependency ADR-021 does not admit.
    """
    issued = credentials.create_member(
        tenant=tenant,
        role=system_roles[RoleCode.STAFF.value],
        email="Salesman@Shop.test",
        full_name="Ramesh Kumar",
        actor=user,
        ctx=_ctx(user, tenant),
    )

    assert issued.created_user is True
    assert issued.password
    assert issued.user.email == "salesman@shop.test"
    # The hash verifies the plaintext, and the plaintext is not in the row.
    assert issued.user.check_password(issued.password)
    assert issued.password not in issued.user.password
    assert issued.user.must_change_password is True
    assert issued.user.password_expires_at is not None
    assert issued.membership.status == MembershipStatus.ACTIVE


@pytest.mark.django_db
def test_the_password_is_never_written_to_the_audit_log(
    tenant: Any, user: Any, system_roles: dict
) -> None:
    """An audit row a support engineer can read is an audit row that hands them the account."""
    issued = credentials.create_member(
        tenant=tenant,
        role=system_roles[RoleCode.STAFF.value],
        email="staff@shop.test",
        full_name="Staff Person",
        actor=user,
        ctx=_ctx(user, tenant),
    )
    everything = "".join(
        str(row) for row in AuditLog.objects.values_list("before", "after", "metadata")
    )
    assert issued.password not in everything


@pytest.mark.django_db
def test_an_address_that_already_has_an_account_keeps_its_own_password(
    tenant: Any, user: Any, system_roles: dict, django_user_model: Any
) -> None:
    """Otherwise this endpoint is an account takeover with a friendly name.

    The person may own another business on this platform. Resetting their
    password because a stranger typed their address into an "add staff" form
    would hand that stranger nothing — they never see the password — but it
    would lock the real owner out of their own books, and a support queue full
    of that is indistinguishable from an attack.
    """
    existing = django_user_model.objects.create_user(
        email="already@shop.test", password="TheirOwn123", full_name="Already Here"
    )
    before = existing.password

    issued = credentials.create_member(
        tenant=tenant,
        role=system_roles[RoleCode.STAFF.value],
        email="already@shop.test",
        full_name="Ignored Name",
        actor=user,
        ctx=_ctx(user, tenant),
    )

    existing.refresh_from_db()
    assert issued.created_user is False
    assert issued.password == ""  # the view renders this as null, not a credential
    assert existing.password == before
    assert existing.check_password("TheirOwn123")
    assert existing.must_change_password is False
    assert issued.membership.user_id == existing.id


@pytest.mark.django_db
def test_adding_somebody_already_on_the_team_is_refused(
    tenant: Any, user: Any, system_roles: dict
) -> None:
    credentials.create_member(
        tenant=tenant,
        role=system_roles[RoleCode.STAFF.value],
        email="twice@shop.test",
        full_name="Twice Added",
        actor=user,
        ctx=_ctx(user, tenant),
    )
    with pytest.raises(BusinessRuleViolation) as exc:
        credentials.create_member(
            tenant=tenant,
            role=system_roles[RoleCode.STAFF.value],
            email="twice@shop.test",
            full_name="Twice Added",
            actor=user,
            ctx=_ctx(user, tenant),
        )
    assert exc.value.code == "validation_error"


# ── regenerating ─────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_regenerate_kills_the_old_password_and_any_session_on_it(
    tenant: Any, user: Any, system_roles: dict
) -> None:
    """The owner lost the message, or seven days passed. One click, and the old one dies.

    `token_epoch` moves too: if the old password leaked, a live session is the
    hole that changing the password alone would leave open (Part 27 §27.4.4
    step 2).
    """
    issued = credentials.create_member(
        tenant=tenant,
        role=system_roles[RoleCode.STAFF.value],
        email="lost@shop.test",
        full_name="Lost Message",
        actor=user,
        ctx=_ctx(user, tenant),
    )
    old_password, old_epoch = issued.password, issued.user.token_epoch

    again = credentials.regenerate(membership=issued.membership, actor=user, ctx=_ctx(user, tenant))

    again.user.refresh_from_db()
    assert again.password != old_password
    assert again.user.check_password(again.password)
    assert not again.user.check_password(old_password)
    assert again.user.token_epoch > old_epoch
    assert again.user.must_change_password is True


@pytest.mark.django_db
def test_regenerate_is_refused_once_the_person_has_chosen_their_own_password(
    tenant: Any, user: Any, system_roles: dict
) -> None:
    """This is the line between a resend and an account takeover.

    Before the staff member picks a password, the owner is re-sending something
    the owner issued. After, the same button would let an owner walk into an
    account and every audit entry written afterwards would name somebody who
    could no longer get in to dispute it. The way back from a forgotten password
    is the reset link, which only its owner can complete.
    """
    issued = credentials.create_member(
        tenant=tenant,
        role=system_roles[RoleCode.STAFF.value],
        email="settled@shop.test",
        full_name="Settled Staff",
        actor=user,
        ctx=_ctx(user, tenant),
    )
    passwords.set_password(
        user=issued.user,
        new_password="ChosenByMe42",
        current_password=issued.password,
    )
    issued.membership.refresh_from_db()

    with pytest.raises(BusinessRuleViolation) as exc:
        credentials.regenerate(membership=issued.membership, actor=user, ctx=_ctx(user, tenant))
    assert exc.value.code == "validation_error"


# ── the gate coming down ─────────────────────────────────────────────────────


@pytest.mark.django_db
def test_choosing_a_password_lowers_the_gate_and_clears_the_expiry(
    tenant: Any, user: Any, system_roles: dict
) -> None:
    """Both fields, together, or the person is locked out by their own password.

    If `must_change_password` cleared and `password_expires_at` did not, the
    password they chose would stop working on the invitation's seven-day
    schedule — DigiKhaato has no password-ageing policy and must not acquire one
    by accident through a field nobody remembered to clear.
    """
    issued = credentials.create_member(
        tenant=tenant,
        role=system_roles[RoleCode.STAFF.value],
        email="chooser@shop.test",
        full_name="Chooser",
        actor=user,
        ctx=_ctx(user, tenant),
    )
    passwords.set_password(
        user=issued.user, new_password="MyOwnPass99", current_password=issued.password
    )

    issued.user.refresh_from_db()
    assert issued.user.must_change_password is False
    assert issued.user.password_expires_at is None
    assert issued.user.is_temporary_password_expired is False


@pytest.mark.django_db
def test_a_reset_lowers_the_gate_too(tenant: Any, user: Any, system_roles: dict) -> None:
    """ "Forgot password" is equally a chosen password.

    Without this, somebody who reset rather than used the change screen would
    set a password that works and still be refused every route by the gate —
    signed in, and unable to reach anything.
    """
    issued = credentials.create_member(
        tenant=tenant,
        role=system_roles[RoleCode.STAFF.value],
        email="resetter@shop.test",
        full_name="Resetter",
        actor=user,
        ctx=_ctx(user, tenant),
    )
    passwords.reset_password(user=issued.user, new_password="Bahikhata88")

    issued.user.refresh_from_db()
    assert issued.user.must_change_password is False
    assert issued.user.password_expires_at is None


@pytest.mark.django_db
def test_expiry_is_only_ever_true_for_a_temporary_password(
    tenant: Any, user: Any, system_roles: dict
) -> None:
    issued = credentials.create_member(
        tenant=tenant,
        role=system_roles[RoleCode.STAFF.value],
        email="aging@shop.test",
        full_name="Aging",
        actor=user,
        ctx=_ctx(user, tenant),
    )
    assert issued.user.is_temporary_password_expired is False

    issued.user.password_expires_at = timezone.now() - dt.timedelta(seconds=1)
    issued.user.save(update_fields=["password_expires_at"])
    assert issued.user.is_temporary_password_expired is True

    # An ordinary account has no expiry and can never trip this, however old.
    assert user.password_expires_at is None
    assert user.is_temporary_password_expired is False
