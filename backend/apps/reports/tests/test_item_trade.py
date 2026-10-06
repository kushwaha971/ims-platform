"""The item page's Sales and Purchases tabs — who bought it, who sold it to us.

Shop gap §1.4 (Vyapar and myBillBook open an item on its own transactions).
These pin that the figures are what stayed sold (a returned half is not a
sale), that a line without a known cost is left out of the margin rather than
counted as pure profit, that margin is ABSENT without `reports.financial.read`,
and that each side is gated by its own document permission.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.reports.selectors.item_trade import item_trade
from apps.reports.tests import builders as b

pytestmark = pytest.mark.django_db

TODAY = dt.date(2026, 10, 6)
TRADE = "v1:report-item-trade"


def _sold(
    doc: Any, item: Any, *, qty: str, value: str, cost: str | None, returned: str = "0"
) -> Any:
    from apps.sales.models import SalesDocumentLine

    return SalesDocumentLine.objects.create(
        document=doc,
        line_no=doc.lines.count() + 1,
        item=item,
        description=item.name,
        qty=Decimal(qty),
        unit_code="NOS",
        unit_price=Decimal(value) / Decimal(qty),
        taxable_value=Decimal(value),
        tax_code="GST0",
        line_total=Decimal(value),
        unit_cost_snapshot=None if cost is None else Decimal(cost),
        returned_qty=Decimal(returned),
    )


def _bought(doc: Any, item: Any, *, qty: str, cost: str) -> Any:
    from apps.purchases.models import PurchaseDocumentLine

    value = Decimal(qty) * Decimal(cost)
    return PurchaseDocumentLine.objects.create(
        document=doc,
        line_no=doc.lines.count() + 1,
        item=item,
        description=item.name,
        qty=Decimal(qty),
        unit_code="NOS",
        unit_cost=Decimal(cost),
        taxable_value=value,
        tax_code="GST0",
        line_total=value,
    )


def test_sales_by_customer_count_what_stayed_sold_and_cost_only_what_is_known(tenant: Any) -> None:
    rice = b.stocked_item(tenant, "Rice", on_hand=100)
    other = b.stocked_item(tenant, "Dal", on_hand=100)
    ramesh, suresh = b.party(tenant, "Ramesh"), b.party(tenant, "Suresh")
    # 10 sold at 50, 4 came back: 6 stayed, value 300, cost 6 x 40 = 240.
    _sold(
        b.sale(tenant, TODAY, "500", party=ramesh),
        rice,
        qty="10",
        value="500",
        cost="40",
        returned="4",
    )
    # 2 at 60, cost unknown: counted in value and qty, not in margin.
    _sold(
        b.sale(tenant, TODAY - dt.timedelta(days=3), "120", party=ramesh),
        rice,
        qty="2",
        value="120",
        cost=None,
    )
    _sold(b.sale(tenant, TODAY, "1000", party=suresh), rice, qty="20", value="1000", cost="40")
    _sold(
        b.sale(tenant, TODAY, "100", walk_in_name="Counter"), rice, qty="1", value="100", cost="40"
    )
    _sold(
        b.sale(tenant, TODAY, "999", party=ramesh, status="void"),
        rice,
        qty="9",
        value="999",
        cost="1",
    )
    _sold(
        b.sale(tenant, TODAY, "999", party=ramesh, kind="estimate"),
        rice,
        qty="9",
        value="999",
        cost="1",
    )
    _sold(b.sale(tenant, TODAY, "999", party=ramesh), other, qty="9", value="999", cost="1")

    got = item_trade(tenant=tenant, item_id=rice.id, side="sales", with_margin=True)

    rows = {(r["party"] or {}).get("name"): r for r in got["by_party"]}
    assert [(r["party"] or {}).get("name") for r in got["by_party"]] == ["Suresh", "Ramesh", None]
    assert rows["Ramesh"]["qty"] == "8.000"
    assert rows["Ramesh"]["amount"] == "420.00"
    assert rows["Ramesh"]["avg_rate"] == "52.50"
    assert rows["Ramesh"]["margin"] == "60.00"
    assert rows["Ramesh"]["documents"] == 2
    assert rows["Ramesh"]["last_date"] == TODAY.isoformat()
    assert rows["Suresh"]["margin"] == "200.00"
    assert got["totals"] == {
        "qty": "29.000",
        "amount": "1520.00",
        "avg_rate": "52.41",
        "margin": "320.00",
        "margin_pct": "22.9",  # 320 over the 1400 whose cost is known
        "uncosted_lines": 1,
    }
    assert len(got["lines"]) == 4
    assert got["lines"][0]["document"]["date"] == TODAY.isoformat()
    walk_in = next(line for line in got["lines"] if line["party"] is None)
    assert walk_in["walk_in_name"] == "Counter"
    uncosted = next(line for line in got["lines"] if line["qty"] == "2.000")
    assert uncosted["margin"] is None


def test_margin_is_absent_not_zero_without_the_financial_permission(tenant: Any) -> None:
    rice = b.stocked_item(tenant, "Rice", on_hand=10)
    _sold(
        b.sale(tenant, TODAY, "100", party=b.party(tenant)), rice, qty="1", value="100", cost="40"
    )
    got = item_trade(tenant=tenant, item_id=rice.id, side="sales", with_margin=False)
    assert "margin" not in got["totals"] and "margin_pct" not in got["totals"]
    assert "margin" not in got["by_party"][0]
    assert "margin" not in got["lines"][0]


def test_purchases_by_supplier_give_the_last_price_paid(tenant: Any) -> None:
    rice = b.stocked_item(tenant, "Rice", on_hand=10)
    agro, mill = b.party(tenant, "Agro Wholesale"), b.party(tenant, "Mill")
    _bought(
        b.purchase(tenant, TODAY - dt.timedelta(days=30), "400", party=agro),
        rice,
        qty="10",
        cost="40",
    )
    _bought(b.purchase(tenant, TODAY, "420", party=agro), rice, qty="10", cost="42")
    _bought(b.purchase(tenant, TODAY, "380", party=mill), rice, qty="10", cost="38")
    _bought(b.purchase(tenant, TODAY, "9999", party=mill, status="void"), rice, qty="99", cost="1")

    got = item_trade(tenant=tenant, item_id=rice.id, side="purchases", with_margin=True)

    assert [r["party"]["name"] for r in got["by_party"]] == ["Agro Wholesale", "Mill"]
    agro_row = got["by_party"][0]
    assert (agro_row["qty"], agro_row["amount"], agro_row["avg_rate"]) == (
        "20.000",
        "820.00",
        "41.00",
    )
    assert agro_row["last_date"] == TODAY.isoformat()
    assert "margin" not in agro_row and "margin" not in got["totals"]
    assert got["totals"]["amount"] == "1200.00"
    assert {line["rate"] for line in got["lines"]} == {"40.00", "42.00", "38.00"}

    since = item_trade(
        tenant=tenant, item_id=rice.id, side="purchases", with_margin=True, date_from=TODAY
    )
    assert since["totals"]["amount"] == "800.00"


def test_the_endpoint_gates_each_side_by_its_own_document_permission(
    tenant: Any, api_as: Any
) -> None:
    rice = b.stocked_item(tenant, "Rice", on_hand=10)
    _sold(
        b.sale(tenant, TODAY, "100", party=b.party(tenant)), rice, qty="1", value="100", cost="40"
    )
    owner, _ = api_as(tenant)
    url = reverse(TRADE, kwargs={"item_id": rice.id})
    got = owner.get(url, {"side": "sales"})
    assert got.status_code == 200, got.content
    assert got["Cache-Control"] == "private, no-store"
    assert got.json()["data"]["totals"]["margin"] == "60.00"
    assert owner.get(url, {"side": "purchases"}).status_code == 200
    assert owner.get(url, {"side": "returns"}).status_code == 400
    assert owner.get(url, {"from": "2026-13-01"}).status_code == 400
    import uuid

    assert owner.get(reverse(TRADE, kwargs={"item_id": uuid.uuid4()})).status_code == 404

    staff, member = api_as(tenant, role="staff")
    member.permissions_override = {"deny": ["purchases.bill.read", "reports.financial.read"]}
    member.save(update_fields=["permissions_override"])
    assert staff.get(url, {"side": "purchases"}).status_code == 403
    sales = staff.get(url, {"side": "sales"})
    assert sales.status_code == 200, sales.content
    assert "margin" not in sales.json()["data"]["totals"]
