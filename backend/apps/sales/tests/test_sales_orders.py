"""Shop item 3 — sales orders: confirm, convert into an invoice, cancel, and no side effects.

The defects these prevent: an order that moves stock or a khata before anything
was billed; an order counted in a sales figure (the invoice list, the GST
summary, profit) because some query trusted the status and not the kind; an
order converted twice into two bills; and a sales order that the invoice routes
can read or issue.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.urls import reverse

from apps.inventory.models import StockMovement
from apps.ledger.models import LedgerEntry
from apps.platform_app.models import AuditLog
from apps.sales.tests.conftest import INVOICES, invoice_url, issue, line

pytestmark = pytest.mark.django_db

ORDERS = "v1:sales-order-list"


def order_url(document_id: Any, action: str | None = None) -> str:
    if action is None:
        return reverse("v1:sales-order-detail", kwargs={"pk": document_id})
    name = {"confirm": "confirm", "cancel": "cancel", "convert": "convert"}[action]
    return reverse(f"v1:sales-order-{name}", kwargs={"pk": document_id})


def new_order(client: Any, **body: Any) -> Any:
    return client.post(reverse(ORDERS), body, format="json")


def open_order(client: Any, party: Any, item: Any, qty: str = "2") -> dict:
    created = new_order(client, party_id=str(party.id), lines=[line(item, qty)])
    assert created.status_code == 201, created.json()
    response = client.post(order_url(created.json()["data"]["id"], "confirm"), {}, format="json")
    assert response.status_code == 200, response.json()
    return response.json()["data"]


def test_an_order_is_numbered_when_confirmed_and_converts_once_into_a_draft_invoice(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    """The walk: draft (no number) → open `SO/26-27/0001` → converted, with a draft
    invoice carrying its lines and the link both ways; a second convert is 409."""
    party, item = make_party(), make_item()
    draft = new_order(owner, party_id=str(party.id), lines=[line(item, "3")]).json()["data"]
    assert (draft["kind"], draft["status"], draft["number"]) == ("sales_order", "draft", None)
    confirmed = owner.post(order_url(draft["id"], "confirm"), {}, format="json").json()["data"]
    assert (confirmed["status"], confirmed["number"]) == ("open", "SO/26-27/0001")
    assert confirmed["due_on"] is None and confirmed["amount_due"] == "0.00"

    response = owner.post(order_url(draft["id"], "convert"), {}, format="json")
    assert response.status_code == 201, response.json()
    invoice = response.json()["data"]
    assert (invoice["kind"], invoice["status"]) == ("invoice", "draft")
    assert invoice["lines"][0]["qty"] == "3.000"
    assert invoice["links"]["converted_from"]["id"] == draft["id"]
    after = owner.get(order_url(draft["id"])).json()["data"]
    assert after["status"] == "converted"
    assert after["links"]["converted_to"]["id"] == invoice["id"]

    second = owner.post(order_url(draft["id"], "convert"), {}, format="json")
    assert second.status_code == 409 and second.json()["error"]["code"] == "document_not_draft"
    assert AuditLog.objects.filter(action="sales_order.converted", entity_id=draft["id"]).exists()


def test_a_draft_is_not_billed_and_a_cancelled_order_cannot_be(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    party, item = make_party(), make_item()
    draft = new_order(owner, party_id=str(party.id), lines=[line(item)]).json()["data"]
    refused = owner.post(order_url(draft["id"], "convert"), {}, format="json")
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "document_not_open"
    assert (
        owner.post(order_url(draft["id"], "cancel"), {"reason": "Not needed"}, format="json").status_code
        == 409
    )

    order = open_order(owner, party, item)
    short = owner.post(order_url(order["id"], "cancel"), {"reason": " "}, format="json")
    assert short.status_code == 400
    cancelled = owner.post(
        order_url(order["id"], "cancel"), {"reason": "Customer bought elsewhere"}, format="json"
    )
    assert cancelled.status_code == 200, cancelled.json()
    assert cancelled.json()["data"]["status"] == "cancelled"
    assert owner.post(order_url(order["id"], "convert"), {}, format="json").status_code == 409
    # Only a draft is deleted; a confirmed order keeps its number for ever.
    assert owner.delete(order_url(order["id"])).status_code == 409
    assert owner.delete(order_url(draft["id"])).status_code == 204


def test_an_order_moves_nothing_and_no_sales_figure_counts_it(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    """No stock, no khata, not in the invoice list, and the invoice routes cannot touch it."""
    party, item = make_party(), make_item()
    movements = StockMovement.objects.count()
    order = open_order(owner, party, item)
    assert StockMovement.objects.count() == movements
    assert not LedgerEntry.objects.filter(party=party).exists()
    party.refresh_from_db()
    assert party.balance == 0
    listing = owner.get(reverse(INVOICES), {"tab": "all"}).json()
    assert all(row["id"] != order["id"] for row in listing["data"])
    assert owner.get(invoice_url(order["id"])).status_code == 404
    assert issue(owner, order["id"]).status_code == 404


def test_the_list_has_its_tabs(owner: Any, make_item: Any, make_party: Any) -> None:
    party, item = make_party(), make_item()
    open_order(owner, party, item)
    new_order(owner, party_id=str(party.id), lines=[line(item)])
    body = owner.get(reverse(ORDERS)).json()
    assert body["meta"]["tabs"]["open"] == 1 and body["meta"]["tabs"]["draft"] == 1
    only_open = owner.get(reverse(ORDERS), {"tab": "open"}).json()
    assert [row["status"] for row in only_open["data"]] == ["open"]


def test_the_accountant_reads_and_staff_take_and_bill_orders(
    shop: Any, api_as: Any, make_item: Any, make_party: Any
) -> None:
    accountant, _ = api_as(shop, role="accountant")
    staff, _ = api_as(shop, role="staff")
    assert accountant.get(reverse(ORDERS)).status_code == 200
    assert new_order(accountant, walk_in_name="X", lines=[]).status_code == 403
    order = open_order(staff, make_party(), make_item())
    assert staff.post(order_url(order["id"], "convert"), {}, format="json").status_code == 201
