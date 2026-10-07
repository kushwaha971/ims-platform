"""Profit by item, customer, category and bill, and the P&L under it (Shop item 1).

These pin the arithmetic a merchant will trust with the question "which items
make me money": what stayed sold after returns, the cost frozen on the line
rather than today's, a line with no cost kept OUT of the profit instead of
counted as pure profit, a value-only credit note taken off the sale, and the
expenses taken off the gross. And that the whole report is the owner's and
the accountant's: staff never get it.
"""

from __future__ import annotations

import csv
import datetime as dt
import io
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.reports.selectors import profit
from apps.reports.tests import builders as b

pytestmark = pytest.mark.django_db

TODAY = dt.date(2026, 10, 6)
FIRST = dt.date(2026, 10, 1)
URL = "v1:report-profit"


def _line(
    doc: Any,
    item: Any,
    *,
    qty: str,
    value: str,
    cost: str | None,
    returned: str = "0",
    description: str | None = None,
) -> Any:
    from apps.sales.models import SalesDocumentLine

    return SalesDocumentLine.objects.create(
        document=doc,
        line_no=doc.lines.count() + 1,
        item=item,
        description=description or item.name,
        qty=Decimal(qty),
        unit_code="NOS",
        unit_price=Decimal(value) / Decimal(qty),
        taxable_value=Decimal(value),
        tax_code="GST0",
        line_total=Decimal(value),
        unit_cost_snapshot=None if cost is None else Decimal(cost),
        returned_qty=Decimal(returned),
    )


def _value_credit(tenant: Any, against: Any, amount: str, *, status: str = "issued") -> Any:
    from apps.sales.models import SalesDocumentLine

    note = b.credit_note(tenant, TODAY, amount, party=against.document.party, status=status)
    return SalesDocumentLine.objects.create(
        document=note,
        line_no=1,
        item=against.item,
        description=against.description,
        qty=Decimal("1"),
        unit_code="NOS",
        unit_price=Decimal(amount),
        taxable_value=Decimal(amount),
        tax_code="GST0",
        line_total=Decimal(amount),
        against_line=against,
        credit_mode="value",
    )


def _category(tenant: Any, name: str) -> Any:
    from apps.inventory.models import Category

    return Category.objects.create(tenant=tenant, name=name)


@pytest.fixture
def book(tenant: Any) -> dict[str, Any]:
    """Rice makes money, Oil loses it, Delivery has no cost; one walk-in sale."""
    grain = _category(tenant, "Grain")
    rice = b.stocked_item(tenant, "Rice", on_hand=100)
    rice.category = grain
    rice.save(update_fields=["category"])
    oil = b.stocked_item(tenant, "Oil", on_hand=100)
    delivery = b.stocked_item(tenant, "Delivery", on_hand=0)
    ramesh, suresh = b.party(tenant, "Ramesh"), b.party(tenant, "Suresh")

    first = b.sale(tenant, TODAY, "1000", party=ramesh)
    # 10 at 50, 4 returned: 6 stayed, sale 300, cost 6 x 40 = 240, profit 60.
    rice_line = _line(first, rice, qty="10", value="500", cost="40", returned="4")
    # Oil sold below cost: 2 at 90 against a cost of 100 → −20.
    _line(first, oil, qty="2", value="180", cost="100")
    # Delivery: no cost known → in the sale, not in the profit.
    _line(first, delivery, qty="1", value="50", cost=None)
    second = b.sale(tenant, TODAY, "1000", party=suresh)
    _line(second, rice, qty="20", value="1000", cost="40")  # profit 200
    counter = b.sale(tenant, TODAY, "100", walk_in_name="Counter")
    _line(counter, rice, qty="2", value="100", cost="40")  # profit 20

    # None of these count: void, draft, estimate, last month.
    _line(
        b.sale(tenant, TODAY, "9", party=ramesh, status="void"), rice, qty="9", value="9", cost="1"
    )
    _line(b.sale(tenant, TODAY, "9", status="draft"), rice, qty="9", value="9", cost="1")
    _line(
        b.sale(tenant, TODAY, "9", party=ramesh, kind="estimate"),
        rice,
        qty="9",
        value="9",
        cost="1",
    )
    _line(
        b.sale(tenant, dt.date(2026, 9, 30), "9", party=ramesh), rice, qty="9", value="9", cost="1"
    )
    return {"rice": rice, "oil": oil, "delivery": delivery, "rice_line": rice_line, "first": first}


def _rows(tenant: Any, group: str, **extra: Any) -> list[dict]:
    rows = profit.grouped(tenant=tenant, group=group, date_from=FIRST, date_to=TODAY, **extra)
    return [profit.row_json(group, row) for row in rows]


def test_item_wise_counts_what_stayed_sold_and_only_the_cost_it_knows(
    tenant: Any, book: dict
) -> None:
    rows = {row["name"]: row for row in _rows(tenant, "item")}
    assert list(rows) == ["Rice", "Delivery", "Oil"]  # most profit first; the loss last
    assert rows["Rice"] == {
        "id": str(book["rice"].id),
        "name": "Rice",
        "qty": "28.000",
        "unit": "NOS",
        "bills": 3,
        "sale_value": "1400.00",
        "cost": "1120.00",
        "profit": "280.00",
        "margin_pct": "20.0",
        "uncosted_lines": 0,
    }
    assert rows["Oil"]["profit"] == "-20.00"
    # No cost: the sale counts, the profit is not invented, and it says so.
    assert rows["Delivery"]["sale_value"] == "50.00"
    # Nothing in the row has a cost, so neither figure is claimed — not even ₹0.00.
    assert (rows["Delivery"]["cost"], rows["Delivery"]["profit"]) == (None, None)
    assert rows["Delivery"]["margin_pct"] is None
    assert rows["Delivery"]["uncosted_lines"] == 1

    losses_first = _rows(tenant, "item", ordering="profit")
    assert losses_first[0]["name"] == "Oil"


def test_party_wise_puts_walk_in_sales_in_one_row_and_category_wise_keeps_the_uncategorised(
    tenant: Any, book: dict
) -> None:
    parties = _rows(tenant, "party")
    assert [(row["name"], row["profit"]) for row in parties] == [
        ("Suresh", "200.00"),
        ("Ramesh", "40.00"),  # 60 on rice less 20 on oil
        (None, "20.00"),
    ]
    assert parties[2]["id"] is None

    categories = {row["name"]: row for row in _rows(tenant, "category")}
    assert categories["Grain"]["profit"] == "280.00"
    assert categories[None]["profit"] == "-20.00"
    assert categories[None]["uncosted_lines"] == 1

    bills = {row["name"]: row for row in _rows(tenant, "bill")}
    bill = bills[book["first"].number]
    assert (bill["date"], bill["profit"]) == (TODAY.isoformat(), "40.00")
    assert bill["party"] == {"id": str(book["first"].party_id), "name": "Ramesh"}


def test_a_value_credit_comes_off_the_sale_and_a_voided_one_does_not(
    tenant: Any, book: dict
) -> None:
    """A15 credits money without moving `returned_qty`; missing it overstates profit."""
    _value_credit(tenant, book["rice_line"], "30")
    _value_credit(tenant, book["rice_line"], "500", status="void")
    rice = next(row for row in _rows(tenant, "item") if row["name"] == "Rice")
    assert (rice["sale_value"], rice["profit"]) == ("1370.00", "250.00")


def test_the_summary_is_every_line_and_takes_the_expenses_off_the_gross(
    tenant: Any, book: dict
) -> None:
    b.expense(tenant, TODAY, "100")
    b.expense(tenant, TODAY, "999", status="void")
    b.expense(tenant, dt.date(2026, 9, 30), "999")
    got = profit.summary(tenant=tenant, date_from=FIRST, date_to=TODAY, with_expenses=True)
    assert got == {
        "bills": 3,
        "sale_value": "1630.00",
        "cost": "1320.00",
        "profit": "260.00",
        "margin_pct": "16.5",  # 260 over the 1580 whose cost is known
        "uncosted_lines": 1,
        "expenses": "100.00",
        "net_profit": "160.00",
    }
    # The rows add up to the summary — one arithmetic, not two.
    rows = _rows(tenant, "item")
    assert sum(Decimal(row["profit"] or 0) for row in rows) == Decimal(got["profit"])
    without = profit.summary(tenant=tenant, date_from=FIRST, date_to=TODAY, with_expenses=False)
    assert "expenses" not in without and "net_profit" not in without


def test_the_dashboard_and_the_bill_say_the_same_profit_as_the_report(
    tenant: Any, book: dict
) -> None:
    """Three screens show profit; with a value credit on a line they once disagreed."""
    from apps.reports.selectors.dashboard_charts import _Span, profit_series
    from apps.sales.selectors.profit import invoice_profit

    _value_credit(tenant, book["rice_line"], "30")
    report = profit.summary(tenant=tenant, date_from=FIRST, date_to=TODAY, with_expenses=False)
    series, uncosted = profit_series(_Span(tenant, FIRST, TODAY, "month"))
    assert sum(series) == Decimal(report["profit"]) == Decimal("230.00")
    assert uncosted == 1
    bill = invoice_profit(book["first"])
    assert bill["totals"]["profit"] == "10.00"  # 60 − 30 on rice, −20 on oil
    assert bill["lines"][0]["sale_value"] == "270.00"


def test_the_endpoint_is_the_owners_and_pages_and_exports(
    tenant: Any, book: dict, api_as: Any
) -> None:
    owner, _ = api_as(tenant)
    url = reverse(URL)
    period = {"date_from": FIRST.isoformat(), "date_to": TODAY.isoformat()}
    got = owner.get(url, {**period, "group": "party", "page_size": 2})
    assert got.status_code == 200, got.content
    assert got["Cache-Control"] == "private, no-store"
    body = got.json()
    assert [row["name"] for row in body["data"]] == ["Suresh", "Ramesh"]
    meta = body["meta"]
    assert (meta["total"], meta["total_pages"], meta["group"]) == (3, 2, "party")
    assert meta["totals"]["profit"] == "260.00"

    searched = owner.get(url, {**period, "q": "ric"}).json()
    assert [row["name"] for row in searched["data"]] == ["Rice"]
    assert searched["meta"]["totals"]["profit"] == "260.00"  # the summary ignores the search

    for bad in ({"group": "supplier"}, {"ordering": "cost"}, {"date_from": "2026-13-01"}):
        assert owner.get(url, bad).status_code == 400
    assert owner.get(url, {"date_to": "2099-01-01"}).status_code == 400

    exported = owner.get(url, {**period, "group": "item", "format": "csv"})
    assert exported.status_code == 200, exported.content
    assert "profit-by-item_2026-10-01_2026-10-06.csv" in exported["Content-Disposition"]
    lines = list(csv.DictReader(io.StringIO(b"".join(exported.streaming_content).decode())))
    assert [line["﻿name" if "﻿name" in line else "name"] for line in lines] == [
        "Rice",
        "Delivery",
        "Oil",
        "TOTAL",
    ]
    assert lines[-1]["profit"] == "260.00"

    staff, _ = api_as(tenant, role="staff")
    assert staff.get(url, period).status_code == 403


def test_expenses_are_absent_not_zero_when_the_expenses_module_is_off(
    tenant: Any, book: dict, api_as: Any
) -> None:
    owner, _ = api_as(tenant)
    tenant.enabled_modules = [code for code in tenant.enabled_modules if code != "expenses"]
    tenant.save(update_fields=["enabled_modules"])
    got = owner.get(reverse(URL), {"date_from": FIRST.isoformat()})
    assert got.status_code == 200, got.content
    assert "net_profit" not in got.json()["meta"]["totals"]
