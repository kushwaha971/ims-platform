"""Shop item 4 — delivery challans (SAL-09): goods leave on the challan, once.

The defects these prevent: stock taken out twice — once by the challan and again
by the invoice made from it; a bill made from a challan carrying today's
average instead of the cost the goods left at; a challan that posts to the
khata or counts as a sale; a voided challan that leaves the goods "gone"; and a
converted challan voided behind its invoice's back.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.inventory.models import ItemStock
from apps.ledger.models import LedgerEntry
from apps.sales.tests.conftest import INVOICES, invoice_url, issue, line

pytestmark = pytest.mark.django_db

CHALLANS = "v1:sales-challan-list"


def challan_url(document_id: Any, verb: str | None = None) -> str:
    if verb is None:
        return reverse("v1:sales-challan-detail", kwargs={"pk": document_id})
    return reverse(f"v1:sales-challan-{verb}", kwargs={"pk": document_id})


def on_hand(item: Any) -> Decimal:
    return ItemStock.objects.get(item=item).on_hand


def issued_challan(client: Any, party: Any, item: Any, qty: str = "10", **extra: Any) -> dict:
    created = client.post(
        reverse(CHALLANS),
        {"party_id": str(party.id), "lines": [line(item, qty)], **extra},
        format="json",
    )
    assert created.status_code == 201, created.json()
    response = client.post(challan_url(created.json()["data"]["id"], "issue"), {}, format="json")
    assert response.status_code == 200, response.json()
    return response.json()["data"]


def test_the_goods_leave_on_the_challan_and_the_invoice_does_not_take_them_again(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    party, rice = make_party(), make_item(stock="40")
    challan = issued_challan(
        owner,
        party,
        rice,
        challan_type="supply_on_approval",
        transporter="Shree Roadways",
        vehicle_number="mh 12 ab 1234",
    )
    assert (challan["kind"], challan["status"], challan["number"]) == (
        "delivery_challan",
        "issued",
        "DC/26-27/0001",
    )
    assert challan["links"]["challan"] == {
        "type": "supply_on_approval",
        "transporter": "Shree Roadways",
        "vehicle_number": "MH 12 AB 1234",
    }
    assert on_hand(rice) == 30  # the goods left with the challan
    assert challan["amount_due"] == "0.00" and challan["due_on"] is None
    assert not LedgerEntry.objects.filter(party=party).exists()

    converted = owner.post(challan_url(challan["id"], "convert"), {}, format="json")
    assert converted.status_code == 201, converted.json()
    invoice = converted.json()["data"]
    assert invoice["kind"] == "invoice" and invoice["lines"][0]["qty"] == "10.000"
    issued = issue(owner, invoice["id"], version=invoice["version"])
    assert issued.status_code == 200, issued.json()
    assert on_hand(rice) == 30  # NOT 20: the invoice did not take them out again
    # The bill's cost is the cost the goods left at (the opening stock's 380).
    from apps.sales.models import SalesDocumentLine

    cost = SalesDocumentLine.objects.get(document_id=invoice["id"]).unit_cost_snapshot
    assert cost == Decimal("380")
    after = owner.get(challan_url(challan["id"])).json()["data"]
    assert after["status"] == "converted"
    assert after["links"]["converted_to"]["id"] == invoice["id"]


def test_an_invoice_asking_for_more_than_the_challan_moves_only_the_extra(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    party, rice = make_party(), make_item(stock="40")
    challan = issued_challan(owner, party, rice, qty="10")
    invoice = owner.post(challan_url(challan["id"], "convert"), {}, format="json").json()["data"]
    edited = owner.patch(
        invoice_url(invoice["id"]),
        {"version": invoice["version"], "lines": [line(rice, "12")]},
        format="json",
    ).json()["data"]
    assert issue(owner, invoice["id"], version=edited["version"]).status_code == 200
    assert on_hand(rice) == 28  # 10 on the challan, 2 more on the bill


def test_void_brings_the_goods_back_and_a_converted_challan_waits_for_its_invoice(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    party, rice = make_party(), make_item(stock="40")
    challan = issued_challan(owner, party, rice, qty="10")
    short = owner.post(challan_url(challan["id"], "void"), {"reason": "x"}, format="json")
    assert short.status_code == 400
    voided = owner.post(
        challan_url(challan["id"], "void"), {"reason": "Customer returned it"}, format="json"
    )
    assert voided.status_code == 200, voided.json()
    assert voided.json()["data"]["status"] == "void"
    assert on_hand(rice) == 40

    second = issued_challan(owner, party, rice, qty="5")
    owner.post(challan_url(second["id"], "convert"), {}, format="json")
    refused = owner.post(
        challan_url(second["id"], "void"), {"reason": "Changed mind"}, format="json"
    )
    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "document_not_open"
    assert on_hand(rice) == 35


def test_a_challan_is_no_sale(owner: Any, make_item: Any, make_party: Any) -> None:
    """Not in the invoice list, unreachable through the invoice routes, never in a sales figure."""
    from apps.reports.constants import SALE_KINDS

    challan = issued_challan(owner, make_party(), make_item())
    listing = owner.get(reverse(INVOICES), {"tab": "all"}).json()
    assert all(row["id"] != challan["id"] for row in listing["data"])
    assert owner.get(invoice_url(challan["id"])).status_code == 404
    assert "delivery_challan" not in SALE_KINDS


def test_a_draft_needs_a_party_and_the_list_has_its_tabs(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    rice = make_item()
    walk_in = owner.post(
        reverse(CHALLANS), {"walk_in_name": "Counter", "lines": [line(rice, "1")]}, format="json"
    ).json()["data"]
    refused = owner.post(challan_url(walk_in["id"], "issue"), {}, format="json")
    assert refused.status_code == 400 and "party_id" in refused.json()["error"]["details"]
    bad_type = owner.post(
        reverse(CHALLANS),
        {"party_id": str(make_party().id), "challan_type": "gift", "lines": [line(rice)]},
        format="json",
    )
    assert bad_type.status_code == 400
    issued_challan(owner, make_party(name="Gupta Stores"), rice, qty="1")
    body = owner.get(reverse(CHALLANS)).json()
    assert body["meta"]["tabs"]["issued"] == 1 and body["meta"]["tabs"]["draft"] == 1


def test_staff_issue_and_bill_challans_and_only_an_owner_voids(
    shop: Any, api_as: Any, make_item: Any, make_party: Any
) -> None:
    staff, _ = api_as(shop, role="staff")
    challan = issued_challan(staff, make_party(), make_item(), qty="1")
    assert (
        staff.post(
            challan_url(challan["id"], "void"), {"reason": "Wrong"}, format="json"
        ).status_code
        == 403
    )
    assert staff.post(challan_url(challan["id"], "convert"), {}, format="json").status_code == 201
