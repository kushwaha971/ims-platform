"""The HTTP layer of DEC-012 — `GET`/`POST /members`, `POST /members/{id}/credentials`.

The service rules are pinned next door in `test_credentials.py`. These are the
four things only the endpoint can get wrong: who may call it, which tenant's
rows it can reach, what leaves the process in the body, and — the one this
feature lives or dies on — whether the forced password change is actually
enforced by the server or merely suggested to the client.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.apps import apps as django_apps
from django.urls import reverse
from django.utils import timezone

from apps.common.constants import RoleCode

LIST_URL = "v1:member-list"


def _credentials_url(membership_id: Any) -> str:
    return reverse("v1:member-credentials", kwargs={"membership_id": str(membership_id)})


def _create(client: Any, **overrides: Any) -> Any:
    body = {
        "email": "ramesh@shop.test",
        "full_name": "Ramesh Kumar",
        "role": "staff",
        **overrides,
    }
    return client.post(reverse(LIST_URL), body, format="json")


def _login(email: str, password: str) -> Any:
    """Sign in the way the new staff member's browser would, and keep the token."""
    from rest_framework.test import APIClient

    client = APIClient()
    response = client.post(
        reverse("v1:auth-login"),
        {"email": email, "password": password},
        format="json",
        # PLT-01 FR-4: only a caller declaring itself an API client is handed
        # the token in the body. A browser gets the httpOnly cookie instead.
        HTTP_X_CLIENT="api",
    )
    assert response.status_code == 200, response.content
    token = response.json()["data"]["access_token"]
    signed_in = APIClient()
    signed_in.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return signed_in, response


# ── Creating ─────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_creating_a_member_returns_credentials_that_actually_sign_in(
    api_as: Any, tenant: Any
) -> None:
    """The whole feature in one assertion: the password in the body works.

    Nothing else in the system can tell whether it does. Only the hash is
    stored, so a view that returned a password it never set, or set one it never
    returned, would look identical in the database and in every unit test — and
    would be discovered by a merchant whose new salesman cannot sign in.
    """
    client, _ = api_as(tenant)

    response = _create(client)

    assert response.status_code == 201, response.content
    data = response.json()["data"]
    assert data["created_user"] is True
    assert data["email"] == "ramesh@shop.test"
    assert data["password"]
    assert data["password_expires_at"]
    assert data["member"]["must_change_password"] is True

    _login("ramesh@shop.test", data["password"])


@pytest.mark.django_db
def test_the_password_never_appears_in_any_other_response(api_as: Any, tenant: Any) -> None:
    """Created once, in one body. The list is the path that would leak it silently."""
    client, _ = api_as(tenant)
    password = _create(client).json()["data"]["password"]

    listing = client.get(reverse(LIST_URL))
    assert listing.status_code == 200
    assert password not in listing.content.decode()

    row = listing.json()["data"][0]
    assert "password" not in row
    assert set(row) == {
        "id",
        "user_id",
        "email",
        "full_name",
        "mobile",
        "role",
        "status",
        "joined_at",
        "last_login_at",
        "must_change_password",
        "password_expires_at",
    }


@pytest.mark.django_db
def test_the_idempotency_replay_row_does_not_keep_the_password(api_as: Any, tenant: Any) -> None:
    """That row lives 24 hours in the database every support engineer can read.

    The decorator stores the 201 body for replay, so without stripping it the
    plaintext would be at rest after all — by the side door, exactly the way
    `invite()` avoids for its token.
    """
    client, _ = api_as(tenant)
    key = {"HTTP_IDEMPOTENCY_KEY": "member-create-once"}

    first = client.post(reverse(LIST_URL), _body(), format="json", **key)
    assert first.status_code == 201
    password = first.json()["data"]["password"]

    stored = django_apps.get_model("platform", "IdempotencyKey").objects.get()
    assert password not in str(stored.response_body)

    replay = client.post(reverse(LIST_URL), _body(), format="json", **key)
    assert replay.json()["data"]["password"] is None


def _body() -> dict:
    return {"email": "ramesh@shop.test", "full_name": "Ramesh Kumar", "role": "staff"}


@pytest.mark.django_db
def test_owner_cannot_be_granted_through_this_endpoint(api_as: Any, tenant: Any) -> None:
    """Canon §0.7: a business has one owner and ownership is transferred.

    An "add staff" form that mints a second owner is a privilege-escalation path
    wearing an onboarding costume.
    """
    client, _ = api_as(tenant)
    response = _create(client, role="owner")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"


@pytest.mark.django_db
def test_staff_may_not_add_members(api_as: Any, tenant: Any) -> None:
    """`platform.members.manage` is owner and admin only (canon §0.9)."""
    client, _ = api_as(tenant, role=RoleCode.STAFF.value)
    assert _create(client).status_code == 403
    assert client.get(reverse(LIST_URL)).status_code == 403


@pytest.mark.django_db
def test_another_businesss_membership_is_404_and_never_403(
    api_as: Any, two_tenants_full: dict
) -> None:
    """Canon §0.11 rule 2. A 403 would confirm the row exists."""
    client, _ = api_as(two_tenants_full["a"]["tenant"])
    other_membership = two_tenants_full["b"]["membership"]

    response = client.post(_credentials_url(other_membership.id))
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


# ── The gate ─────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_a_temporary_password_reaches_the_change_screen_and_nothing_else(
    api_as: Any, tenant: Any
) -> None:
    """The gate is server-side and fails closed, which is the point of DEC-012.

    If this were only a client-side redirect, anyone holding a password an owner
    sent over WhatsApp could read that business's books with `curl` and never
    change it. So a business route is refused with a code the client can act on,
    while the handful of routes needed to *complete* the change still answer.
    """
    client, _ = api_as(tenant)
    issued = _create(client).json()["data"]
    staff, _login_response = _login("ramesh@shop.test", issued["password"])

    blocked = staff.get(reverse("v1:party-list"))
    assert blocked.status_code == 403
    assert blocked.json()["error"]["code"] == "password_change_required"

    # ...and the ones that let them out of it.
    assert staff.get(reverse("v1:auth-me")).status_code == 200


@pytest.mark.django_db
def test_the_session_says_the_gate_is_up_so_the_client_can_route(api_as: Any, tenant: Any) -> None:
    """Without this the client cannot tell "choose a password" from "not allowed".

    Both are 403s. A new staff member's first ever login would land on a dead-end
    error screen instead of the one screen they are able to use.
    """
    client, _ = api_as(tenant)
    issued = _create(client).json()["data"]
    staff, _ = _login("ramesh@shop.test", issued["password"])

    me = staff.get(reverse("v1:auth-me")).json()["data"]
    assert me["user"]["must_change_password"] is True
    assert me["user"]["password_expires_at"]


@pytest.mark.django_db
def test_changing_the_password_opens_everything_up(api_as: Any, tenant: Any) -> None:
    """The gate lifts on the same request that sets the password, with no re-login."""
    client, _ = api_as(tenant)
    issued = _create(client).json()["data"]
    staff, _ = _login("ramesh@shop.test", issued["password"])

    changed = staff.post(
        reverse("v1:auth-password-set"),
        {"current_password": issued["password"], "new_password": "Dukaan2026x"},
        format="json",
    )
    assert changed.status_code == 200, changed.content

    assert staff.get(reverse("v1:party-list")).status_code == 200
    assert staff.get(reverse("v1:auth-me")).json()["data"]["user"]["must_change_password"] is False


@pytest.mark.django_db
def test_an_expired_temporary_password_is_refused_rather_than_routed(
    api_as: Any, tenant: Any
) -> None:
    """The window has passed; the way back is the owner reissuing, not the old message.

    Deliberately not `password_change_required`: that code invites the client to
    show the change screen, and a change the server will refuse is a worse
    experience than a clear "ask for a new one".
    """
    client, _ = api_as(tenant)
    issued = _create(client).json()["data"]
    staff, _ = _login("ramesh@shop.test", issued["password"])

    user = django_apps.get_model("platform", "User").objects.get(email="ramesh@shop.test")
    user.password_expires_at = timezone.now() - dt.timedelta(seconds=1)
    user.save(update_fields=["password_expires_at"])

    response = staff.get(reverse("v1:auth-me"))
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "password_expired"


@pytest.mark.django_db
def test_regenerating_throws_out_a_session_held_on_the_old_password(
    api_as: Any, tenant: Any
) -> None:
    """Changing the hash alone would leave a live session open on a leaked password."""
    client, _ = api_as(tenant)
    issued = _create(client).json()["data"]
    staff, _ = _login("ramesh@shop.test", issued["password"])
    assert staff.get(reverse("v1:auth-me")).status_code == 200

    again = client.post(_credentials_url(issued["member"]["id"]))
    assert again.status_code == 200
    assert again.json()["data"]["password"] != issued["password"]

    assert staff.get(reverse("v1:auth-me")).status_code == 401
    _login("ramesh@shop.test", again.json()["data"]["password"])


# ── A mobile number another login already holds (NEW-2) ──────────────────────


@pytest.mark.django_db
def test_a_mobile_another_login_holds_is_a_400_on_the_field_not_a_500(
    api_as: Any, tenant: Any
) -> None:
    """NEW-2: a taken number reached the INSERT and `uq_user_mobile_notnull` answered 500.

    The number is optional on this form and a correctable input, so the owner
    must be told which field to change — and that leaving it blank is fine —
    rather than shown "Something went wrong" for a form they cannot fix. The
    platform-wide rule itself (one account per number) stays exactly as it was.
    """
    from tests.factories.platform import UserFactory

    holder = UserFactory(mobile="+919876543210")
    client, _ = api_as(tenant)

    response = _create(client, mobile="+919876543210")

    assert response.status_code == 400, response.content
    error = response.json()["error"]
    assert error["code"] == "validation_error"
    assert error["details"] == {
        "mobile": [
            "This mobile number is already used by another login. "
            "Leave it blank or use a different number."
        ]
    }
    # It says a login holds the number and nothing about whose.
    assert holder.email not in response.content.decode()


@pytest.mark.django_db
def test_a_differently_spelt_taken_mobile_is_refused_the_same_way(api_as: Any, tenant: Any) -> None:
    """NEW-2: `98765 43210` is the same number as `+919876543210`.

    The serializer did not normalise, so any spelling but the stored E.164 one
    walked past a uniqueness check and wrote a second spelling of a number the
    platform already holds — the index cannot see that they are equal.
    """
    from tests.factories.platform import UserFactory

    UserFactory(mobile="+919876543210")
    client, _ = api_as(tenant)

    response = _create(client, mobile="98765 43210")

    assert response.status_code == 400, response.content
    assert set(response.json()["error"]["details"]) == {"mobile"}


@pytest.mark.django_db
def test_a_refused_mobile_writes_nothing_and_releases_the_idempotency_key(
    api_as: Any, tenant: Any
) -> None:
    """NEW-2: no half-made account, and the corrected retry is not met with a 409.

    The dialog rotates its key on a validation error, but a client that retries
    with the SAME key and the number removed is equally legitimate. A key left
    `in_progress` — or a `platform_user` without its membership, or an audit
    row for a member who does not exist — would each outlive the 400.
    """
    from tests.factories.platform import UserFactory

    UserFactory(mobile="+919876543210")
    client, _ = api_as(tenant)
    User = django_apps.get_model("platform", "User")
    Membership = django_apps.get_model("platform", "Membership")
    IdempotencyKey = django_apps.get_model("platform", "IdempotencyKey")
    AuditLog = django_apps.get_model("platform", "AuditLog")
    members_before = Membership.objects.filter(tenant=tenant).count()
    audits_before = AuditLog.objects.count()
    key = {"HTTP_IDEMPOTENCY_KEY": "member-create-new2"}

    refused = client.post(
        reverse(LIST_URL), {**_body(), "mobile": "+919876543210"}, format="json", **key
    )

    assert refused.status_code == 400, refused.content
    assert not User.objects.filter(email="ramesh@shop.test").exists()
    assert Membership.objects.filter(tenant=tenant).count() == members_before
    assert AuditLog.objects.count() == audits_before
    assert not IdempotencyKey.objects.filter(key="member-create-new2").exists()

    retried = client.post(reverse(LIST_URL), {**_body(), "mobile": ""}, format="json", **key)

    assert retried.status_code == 201, retried.content
    assert retried.json()["data"]["member"]["mobile"] is None


@pytest.mark.django_db
def test_an_existing_account_is_added_whatever_mobile_the_owner_typed(
    api_as: Any, tenant: Any
) -> None:
    """NEW-2 must not over-reach: an existing account's profile is never rewritten.

    Adding somebody who already has a login only grants access; the number
    typed is not written, so it cannot collide and must not be refused — here
    it is that person's own number, which the unique index already holds.
    """
    from tests.factories.platform import UserFactory

    UserFactory(email="ramesh@shop.test", mobile="+919876543210")
    client, _ = api_as(tenant)

    own = _create(client, mobile="+919876543210")
    assert own.status_code == 201, own.content
    assert own.json()["data"]["created_user"] is False
