"""Bill-wise profit (docs/platform/15 §1.4 item 1; Vyapar's bill-wise profit).

The defect class this guards: a margin figure that is not true. Each line's
cost is frozen on the line when the bill is issued; the profit is the line's
taxable value (after discounts, before GST) less that cost; a line whose cost
was never known is shown without a profit rather than as pure profit; returns
count only what stayed sold; and nobody without `reports.financial.read` sees
a cost (INV-08 EC-4).
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.sales.tests.conftest import CREDIT_NOTES, invoice_url, issue_note, issued_invoice, line

pytestmark = pytest.mark.django_db


def _profit(client: Any, invoice: dict) -> Any:
    return client.get(invoice_url(invoice["id"], "profit"))


def test_a_stock_item_earns_its_price_less_the_average_it_left_at(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    rice = make_item("Basmati Rice 5kg", "450.00", "GST5")  # 40 in at 380
    invoice = issued_invoice(owner, make_party(), [line(rice, "2")])
    data = _profit(owner, invoice).json()["data"]
    row = data["lines"][0]
    assert (row["sale_value"], row["cost"], row["profit"], row["margin_pct"]) == (
        "900.00",
        "760.00",
        "140.00",
        "15.6",
    )
    assert data["totals"] == {
        "sale_value": "900.00",
        "cost": "760.00",
        "profit": "140.00",
        "margin_pct": "15.6",
    }
    assert data["lines_without_cost"] == 0


def test_a_past_bill_keeps_the_cost_it_was_sold_at(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    """Today's average moving must not rewrite yesterday's profit."""
    from apps.inventory.models import Item

    rice = make_item("Rice", "450.00", "GST5")
    invoice = issued_invoice(owner, make_party(), [line(rice, "1")])
    Item.objects.filter(pk=rice.pk).update(purchase_price=Decimal("999.00"))
    assert _profit(owner, invoice).json()["data"]["lines"][0]["cost"] == "380.00"


def test_an_item_without_stock_is_costed_at_its_purchase_price_then(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    bag = make_item(
        "Carry bag", "100.00", "GST0", stock=None, track_stock=False, purchase_price="70.00"
    )
    invoice = issued_invoice(owner, make_party(), [line(bag, "3")])
    row = _profit(owner, invoice).json()["data"]["lines"][0]
    assert (row["cost"], row["profit"]) == ("210.00", "90.00")


def test_a_line_with_no_known_cost_is_not_counted_as_pure_profit(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    rice = make_item("Rice", "450.00", "GST5")
    fitting = make_item(
        "Fitting charge",
        "200.00",
        "GST18",
        stock=None,
        item_type="service",
        track_stock=False,
        hsn_sac="998729",
    )
    invoice = issued_invoice(owner, make_party(), [line(rice, "1"), line(fitting, "1")])
    data = _profit(owner, invoice).json()["data"]
    assert data["lines"][1]["profit"] is None and data["lines"][1]["cost"] is None
    assert data["lines_without_cost"] == 1
    assert data["totals"]["sale_value"] == "450.00"
    assert data["totals"]["profit"] == "70.00"


def test_a_return_counts_only_what_stayed_sold(owner: Any, make_item: Any, make_party: Any) -> None:
    rice = make_item("Rice", "450.00", "GST5")
    invoice = issued_invoice(owner, make_party(), [line(rice, "4")])
    note = owner.post(
        reverse(CREDIT_NOTES),
        {
            "reason": "sales_return",
            "against_id": invoice["id"],
            "lines": [{"against_line_id": invoice["lines"][0]["id"], "qty": "1"}],
        },
        format="json",
    ).json()["data"]
    assert issue_note(owner, note["id"], version=note["version"]).status_code == 200
    row = _profit(owner, invoice).json()["data"]["lines"][0]
    assert (row["returned_qty"], row["sale_value"], row["cost"]) == ("1.000", "1350.00", "1140.00")


@pytest.mark.parametrize("role", ["staff"])
def test_staff_never_see_a_cost(
    role: str, owner: Any, shop: Any, api_as: Any, make_item: Any, make_party: Any
) -> None:
    rice = make_item("Rice", "450.00", "GST5")
    invoice = issued_invoice(owner, make_party(), [line(rice, "1")])
    staff, _ = api_as(shop, role)
    assert _profit(staff, invoice).status_code == 403
