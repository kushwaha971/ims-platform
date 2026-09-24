"""PLT-08 — the audit log viewer's API.

T-PLT-08-2…-5, plus the CSV export (FR-7). The isolation tests matter most:
an audit log names people, amounts and reasons, and one row of another
business's log is a data breach.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.platform_app.selectors.audit import changed_keys, flatten

pytestmark = pytest.mark.django_db

URL = "v1:audit-log-list"


def _row(tenant: Any, **fields: Any) -> Any:
    from apps.platform_app.models import AuditLog

    defaults = {"action": "party.created", "entity_type": "parties_party"}
    defaults.update(fields)
    return AuditLog.objects.create(tenant=tenant, **defaults)


def test_flatten_turns_nested_jsonb_into_dotted_paths() -> None:
    """T-PLT-08-5 / EC-5: an address diff reads `address.city`, not `address`."""
    assert flatten({"address": {"city": "Pune", "pin": "411001"}, "name": "A"}) == {
        "address.city": "Pune",
        "address.pin": "411001",
        "name": "A",
    }
    assert changed_keys({"address": {"city": "Pune"}}, {"address": {"city": "Nashik"}}) == [
        "address.city"
    ]


def test_a_tenant_sees_only_its_own_rows_and_never_platform_rows(
    api_as: Any, tenant: Any, other_tenant: Any
) -> None:
    """T-PLT-08-2 / BR-2: tenant B's rows and `tenant_id IS NULL` rows are invisible."""
    mine = _row(tenant)
    _row(other_tenant)
    _row(None, action="admin.partner_updated", entity_type="platform_partner")
    client, _m = api_as(tenant)
    rows = client.get(reverse(URL)).json()["data"]
    assert [r["id"] for r in rows] == [str(mine.id)]


def test_filters_by_actor_action_group_and_date(api_as: Any, tenant: Any) -> None:
    """T-PLT-08-3: each filter narrows; the group maps to action prefixes."""
    client, member = api_as(tenant)
    _row(tenant, actor=member.user, action="ledger.entry.reversed", entity_type="ledger_entry")
    _row(tenant, action="party.created")
    old = _row(tenant, action="settings.updated", entity_type="platform_tenant")
    type(old).objects.filter(pk=old.pk).update(created_at=timezone.now() - dt.timedelta(days=40))

    def ids(**params: Any) -> list[str]:
        return [r["action"] for r in client.get(reverse(URL), params).json()["data"]]

    assert ids(actor_id=str(member.user_id)) == ["ledger.entry.reversed"]
    assert ids(group="ledger") == ["ledger.entry.reversed"]
    assert ids(action="party.created") == ["party.created"]
    today = timezone.localdate()
    assert "settings.updated" not in ids(date_from=str(today - dt.timedelta(days=7)))


def test_a_range_over_a_year_is_refused(api_as: Any, tenant: Any) -> None:
    """§10: "Choose a range up to 1 year" (400)."""
    client, _m = api_as(tenant)
    response = client.get(reverse(URL), {"date_from": "2024-01-01", "date_to": "2025-06-01"})
    assert response.status_code == 400


def test_staff_are_refused_and_the_accountant_reads_without_ips(api_as: Any, tenant: Any) -> None:
    """T-PLT-08-4 and §19: IPs are for owner/admin; the request id is enough for support."""
    _row(tenant, metadata={"ip": "203.0.113.9", "request_id": "req-1"})
    staff, _m = api_as(tenant, role="staff")
    assert staff.get(reverse(URL)).status_code == 403
    accountant, _m = api_as(tenant, role="accountant")
    row = accountant.get(reverse(URL)).json()["data"][0]
    assert row["metadata"]["request_id"] == "req-1"
    assert "ip" not in row["metadata"]
    owner, _m = api_as(tenant)
    assert owner.get(reverse(URL)).json()["data"][0]["metadata"]["ip"] == "203.0.113.9"


def test_the_label_is_the_entitys_current_name_and_falls_back_to_the_snapshot(
    api_as: Any, tenant: Any, party: Any
) -> None:
    """FR-4 / EC-1: a renamed party reads under its new name; a gone entity keeps
    the name its row recorded, and has no Open link."""
    import uuid

    _row(tenant, entity_id=party.id, after={"name": "Old name"})
    party.name = "Ramesh Traders"
    party.save(update_fields=["name"])
    _row(tenant, entity_id=uuid.uuid4(), after={"name": "Deleted draft"})
    client, _m = api_as(tenant)
    rows = client.get(reverse(URL)).json()["data"]
    labels = {r["entity_label"]: r["entity_route"] for r in rows}
    assert labels["Ramesh Traders"] == f"/parties/{party.id}"
    assert labels["Deleted draft"] is None


def test_a_removed_member_is_still_named_and_flagged(api_as: Any, tenant: Any) -> None:
    """EC-2: the audit trail must still say who did it after they leave."""
    client, _owner = api_as(tenant)
    _staff_client, staff = api_as(tenant, role="staff")
    _row(tenant, actor=staff.user)
    staff.status = "removed"
    staff.save(update_fields=["status"])
    actor = client.get(reverse(URL)).json()["data"][0]["actor"]
    assert actor["name"] == staff.user.full_name
    assert actor["is_former_member"] is True


def test_the_page_costs_a_fixed_number_of_queries(api_as: Any, tenant: Any, party: Any) -> None:
    """§15: labels are one query per entity type per page, never one per row."""
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    client, member = api_as(tenant)
    for _ in range(3):
        _row(tenant, actor=member.user, entity_id=party.id)
    with CaptureQueriesContext(connection) as three:
        client.get(reverse(URL))
    for _ in range(20):
        _row(tenant, actor=member.user, entity_id=party.id)
    with CaptureQueriesContext(connection) as twenty_three:
        client.get(reverse(URL))
    assert len(three) == len(twenty_three)


def test_csv_export_streams_the_filtered_rows_and_is_itself_audited(
    api_as: Any, tenant: Any
) -> None:
    """AC-3 / §16: exactly the filtered rows, and `audit.exported` records who took them."""
    from apps.platform_app.models import AuditLog

    _row(tenant, action="party.created", after={"name": "=HYPERLINK(evil)"})
    _row(tenant, action="settings.updated", entity_type="platform_tenant")
    client, _m = api_as(tenant)
    response = client.get(reverse(URL), {"format": "csv", "group": "parties"})
    assert response.status_code == 200
    body = b"".join(response.streaming_content).decode()
    assert "party.created" in body and "settings.updated" not in body
    assert "'=HYPERLINK" in body  # CSV injection neutralised
    exported = AuditLog.objects.get(action="audit.exported", tenant=tenant)
    assert exported.metadata["row_count"] == 1


def test_a_cross_site_export_is_refused(api_as: Any, tenant: Any) -> None:
    """A link on a hostile page must not make a signed-in owner's browser download the log."""
    client, _m = api_as(tenant)
    response = client.get(reverse(URL), {"format": "csv"}, HTTP_SEC_FETCH_SITE="cross-site")
    assert response.status_code == 403


def test_the_actor_list_includes_former_members(api_as: Any, tenant: Any) -> None:
    """FR-3: the "Who" filter offers everyone who ever acted, removed included."""
    client, _owner = api_as(tenant)
    _c, staff = api_as(tenant, role="staff")
    staff.status = "removed"
    staff.save(update_fields=["status"])
    actors = client.get(reverse("v1:audit-log-actors")).json()["data"]
    assert any(a["id"] == str(staff.user_id) and a["is_former_member"] for a in actors)
