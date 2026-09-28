"""RPT-01 / RPT-02 / RPT-08 over HTTP: permissions, the cache, the files.

The arithmetic is proved in the two reconciliation suites. These tests are
about what the ENDPOINTS add on top — who may see which tile, when the cache
is served and when it is dropped, what a CSV's header is, and what happens
above 5,000 rows.
"""

from __future__ import annotations

import csv
import datetime as dt
import io
from decimal import Decimal
from typing import Any

import pytest
from django.core.cache import cache
from django.urls import reverse

from apps.common import exports
from apps.common.dates import tenant_today
from apps.reports.models import Export, Snapshot
from apps.reports.tests import builders as b

pytestmark = pytest.mark.django_db

DASHBOARD = "v1:report-dashboard"
DAY_BOOK = "v1:report-day-book"
DAY_BOOK_HEADER = [
    "date",
    "time",
    "type",
    "number",
    "party",
    "description",
    "debit",
    "credit",
    "mode",
    "cash_balance",
    "bank_balance",
    "created_by",
    "reference",
    "source_id",
]


@pytest.fixture(autouse=True)
def _fresh_budget() -> Any:
    """The export budget is ten an hour per user, in a cache that outlives a test."""
    cache.clear()
    yield
    cache.clear()


def _csv(response: Any) -> list[list[str]]:
    body = b"".join(response.streaming_content).decode("utf-8")
    assert body.startswith("﻿"), "Excel needs the BOM to read Devanagari"
    assert "\r\n" in body, "RPT-08 FR-9 — CRLF line ends"
    return list(csv.reader(io.StringIO(body.lstrip("﻿"))))


def _deny(member: Any, *codenames: str) -> None:
    member.permissions_override = {"deny": list(codenames)}
    member.save(update_fields=["permissions_override"])


def _allow(member: Any, *codenames: str) -> None:
    member.permissions_override = {"allow": list(codenames)}
    member.save(update_fields=["permissions_override"])


# ── RPT-01 ───────────────────────────────────────────────────────────────────


def test_dashboard_tiles_follow_the_readers_permissions(tenant: Any, api_as: Any) -> None:
    """T-RPT01-3 — staff get no Cash in hand; the accountant and the owner do.
    Omitted, not zeroed (§10)."""
    b.payment(tenant, tenant_today(tenant), {"cash": 300}, party=b.party(tenant))
    owner, _ = api_as(tenant)
    staff, _ = api_as(tenant, role="staff")
    accountant, _ = api_as(tenant, role="accountant")
    mine = owner.get(reverse(DASHBOARD))
    assert mine.status_code == 200
    assert mine["Cache-Control"] == "private, no-store"
    assert mine.json()["data"]["tiles"]["cash_in_hand"] == {"amount": "300.00"}
    assert "cash_in_hand" not in staff.get(reverse(DASHBOARD)).json()["data"]["tiles"]
    assert "cash_in_hand" in accountant.get(reverse(DASHBOARD)).json()["data"]["tiles"]


def test_dashboard_omits_low_stock_when_inventory_is_off(tenant: Any, api_as: Any) -> None:
    """T-RPT01-4 / FR-6 — a module switched off takes its tile with it."""
    b.stocked_item(tenant, "Dal", on_hand=0, reorder_point=2)
    owner, _ = api_as(tenant)
    assert owner.get(reverse(DASHBOARD)).json()["data"]["tiles"]["low_stock"]["count"] == 1
    tenant.enabled_modules = [m for m in tenant.enabled_modules if m != "inventory"]
    tenant.save(update_fields=["enabled_modules"])
    body = owner.get(reverse(DASHBOARD)).json()["data"]
    assert "low_stock" not in body["tiles"] and body["low_stock_items"] == []


def test_dashboard_needs_the_basic_report_permission(tenant: Any, api_as: Any) -> None:
    """§12 — without `reports.basic.read` the endpoint refuses; the page falls
    back to the party list."""
    staff, member = api_as(tenant, role="staff")
    _deny(member, "reports.basic.read")
    assert staff.get(reverse(DASHBOARD)).status_code == 403


def test_dashboard_is_cached_for_a_minute_and_dropped_by_a_write(
    tenant: Any, api_as: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """T-RPT01-5 — the second read is the snapshot; a bill issued in between
    deletes it on commit (BR-5), so the third read has the bill."""
    owner, _ = api_as(tenant)
    ramesh = b.party(tenant)
    first = owner.get(reverse(DASHBOARD)).json()
    assert first["meta"]["cached"] is False
    second = owner.get(reverse(DASHBOARD)).json()
    assert second["meta"]["cached"] is True
    assert second["data"]["generated_at"] == first["data"]["generated_at"]

    with django_capture_on_commit_callbacks(execute=True):
        b.sale(tenant, tenant_today(tenant), "1772.00", party=ramesh)
    assert not Snapshot.objects.filter(tenant=tenant).exists()
    third = owner.get(reverse(DASHBOARD)).json()
    assert third["meta"]["cached"] is False
    assert third["data"]["tiles"]["today_sales"]["amount"] == "1772.00"


def test_a_stale_snapshot_is_recomputed_and_refresh_bypasses_a_fresh_one(
    tenant: Any, api_as: Any
) -> None:
    """FR-1 ≤ 60 s; FR-8 the refresh icon recomputes whatever the age."""
    owner, _ = api_as(tenant)
    owner.get(reverse(DASHBOARD))
    Snapshot.objects.filter(tenant=tenant).update(
        computed_at=dt.datetime.now(dt.UTC) - dt.timedelta(seconds=61)
    )
    assert owner.get(reverse(DASHBOARD)).json()["meta"]["cached"] is False
    assert owner.get(reverse(DASHBOARD) + "?refresh=true").json()["meta"]["cached"] is False
    assert Snapshot.objects.filter(tenant=tenant).count() == 1


def test_one_shops_snapshot_is_never_another_shops(
    tenant: Any, other_tenant: Any, api_as: Any
) -> None:
    """§19 — the cache key is the tenant; the other shop computes its own."""
    b.party(tenant, balance=Decimal("4000"))
    mine, _ = api_as(tenant)
    theirs, _ = api_as(other_tenant)
    assert mine.get(reverse(DASHBOARD)).json()["data"]["tiles"]["to_collect"]["amount"] == "4000.00"
    other = theirs.get(reverse(DASHBOARD)).json()
    assert other["meta"]["cached"] is False
    assert other["data"]["tiles"]["to_collect"]["amount"] == "0.00"


# ── RPT-02 ───────────────────────────────────────────────────────────────────


def _book(client: Any, query: str = "") -> Any:
    return client.get(reverse(DAY_BOOK) + query)


def test_day_book_defaults_to_today_and_pages(tenant: Any, api_as: Any) -> None:
    """FR-5 — today; §5 — pages carry the running cash across the boundary."""
    today = tenant_today(tenant)
    ramesh = b.party(tenant)
    for n in range(5):
        b.payment(tenant, today, {"cash": 100 + n}, party=ramesh)
    b.payment(tenant, today - dt.timedelta(days=1), {"cash": 1000}, party=ramesh)
    owner, _ = api_as(tenant)
    page1 = _book(owner, "?page_size=2").json()
    assert page1["meta"]["total"] == 5 and page1["meta"]["total_pages"] == 3
    assert page1["data"]["opening"] == {"cash": "1000.00", "bank": "0.00"}
    page3 = _book(owner, "?page_size=2&page=3").json()
    assert page3["data"]["rows"][-1]["cash_after"] == page3["data"]["closing"]["cash"] == "1510.00"
    row = page1["data"]["rows"][0]
    assert row["type"] == "payment_in" and row["source"]["kind"] == "payment"
    assert row["modes"] == [{"mode": "cash", "amount": "100.00"}]


def test_day_book_validates_before_reading(tenant: Any, api_as: Any) -> None:
    """§10 — a year at most; from ≤ to; known types; `created_by` only for the
    owner, admin and accountant (§12); `format=pdf` is the browser's print."""
    owner, _ = api_as(tenant)
    staff, _ = api_as(tenant, role="staff")
    assert _book(owner, "?date_from=2025-01-01&date_to=2026-06-01").status_code == 400
    assert _book(owner, "?date_from=2026-06-02&date_to=2026-06-01").status_code == 400
    assert _book(owner, "?type=sale,bogus").status_code == 400
    assert _book(owner, "?mode=barter").status_code == 400
    assert _book(owner, "?party_id=nope").status_code == 400
    somebody = "?created_by=0c7a4b52-9f4c-4f53-9c11-6f44e8d2b111"
    assert _book(staff, somebody).status_code == 403
    assert _book(owner, somebody).status_code == 200
    pdf = _book(owner, "?format=pdf")
    assert pdf.status_code == 400
    assert "Print" in pdf.json()["error"]["details"]["format"][0]
    assert _book(owner, "?format=xlsx").status_code == 400


def test_staff_see_rows_but_not_the_drawer(tenant: Any, api_as: Any) -> None:
    """The cash position needs `reports.financial.read` (RPT-01 §12's rule for the
    same figure): the keys are absent and `balances_visible` says so."""
    b.payment(tenant, tenant_today(tenant), {"cash": 40}, party=b.party(tenant))
    staff, _ = api_as(tenant, role="staff")
    body = _book(staff).json()
    assert body["meta"]["balances_visible"] is False
    assert "opening" not in body["data"] and "closing" not in body["data"]
    assert "cash_after" not in body["data"]["rows"][0]
    assert body["data"]["rows"][0]["money_in"] == "40.00"


def test_a_reader_without_purchases_gets_no_purchase_rows(tenant: Any, api_as: Any) -> None:
    """T-RPT02-4 — §12 "rows filtered by entity read permissions"."""
    ramesh = b.party(tenant)
    b.purchase(tenant, tenant_today(tenant), 900, party=ramesh)
    b.sale(tenant, tenant_today(tenant), 100, party=ramesh)
    staff, member = api_as(tenant, role="staff")
    assert {r["type"] for r in _book(staff).json()["data"]["rows"]} == {"purchase", "sale"}
    _deny(member, "purchases.bill.read")
    body = _book(staff).json()
    assert {r["type"] for r in body["data"]["rows"]} == {"sale"}
    assert "purchases" not in body["meta"]["sources"]


def test_day_book_csv_has_the_exact_header_and_only_the_filtered_rows(
    tenant: Any, api_as: Any
) -> None:
    """T-RPT02-5 / AC-2 — `type=payment_in,payment_out` → only payment rows, the
    FR-6 header in order, plain decimals, ISO dates, the RPT-08 file name."""
    today = tenant_today(tenant)
    ramesh = b.party(tenant, name="=HYPERLINK(evil)")
    b.sale(tenant, today, 999, party=ramesh)
    b.payment(tenant, today, {"upi": 700, "cash": 300}, party=ramesh)
    b.payment(tenant, today, {"cash": 50}, party=ramesh, direction="out")
    b.expense(tenant, today, 25)
    owner, _ = api_as(tenant)
    response = _book(owner, "?type=payment_in,payment_out&format=csv")
    assert response.status_code == 200
    assert response["Content-Disposition"] == (
        f'attachment; filename="day-book_{today.isoformat()}_{today.isoformat()}.csv"'
    )
    rows = _csv(response)
    assert rows[0] == DAY_BOOK_HEADER
    body = rows[1:]
    assert [r[2] for r in body] == ["payment_in", "payment_out"]
    first = dict(zip(rows[0], body[0], strict=True))
    assert first["date"] == today.isoformat()
    assert first["debit"] == "1000.00" and first["credit"] == ""
    assert first["mode"] == "UPI 700.00 + Cash 300.00"
    assert first["party"] == "'=HYPERLINK(evil)", "RPT-08 BR-6 — formula neutralised"
    assert first["cash_balance"] == "300.00" and first["bank_balance"] == "700.00"
    second = dict(zip(rows[0], body[1], strict=True))
    assert second["credit"] == "50.00" and second["cash_balance"] == "250.00"
    json_rows = _book(owner, "?type=payment_in,payment_out").json()["meta"]["total"]
    assert json_rows == len(body), "RPT-08 BR-1 — the file is the screen"


def test_a_non_money_row_carries_its_amount_in_the_description(tenant: Any, api_as: Any) -> None:
    """FR-6 — "Sale ₹1,772.00 credit"; debit/credit empty."""
    b.sale(tenant, tenant_today(tenant), "1772.00", party=b.party(tenant))
    owner, _ = api_as(tenant)
    header, row = _csv(_book(owner, "?format=csv"))
    cells = dict(zip(header, row, strict=True))
    assert cells["description"] == "Sale ₹1,772.00 credit"
    assert cells["debit"] == cells["credit"] == ""


def test_the_balance_columns_leave_the_file_with_the_permission(tenant: Any, api_as: Any) -> None:
    """RPT-08 BR-2 — a reader who may export but not see the drawer gets a header
    WITHOUT the two balance columns, not two blank ones."""
    b.payment(tenant, tenant_today(tenant), {"cash": 10}, party=b.party(tenant))
    staff, member = api_as(tenant, role="staff")
    assert _book(staff, "?format=csv").status_code == 403, "staff may not export (§12)"
    _allow(member, "reports.export")
    header = _csv(_book(staff, "?format=csv"))[0]
    assert header == [c for c in DAY_BOOK_HEADER if c not in ("cash_balance", "bank_balance")]


def test_an_empty_period_is_a_header_only_file(tenant: Any, api_as: Any) -> None:
    """RPT-08 EC-2 — no rows is an answer, not a refusal."""
    owner, _ = api_as(tenant)
    rows = _csv(_book(owner, "?format=csv"))
    assert rows == [DAY_BOOK_HEADER]


def test_a_cross_site_export_is_refused(tenant: Any, api_as: Any) -> None:
    """F-3 — a link on another site cannot make a merchant download their book."""
    owner, _ = api_as(tenant)
    assert _book(owner, "?format=csv").status_code == 200
    assert (
        owner.get(reverse(DAY_BOOK) + "?format=csv", HTTP_SEC_FETCH_SITE="cross-site").status_code
        == 403
    )


def test_a_big_day_book_is_queued_built_and_named(
    tenant: Any, api_as: Any, monkeypatch: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """RPT-08 FR-3 / T-RPT08-16 — over the threshold: 202, a job, a file equal to
    the synchronous one, with the report's own file name and the grants the
    requester had when they asked (BR-2)."""
    monkeypatch.setattr(exports, "SYNC_MAX_ROWS", 3)
    today = tenant_today(tenant)
    ramesh = b.party(tenant)
    for n in range(5):
        b.payment(tenant, today, {"cash": 10 + n}, party=ramesh)
    owner, _ = api_as(tenant)
    with django_capture_on_commit_callbacks(execute=True):
        response = _book(owner, "?format=csv")
    assert response.status_code == 202
    body = response.json()["data"]
    assert body["report"] == "day-book" and body["row_count"] == 5

    export = Export.objects.get(pk=body["export_id"])
    assert export.report_name == "report:day-book"
    assert export.params["query"]["balances"] is True
    status = owner.get(reverse("v1:report-export-detail", args=[export.id])).json()["data"]
    assert status["status"] == "ready" and status["row_count"] == 5

    download = owner.get(reverse("v1:report-export-download", args=[export.id]))
    assert download.status_code == 200
    assert (
        f"day-book_{today.isoformat()}_{today.isoformat()}.csv" in download["Content-Disposition"]
    )
    rows = _csv(download)
    assert rows[0] == DAY_BOOK_HEADER
    assert [r[-5] for r in rows[1:]] == ["10.00", "21.00", "33.00", "46.00", "60.00"]
