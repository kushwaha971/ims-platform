"""PAY-01/PAY-05 × SAL-04/SAL-05 — payments and credit notes settle one invoice together.

The integration of `track/w3a-payments` with `track/w3c-sales-completion`:
one formula for an invoice's due (`grand_total − amount_paid − Σ credit
applications`, SAL-02 BR-9) whichever of the two features moves it; an
invoice void leaves its payments as advances (SAL-05 BR-4); a credit note's
refund is a real `payment_out` voucher that PAY-05 can void (SAL-04 FR-10).
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.ledger.models import LedgerEntry
from apps.parties.models import Party
from apps.payments.models import Allocation, Payment
from apps.payments.tests.conftest import cash_lines, pay, void
from apps.sales.models import SalesDocument
from apps.sales.tests.conftest import credit_note_url, invoice_url, issue_note, line, recalc_clean

pytestmark = pytest.mark.django_db


def _note(owner: Any, party: Any, item: Any, **body: Any) -> dict:
    """A standalone credit note for `item` × 1, issued."""
    created = owner.post(
        reverse("v1:sales-credit-note-list"),
        {"party_id": str(party.id), "reason": "deficiency", "lines": [line(item)], **body},
        format="json",
    )
    assert created.status_code == 201, created.json()
    issued = issue_note(owner, created.json()["data"]["id"])
    assert issued.status_code == 200, issued.json()
    return issued.json()["data"]


def _due(invoice: dict) -> tuple[Decimal, Decimal, str]:
    doc = SalesDocument.objects.get(pk=invoice["id"])
    return doc.amount_due, doc.amount_paid, doc.status


def _service(make_item: Any, price: str) -> Any:
    return make_item(
        f"Labour {price}", price, "GST0", stock=None, item_type="service", hsn_sac="9987"
    )


def test_credit_and_payment_share_one_due_formula_through_every_void(
    owner: Any, make_party: Any, make_item: Any, invoice_for: Any
) -> None:
    """Integration W3a×W3c — invoice ₹1000, credit note ₹200 applied, payment ₹300 → due ₹500;
    void the payment → due ₹800 (the credit is not clobbered by the payment's move); void the
    credit note → due ₹1000 (the payment's absence is not clobbered by the credit's refresh)."""
    party = make_party()
    invoice = invoice_for(party, "1000.00")
    note = _note(owner, party, _service(make_item, "200.00"))
    applied = owner.post(
        credit_note_url(note["id"], "apply"),
        {"invoice_id": invoice["id"], "amount": "200.00"},
        format="json",
    )
    assert applied.status_code == 200, applied.json()
    assert _due(invoice) == (Decimal("800.00"), Decimal("0.00"), "partially_paid")

    paid = pay(
        owner,
        party_id=str(party.id),
        mode_breakup=cash_lines("300.00"),
        allocations=[
            {"document_type": "sales_document", "document_id": invoice["id"], "amount": "300.00"}
        ],
    )
    assert paid.status_code == 201, paid.json()
    assert _due(invoice) == (Decimal("500.00"), Decimal("300.00"), "partially_paid")

    assert void(owner, paid.json()["data"]["id"]).status_code == 200
    assert _due(invoice) == (Decimal("800.00"), Decimal("0.00"), "partially_paid")

    voided = owner.post(credit_note_url(note["id"], "void"), {"reason": "Raised in error"})
    assert voided.status_code == 200, voided.json()
    assert _due(invoice) == (Decimal("1000.00"), Decimal("0.00"), "issued")
    recalc_clean()


def test_auto_allocation_takes_only_what_the_credit_left(
    owner: Any, make_party: Any, make_item: Any, invoice_for: Any
) -> None:
    """Integration W3a×W3c — FIFO sees the credit-reduced due: ₹1000 invoice with ₹200 credit
    applied takes ₹800 of a ₹1000 payment; ₹200 stays an advance; the invoice is paid."""
    party = make_party()
    invoice = invoice_for(party, "1000.00")
    note = _note(owner, party, _service(make_item, "200.00"))
    owner.post(
        credit_note_url(note["id"], "apply"),
        {"invoice_id": invoice["id"], "amount": "200.00"},
        format="json",
    )
    paid = pay(owner, party_id=str(party.id), mode_breakup=cash_lines("1000.00"))
    assert paid.status_code == 201, paid.json()
    assert paid.json()["data"]["unallocated_amount"] == "200.00"
    assert _due(invoice) == (Decimal("0.00"), Decimal("800.00"), "paid")
    recalc_clean()


def test_an_invoice_void_leaves_its_party_payment_as_an_advance(
    owner: Any, make_party: Any, invoice_for: Any
) -> None:
    """SAL-05 BR-4 / FR-6 × PAY-05 — the ₹300 receipt stays `recorded`, its allocation is gone,
    its unallocated amount is ₹300, the void response names it, and the khata shows the
    advance (balance −₹300 once the invoice debit is reversed)."""
    party = make_party()
    invoice = invoice_for(party, "1000.00")
    paid = pay(owner, party_id=str(party.id), mode_breakup=cash_lines("300.00")).json()["data"]
    response = owner.post(invoice_url(invoice["id"], "void"), {"reason": "Duplicate bill"})
    assert response.status_code == 200, response.json()
    assert response.json()["meta"]["unallocated_payments"] == [
        {
            "payment_id": paid["id"],
            "number": paid["number"],
            "amount": "300.00",
            "walk_in": False,
            "voided": False,  # UAT D3 — only a walk-in's counter receipt is voided
        }
    ]
    payment = Payment.objects.get(pk=paid["id"])
    assert payment.status == "recorded" and payment.unallocated_amount == Decimal("300.00")
    assert not Allocation.objects.filter(document_id=invoice["id"]).exists()
    assert Party.objects.get(pk=party.id).balance == Decimal("-300.00")
    recalc_clean()


def test_voiding_the_refund_payment_lets_the_credit_note_be_voided(
    owner: Any, make_party: Any, make_item: Any
) -> None:
    """SAL-04 FR-10 × PAY-05 — a refunded note is refused until its refund is voided; voiding
    the `payment_out` voucher returns the ₹150 to the note as open credit (status `issued`),
    and then the note voids and the khata nets back to zero."""
    party = make_party()
    note = _note(
        owner,
        party,
        _service(make_item, "150.00"),
        settlement="refund",
        refund={"mode_breakup": [{"mode": "cash", "amount": "150.00"}]},
    )
    assert note["status"] == "applied" and note["amount_paid"] == "150.00"
    refused = owner.post(credit_note_url(note["id"], "void"), {"reason": "Mistake"})
    assert refused.status_code == 400

    refund_id = note["links"]["refund"]["payment_id"]
    assert void(owner, refund_id, "Refund not handed over").status_code == 200
    back = SalesDocument.objects.get(pk=note["id"])
    assert (back.status, back.amount_paid, back.amount_due) == (
        "issued",
        Decimal("0.00"),
        Decimal("150.00"),
    )
    assert back.meta["refund"]["voided"] is True
    assert Party.objects.get(pk=party.id).balance == Decimal("-150.00")

    voided = owner.post(credit_note_url(note["id"], "void"), {"reason": "Mistake"})
    assert voided.status_code == 200, voided.json()
    assert Party.objects.get(pk=party.id).balance == Decimal("0.00")
    assert LedgerEntry.objects.filter(source_id=note["id"], entry_type="reversal").count() == 1
    recalc_clean()
