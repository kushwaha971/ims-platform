"""Shop item 3 — purchase orders: send, create the bill, cancel, and never count as a bill.

Orders share `purchases_document` with bills, so the defects worth a test are the
ones that sharing invites: a sent order in the bills list, the purchases graph,
the item's purchase tab or its "last price paid"; a bill route that can record,
void or edit an order; an order that is payable; and an order billed twice.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.urls import reverse

from apps.inventory.models import ItemStock
from apps.ledger.models import LedgerEntry
from apps.purchases.tests.conftest import BILLS, bill_url, line, record

pytestmark = pytest.mark.django_db

ORDERS = "v1:purchase-order-list"


def order_url(document_id: Any, verb: str | None = None) -> str:
    base = reverse("v1:purchase-order-detail", args=[document_id])
    return f"{base}/{verb}" if verb else base


def new_order(client: Any, **body: Any) -> Any:
    return client.post(reverse(ORDERS), body, format="json")


def sent_order(client: Any, supplier: Any, item: Any, qty: str = "30", cost: str = "46.00") -> dict:
    created = new_order(client, party_id=str(supplier.id), lines=[line(item, qty, cost)])
    assert created.status_code == 201, created.json()
    sent = client.post(order_url(created.json()["data"]["id"], "send"), {}, format="json")
    assert sent.status_code == 200, sent.json()
    return sent.json()["data"]


def test_an_order_is_numbered_when_sent_and_becomes_one_draft_bill(
    owner: Any, make_supplier: Any, make_item: Any
) -> None:
    supplier, rice = make_supplier(), make_item()
    expected = (dt.date.today() + dt.timedelta(days=10)).isoformat()
    draft = new_order(
        owner, party_id=str(supplier.id), due_on=expected, lines=[line(rice, "30", "46.00")]
    ).json()["data"]
    assert (draft["kind"], draft["status"], draft["number"]) == ("purchase_order", "draft", None)
    assert draft["amount_due"] == "0.00"  # an order is never payable
    order = owner.post(order_url(draft["id"], "send"), {}, format="json").json()["data"]
    assert (order["status"], order["number"]) == ("sent", "PO/26-27/0001")
    assert order["due_on"] == expected  # "Expected by" may be in the future

    response = owner.post(order_url(order["id"], "create-bill"), {}, format="json")
    assert response.status_code == 201, response.json()
    bill = response.json()["data"]
    assert (bill["kind"], bill["status"]) == ("purchase_bill", "draft")
    assert bill["lines"][0]["qty"] == "30.000" and bill["lines"][0]["unit_cost"] == "46.0000"
    assert bill["links"]["order"]["id"] == order["id"]
    after = owner.get(order_url(order["id"])).json()["data"]
    assert after["status"] == "billed" and after["links"]["bill"]["id"] == bill["id"]
    again = owner.post(order_url(order["id"], "create-bill"), {}, format="json")
    assert again.status_code == 409 and again.json()["error"]["code"] == "document_not_open"

    # The bill records like any bill: stock and the khata move then, not before.
    recorded = record(owner, bill["id"], version=bill["version"], supplier_invoice_number="AT/1")
    assert recorded.status_code == 200, recorded.json()
    assert ItemStock.objects.get(item=rice).on_hand == 30


def test_a_sent_order_counts_as_no_purchase_anywhere(
    owner: Any, make_supplier: Any, make_item: Any
) -> None:
    """No stock, no khata, not in the bills list, the item's purchases or its last price,
    and the bill routes cannot record, void or edit it."""
    from apps.reports.selectors.item_trade import item_trade, last_rate

    supplier, rice = make_supplier(), make_item()
    order = sent_order(owner, supplier, rice)
    assert not ItemStock.objects.filter(item=rice, on_hand__gt=0).exists()
    assert not LedgerEntry.objects.filter(party=supplier).exists()
    listing = owner.get(reverse(BILLS), {"tab": "all"}).json()
    assert listing["data"] == [] and listing["meta"]["counts"]["draft"] == 0
    tenant = supplier.tenant
    trade = item_trade(tenant=tenant, item_id=rice.id, side="purchases", with_margin=True)
    assert trade["by_party"] == []
    assert last_rate(tenant=tenant, item_id=rice.id, side="purchases", party_id=supplier.id) is None
    assert owner.get(bill_url(order["id"])).status_code == 404
    assert record(owner, order["id"]).status_code == 404
    assert (
        owner.post(
            bill_url(order["id"], "void"), {"reason": "Entered twice"}, format="json"
        ).status_code
        == 404
    )


def test_cancel_takes_a_reason_and_a_cancelled_order_is_never_billed(
    owner: Any, make_supplier: Any, make_item: Any
) -> None:
    supplier, rice = make_supplier(), make_item()
    draft = new_order(owner, party_id=str(supplier.id), lines=[line(rice, "5")]).json()["data"]
    assert (
        owner.post(
            order_url(draft["id"], "cancel"), {"reason": "Not needed"}, format="json"
        ).status_code
        == 409
    )
    order = sent_order(owner, supplier, rice)
    assert (
        owner.post(order_url(order["id"], "cancel"), {"reason": " "}, format="json").status_code
        == 400
    )
    cancelled = owner.post(
        order_url(order["id"], "cancel"), {"reason": "Supplier out of stock"}, format="json"
    ).json()["data"]
    assert cancelled["status"] == "cancelled"
    assert cancelled["links"]["cancel_reason"] == "Supplier out of stock"
    assert owner.post(order_url(order["id"], "create-bill"), {}, format="json").status_code == 409
    assert owner.delete(order_url(order["id"])).status_code == 409
    assert owner.delete(order_url(draft["id"])).status_code == 204


def test_a_voided_bill_frees_its_order_to_be_billed_again(
    owner: Any, make_supplier: Any, make_item: Any
) -> None:
    supplier, rice = make_supplier(), make_item()
    order = sent_order(owner, supplier, rice)
    bill = owner.post(order_url(order["id"], "create-bill"), {}, format="json").json()["data"]
    owner.delete(bill_url(bill["id"]))  # the draft discarded
    second = owner.post(order_url(order["id"], "create-bill"), {}, format="json")
    assert second.status_code == 201, second.json()


def test_the_list_has_its_tabs_and_counts_what_is_still_on_order(
    owner: Any, make_supplier: Any, make_item: Any
) -> None:
    supplier, rice = make_supplier(), make_item()
    sent_order(owner, supplier, rice, qty="10", cost="40.00")
    new_order(owner, party_id=str(supplier.id), lines=[line(rice, "5")])
    body = owner.get(reverse(ORDERS)).json()
    assert body["meta"]["counts"]["sent"] == 1 and body["meta"]["counts"]["draft"] == 1
    assert body["meta"]["totals"]["count"] == 2
    sent_only = owner.get(reverse(ORDERS), {"tab": "sent"}).json()
    assert [row["status"] for row in sent_only["data"]] == ["sent"]


def test_the_accountant_reads_orders_and_cannot_write_one(
    shop: Any, api_as: Any, make_supplier: Any, make_item: Any
) -> None:
    accountant, _ = api_as(shop, role="accountant")
    assert accountant.get(reverse(ORDERS)).status_code == 200
    created = new_order(
        accountant, party_id=str(make_supplier().id), lines=[line(make_item(), "1")]
    )
    assert created.status_code == 403
