"""The sales payment seam, replaced — money taken at issue is a real PAY-01 payment.

SAL-07 FR-4 (walk-in, paid in full, no khata line) and SAL-02 FR-10 (party
payment at issue, part or whole or more, the khata showing the bill AND the
receipt — LED-10 BR-4). CR-2026-09-24-SAL-A refused party payments at issue
until this existed.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

import pytest

from apps.ledger.constants import EntryType
from apps.ledger.models import LedgerEntry
from apps.parties.models import Party
from apps.payments.models import Allocation, Payment
from apps.payments.tests.conftest import void
from apps.payments.tests.test_record import assert_books_clean
from apps.sales.models import SalesDocument
from apps.sales.tests.conftest import draft, issue, line

pytestmark = pytest.mark.django_db


def _cash(amount: str) -> dict:
    return {"mode_breakup": [{"mode": "cash", "amount": amount}]}


def test_a_walk_in_sale_is_paid_by_a_receipt_and_posts_no_khata_line(
    owner: Any, make_item: Any
) -> None:
    """SAL-07 FR-4 / BR-2 — a `payments_payment` with no party, allocated to the bill in
    full; the bill is paid; no ledger row; the print still reads `payment.mode_breakup`."""
    item = make_item(price="100.00", tax_code="GST0")
    doc = draft(owner, lines=[line(item, "2")]).json()["data"]
    split = {
        "mode_breakup": [
            {"mode": "upi", "amount": "150.00", "reference": "UTR1"},
            {"mode": "cash", "amount": "50.00"},
        ]
    }
    data = issue(owner, doc["id"], payment=split).json()["data"]
    assert data["status"] == "paid" and data["amount_paid"] == "200.00"
    payment = Payment.objects.get()
    assert payment.party_id is None and payment.amount == Decimal("200.00")
    assert payment.primary_mode == "upi" and payment.number == "RCT/26-27/0001"
    assert Allocation.objects.get().document_id == SalesDocument.objects.get().id
    assert data["payment"]["number"] == payment.number
    assert [r["mode"] for r in data["payment"]["mode_breakup"]] == ["upi", "cash"]
    assert data["payments"][0]["number"] == payment.number
    assert not LedgerEntry.objects.exists()


def test_a_party_can_pay_part_of_the_bill_at_issue(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    """SAL-02 FR-10 / LED-10 BR-4 — ₹300 of ₹898 at the counter: partially paid, ₹598 due;
    the khata carries the invoice debit AND the receipt credit, and the balance is ₹598."""
    party = make_party()
    item = make_item(price="898.00", tax_code="GST0")
    doc = draft(owner, party_id=str(party.id), lines=[line(item)]).json()["data"]
    response = issue(owner, doc["id"], payment=_cash("300.00"))
    assert response.status_code == 200, response.json()
    data = response.json()["data"]
    assert (data["status"], data["amount_paid"], data["amount_due"]) == (
        "partially_paid",
        "300.00",
        "598.00",
    )
    assert response.json()["meta"]["party_balance"] == "598.00"
    types = list(
        LedgerEntry.objects.filter(party=party)
        .order_by("created_at")
        .values_list("entry_type", flat=True)
    )
    assert types == [EntryType.INVOICE, EntryType.PAYMENT_IN]
    assert Party.objects.get(pk=party.pk).balance == Decimal("598.00")
    assert_books_clean()


def test_paying_more_than_the_bill_at_issue_keeps_the_rest_as_advance(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    """PAY-02 EC-2 — allowed for a party: the bill is paid, ₹102 sits on the khata."""
    party = make_party()
    item = make_item(price="898.00", tax_code="GST0")
    doc = draft(owner, party_id=str(party.id), lines=[line(item)]).json()["data"]
    data = issue(owner, doc["id"], payment=_cash("1000.00")).json()["data"]
    assert data["status"] == "paid" and data["due_on"] is None
    payment = Payment.objects.get()
    assert payment.unallocated_amount == Decimal("102.00")
    assert Party.objects.get(pk=party.pk).balance == Decimal("-102.00")


def test_voiding_the_payment_taken_at_issue_reopens_the_bill(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    """PAY-05 FR-6 — the invoice debit stays; the receipt is reversed; the bill is issued."""
    party = make_party()
    item = make_item(price="898.00", tax_code="GST0")
    doc = draft(owner, party_id=str(party.id), lines=[line(item)]).json()["data"]
    issue(owner, doc["id"], payment=_cash("898.00"))
    void(owner, Payment.objects.get().id, "Cheque bounced")
    document = SalesDocument.objects.get()
    assert (document.status, document.amount_due) == ("issued", Decimal("898.00"))
    assert Party.objects.get(pk=party.pk).balance == Decimal("898.00")
    assert_books_clean()


def test_voiding_a_walk_in_payment_reopens_the_bill_with_nobody_to_owe(
    owner: Any, make_item: Any
) -> None:
    """PAY-05 FR-5 / T-PAY-05-4 — allowed; the bill is `issued` with nothing paid, its due
    held at zero (a walk-in is never a receivable); no ledger rows either side."""
    item = make_item(price="100.00", tax_code="GST0")
    doc = draft(owner, lines=[line(item)]).json()["data"]
    issue(owner, doc["id"], payment=_cash("100.00"))
    assert void(owner, Payment.objects.get().id, "Customer returned").status_code == 200
    document = SalesDocument.objects.get()
    assert (document.status, document.amount_paid, document.amount_due) == (
        "issued",
        Decimal("0.00"),
        Decimal("0.00"),
    )
    assert not LedgerEntry.objects.exists()


def test_a_bad_payment_line_refuses_the_issue_and_writes_nothing(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    """The lines are validated BEFORE anything is written — no half-issued bill."""
    party = make_party()
    doc = draft(owner, party_id=str(party.id), lines=[line(make_item())]).json()["data"]
    response = issue(owner, doc["id"], payment={"mode_breakup": [{"mode": "gold", "amount": "1"}]})
    assert response.status_code == 400
    assert "payment.mode_breakup.0.mode" in response.json()["error"]["details"]
    assert SalesDocument.objects.get().status == "draft"
    assert not Payment.objects.exists()
