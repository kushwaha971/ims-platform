"""PLT-10 — the full export, the deletion request and the deletion job.

T-PLT-10-1…4 and T-PLT-10-7, plus the registry that both jobs read. Tier 1: a
bug here either leaks a business's whole book or deletes one that asked for
thirty days to change its mind.
"""

from __future__ import annotations

import datetime as dt
import io
import zipfile
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.common.constants import JobStatus
from tests.factories.parties import PartyFactory
from tests.factories.platform import MembershipFactory, SessionFactory, UserFactory

pytestmark = pytest.mark.django_db

EXPORT = "v1:tenant-export"
EXPORTS = "v1:tenant-export-list"
DELETION = "v1:tenant-deletion"
DELETE_REQUEST = "v1:tenant-delete-request"
DELETE_CANCEL = "v1:tenant-delete-cancel"
PASSWORD = "Kirana-Owner-99"


def _owner(api_as: Any, tenant: Any) -> tuple[Any, Any]:
    client, member = api_as(tenant, "owner")
    member.user.set_password(PASSWORD)
    member.user.save(update_fields=["password"])
    return client, member


def _post_party(client: Any, name: str = "Ramesh Traders") -> dict:
    response = client.post(
        reverse("v1:party-list"), {"name": name, "party_type": "customer"}, format="json"
    )
    assert response.status_code == 201, response.json()
    return response.json()["data"]


def _post_entry(client: Any, party_id: str, amount: str = "500.00") -> None:
    response = client.post(
        reverse("v1:ledger-entry-list"),
        {
            "party_id": party_id,
            "direction": "debit",
            "amount": amount,
            "entry_date": timezone.localdate().isoformat(),
        },
        format="json",
    )
    assert response.status_code == 201, response.json()


def _export(client: Any, capture: Any) -> dict:
    with capture(execute=True):
        response = client.post(reverse(EXPORT))
    assert response.status_code == 202, response.json()
    export_id = response.json()["data"]["id"]
    detail = client.get(reverse("v1:tenant-export-detail", args=[export_id]))
    assert detail.status_code == 200
    return detail.json()["data"]


def _zip(client: Any, export: dict) -> zipfile.ZipFile:
    response = client.get(export["download_url"])
    assert response.status_code == 200
    assert response["Content-Type"] == "application/zip"
    return zipfile.ZipFile(io.BytesIO(b"".join(response.streaming_content)))


# ── The registry ────────────────────────────────────────────────────────────


def test_every_tenant_table_is_registered_for_export_and_deletion() -> None:
    """A table with a tenant FK that nobody registered would be left behind by the
    deletion job, or stop it half-way on a RESTRICT. The job refuses to start in
    that case; this test makes the omission fail the build first."""
    from apps.common.tenant_data import unregistered_tenant_models

    assert unregistered_tenant_models(include_pending=False) == []


def test_deletion_order_puts_children_before_their_parents() -> None:
    """Every tenant FK is RESTRICT and deferred; a parent deleted first fails at commit."""
    from apps.common.tenant_data import deletion_order

    order = [t.model for t in deletion_order()]
    assert order.index("ledger.LedgerEntry") < order.index("parties.Party")
    assert order.index("parties.PartyTag") < order.index("parties.Tag")
    assert order.index("inventory.StockMovement") < order.index("inventory.Item")
    assert order.index("platform.Membership") < order.index("platform.Role")
    assert order.index("expenses.Expense") < order.index("ledger.LedgerEntry")


# ── Export ──────────────────────────────────────────────────────────────────


def test_export_produces_a_zip_of_every_listed_file(
    tenant: Any, api_as: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """T-PLT-10-1 / AC-1: tenant, members, parties, ledger, audit, settings, README."""
    client, _ = _owner(api_as, tenant)
    party = _post_party(client)
    _post_party(client, name="=HYPERLINK(evil)")
    _post_entry(client, party["id"])

    export = _export(client, django_capture_on_commit_callbacks)

    assert export["status"] == "succeeded"
    assert export["row_counts"]["parties.csv"] == 2
    assert export["row_counts"]["ledger_entries.csv"] == 1
    assert export["expires_at"]
    names = set(_zip(client, export).namelist())
    for expected in (
        "tenant.csv",
        "members.csv",
        "parties.csv",
        "ledger_entries.csv",
        "reminders.csv",
        "items.csv",
        "stock_movements.csv",
        "expenses.csv",
        "message_log.csv",
        "audit_log.csv",
        "settings.json",
        "README.txt",
    ):
        assert expected in names, expected
    parties_csv = _zip(client, export).read("parties.csv").decode("utf-8-sig")
    assert "'=HYPERLINK(evil)" in parties_csv  # CSV injection neutralised
    assert "Ramesh Traders" in parties_csv


def test_the_export_holds_only_this_tenants_rows(
    two_tenants_full: dict, django_capture_on_commit_callbacks: Any
) -> None:
    """FRD §19: no export of another tenant's data is possible."""
    a, b = two_tenants_full["a"], two_tenants_full["b"]
    export = _export(a["client"], django_capture_on_commit_callbacks)
    body = _zip(a["client"], export).read("parties.csv").decode("utf-8-sig")
    assert "Party of a" in body
    assert "Party of b" not in body
    # And b cannot read a's export by id.
    assert (
        b["client"].get(reverse("v1:tenant-export-detail", args=[export["id"]])).status_code == 404
    )
    assert b["client"].get(export["download_url"]).status_code == 404


@pytest.mark.parametrize("role", ["admin", "staff", "accountant"])
def test_only_the_owner_may_export(tenant: Any, api_as: Any, role: str) -> None:
    """T-PLT-10-7: an admin holds `platform.tenant.manage` and must still be refused."""
    client, _ = api_as(tenant, role)
    assert client.post(reverse(EXPORT)).status_code == 403
    assert client.get(reverse(DELETION)).status_code == 403


def test_a_cross_site_download_is_refused(
    tenant: Any, api_as: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """A link on a hostile page must not download the owner's whole book (F-3)."""
    client, _ = _owner(api_as, tenant)
    export = _export(client, django_capture_on_commit_callbacks)
    response = client.get(export["download_url"], HTTP_SEC_FETCH_SITE="cross-site")
    assert response.status_code == 403


def test_three_exports_a_day_then_429(tenant: Any, api_as: Any) -> None:
    """FRD §10. In-flight exports are returned rather than doubled, so each is finished first."""
    from apps.platform_app.models import Job

    client, _ = _owner(api_as, tenant)
    for _ in range(3):
        assert client.post(reverse(EXPORT)).status_code == 202
        Job.objects.filter(job_type="platform.tenant_export").update(status=JobStatus.SUCCEEDED)
    response = client.post(reverse(EXPORT))
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "rate_limited"


def test_an_in_flight_export_is_returned_not_doubled(tenant: Any, api_as: Any) -> None:
    client, _ = _owner(api_as, tenant)
    first = client.post(reverse(EXPORT)).json()["data"]["id"]
    second = client.post(reverse(EXPORT)).json()["data"]["id"]
    assert first == second


def test_an_expired_export_deletes_its_file_and_404s(
    tenant: Any, api_as: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """FR-1's seven days: the GC removes the bytes and the download answers 404."""
    from django.core.files.storage import default_storage

    from apps.platform_app.models import Job
    from apps.platform_app.services.tenant_export import expire_exports

    client, _ = _owner(api_as, tenant)
    export = _export(client, django_capture_on_commit_callbacks)
    job = Job.objects.get(pk=export["id"])
    key = job.result["storage_key"]
    assert default_storage.exists(key)

    assert expire_exports(now=timezone.now() + dt.timedelta(days=8)) == 1

    assert not default_storage.exists(key)
    listed = client.get(reverse(EXPORTS)).json()["data"][0]
    assert listed["status"] == "expired"
    assert listed["download_url"] is None
    assert client.get(export["download_url"]).status_code == 404


# ── The deletion request ────────────────────────────────────────────────────


def test_deletion_requires_a_fresh_export(tenant: Any, api_as: Any) -> None:
    """T-PLT-10-2 first half: no export → 409 `export_required`."""
    client, _ = _owner(api_as, tenant)
    response = client.post(
        reverse(DELETE_REQUEST), {"password": PASSWORD, "confirm_name": tenant.name}, format="json"
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "export_required"


def test_an_entry_after_the_export_makes_it_stale(
    tenant: Any, api_as: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """EC-3: export, then record more, then ask to delete → the gate fails again."""
    client, _ = _owner(api_as, tenant)
    party = _post_party(client)
    _export(client, django_capture_on_commit_callbacks)
    assert client.get(reverse(DELETION)).json()["data"]["export_fresh"] is True

    _post_entry(client, party["id"])

    assert client.get(reverse(DELETION)).json()["data"]["export_fresh"] is False
    response = client.post(
        reverse(DELETE_REQUEST), {"password": PASSWORD, "confirm_name": tenant.name}, format="json"
    )
    assert response.json()["error"]["code"] == "export_required"


def test_a_wrong_password_is_a_field_error_never_a_401(
    tenant: Any, api_as: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """A 401 would send the client through refresh and read a typo as an expired session."""
    client, _ = _owner(api_as, tenant)
    _export(client, django_capture_on_commit_callbacks)
    response = client.post(
        reverse(DELETE_REQUEST), {"password": "wrong-one", "confirm_name": "nope"}, format="json"
    )
    assert response.status_code == 400
    fields = response.json()["error"]["details"]
    assert "password" in fields
    assert "confirm_name" in fields
    tenant.refresh_from_db()
    assert tenant.status == "active"


def test_the_request_makes_the_business_read_only_and_revokes_staff(
    tenant: Any, api_as: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """T-PLT-10-2 second half / AC-2: pending, staff sessions revoked, writes → 409."""
    from apps.platform_app.models import AuditLog, Session

    client, owner = _owner(api_as, tenant)
    staff = MembershipFactory(
        tenant=tenant,
        user=UserFactory(),
        role=owner.role.__class__.objects.get(code="staff", tenant=None),
    )
    staff_session = SessionFactory(user=staff.user, tenant=tenant)
    owner_session = SessionFactory(user=owner.user, tenant=tenant)
    _export(client, django_capture_on_commit_callbacks)

    response = client.post(
        reverse(DELETE_REQUEST),
        {"password": PASSWORD, "confirm_name": f"  {tenant.name.upper()} ", "reason": "Closing"},
        format="json",
    )

    assert response.status_code == 200, response.json()
    data = response.json()["data"]
    assert data["status"] == "pending_deletion"
    scheduled = dt.datetime.fromisoformat(data["scheduled_for"].replace("Z", "+00:00"))
    requested = dt.datetime.fromisoformat(data["deletion_requested_at"].replace("Z", "+00:00"))
    assert scheduled - requested == dt.timedelta(days=30)
    assert Session.objects.get(pk=staff_session.pk).revoked_at is not None
    assert Session.objects.get(pk=owner_session.pk).revoked_at is None
    audit = AuditLog.objects.get(tenant=tenant, action="tenant.deletion_requested")
    assert audit.metadata["reason"] == "Closing"
    assert PASSWORD not in str(audit.metadata)  # the secret is never audited

    # Read-only: a write is refused, a read works, another export is allowed.
    refused = client.post(reverse("v1:party-list"), {"name": "New"}, format="json")
    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "tenant_pending_deletion"
    assert client.get(reverse("v1:party-list")).status_code == 200
    assert client.post(reverse(EXPORT)).status_code == 202
    me = client.get(reverse("v1:auth-me")).json()["data"]
    assert me["active_tenant"]["status"] == "pending_deletion"
    assert me["active_tenant"]["deletion_scheduled_for"] is not None


def test_cancel_restores_the_business(
    tenant: Any, api_as: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """T-PLT-10-3."""
    client, _ = _owner(api_as, tenant)
    _export(client, django_capture_on_commit_callbacks)
    client.post(
        reverse(DELETE_REQUEST), {"password": PASSWORD, "confirm_name": tenant.name}, format="json"
    )

    response = client.post(reverse(DELETE_CANCEL))

    assert response.status_code == 200
    assert response.json()["data"]["status"] == "active"
    assert response.json()["data"]["scheduled_for"] is None
    assert (
        client.post(
            reverse("v1:party-list"), {"name": "Back", "party_type": "customer"}, format="json"
        ).status_code
        == 201
    )
    assert client.post(reverse(DELETE_CANCEL)).status_code == 412  # nothing pending


# ── The deletion job ───────────────────────────────────────────────────────


def _pending(tenant: Any, *, days_ago: int) -> None:
    tenant.status = "pending_deletion"
    tenant.deletion_requested_at = timezone.now() - dt.timedelta(days=days_ago)
    tenant.save(update_fields=["status", "deletion_requested_at"])


def test_the_job_refuses_inside_the_cool_off(tenant: Any) -> None:
    """BR-1: nothing is selected before thirty days have passed."""
    from apps.platform_app.services.tenant_delete import due_tenants

    _pending(tenant, days_ago=29)
    assert list(due_tenants()) == []


def test_after_thirty_days_the_children_go_and_a_tombstone_stays(
    tenant: Any,
    other_tenant: Any,
    api_as: Any,
    django_capture_on_commit_callbacks: Any,
) -> None:
    """T-PLT-10-4: children deleted (append-only ledger included), audit anonymised,
    tombstone remains, GSTIN reusable, the other tenant untouched, the final export kept."""
    from apps.ledger.models import LedgerEntry
    from apps.parties.models import Party
    from apps.platform_app.models import AuditLog, Job, Membership, Tenant
    from apps.platform_app.services.tenant_delete import enqueue_due

    client, owner = _owner(api_as, tenant)
    party = _post_party(client)
    _post_entry(client, party["id"])
    other_client, _ = api_as(other_tenant, "owner")
    other_party = _post_party(other_client, name="Survivor")
    _post_entry(other_client, other_party["id"])
    Tenant.objects.filter(pk=tenant.pk).update(gstin="27AAPFU0939F1ZV", gst_type="regular")
    _pending(tenant, days_ago=31)

    with django_capture_on_commit_callbacks(execute=True):
        assert enqueue_due() == 1

    job = Job.objects.get(tenant=tenant, job_type="platform.delete_tenant")
    assert job.status == JobStatus.SUCCEEDED, job.error
    tenant.refresh_from_db()
    assert tenant.status == "deleted"
    assert tenant.name == "Deleted business"
    assert tenant.gstin is None
    assert not Party.all_objects.filter(tenant=tenant).exists()
    assert not LedgerEntry.objects.filter(tenant=tenant).exists()
    assert not Membership.objects.filter(tenant=tenant).exists()
    # The other business is exactly as it was.
    assert Party.objects.filter(tenant=other_tenant).count() == 1
    assert LedgerEntry.objects.filter(tenant=other_tenant).count() == 1
    other_party_row = Party.objects.get(tenant=other_tenant)
    assert other_party_row.balance == Decimal("500.00")
    # Audit rows survive, anonymised, except the system's own tombstone record.
    rows = AuditLog.objects.filter(tenant=tenant)
    assert rows.filter(action="party.created", actor__isnull=True).exists()
    assert not rows.exclude(action="tenant.deleted").filter(actor__isnull=False).exists()
    final = rows.get(action="tenant.deleted")
    assert final.metadata["counts"]["ledger.LedgerEntry"] == 1
    # BR-4: the retention copy is kept.
    kept = Job.objects.get(pk=final.metadata["final_export_id"])
    assert kept.status == JobStatus.SUCCEEDED
    # The GSTIN is free for a new business under the same partner.
    Tenant.objects.create(
        partner=tenant.partner,
        plan=tenant.plan,
        name="Reborn",
        business_type="retail",
        state_code="27",
        phone="+919999999999",
        gstin="27AAPFU0939F1ZV",
        gst_type="regular",
    )
    # And the owner's account itself was not deleted.
    owner.user.refresh_from_db()
    assert owner.user.is_active


def test_a_cancelled_request_is_never_executed(tenant: Any) -> None:
    """A job queued the night before a cancel must not delete the business."""
    from apps.common.jobs import run_job
    from apps.platform_app.models import Job

    _pending(tenant, days_ago=31)
    job = Job.objects.create(
        tenant=tenant,
        job_type="platform.delete_tenant",
        payload={},
        run_after=timezone.now(),
        status=JobStatus.RUNNING,
        attempts=1,
    )
    tenant.status = "active"
    tenant.deletion_requested_at = None
    tenant.save(update_fields=["status", "deletion_requested_at"])

    run_job(job, worker="test")

    job.refresh_from_db()
    assert job.status == JobStatus.DEAD_LETTER
    tenant.refresh_from_db()
    assert tenant.status == "active"


def test_dry_run_plans_every_table_with_counts(tenant: Any) -> None:
    """TSK-PLT-10-04's dry-run mode: the plan, without deleting."""
    from apps.platform_app.services.tenant_delete import plan

    PartyFactory(tenant=tenant)
    steps = {step["table"]: step for step in plan(tenant)}
    assert steps["parties.Party"]["rows"] == 1
    assert steps["ledger.LedgerEntry"]["triggers"] == ["ledger_entry_forbid_update_delete"]
    assert steps["platform.AuditLog"]["action"] == "custom"


def test_an_unregistered_table_holding_rows_stops_deletion_before_anything_goes(
    tenant: Any, other_tenant: Any, monkeypatch: Any
) -> None:
    """A table nobody declared (sales before it registers, say) that holds this
    tenant's rows must stop the job BEFORE the first delete; one that holds none
    for this tenant must not block a deletion the owner asked for."""
    from apps.common import tenant_data
    from apps.common.jobs import run_job
    from apps.parties.models import Party, Tag
    from apps.platform_app.models import Job

    tenant_data.ensure_loaded()
    monkeypatch.delitem(tenant_data.REGISTRY, "parties.Tag")
    monkeypatch.delitem(tenant_data.REGISTRY, "parties.PartyTag")
    Tag.objects.create(tenant=other_tenant, name="Elsewhere")
    assert tenant_data.unregistered_tables_holding(tenant) == []

    Tag.objects.create(tenant=tenant, name="Route 2")
    PartyFactory(tenant=tenant)
    _pending(tenant, days_ago=31)
    job = Job.objects.create(
        tenant=tenant,
        job_type="platform.delete_tenant",
        payload={},
        run_after=timezone.now(),
        status=JobStatus.RUNNING,
        attempts=1,
    )

    run_job(job, worker="test")

    job.refresh_from_db()
    assert job.status == JobStatus.DEAD_LETTER
    assert "parties.Tag" in job.error
    tenant.refresh_from_db()
    assert tenant.status == "pending_deletion"
    assert Party.all_objects.filter(tenant=tenant).count() == 1
