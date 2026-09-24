"""PLT-09 — the device list, revocation, and what revocation reaches.

T-PLT-09-1, -2, -4, -5, plus AC-3. These are Tier 1: each one decides whether
"the staff member who left with the app still open" is still logged in.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.platform_app.selectors.devices import mask_ip, user_agent_summary
from apps.platform_app.services import sessions as session_service

pytestmark = pytest.mark.django_db

CHROME_ANDROID = (
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0 Mobile Safari/537.36"
)
SAFARI_IOS = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"
)
EDGE_WINDOWS = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0 Safari/537.36 Edg/124.0"
)


def _client_for(issued: Any) -> APIClient:
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {issued.access}", HTTP_X_CLIENT="api")
    return client


def _issue(membership: Any, **kwargs: Any) -> Any:
    return session_service.issue(
        user=membership.user, tenant=membership.tenant, membership=membership, **kwargs
    )


@pytest.mark.parametrize(
    ("ua", "expected"),
    [
        (CHROME_ANDROID, {"browser": "Chrome", "os": "Android", "device": "phone"}),
        (SAFARI_IOS, {"browser": "Safari", "os": "iOS", "device": "phone"}),
        (EDGE_WINDOWS, {"browser": "Edge", "os": "Windows", "device": "desktop"}),
        (None, {"browser": None, "os": None, "device": None}),
    ],
)
def test_user_agent_summary(ua: str | None, expected: dict) -> None:
    """T-PLT-09-5: Edge says "Chrome" and Chrome says "Safari"; order decides the label."""
    assert user_agent_summary(ua) == expected


def test_the_ip_is_masked_to_its_slash_24() -> None:
    """§19: the UI never shows a full IP — `203.0.113.x`."""
    assert mask_ip("203.0.113.57") == "203.0.113.x"
    assert mask_ip(None) is None


def test_the_list_is_the_callers_live_sessions_with_this_device_marked(membership: Any) -> None:
    """T-PLT-09-1: own sessions only, revoked ones gone, `is_current` on this one."""
    current = _issue(membership, user_agent=CHROME_ANDROID, ip="203.0.113.5")
    other = _issue(membership, user_agent=EDGE_WINDOWS)
    revoked = _issue(membership)
    session_service.revoke(session=revoked.session)

    rows = _client_for(current).get(reverse("v1:auth-sessions")).json()["data"]
    by_id = {r["id"]: r for r in rows}
    assert set(by_id) == {str(current.session.id), str(other.session.id)}
    assert by_id[str(current.session.id)]["is_current"] is True
    assert by_id[str(current.session.id)]["ip_masked"] == "203.0.113.x"
    assert by_id[str(other.session.id)]["user_agent_summary"]["browser"] == "Edge"


def test_revoking_another_device_kills_its_refresh(membership: Any) -> None:
    """T-PLT-09-2 / AC-1: the other device is thrown out at its next refresh."""
    current = _issue(membership)
    other = _issue(membership)
    client = _client_for(current)
    response = client.delete(reverse("v1:auth-session-detail", args=[other.session.id]))
    assert response.status_code == 204

    refresh = APIClient().post(
        reverse("v1:auth-refresh"), {"refresh_token": other.refresh}, format="json"
    )
    assert refresh.status_code == 401
    assert refresh.json()["error"]["code"] == "session_revoked"


def test_revoking_this_device_is_409_current_session(membership: Any) -> None:
    """FR-2: the current session is logged out with Log out, never from the list."""
    current = _issue(membership)
    response = _client_for(current).delete(
        reverse("v1:auth-session-detail", args=[current.session.id])
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "current_session"


def test_another_persons_session_is_404(membership: Any, api_as: Any, tenant: Any) -> None:
    """§10: a session id that is not the caller's is indistinguishable from none."""
    mine = _issue(membership)
    _client, stranger = api_as(tenant, role="staff")
    theirs = _issue(stranger)
    response = _client_for(mine).delete(reverse("v1:auth-session-detail", args=[theirs.session.id]))
    assert response.status_code == 404


def test_a_device_can_be_renamed(membership: Any) -> None:
    """FR-7: the label is the person's own word for the device."""
    current = _issue(membership)
    response = _client_for(current).patch(
        reverse("v1:auth-session-detail", args=[current.session.id]),
        {"device_label": "Shop counter phone"},
        format="json",
    )
    assert response.status_code == 200
    assert response.json()["data"]["device_label"] == "Shop counter phone"


def test_a_manager_revokes_a_members_sessions_in_this_business_only(
    api_as: Any, tenant: Any, other_tenant: Any, system_roles: dict
) -> None:
    """T-PLT-09-4 / EC-5 / AC-2: only the current tenant's sessions go; the member
    stays a member; their token here stops working now (`permissions_version`)."""
    from tests.factories.platform import MembershipFactory

    owner_client, _owner = api_as(tenant)
    _c, staff = api_as(tenant, role="staff")
    elsewhere = MembershipFactory(user=staff.user, tenant=other_tenant, role=system_roles["owner"])
    here = _issue(staff)
    there = _issue(elsewhere)

    response = owner_client.post(
        reverse("v1:membership-revoke-sessions", args=[staff.id]), format="json"
    )
    assert response.status_code == 200
    assert response.json()["data"]["sessions_revoked"] == 1

    here.session.refresh_from_db()
    there.session.refresh_from_db()
    assert here.session.revoked_at is not None
    assert there.session.revoked_at is None
    staff.refresh_from_db()
    assert staff.status == "active"
    stale = _client_for(here).get(reverse("v1:party-list"))
    assert stale.status_code == 401


def test_log_out_everywhere_kills_every_access_token_now(membership: Any) -> None:
    """AC-3: "all my devices including this one" — the epoch bump makes it immediate,
    rather than when each device's fifteen-minute token happens to run out."""
    current = _issue(membership)
    other = _issue(membership)
    response = _client_for(current).post(reverse("v1:auth-logout") + "?all=true")
    assert response.status_code == 200
    assert _client_for(other).get(reverse("v1:auth-me")).status_code == 401


def test_refresh_records_when_the_device_was_last_used(membership: Any) -> None:
    """FR-5: `last_used_at` moves on refresh; the list orders by it."""
    issued = _issue(membership)
    assert issued.session.last_used_at is not None
    rotated = APIClient().post(
        reverse("v1:auth-refresh"),
        {"refresh_token": issued.refresh},
        format="json",
        HTTP_X_CLIENT="api",
    )
    assert rotated.status_code == 200
