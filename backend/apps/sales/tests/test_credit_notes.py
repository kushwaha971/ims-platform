"""SAL-04 — credit notes: snapshot pricing, the return cap, restock, settlement, apply, void."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.inventory.models import ItemStock, StockMovement
from apps.ledger.models import LedgerEntry
from apps.sales.models import SalesCreditApplication, SalesDocument, SalesDocumentLine
from apps.sales.tests.conftest import (
    CREDIT_NOTES,
    credit_note_url,
    invoice_url,
    issue_note,
    issued_invoice,
    line,
    recalc_clean,
)

pytestmark = pytest.mark.django_db


def note_draft(client: Any, **body: Any) -> Any:
    body.setdefault("reason", "sales_return")
    return client.post(reverse(CREDIT_NOTES), body, format="json")


def returning(invoice: dict, qty: str, index: int = 0) -> list[dict]:
    return [{"against_line_id": invoice["lines"][index]["id"], "qty": qty}]


def test_partial_return_of_an_inclusive_line_uses_the_invoice_snapshot(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    """T-SAL04-1 / BR-1 — 3 of 5 inclusive units @160 GST5: taxable 457.14, tax 22.86."""
    oil = make_item("Cooking Oil 1L", "160.00", "GST5", inclusive=True)
    invoice = issued_invoice(owner, make_party(), [line(oil, "5")])
    response = note_draft(owner, against_id=invoice["id"], lines=returning(invoice, "3"))
    assert response.status_code == 201, response.json()
    data = response.json()["data"]
    assert data["kind"] == "credit_note" and data["status"] == "draft"
    assert data["taxable_total"] == "457.14"
    assert Decimal(data["cgst_total"]) + Decimal(data["sgst_total"]) == Decimal("22.86")
    assert data["lines"][0]["against_line_id"] == invoice["lines"][0]["id"]


def test_the_document_discount_is_prorated_to_the_returned_line(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    """T-SAL04-2 / FR-4 — returning all of one line takes back exactly its discount share."""
    rice = make_item("Rice", "500.00", "GST0")
    dal = make_item("Dal", "500.00", "GST0")
    invoice = issued_invoice(
        owner,
        make_party(),
        [line(rice, "1"), line(dal, "1")],
        discount_type="amount",
        discount_value="100.00",
    )
    share = Decimal(invoice["doc_discount_allocation"]["1"])
    data = note_draft(owner, against_id=invoice["id"], lines=returning(invoice, "1")).json()["data"]
    assert Decimal(data["discount_amount"]) == share == Decimal("50.00")
    assert data["grand_total"] == "450.00"


def test_the_cap_holds_across_two_partial_credit_notes(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    """T-SAL04-3 / BR-2 — two drafts of 3 against 5 units: the first issues, the second is
    refused on the LOCKED line at issue; a third draft of 3 is refused at once."""
    item = make_item()
    invoice = issued_invoice(owner, make_party(), [line(item, "5")])
    first = note_draft(owner, against_id=invoice["id"], lines=returning(invoice, "3")).json()
    second = note_draft(owner, against_id=invoice["id"], lines=returning(invoice, "3")).json()
    assert issue_note(owner, first["data"]["id"]).status_code == 200

    refused = issue_note(owner, second["data"]["id"])
    assert refused.status_code == 400
    assert refused.json()["error"]["details"]["lines.0.qty"] == ["Only 2 NOS can be returned"]

    third = note_draft(owner, against_id=invoice["id"], lines=returning(invoice, "3"))
    assert third.status_code == 400
    assert SalesDocumentLine.objects.get(pk=invoice["lines"][0]["id"]).returned_qty == 3


def test_issuing_against_an_unpaid_invoice_applies_restocks_and_credits(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    """T-SAL04-4 / AC-1 / AC-2 — number CN/26-27/0001; application row; invoice due down and
    `partially_paid`; ledger credit linked to the note; stock back at the snapshot cost."""
    party, item = make_party(), make_item()
    invoice = issued_invoice(owner, party, [line(item, "4")])
    stock_before = ItemStock.objects.get(item=item)
    created = note_draft(owner, against_id=invoice["id"], lines=returning(invoice, "2")).json()
    response = issue_note(owner, created["data"]["id"])
    assert response.status_code == 200, response.json()
    note, meta = response.json()["data"], response.json()["meta"]
    assert note["number"] == "CN/26-27/0001"
    assert note["status"] == "applied" and note["amount_due"] == "0.00"
    assert meta["invoice"]["amount_due"] == "945.00"
    assert meta["invoice"]["status"] == "partially_paid"
    assert SalesCreditApplication.objects.get(credit_note_id=note["id"]).amount == Decimal("945.00")

    credit = LedgerEntry.objects.get(source_id=note["id"], entry_type="credit_note")
    assert credit.direction == "credit" and credit.amount == Decimal("945.00")
    party.refresh_from_db()
    assert party.balance == Decimal("945.00")

    back = StockMovement.objects.get(source_id=note["id"])
    assert back.movement_type == "sale_return_in" and back.qty == Decimal("2.000")
    assert back.unit_cost == Decimal("380.0000")
    stock = ItemStock.objects.get(item=item)
    assert stock.on_hand == stock_before.on_hand + 2
    assert stock.avg_cost == stock_before.avg_cost
    recalc_clean()


def test_restock_off_moves_no_stock(owner: Any, make_item: Any, make_party: Any) -> None:
    """T-SAL04-5 / AC-2 — damaged goods: `restock: false` writes no movement."""
    item = make_item()
    invoice = issued_invoice(owner, make_party(), [line(item, "2")])
    created = note_draft(
        owner, against_id=invoice["id"], restock=False, lines=returning(invoice, "1")
    ).json()
    assert issue_note(owner, created["data"]["id"]).status_code == 200
    assert not StockMovement.objects.filter(source_id=created["data"]["id"]).exists()


def test_a_refunded_standalone_note_nets_the_party_to_zero(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    """T-SAL04-6 / AC-3 / AC-4 / BR-4 — standalone ₹ note refunded in cash: a credit and a
    `payment_out` debit of the same amount; the note is `applied`."""
    party = make_party()
    service = make_item(
        "Repair visit", "200.00", "GST0", stock=None, item_type="service", hsn_sac="9987"
    )
    created = note_draft(
        owner,
        party_id=str(party.id),
        reason="deficiency",
        settlement="refund",
        refund={"mode_breakup": [{"mode": "cash", "amount": "200.00"}]},
        lines=[line(service, "1")],
    )
    assert created.status_code == 201, created.json()
    response = issue_note(owner, created.json()["data"]["id"])
    assert response.status_code == 200, response.json()
    note = response.json()["data"]
    assert note["status"] == "applied" and note["amount_paid"] == "200.00"
    assert note["links"]["refund"]["mode_breakup"][0]["mode"] == "cash"
    rows = LedgerEntry.objects.filter(source_id=note["id"]).order_by("created_at")
    assert [(r.entry_type, r.direction, r.amount) for r in rows] == [
        ("credit_note", "credit", Decimal("200.00")),
    ]
    # PAY-01 integration — the refund is a real `payment_out` voucher that posts its own
    # debit, sourced to the payment, and names the note in its meta.
    from apps.payments.models import Payment

    refund = Payment.objects.get(pk=note["links"]["refund"]["payment_id"])
    assert (refund.direction, refund.amount, refund.status) == (
        "out",
        Decimal("200.00"),
        "recorded",
    )
    assert refund.meta["credit_note_id"] == note["id"]
    assert note["links"]["refund"]["number"] == refund.number
    debit = LedgerEntry.objects.get(source_type="payment", source_id=refund.id)
    assert (debit.entry_type, debit.direction, debit.amount) == (
        "payment_out",
        "debit",
        Decimal("200.00"),
    )
    party.refresh_from_db()
    assert party.balance == 0
    recalc_clean()


def test_open_credit_applies_to_the_same_partys_invoice_only(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    """T-SAL04-7 / AC-6 / EC-11 — ₹200 open credit on a ₹500-due invoice → due 300, note
    applied; another party's invoice → 400 `invoice_id`; more than is open → 400."""
    party, other = make_party(), make_party(name="Suresh Stores")
    service = make_item("Labour", "200.00", "GST0", stock=None, item_type="service", hsn_sac="9987")
    bill_item = make_item("Bulb", "500.00", "GST0")
    invoice = issued_invoice(owner, party, [line(bill_item, "1")])
    stranger = issued_invoice(owner, other, [line(bill_item, "1")])
    created = note_draft(owner, party_id=str(party.id), lines=[line(service, "1")]).json()
    note = issue_note(owner, created["data"]["id"]).json()["data"]
    assert note["status"] == "issued" and note["amount_due"] == "200.00"

    wrong = owner.post(
        credit_note_url(note["id"], "apply"),
        {"invoice_id": stranger["id"], "amount": "200.00"},
        format="json",
    )
    assert wrong.status_code == 400 and "invoice_id" in wrong.json()["error"]["details"]
    too_much = owner.post(
        credit_note_url(note["id"], "apply"),
        {"invoice_id": invoice["id"], "amount": "250.00"},
        format="json",
    )
    assert too_much.status_code == 400
    applied = owner.post(
        credit_note_url(note["id"], "apply"),
        {"invoice_id": invoice["id"], "amount": "200.00"},
        format="json",
    )
    assert applied.status_code == 200, applied.json()
    assert applied.json()["data"]["status"] == "applied"
    assert applied.json()["meta"]["invoice"] == {
        "id": invoice["id"],
        "amount_due": "300.00",
        "status": "partially_paid",
    }


def test_void_reverses_everything_the_issue_did(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    """T-SAL04-8 / FR-10 / BR-7 — stock reversal, ledger reversal dated today, application
    removed (invoice due back), `returned_qty` restored; caches replay clean."""
    party, item = make_party(), make_item()
    invoice = issued_invoice(owner, party, [line(item, "3")])
    created = note_draft(owner, against_id=invoice["id"], lines=returning(invoice, "3")).json()
    note = issue_note(owner, created["data"]["id"]).json()["data"]
    assert SalesDocument.objects.get(pk=invoice["id"]).status == "paid"

    response = owner.post(credit_note_url(note["id"], "void"), {"reason": "Customer kept it"})
    assert response.status_code == 200, response.json()
    assert response.json()["data"]["status"] == "void"
    assert response.json()["meta"]["reversals"]["ledger_entry_id"]
    back = SalesDocument.objects.get(pk=invoice["id"])
    assert back.status == "issued" and back.amount_due == Decimal(invoice["grand_total"])
    assert not SalesCreditApplication.objects.filter(credit_note_id=note["id"]).exists()
    assert SalesDocumentLine.objects.get(pk=invoice["lines"][0]["id"]).returned_qty == 0
    party.refresh_from_db()
    assert party.balance == Decimal(invoice["grand_total"])
    assert StockMovement.objects.filter(source_id=note["id"], movement_type="reversal").count() == 1
    recalc_clean()

    again = owner.post(credit_note_url(note["id"], "void"), {"reason": "again"})
    assert again.status_code == 409 and again.json()["error"]["code"] == "document_already_void"


def test_a_refunded_note_cannot_be_voided(owner: Any, make_item: Any, make_party: Any) -> None:
    """T-SAL04-8 / FR-10 — "Void the refund payment first"."""
    party = make_party()
    service = make_item("Labour", "100.00", "GST0", stock=None, item_type="service", hsn_sac="9987")
    created = note_draft(
        owner,
        party_id=str(party.id),
        settlement="refund",
        refund={"mode_breakup": [{"mode": "upi", "amount": "100.00"}]},
        lines=[line(service, "1")],
    ).json()
    note = issue_note(owner, created["data"]["id"]).json()["data"]
    refused = owner.post(credit_note_url(note["id"], "void"), {"reason": "Mistake"})
    assert refused.status_code == 400
    assert refused.json()["error"]["details"]["non_field_errors"] == [
        "Void the refund payment first"
    ]


def test_composition_tenant_credit_note_has_no_tax(
    owner: Any, shop: Any, make_item: Any, make_party: Any
) -> None:
    """T-SAL04-9 / BR-10 — a composition tenant's note mirrors its bill: zero tax."""
    item = make_item()
    shop.gst_type = "composition"
    shop.save(update_fields=["gst_type"])
    invoice = issued_invoice(owner, make_party(), [line(item, "2")])
    assert invoice["kind"] == "bill_of_supply"
    data = note_draft(owner, against_id=invoice["id"], lines=returning(invoice, "1")).json()["data"]
    assert data["cgst_total"] == data["sgst_total"] == data["igst_total"] == "0.00"
    assert data["grand_total"] == "450.00"


def test_a_note_against_a_void_or_walk_in_invoice_is_refused(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    """EC-1 / EC-7 — "Invoice is void"; a walk-in bill needs the customer made a party."""
    item = make_item()
    invoice = issued_invoice(owner, make_party(), [line(item, "1")])
    owner.post(invoice_url(invoice["id"], "void"), {"reason": "Duplicate bill"})
    void = note_draft(owner, against_id=invoice["id"], lines=returning(invoice, "1"))
    assert void.status_code == 400
    assert void.json()["error"]["details"]["against_id"] == ["Invoice is void"]


def test_permissions_staff_issue_accountant_reads_staff_cannot_void(
    shop: Any, api_as: Any, owner: Any, make_item: Any, make_party: Any
) -> None:
    """T-SAL04-10 — accountant 403 on create; staff 201 and issue; staff void 403."""
    accountant, _ = api_as(shop, role="accountant")
    staff, _ = api_as(shop, role="staff")
    invoice = issued_invoice(owner, make_party(), [line(make_item(), "2")])
    assert accountant.get(reverse(CREDIT_NOTES)).status_code == 200
    assert note_draft(accountant, against_id=invoice["id"]).status_code == 403
    created = note_draft(staff, against_id=invoice["id"], lines=returning(invoice, "1"))
    assert created.status_code == 201, created.json()
    note = issue_note(staff, created.json()["data"]["id"])
    assert note.status_code == 200
    denied = staff.post(credit_note_url(note.json()["data"]["id"], "void"), {"reason": "No"})
    assert denied.status_code == 403
