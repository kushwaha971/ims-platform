"""PLT-14 — the super-admin console, consented impersonation and the health view.

T-PLT-14-1…5 and T-PLT-14-7. Tier 1: the one rule this file protects is that an
operator can never act inside a business without an owner of that business
having said yes, and that everything they do there is marked as theirs.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from tests.factories.platform import PlanFactory, SessionFactory, UserFactory

pytestmark = pytest.mark.django_db

REASON = "Customer reported a wrong balance"


def _admin() -> tuple[APIClient, Any, Any]:
    user = UserFactory(is_super_admin=True, full_name="Ops Person")
    session = SessionFactory(user=user)
    token = AccessToken.for_user(user)
    token["sid"] = str(session.id)
    token["epo"] = int(user.token_epoch)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client, user, session


def _bearer(raw: str) -> APIClient:
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {raw}")
    return client


def _consent(admin_client: Any, owner_client: Any, tenant: Any) -> str:
    requested = admin_client.post(
        reverse("v1:admin-tenant-access-request", args=[tenant.id]),
        {"reason": REASON},
        format="json",
    )
    assert requested.status_code == 201, requested.json()
    access_id = requested.json()["data"]["id"]
    allowed = owner_client.post(reverse("v1:support-access-allow", args=[access_id]))
    assert allowed.status_code == 200, allowed.json()
    assert allowed.json()["data"]["status"] == "granted"
    return access_id


def _impersonate(admin_client: Any, tenant: Any, consent_id: str) -> Any:
    return admin_client.post(
        reverse("v1:admin-tenant-impersonate", args=[tenant.id]),
        {"consent_id": consent_id, "reason": REASON},
        format="json",
    )


# ── The gate ────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "name",
    ["v1:admin-overview", "v1:admin-tenant-list", "v1:admin-partner-list", "v1:admin-health"],
)
def test_a_merchant_is_refused_every_console_route(tenant: Any, api_as: Any, name: str) -> None:
    """T-PLT-14-1: an owner of a business is not an operator of the platform."""
    client, _ = api_as(tenant, "owner")
    assert client.get(reverse(name)).status_code == 403


def test_the_tenant_list_searches_name_gstin_and_owner_email(
    tenant: Any, other_tenant: Any, api_as: Any
) -> None:
    """FR-2."""
    admin, _, _ = _admin()
    _, owner = api_as(tenant, "owner")
    tenant.gstin = "27AAPFU0939F1ZV"
    tenant.gst_type = "regular"
    tenant.save(update_fields=["gstin", "gst_type"])

    by_name = admin.get(reverse("v1:admin-tenant-list"), {"q": tenant.name[:6]}).json()["data"]
    assert tenant.name in {row["name"] for row in by_name}
    by_gstin = admin.get(reverse("v1:admin-tenant-list"), {"q": "27aapfu0939f1zv"}).json()["data"]
    assert [row["id"] for row in by_gstin] == [str(tenant.id)]
    by_email = admin.get(reverse("v1:admin-tenant-list"), {"q": owner.user.email}).json()["data"]
    assert [row["id"] for row in by_email] == [str(tenant.id)]
    assert by_email[0]["owner_email"] == owner.user.email
    assert by_email[0]["usage"]["members"] == 1


# ── Tenant writes ───────────────────────────────────────────────────────────


def test_every_write_needs_a_reason(tenant: Any) -> None:
    """FR-10."""
    admin, _, _ = _admin()
    response = admin.patch(
        reverse("v1:admin-tenant", args=[tenant.id]), {"status": "suspended"}, format="json"
    )
    assert response.status_code == 400
    assert "reason" in response.json()["error"]["details"]


def test_plan_change_and_overrides_are_audited_as_the_operator(tenant: Any, api_as: Any) -> None:
    """T-PLT-14-5 / §16: in the tenant's own log, with the reason, as `super_admin`."""
    from apps.platform_app.models import AuditLog

    admin, admin_user, _ = _admin()
    owner_client, _ = api_as(tenant, "owner")
    new_plan = PlanFactory(code="growth", limits={"max_users": 5})

    response = admin.patch(
        reverse("v1:admin-tenant", args=[tenant.id]),
        {
            "reason": REASON,
            "plan_id": str(new_plan.id),
            "entitlement_overrides": {"max_users": 12},
        },
        format="json",
    )

    assert response.status_code == 200, response.json()
    data = response.json()["data"]
    assert data["plan"]["code"] == "growth"
    assert data["entitlements"]["overrides"] == {"max_users": 12}
    me = owner_client.get(reverse("v1:auth-me")).json()["data"]
    assert me["plan_limits"]["limits"]["max_users"]["limit"] == 12
    rows = AuditLog.objects.filter(tenant=tenant, actor=admin_user)
    assert set(rows.values_list("action", flat=True)) == {
        "admin.tenant_plan_changed",
        "admin.tenant_overrides_changed",
    }
    assert all(r.actor_type == "super_admin" and r.metadata["reason"] == REASON for r in rows)


def test_suspending_revokes_every_session(tenant: Any, api_as: Any) -> None:
    """T-PLT-14-4."""
    from apps.platform_app.models import Session

    admin, _, _ = _admin()
    _, owner = api_as(tenant, "owner")
    live = SessionFactory(user=owner.user, tenant=tenant)

    response = admin.patch(
        reverse("v1:admin-tenant", args=[tenant.id]),
        {"reason": REASON, "status": "suspended"},
        format="json",
    )

    assert response.status_code == 200
    assert Session.objects.get(pk=live.pk).revoked_at is not None
    tenant.refresh_from_db()
    assert tenant.status == "suspended"


def test_a_business_being_deleted_cannot_be_suspended_or_woken(tenant: Any) -> None:
    """EC-5: deletion is the owner's decision; the console cannot interfere."""
    admin, _, _ = _admin()
    tenant.status = "pending_deletion"
    tenant.deletion_requested_at = timezone.now()
    tenant.save(update_fields=["status", "deletion_requested_at"])
    response = admin.patch(
        reverse("v1:admin-tenant", args=[tenant.id]),
        {"reason": REASON, "status": "active"},
        format="json",
    )
    assert response.status_code == 409


# ── Consent ─────────────────────────────────────────────────────────────────


def test_impersonation_without_consent_is_refused(tenant: Any, api_as: Any) -> None:
    """T-PLT-14-2 first half / AC-3: a request that nobody allowed is not a consent."""
    admin, _, _ = _admin()
    api_as(tenant, "owner")
    requested = admin.post(
        reverse("v1:admin-tenant-access-request", args=[tenant.id]),
        {"reason": REASON},
        format="json",
    ).json()["data"]
    response = _impersonate(admin, tenant, requested["id"])
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "impersonation_not_consented"


def test_an_expired_or_denied_or_foreign_consent_is_refused(
    tenant: Any, other_tenant: Any, api_as: Any
) -> None:
    """T-PLT-14-2: expired → 403; another tenant's consent → 403; denied → 403."""
    from apps.platform_app.models import SupportAccess

    admin, _, _ = _admin()
    owner_client, _ = api_as(tenant, "owner")
    consent = _consent(admin, owner_client, tenant)

    assert _impersonate(admin, other_tenant, consent).status_code == 403

    SupportAccess.objects.filter(pk=consent).update(expires_at=timezone.now() - dt.timedelta(1))
    assert _impersonate(admin, tenant, consent).status_code == 403

    second = admin.post(
        reverse("v1:admin-tenant-access-request", args=[tenant.id]),
        {"reason": REASON},
        format="json",
    ).json()["data"]["id"]
    assert owner_client.post(reverse("v1:support-access-deny", args=[second])).status_code == 200
    assert _impersonate(admin, tenant, second).status_code == 403


def test_only_an_owner_can_consent(tenant: Any, api_as: Any) -> None:
    """An admin of the business holds `platform.tenant.manage` and still may not let support in."""
    admin, _, _ = _admin()
    admin_member_client, _ = api_as(tenant, "admin")
    access = admin.post(
        reverse("v1:admin-tenant-access-request", args=[tenant.id]),
        {"reason": REASON},
        format="json",
    ).json()["data"]["id"]
    assert (
        admin_member_client.post(reverse("v1:support-access-allow", args=[access])).status_code
        == 403
    )


def test_the_owner_is_notified_of_the_request(tenant: Any, api_as: Any) -> None:
    """FR-6: the request reaches the owners' inbox."""
    from apps.notifications.models import Notification

    admin, _, _ = _admin()
    api_as(tenant, "owner")
    admin.post(
        reverse("v1:admin-tenant-access-request", args=[tenant.id]),
        {"reason": REASON},
        format="json",
    )
    note = Notification.objects.get(tenant=tenant, type="support_access_request")
    assert note.data["params"]["reason"] == REASON
    assert note.data["route"] == "/settings/data"


# ── The support session ─────────────────────────────────────────────────────


def test_a_consented_session_reads_as_owner_and_is_marked_as_support(
    tenant: Any, api_as: Any
) -> None:
    """T-PLT-14-2/3: `imp` token, the tenant's view as its owner sees it, entry audited."""
    from apps.platform_app.models import AuditLog, ImpersonationSession

    admin, admin_user, _ = _admin()
    owner_client, _ = api_as(tenant, "owner")
    consent = _consent(admin, owner_client, tenant)

    response = _impersonate(admin, tenant, consent)

    assert response.status_code == 200, response.json()
    raw = response.cookies["ub_access"].value
    claims = AccessToken(raw).payload
    assert claims["imp"] and claims["rol"] == "owner" and claims["tid"] == str(tenant.id)
    assert "ver" not in claims
    session = ImpersonationSession.objects.get()
    assert raw not in session.jti_hash and len(session.jti_hash) == 64  # hashed, never stored
    assert session.expires_at - session.created_at <= dt.timedelta(minutes=60, seconds=1)

    support = _bearer(raw)
    me = support.get(reverse("v1:auth-me")).json()["data"]
    assert me["impersonation"]["tenant_name"] == tenant.name
    assert me["impersonation"]["admin_name"] == "Ops Person"
    assert me["active_tenant"]["id"] == str(tenant.id)

    # Part 20 §20.4.8 rule 5: support access READS. A write is refused even where
    # the FRD would allow it (CR-LOG CR-2026-09-24-W2C-B records the conflict).
    assert support.get(reverse("v1:party-list")).status_code == 200
    refused = support.post(
        reverse("v1:party-list"),
        {"name": "Made by support", "party_type": "customer"},
        format="json",
    )
    assert refused.status_code == 403
    started = AuditLog.objects.get(tenant=tenant, action="admin.impersonation_started")
    assert started.actor_id == admin_user.id
    assert started.actor_type == "super_admin"
    assert started.metadata["consent_id"] == consent


@pytest.mark.parametrize(
    ("method", "name", "args"),
    [
        ("get", "v1:admin-tenant-list", []),
        ("post", "v1:auth-switch-tenant", []),
        ("post", "v1:tenant-delete-request", []),
        ("post", "v1:tenant-export", []),
        ("get", "v1:support-access-list", []),
        ("post", "v1:member-list", []),
    ],
)
def test_a_support_session_cannot_do_the_forbidden_things(
    tenant: Any, api_as: Any, method: str, name: str, args: list
) -> None:
    """T-PLT-14-3 / FR-5: 403 `impersonation_forbidden` for the console, switching,
    deletion, the whole-book export, its own consent, and the team."""
    admin, _, _ = _admin()
    owner_client, _ = api_as(tenant, "owner")
    raw = (
        _impersonate(admin, tenant, _consent(admin, owner_client, tenant))
        .cookies["ub_access"]
        .value
    )
    response = getattr(_bearer(raw), method)(reverse(name, args=args), {}, format="json")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "impersonation_forbidden"


def test_bank_details_are_refused_under_support(tenant: Any, api_as: Any) -> None:
    """FR-5: PLT-07 bank details are out of reach of a support session."""
    admin, _, _ = _admin()
    owner_client, _ = api_as(tenant, "owner")
    raw = (
        _impersonate(admin, tenant, _consent(admin, owner_client, tenant))
        .cookies["ub_access"]
        .value
    )
    response = _bearer(raw).patch(
        reverse("v1:tenant-current"), {"bank_details": {"account_number": "1"}}, format="json"
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "impersonation_forbidden"


def test_ending_or_revoking_cuts_the_token_at_once(tenant: Any, api_as: Any) -> None:
    """The token is re-checked against the row on every request, not trusted until `exp`."""
    admin, _, _ = _admin()
    owner_client, _ = api_as(tenant, "owner")
    consent = _consent(admin, owner_client, tenant)
    raw = _impersonate(admin, tenant, consent).cookies["ub_access"].value
    support = _bearer(raw)

    ended = support.post(reverse("v1:admin-imp-end"))
    assert ended.status_code == 200, ended.json()
    assert "ub_access" in ended.cookies  # swapped back to the operator's own token
    assert AccessToken(ended.cookies["ub_access"].value).payload.get("imp") is None
    assert support.get(reverse("v1:party-list")).status_code == 401

    # A second session on the same consent, then the owner withdraws it.
    raw2 = _impersonate(admin, tenant, consent).cookies["ub_access"].value
    assert _bearer(raw2).get(reverse("v1:party-list")).status_code == 200
    revoked = owner_client.post(reverse("v1:support-access-revoke", args=[consent]))
    assert revoked.status_code == 200
    assert _bearer(raw2).get(reverse("v1:party-list")).status_code == 401


# ── Health ──────────────────────────────────────────────────────────────────


def test_health_reports_the_scheduler_heartbeat(db: Any) -> None:
    """T-PLT-14-7 / AC-5: no heartbeat is red; a fresh one is green."""
    from apps.common.jobs import record_heartbeat

    admin, _, _ = _admin()
    before = admin.get(reverse("v1:admin-health")).json()["data"]
    assert before["db"]["ok"] is True
    assert before["scheduler"]["ok"] is False

    record_heartbeat("test-worker", force=True)

    after = admin.get(reverse("v1:admin-health")).json()["data"]
    assert after["scheduler"]["ok"] is True
    assert after["scheduler"]["lag_s"] <= 5
    assert set(after["jobs"]) >= {"queued", "running", "failed_24h"}


def test_the_heartbeat_is_one_row_that_is_never_claimed(db: Any) -> None:
    """Every runner touches the same row; its status keeps it out of the claim query."""
    from apps.common.jobs import claim_jobs, record_heartbeat
    from apps.platform_app.models import Job

    record_heartbeat("a", force=True)
    record_heartbeat("b", force=True)
    assert Job.objects.filter(scheduled_key="platform.heartbeat").count() == 1
    assert claim_jobs(batch=10, worker="c") == []
