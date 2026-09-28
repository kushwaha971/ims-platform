"""PAY-05 — voiding a payment: bills reopen exactly, the khata line is reversed today."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

import pytest

from apps.common.audit import AuditAction
from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.ledger.constants import EntryStatus, EntryType, SourceType
from apps.ledger.models import LedgerEntry
from apps.parties.models import Party
from apps.payments.models import Allocation, Payment
from apps.payments.services.void import release_document_allocations
from apps.payments.tests.conftest import cash_lines, pay, upi, void
from apps.payments.tests.test_record import assert_books_clean
from apps.platform_app.models import AuditLog
from apps.sales.models import SalesDocument

pytestmark = pytest.mark.django_db


def _doc(data: dict) -> SalesDocument:
    return SalesDocument.objects.get(pk=data["id"])


def test_void_reopens_the_bill_and_reverses_the_khata_line_dated_today(
    owner: Any, make_party: Any, invoice_for: Any, shop: Any
) -> None:
    """AC-1 / AC-2 / T-PAY-05-2 — the only payment on INV ₹898 is voided: the bill is
    `issued` with ₹898 due and no allocation left; the ₹500 credit is `reversed` and a
    DEBIT reversal dated TODAY, sourced to the payment, restores the balance to ₹898."""
    ramesh = make_party()
    inv = invoice_for(ramesh, "898.00", days_ago=3)
    paid = pay(owner, party_id=str(ramesh.id), mode_breakup=upi("500.00", "UTR1")).json()["data"]
    response = void(owner, paid["id"], "Wrong party — was Suresh")
    assert response.status_code == 200, response.json()
    body = response.json()
    assert body["data"]["status"] == "void"
    assert body["data"]["void_reason"] == "Wrong party — was Suresh"
    assert body["data"]["unallocated_amount"] == "0.00"
    assert body["data"]["number"] == paid["number"]
    assert body["meta"]["party_balance"] == "898.00"
    assert body["meta"]["documents"][0]["status"] == "issued"
    doc = _doc(inv)
    assert (doc.status, doc.amount_paid, doc.amount_due) == (
        "issued",
        Decimal("0"),
        Decimal("898.00"),
    )
    assert not Allocation.objects.exists()

    original = LedgerEntry.objects.get(entry_type=EntryType.PAYMENT_IN)
    reversal = LedgerEntry.objects.get(entry_type=EntryType.REVERSAL)
    assert original.status == EntryStatus.REVERSED and original.reversed_by_id == reversal.id
    assert reversal.direction == "debit" and reversal.amount == Decimal("500.00")
    assert reversal.entry_date == tenant_today(shop)
    assert (reversal.source_type, reversal.source_id) == (SourceType.PAYMENT, original.source_id)
    assert reversal.reason == "Wrong party — was Suresh"
    assert body["meta"]["reversal_entry_id"] == str(reversal.id)
    assert Party.objects.get(pk=ramesh.pk).balance == Decimal("898.00")
    audit = AuditLog.objects.get(action=AuditAction.PAYMENT_VOIDED)
    assert audit.before["allocations"][0]["amount"] == "500.00"
    assert_books_clean()


def test_void_leaves_a_bill_another_payment_also_settled_partly_paid(
    owner: Any, make_party: Any, invoice_for: Any
) -> None:
    """T-PAY-05-1 / EC-2 — recomputed, never toggled: two payments made it paid; voiding
    one leaves it partially paid with exactly that payment's share due again."""
    party = make_party()
    inv = invoice_for(party, "898.00")
    first = pay(owner, party_id=str(party.id), mode_breakup=cash_lines("500.00")).json()["data"]
    pay(
        owner,
        party_id=str(party.id),
        mode_breakup=[
            {"mode": "cash", "amount": "200.00"},
            {"mode": "upi", "amount": "198.00"},
        ],
    )
    assert _doc(inv).status == "paid"
    void(owner, first["id"])
    doc = _doc(inv)
    assert (doc.status, doc.amount_paid, doc.amount_due) == (
        "partially_paid",
        Decimal("398.00"),
        Decimal("500.00"),
    )
    assert_books_clean()


def test_a_second_void_is_refused(owner: Any, make_party: Any) -> None:
    """T-PAY-05-3 — 409 `payment_already_void`; nothing reversed twice."""
    party = make_party()
    paid = pay(owner, party_id=str(party.id), mode_breakup=cash_lines("10.00")).json()["data"]
    assert void(owner, paid["id"]).status_code == 200
    again = void(owner, paid["id"])
    assert again.status_code == 409 and again.json()["error"]["code"] == "payment_already_void"
    assert LedgerEntry.objects.filter(entry_type=EntryType.REVERSAL).count() == 1


def test_voiding_an_advance_moves_the_balance_by_the_full_amount(
    owner: Any, make_party: Any
) -> None:
    """T-PAY-05-6 / BR-5 — nothing to reopen; the whole ₹1,000 leaves the khata."""
    party = make_party()
    paid = pay(owner, party_id=str(party.id), mode_breakup=cash_lines("1000.00")).json()["data"]
    assert Party.objects.get(pk=party.pk).balance == Decimal("-1000.00")
    void(owner, paid["id"])
    assert Party.objects.get(pk=party.pk).balance == Decimal("0.00")
    assert Payment.objects.get().unallocated_amount == Decimal("0.00")


def test_a_reason_is_required(owner: Any, make_party: Any) -> None:
    """§10 — 3–160 characters; whitespace is not a reason (EC-8)."""
    party = make_party()
    paid = pay(owner, party_id=str(party.id), mode_breakup=cash_lines("10.00")).json()["data"]
    assert void(owner, paid["id"], "  ").status_code == 400
    assert Payment.objects.get().status == "recorded"


def test_only_owner_and_admin_void(shop: Any, api_as: Any, owner: Any, make_party: Any) -> None:
    """T-PAY-05-7 — staff 403, accountant 403, admin 200."""
    party = make_party()
    paid = pay(owner, party_id=str(party.id), mode_breakup=cash_lines("10.00")).json()["data"]
    staff, _ = api_as(shop, role="staff")
    accountant, _ = api_as(shop, role="accountant")
    admin, _ = api_as(shop, role="admin")
    assert void(staff, paid["id"]).status_code == 403
    assert void(accountant, paid["id"]).status_code == 403
    assert void(admin, paid["id"]).status_code == 200


def test_an_archived_party_does_not_block_the_void(owner: Any, make_party: Any) -> None:
    """EC-5 — `party_archived` guards new entries, never the undoing of a wrong one."""
    party = make_party()
    paid = pay(owner, party_id=str(party.id), mode_breakup=cash_lines("10.00")).json()["data"]
    Party.objects.filter(pk=party.pk).update(status="archived")
    assert void(owner, paid["id"]).status_code == 200


def test_a_document_void_releases_its_allocations_as_advance(
    owner: Any, make_party: Any, invoice_for: Any, shop: Any
) -> None:
    """LED-10 BR-7 (the helper SAL-05 calls) — the payment stays recorded, its
    allocation to the voided bill is deleted, and its unallocated amount grows."""
    party = make_party()
    inv = invoice_for(party, "898.00")
    paid = pay(owner, party_id=str(party.id), mode_breakup=cash_lines("500.00")).json()["data"]
    from django.db import transaction

    with transaction.atomic():
        released = release_document_allocations(
            ctx=Ctx.system(shop), document_type="sales_document", document_id=inv["id"]
        )
    assert released == [{"payment_id": paid["id"], "number": paid["number"], "amount": "500.00"}]
    payment = Payment.objects.get()
    assert payment.status == "recorded" and payment.unallocated_amount == Decimal("500.00")
    assert not Allocation.objects.exists()
