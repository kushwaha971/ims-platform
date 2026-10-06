"""The dashboard's graphs — every series against a figure computed by hand.

Owner, 6 Oct 2026: competitors' home screens lead with a sale graph, and "via
graph user able to see sales, profit, purchase, based on day, monthly, week,
year, all time". These pin that each series says what the books say, that the
ranges and groupings land on the right days, and that a series a reader may not
read is ABSENT rather than a row of zeros.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.common.dates import tenant_today
from apps.reports.selectors.dashboard_charts import (
    ChartRequestError,
    bucket_starts,
    dashboard_charts,
    default_group,
    window,
)
from apps.reports.tests import builders as b

pytestmark = pytest.mark.django_db

TODAY = dt.date(2026, 10, 6)  # a Tuesday
CHARTS = "v1:report-dashboard-charts"
EVERYTHING = frozenset(
    {
        "reports.basic.read",
        "reports.financial.read",
        "parties.party.read",
        "sales.invoice.read",
        "purchases.bill.read",
    }
)
ALL_MODULES = frozenset({"payments", "expenses", "sales", "purchases", "parties"})


def _charts(tenant: Any, range_: str = "7d", **extra: Any) -> dict:
    extra.setdefault("granted", EVERYTHING)
    return dashboard_charts(tenant=tenant, today=TODAY, range_=range_, modules=ALL_MODULES, **extra)


def _starts(range_: str, group: str | None = None, today: dt.date = TODAY, **kw: Any) -> list:
    first, last = window(range_, today, **kw)
    return bucket_starts(first, last, group or default_group(first, last))


def _line(doc: Any, no: int, *, qty: str, value: str, item: Any = None, **extra: Any) -> Any:
    from apps.sales.models import SalesDocumentLine

    return SalesDocumentLine.objects.create(
        document=doc,
        line_no=no,
        item=item,
        description=item.name if item else "Service",
        qty=Decimal(qty),
        unit_code="NOS",
        unit_price=Decimal(value) / Decimal(qty),
        taxable_value=Decimal(value),
        tax_code="GST0",
        line_total=Decimal(value),
        **extra,
    )


# ── Ranges and groupings ─────────────────────────────────────────────────────


def test_presets_land_on_the_right_days(tenant: Any) -> None:
    assert window("7d", TODAY) == (dt.date(2026, 9, 30), TODAY)
    assert window("month", TODAY) == (dt.date(2026, 10, 1), TODAY)
    assert window("last_month", TODAY) == (dt.date(2026, 9, 1), dt.date(2026, 9, 30))
    assert window("quarter", TODAY) == (dt.date(2026, 10, 1), TODAY)
    assert window("quarter", dt.date(2026, 8, 20)) == (dt.date(2026, 7, 1), dt.date(2026, 8, 20))
    assert window("12m", TODAY) == (dt.date(2025, 11, 1), TODAY)
    assert window("fy", TODAY, tenant=tenant) == (dt.date(2026, 4, 1), TODAY)
    assert window("last_fy", TODAY, tenant=tenant) == (dt.date(2025, 4, 1), dt.date(2026, 3, 31))


def test_all_time_starts_at_the_first_record_and_an_empty_book_is_just_today(tenant: Any) -> None:
    assert window("all", TODAY, tenant=tenant) == (TODAY, TODAY)
    b.sale(tenant, dt.date(2024, 5, 9), "10.00", party=b.party(tenant))
    assert window("all", TODAY, tenant=tenant) == (dt.date(2024, 5, 9), TODAY)
    assert default_group(dt.date(2024, 5, 9), TODAY) == "month"


def test_groupings_bucket_by_day_iso_week_month_and_year() -> None:
    """A week starts on Monday; buckets touching the range's edges are kept."""
    assert _starts("7d", "day")[0] == dt.date(2026, 9, 30) and len(_starts("7d", "day")) == 7
    assert _starts("30d", "week") == [dt.date(2026, 9, 7) + dt.timedelta(weeks=n) for n in range(5)]
    assert _starts("12m", "month")[0] == dt.date(2025, 11, 1) and len(_starts("12m")) == 12
    assert _starts("12m", "year") == [dt.date(2025, 1, 1), dt.date(2026, 1, 1)]
    assert default_group(*window("30d", TODAY)) == "day"
    assert default_group(*window("quarter", dt.date(2026, 9, 30))) == "week"


def test_a_custom_range_is_checked() -> None:
    first, last = window(
        "custom", TODAY, date_from=dt.date(2026, 8, 1), date_to=dt.date(2026, 8, 31)
    )
    assert len(bucket_starts(first, last, "day")) == 31
    for bad in (
        {"date_from": dt.date(2026, 9, 2), "date_to": dt.date(2026, 9, 1)},
        {"date_from": dt.date(2026, 9, 1), "date_to": dt.date(2026, 10, 7)},
        {"date_from": dt.date(2010, 1, 1), "date_to": dt.date(2026, 9, 1)},
        {"date_from": None, "date_to": None},
    ):
        with pytest.raises(ChartRequestError):
            window("custom", TODAY, **bad)


def test_too_many_bars_is_refused_with_the_control_to_change(tenant: Any) -> None:
    """Twelve months by day is 340 slivers on a phone: ask for a longer step."""
    with pytest.raises(ChartRequestError) as refused:
        _charts(tenant, "12m", group="day")
    assert refused.value.field == "group"


# ── What each series counts ─────────────────────────────────────────────────


def test_sales_are_net_of_credit_notes_and_never_count_drafts_or_voids(tenant: Any) -> None:
    """The Today's sales tile's rule (RPT-01 BR-2), one bar per day."""
    ramesh = b.party(tenant)
    b.sale(tenant, TODAY, "1000.00", party=ramesh)
    b.sale(tenant, TODAY, "500.00", party=ramesh, status="void")
    b.sale(tenant, TODAY, "700.00", party=ramesh, status="draft")
    b.sale(tenant, TODAY, "700.00", party=ramesh, kind="estimate")
    b.credit_note(tenant, TODAY, "200.00", party=ramesh)
    b.sale(tenant, TODAY - dt.timedelta(days=2), "300.00", party=ramesh)
    b.sale(tenant, TODAY - dt.timedelta(days=9), "999.00", party=ramesh)  # outside 7d
    b.purchase(tenant, TODAY, "400.00", party=ramesh)
    b.purchase(tenant, TODAY, "4000.00", party=ramesh, status="void")
    b.expense(tenant, TODAY, "50.00")
    trend = _charts(tenant)["trend"]
    assert trend["series"] == ["sales", "purchases", "profit", "expenses"]
    last = trend["points"][-1]
    assert (last["date"], last["sales"], last["purchases"], last["expenses"]) == (
        "2026-10-06",
        "800.00",
        "400.00",
        "50.00",
    )
    assert trend["points"][-3]["sales"] == "300.00"
    assert trend["points"][0]["sales"] == "0.00"
    assert trend["totals"]["sales"] == "1100.00"


def test_monthly_and_weekly_buckets_add_up(tenant: Any) -> None:
    ramesh = b.party(tenant)
    b.sale(tenant, dt.date(2026, 9, 1), "100.00", party=ramesh)
    b.sale(tenant, dt.date(2026, 9, 30), "250.00", party=ramesh)  # a Wednesday
    b.sale(tenant, dt.date(2026, 10, 2), "50.00", party=ramesh)  # the same ISO week
    months = _charts(tenant, "12m")["trend"]["points"]
    assert [(p["date"], p["sales"]) for p in months[-2:]] == [
        ("2026-09-01", "350.00"),
        ("2026-10-01", "50.00"),
    ]
    weeks = _charts(tenant, "30d", group="week")["trend"]["points"]
    assert (weeks[-2]["date"], weeks[-2]["sales"]) == ("2026-09-28", "300.00")


def test_profit_is_what_stayed_sold_less_its_cost_and_uncosted_lines_are_counted(
    tenant: Any,
) -> None:
    """Rice: 4 sold at ₹100 taxable each, 1 returned, cost ₹70 → 300 − 210 = 90.
    A service line with no cost adds nothing and is counted, never shown as profit."""
    rice = b.stocked_item(tenant, "Rice", on_hand=10)
    doc = b.sale(tenant, TODAY, "1000.00", party=b.party(tenant))
    _line(
        doc,
        1,
        qty="4",
        value="400.00",
        item=rice,
        unit_cost_snapshot=Decimal("70"),
        returned_qty=Decimal("1"),
    )
    _line(doc, 2, qty="1", value="600.00")
    body = _charts(tenant)
    assert body["trend"]["points"][-1]["profit"] == "90.00"
    assert body["uncosted_lines"] == 1


def test_money_out_is_payouts_and_paid_expenses_and_voids_are_not_money(tenant: Any) -> None:
    """The day book's terms: an unpaid expense has not left the drawer yet."""
    ramesh = b.party(tenant)
    b.payment(tenant, TODAY, {"cash": 1000, "upi": 500}, party=ramesh)
    b.payment(tenant, TODAY, {"cash": 9000}, party=ramesh, status="void")
    b.payment(tenant, TODAY, {"cash": 300}, direction="out", party=ramesh)
    b.expense(tenant, TODAY, "120.00")
    b.expense(tenant, TODAY, "80.00", paid=False, party=ramesh)
    b.expense(tenant, TODAY, "60.00", status="void")
    body = _charts(tenant)
    assert body["money"]["points"][-1] == {"date": "2026-10-06", "in": "1500.00", "out": "420.00"}
    # Expenses in the TREND are accrual: the unpaid one counts there.
    assert body["trend"]["points"][-1]["expenses"] == "200.00"


def test_top_customers_rank_billed_parties_and_skip_walk_ins(tenant: Any) -> None:
    big, small = b.party(tenant, "Big Traders"), b.party(tenant, "Small Shop")
    b.sale(tenant, TODAY, "900.00", party=big)
    b.sale(tenant, TODAY, "100.00", party=small)
    b.sale(tenant, TODAY, "5000.00", walk_in_name="Counter")
    tops = _charts(tenant)["top_customers"]
    assert [(row["name"], row["amount"]) for row in tops] == [
        ("Big Traders", "900.00"),
        ("Small Shop", "100.00"),
    ]


def test_top_items_rank_by_value_or_by_quantity(tenant: Any) -> None:
    rice = b.stocked_item(tenant, "Rice", on_hand=10)
    salt = b.stocked_item(tenant, "Salt", on_hand=10)
    doc = b.sale(tenant, TODAY, "1000.00", party=b.party(tenant))
    _line(doc, 1, qty="2", value="600.00", item=rice)
    _line(doc, 2, qty="9", value="90.00", item=salt)
    by_value = _charts(tenant)["top_items"]
    by_qty = _charts(tenant, top_by="qty")["top_items"]
    assert [row["name"] for row in by_value] == ["Rice", "Salt"]
    assert (by_qty[0]["name"], by_qty[0]["qty"], by_qty[0]["unit"]) == ("Salt", "9.000", "NOS")


def test_a_series_the_reader_may_not_read_is_absent_not_zero(tenant: Any) -> None:
    """§10 — a cashier shown "₹0 purchases" is told something false about the shop;
    profit and expenses are the financial reader's (INV-08 EC-4)."""
    cashier = frozenset({"reports.basic.read", "sales.invoice.read"})
    body = _charts(tenant, granted=cashier)
    assert body["trend"]["series"] == ["sales"]
    assert "profit" not in body["trend"]["points"][0] and "uncosted_lines" not in body
    assert "money" not in body and "top_customers" not in body and "receivable_aging" not in body
    assert "top_items" in body
    nothing = _charts(tenant, granted=frozenset({"reports.basic.read"}))
    assert set(nothing) == {"range", "group", "from", "to"}


def test_receivables_by_age_are_ledger_aging_buckets(tenant: Any) -> None:
    aging = _charts(tenant)["receivable_aging"]
    assert [row["key"] for row in aging] == ["0_30", "31_60", "61_90", "90_plus"]


# ── The endpoint ────────────────────────────────────────────────────────────


def test_the_endpoint_checks_every_parameter_and_the_permission(tenant: Any, api_as: Any) -> None:
    owner, _ = api_as(tenant)
    b.sale(tenant, tenant_today(tenant), "250.00", party=b.party(tenant))
    got = owner.get(reverse(CHARTS), {"range": "30d"})
    assert got.status_code == 200, got.content
    assert got["Cache-Control"] == "private, no-store"
    data = got.json()["data"]
    assert (data["range"], data["group"], len(data["trend"]["points"])) == ("30d", "day", 30)
    assert data["trend"]["points"][-1]["sales"] == "250.00"
    weekly = owner.get(reverse(CHARTS), {"range": "30d", "group": "week"}).json()["data"]
    assert weekly["group"] == "week"
    for bad, field in (
        ({"range": "2y"}, "range"),
        ({"group": "hour"}, "group"),
        ({"top_by": "colour"}, "top_by"),
        ({"range": "custom"}, "from"),
        ({"range": "custom", "from": "2026-13-01"}, "from"),
        ({"range": "12m", "group": "day"}, "group"),
    ):
        refused = owner.get(reverse(CHARTS), bad)
        assert refused.status_code == 400, bad
        assert field in refused.json()["error"]["details"], (bad, refused.json())
    staff, member = api_as(tenant, role="staff")
    member.permissions_override = {"deny": ["reports.basic.read"]}
    member.save(update_fields=["permissions_override"])
    assert staff.get(reverse(CHARTS)).status_code == 403
