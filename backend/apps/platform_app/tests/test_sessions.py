"""Refresh rotation, family revocation, the token epoch and logout.

`PLT-01` FR-4/§14 and T-PLT-01-8; Part 20 §20.5.2–§20.5.3; Part 27 §27.4.3–§27.4.4.
Tier 1: every rule here decides whether a stolen token still works.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.urls import reverse
from django.utils import timezone

pytestmark = pytest.mark.django_db

REFRESH_URL = "v1:auth-refresh"
LOGOUT_URL = "v1:auth-logout"
ME_URL = "v1:auth-me"
PARTY_LIST_URL = "v1:party-list"


def _login(auth_client: Any, membership: Any) -> dict:
    membership.user.set_password("Kirana1234")
    membership.user.save(update_fields=["password"])
    response = auth_client.post(
        reverse("v1:auth-login"),
        {"email": membership.user.email, "password": "Kirana1234"},
        format="json",
    )
    assert response.status_code == 200
    return response.json()["data"]


# ── Rotation ─────────────────────────────────────────────────────────────────


def test_refresh_rotates_the_token_and_chains_the_session(
    auth_client: Any, membership: Any
) -> None:
    """Part 20 §20.5.2 step 4: a new row in the same family, the old one replaced."""
    from apps.platform_app.models import Session

    data = _login(auth_client, membership)
    old_refresh = data["refresh_token"]

    rotated = auth_client.post(reverse(REFRESH_URL), {"refresh_token": old_refresh}, format="json")
    assert rotated.status_code == 200
    new_refresh = rotated.json()["data"]["refresh_token"]
    assert new_refresh != old_refresh

    sessions = list(Session.objects.filter(user=membership.user).order_by("created_at"))
    assert len(sessions) == 2
    assert sessions[0].replaced_by_id == sessions[1].id
    assert sessions[0].revoked_at is not None
    assert sessions[1].revoked_at is None
    assert sessions[0].family_id == sessions[1].family_id


def test_reusing_an_old_refresh_token_revokes_the_whole_family(
    auth_client: Any, membership: Any
) -> None:
    """T-PLT-01-8 / Part 20 §20.5.2 step 3 / Part 27 §27.4.4."""
    from apps.platform_app.models import AuditLog, Session

    data = _login(auth_client, membership)
    old_refresh = data["refresh_token"]
    rotated = auth_client.post(reverse(REFRESH_URL), {"refresh_token": old_refresh}, format="json")
    fresh_refresh = rotated.json()["data"]["refresh_token"]

    replayed = auth_client.post(reverse(REFRESH_URL), {"refresh_token": old_refresh}, format="json")
    assert replayed.status_code == 401
    assert replayed.json()["error"]["code"] == "session_revoked"

    assert not Session.objects.filter(user=membership.user, revoked_at__isnull=True).exists()
    assert AuditLog.objects.filter(action="auth.refresh_reuse_detected").exists()

    # The token that was legitimately issued is dead too — that is the point.
    after = auth_client.post(reverse(REFRESH_URL), {"refresh_token": fresh_refresh}, format="json")
    assert after.status_code == 401


def test_an_unknown_refresh_token_is_invalid_token_not_session_revoked(
    auth_client: Any,
) -> None:
    """Part 20 §20.5.2 step 2: "If the row does not exist → 401 `invalid_token`"."""
    response = auth_client.post(
        reverse(REFRESH_URL), {"refresh_token": "not-a-token"}, format="json"
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_token"


def test_an_expired_session_cannot_be_refreshed(auth_client: Any, membership: Any) -> None:
    from apps.platform_app.models import Session

    data = _login(auth_client, membership)
    Session.objects.filter(user=membership.user).update(
        expires_at=timezone.now() - dt.timedelta(seconds=1)
    )
    response = auth_client.post(
        reverse(REFRESH_URL), {"refresh_token": data["refresh_token"]}, format="json"
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_token"


def test_refresh_fails_once_the_membership_is_revoked(auth_client: Any, membership: Any) -> None:
    """PLT-04 EC-1: a membership that went away does not survive to token expiry."""
    from apps.platform_app.models import MembershipStatus

    data = _login(auth_client, membership)
    membership.status = MembershipStatus.SUSPENDED
    membership.save(update_fields=["status"])

    response = auth_client.post(
        reverse(REFRESH_URL), {"refresh_token": data["refresh_token"]}, format="json"
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "session_revoked"


def test_the_browser_cookie_is_accepted_without_a_body(auth_client: Any, membership: Any) -> None:
    """Part 22 §22.1: the browser sends `ub_refresh`, path-scoped to this endpoint."""
    _login(auth_client, membership)
    response = auth_client.post(reverse(REFRESH_URL), {}, format="json")
    assert response.status_code == 200
    assert "ub_access" in response.cookies


# ── `token_epoch` (Part 21 §21.3.1, Part 27 §27.4.4 step 2) ──────────────────


def test_bumping_the_token_epoch_kills_every_outstanding_access_token(
    api_as: Any, tenant: Any
) -> None:
    """The only mechanism that cuts an access token inside its fifteen minutes."""
    client, member = api_as(tenant)
    assert client.get(reverse(PARTY_LIST_URL)).status_code == 200

    member.user.token_epoch += 1
    member.user.save(update_fields=["token_epoch"])

    refused = client.get(reverse(PARTY_LIST_URL))
    assert refused.status_code == 401
    assert refused.json()["error"]["code"] == "session_revoked"


def test_a_token_with_no_epoch_claim_is_refused(api_as: Any, tenant: Any) -> None:
    """An absent claim must never be read as a passing one."""
    from rest_framework.test import APIClient
    from rest_framework_simplejwt.tokens import AccessToken

    _client, member = api_as(tenant)
    token = AccessToken.for_user(member.user)
    token["tid"] = str(member.tenant_id)
    token["rol"] = member.role.code
    token["ver"] = member.permissions_version
    token["sid"] = str(member.id)

    bare = APIClient()
    bare.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    response = bare.get(reverse(PARTY_LIST_URL))
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "session_revoked"


def test_bumping_the_epoch_also_kills_the_refresh_token(auth_client: Any, membership: Any) -> None:
    data = _login(auth_client, membership)
    membership.user.token_epoch += 1
    membership.user.save(update_fields=["token_epoch"])

    response = auth_client.post(
        reverse(REFRESH_URL), {"refresh_token": data["refresh_token"]}, format="json"
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "session_revoked"


def test_a_refresh_token_is_not_a_credential_for_anything_else(
    auth_client: Any, membership: Any
) -> None:
    """`typ` must be `access`: a refresh token buys nothing but a rotation."""
    from rest_framework.test import APIClient

    data = _login(auth_client, membership)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {data['refresh_token']}")
    response = client.get(reverse(ME_URL))
    assert response.status_code == 401


# ── Logout (Part 27 §27.4.3) ─────────────────────────────────────────────────


def test_logout_revokes_the_current_session_only(auth_client: Any, membership: Any) -> None:
    from apps.platform_app.models import Session
    from apps.platform_app.services import sessions as session_service

    data = _login(auth_client, membership)
    elsewhere = session_service.issue(
        user=membership.user, tenant=membership.tenant, membership=membership
    )

    auth_client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {data['access_token']}", HTTP_X_CLIENT="api"
    )
    response = auth_client.post(reverse(LOGOUT_URL))
    assert response.status_code == 200
    assert response.json()["data"]["sessions_revoked"] == 1

    elsewhere.session.refresh_from_db()
    assert elsewhere.session.revoked_at is None
    assert Session.objects.filter(user=membership.user, revoked_at__isnull=True).count() == 1
    assert response.cookies["ub_access"].value == ""


def test_logout_all_revokes_every_session(auth_client: Any, membership: Any) -> None:
    from apps.platform_app.models import Session
    from apps.platform_app.services import sessions as session_service

    data = _login(auth_client, membership)
    session_service.issue(user=membership.user, tenant=membership.tenant, membership=membership)
    session_service.issue(user=membership.user, tenant=membership.tenant, membership=membership)

    auth_client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {data['access_token']}", HTTP_X_CLIENT="api"
    )
    response = auth_client.post(reverse(LOGOUT_URL) + "?all=true")
    assert response.status_code == 200
    assert response.json()["data"]["sessions_revoked"] == 3
    assert not Session.objects.filter(user=membership.user, revoked_at__isnull=True).exists()


def test_a_revoked_session_cannot_be_refreshed(auth_client: Any, membership: Any) -> None:
    data = _login(auth_client, membership)
    auth_client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {data['access_token']}", HTTP_X_CLIENT="api"
    )
    auth_client.post(reverse(LOGOUT_URL))
    auth_client.credentials(HTTP_X_CLIENT="api")

    response = auth_client.post(
        reverse(REFRESH_URL), {"refresh_token": data["refresh_token"]}, format="json"
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "session_revoked"


def test_logout_requires_authentication(anonymous_client: Any) -> None:
    assert anonymous_client.post(reverse(LOGOUT_URL)).status_code == 401


# ── Session and device records (Part 27 §27.4.3) ─────────────────────────────


def test_the_session_row_records_the_device_and_me_lists_it(
    auth_client: Any, membership: Any
) -> None:
    """Part 27 §27.4.3: "`GET /auth/me` lists the caller's active sessions"."""
    membership.user.set_password("Kirana1234")
    membership.user.save(update_fields=["password"])
    data = auth_client.post(
        reverse("v1:auth-login"),
        {
            "email": membership.user.email,
            "password": "Kirana1234",
            "device_label": "Counter PC",
        },
        format="json",
        HTTP_USER_AGENT="Mozilla/5.0 (Windows NT 10.0)",
    ).json()["data"]

    assert data["sessions"][0]["device_label"] == "Counter PC"
    assert data["sessions"][0]["user_agent"].startswith("Mozilla/5.0")


def test_the_refresh_cookie_is_scoped_to_the_refresh_path(
    auth_client: Any, membership: Any
) -> None:
    """Part 22 §22.1: `ub_refresh` never travels with an ordinary API call."""
    membership.user.set_password("Kirana1234")
    membership.user.save(update_fields=["password"])
    response = auth_client.post(
        reverse("v1:auth-login"),
        {"email": membership.user.email, "password": "Kirana1234"},
        format="json",
    )
    assert response.cookies["ub_refresh"]["path"] == "/api/v1/auth/refresh"
    assert response.cookies["ub_refresh"]["httponly"] is True
    assert response.cookies["ub_access"]["path"] == "/"


# ── CSRF double-submit for cookie sessions (Part 22 §22.1) ───────────────────


def test_a_cookie_session_needs_the_csrf_header_on_an_unsafe_method(
    membership: Any,
) -> None:
    from rest_framework.test import APIClient

    from apps.platform_app.services import sessions as session_service
    from apps.platform_app.tokens import ACCESS_COOKIE, CSRF_COOKIE

    issued = session_service.issue(
        user=membership.user, tenant=membership.tenant, membership=membership
    )
    client = APIClient()
    client.cookies[ACCESS_COOKIE] = issued.access
    client.cookies[CSRF_COOKIE] = issued.csrf

    # A safe method needs nothing.
    assert client.get(reverse(ME_URL)).status_code == 200

    refused = client.post(reverse(LOGOUT_URL))
    assert refused.status_code == 403
    assert refused.json()["error"]["code"] == "permission_denied"

    client.credentials(HTTP_X_CSRF_TOKEN=issued.csrf)
    assert client.post(reverse(LOGOUT_URL)).status_code == 200


def test_a_bearer_client_is_exempt_from_csrf(api_as: Any, tenant: Any) -> None:
    """ "API clients … are exempt from CSRF because they are not cookie-driven"."""
    client, _member = api_as(tenant)
    assert client.post(reverse(LOGOUT_URL)).status_code == 200
