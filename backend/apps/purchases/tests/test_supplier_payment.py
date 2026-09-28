"""PUR-02 — supplier payments: PAY-01's `record_payment` direction out, settling purchase bills.

Every bill here is recorded through the real `record_bill` and every payment
through the real `POST /payments`, so the rows these tests assert are the rows a
merchant's counter produces. Each test ends by checking the two invariants the
feature is measured by (PUR-02 §1): the supplier's cached balance equals a full
replay of the ledger, and every bill's `amount_paid` equals the sum of the
allocations pointing at it.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from io import StringIO
from typing import Any

import pytest
from django.core.management import call_command
from django.db.models import Sum
from django.urls import reverse
from rest_framework.test import APIClient

from apps.common.audit import AuditAction
from apps.common.constants import RoleCode
from apps.ledger.models import LedgerEntry
from apps.ledger.selectors.entry import computed_balance
from apps.payments.models import Allocation, Payment
from apps.platform_app.models import AuditLog
from apps.purchases.models import PurchaseDocument
from apps.purchases.tests.conftest import bill_url, draft, line, record, recorded_bill, void
from tests.fixtures import build_access_token

pytestmark = pytest.mark.django_db

PAYMENTS = "v1:payment-list"


def pay(client: Any, *, key: str | None = None, **body: Any) -> Any:
    body.setdefault("direction", "out")
    return client.post(
        reverse(PAYMENTS), body, format="json", HTTP_IDEMPOTENCY_KEY=key or str(uuid.uuid4())
    )


def void_payment(client: Any, payment_id: Any, reason: str = "Cheque bounced") -> Any:
    return client.post(
        f"{reverse('v1:payment-detail', args=[payment_id])}/void",
        {"reason": reason},
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )


def cash(amount: str) -> list[dict]:
    return [{"mode": "cash", "amount": amount}]


def bill(doc_id: Any) -> PurchaseDocument:
    return PurchaseDocument.objects.get(pk=doc_id)


def assert_books_clean(shop: Any, supplier: Any) -> None:
    """PUR-02 §1 — the balance equals a replay, and Σ allocations = `amount_paid` on every bill."""
    supplier.refresh_from_db()
    assert supplier.balance == computed_balance(tenant=shop, party_id=supplier.id)
    out = StringIO()
    call_command("recalc_balances", stdout=out)
    assert "0 found" in out.getvalue(), out.getvalue()
    for document in PurchaseDocument.objects.filter(tenant=shop).exclude(status="draft"):
        allocated = Allocation.objects.filter(
            document_type="purchase_document", document_id=document.id
        ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
        assert document.amount_paid == allocated, document.number
        assert document.amount_paid + document.amount_due == document.grand_total


@pytest.fixture
def bill_of(owner: Any, make_item: Any) -> Any:
    """`bill_of(supplier, total, document_date=None, due_on=None)` → a RECORDED bill of `total`.

    A zero-rated item costing exactly the total, so the grand total is the figure the test
    names — no tax or round-off to reason about.
    """
    items: dict[str, Any] = {}

    def _make(
        supplier: Any, total: str, document_date: str | None = None, due_on: str | None = None
    ) -> dict:
        item = items.get(total) or make_item(f"Goods {total}", total, "GST0")
        items[total] = item
        body: dict[str, Any] = {"party_id": str(supplier.id), "lines": [line(item, "1", total)]}
        if document_date:
            body["document_date"] = document_date
        if due_on:
            body["due_on"] = due_on
        return recorded_bill(owner, **body)

    return _make


def test_paying_one_bill_in_full_from_its_page_settles_it(
    shop: Any, owner: Any, make_supplier: Any, bill_of: Any
) -> None:
    """T-PUR-02-2 / AC-3 — the bill page's Pay pre-allocates its due: ₹1,921 to that bill makes
    it `paid` with nothing due, posts ONE `payment_out` debit (PAYOUT series), brings the
    supplier to zero, audits `purchase_bill.status_changed`, and the bill lists the voucher."""
    supplier = make_supplier()
    data = bill_of(supplier, "1921.00")
    response = pay(
        owner,
        party_id=str(supplier.id),
        mode_breakup=[{"mode": "upi", "amount": "1921.00", "reference": "UTR42"}],
        allocations=[
            {"document_type": "purchase_document", "document_id": data["id"], "amount": "1921.00"}
        ],
    )
    assert response.status_code == 201, response.json()
    payment, meta = response.json()["data"], response.json()["meta"]
    assert payment["number"] == "PAYOUT/26-27/0001"
    assert payment["unallocated_amount"] == "0.00"
    assert meta["party_balance"] == "0.00"
    assert [(d["number"], d["status"], d["amount_due"]) for d in meta["documents"]] == [
        (data["number"], "paid", "0.00")
    ]
    settled = bill(data["id"])
    assert (settled.status, settled.amount_paid, settled.amount_due) == (
        "paid",
        Decimal("1921.00"),
        Decimal("0.00"),
    )
    entry = LedgerEntry.objects.get(entry_type="payment_out")
    assert (entry.direction, entry.amount, entry.source_type) == (
        "debit",
        Decimal("1921.00"),
        "payment",
    )
    audit = AuditLog.objects.get(
        action=AuditAction.PURCHASE_BILL_STATUS_CHANGED, entity_id=data["id"]
    )
    assert (audit.before["status"], audit.after["status"]) == ("recorded", "paid")
    detail = owner.get(bill_url(data["id"])).json()["data"]
    assert [(p["number"], p["amount"]) for p in detail["payments"]] == [
        ("PAYOUT/26-27/0001", "1921.00")
    ]
    assert_books_clean(shop, supplier)


def test_auto_allocation_part_pays_two_bills_oldest_due_first(
    shop: Any, owner: Any, make_supplier: Any, bill_of: Any
) -> None:
    """T-PUR-02-1 / AC-2 / FR-3 — ₹4,000 on Auto over bills of ₹1,921 (due earlier) and ₹3,000:
    1,921 then 2,079, statuses `paid` and `partially_paid`. FIFO is by `due_on` FIRST — the
    ₹1,921 bill is dated LATER but due sooner, so a date-only FIFO would get this wrong."""
    supplier = make_supplier()
    later_due = bill_of(supplier, "3000.00", document_date="2026-09-10", due_on="2026-12-31")
    sooner_due = bill_of(supplier, "1921.00", document_date="2026-09-15", due_on="2026-12-01")
    open_rows = owner.get(
        f"{reverse(PAYMENTS)}/open-documents", {"party_id": str(supplier.id), "direction": "out"}
    ).json()["data"]
    assert [r["number"] for r in open_rows] == [sooner_due["number"], later_due["number"]]

    response = pay(owner, party_id=str(supplier.id), mode_breakup=cash("4000.00"))
    assert response.status_code == 201, response.json()
    rows = {
        str(a.document_id): a.amount
        for a in Allocation.objects.filter(payment_id=response.json()["data"]["id"])
    }
    assert rows == {sooner_due["id"]: Decimal("1921.00"), later_due["id"]: Decimal("2079.00")}
    assert (bill(sooner_due["id"]).status, bill(later_due["id"]).status) == (
        "paid",
        "partially_paid",
    )
    assert bill(later_due["id"]).amount_due == Decimal("921.00")
    assert response.json()["meta"]["party_balance"] == "-921.00"
    assert_books_clean(shop, supplier)


def test_paying_more_than_is_owed_keeps_the_rest_as_advance(
    shop: Any, owner: Any, make_supplier: Any, bill_of: Any
) -> None:
    """T-PUR-02-3 / EC-5 / US-4 — ₹1,500 against one ₹1,000 bill settles it and keeps ₹500
    unallocated; the supplier's balance goes POSITIVE (+500, "You will get"). With no open
    bills at all the whole payment is advance (AC-4)."""
    supplier = make_supplier()
    data = bill_of(supplier, "1000.00")
    response = pay(owner, party_id=str(supplier.id), mode_breakup=cash("1500.00"))
    assert response.json()["data"]["unallocated_amount"] == "500.00"
    assert response.json()["meta"]["party_balance"] == "500.00"
    assert bill(data["id"]).status == "paid"

    fresh = make_supplier(name="Tempo Bhai")
    advance = pay(owner, party_id=str(fresh.id), mode_breakup=cash("500.00")).json()
    assert advance["data"]["unallocated_amount"] == "500.00"
    assert advance["meta"]["party_balance"] == "500.00"
    assert_books_clean(shop, supplier)
    assert_books_clean(shop, fresh)


def test_an_allocation_over_the_due_or_to_another_suppliers_bill_is_refused(
    owner: Any, make_supplier: Any, bill_of: Any
) -> None:
    """T-PUR-02-4 — more than the bill's due is 400 naming the row and the current due; a bill
    of ANOTHER supplier is 404 (not found, never forbidden); nothing was written either way."""
    supplier, other = make_supplier(), make_supplier(name="Other Traders")
    mine = bill_of(supplier, "1000.00")
    theirs = bill_of(other, "700.00")
    over = pay(
        owner,
        party_id=str(supplier.id),
        mode_breakup=cash("1200.00"),
        allocations=[
            {"document_type": "purchase_document", "document_id": mine["id"], "amount": "1200.00"}
        ],
    )
    assert over.status_code == 400
    assert over.json()["error"]["details"]["allocations.0.amount"] == ["Max ₹1000.00"]
    wrong = pay(
        owner,
        party_id=str(supplier.id),
        mode_breakup=cash("100.00"),
        allocations=[
            {"document_type": "purchase_document", "document_id": theirs["id"], "amount": "100.00"}
        ],
    )
    assert wrong.status_code == 404
    assert Payment.objects.count() == 0


def test_voiding_a_supplier_payment_reopens_its_bills_exactly(
    shop: Any, owner: Any, make_supplier: Any, bill_of: Any
) -> None:
    """T-PUR-02-5 / FR-7 — void the ₹4,000 payment that paid one bill and part-paid another:
    both return to `recorded` with their full due, the allocations are gone, the khata gets a
    reversal CREDIT of 4,000, and the balance is back to −4,921 as before the payment."""
    supplier = make_supplier()
    first = bill_of(supplier, "1921.00", document_date="2026-09-10", due_on="2026-12-01")
    second = bill_of(supplier, "3000.00", document_date="2026-09-15", due_on="2026-12-31")
    before = {d: (bill(d).status, bill(d).amount_due) for d in (first["id"], second["id"])}
    payment = pay(owner, party_id=str(supplier.id), mode_breakup=cash("4000.00")).json()["data"]

    response = void_payment(owner, payment["id"])
    assert response.status_code == 200, response.json()
    assert response.json()["meta"]["party_balance"] == "-4921.00"
    assert {d: (bill(d).status, bill(d).amount_due) for d in before} == before
    assert Allocation.objects.filter(payment_id=payment["id"]).count() == 0
    reversal = LedgerEntry.objects.get(entry_type="reversal", source_id=payment["id"])
    assert (reversal.direction, reversal.amount) == ("credit", Decimal("4000.00"))
    assert AuditLog.objects.filter(action=AuditAction.PURCHASE_BILL_STATUS_CHANGED).count() == 4
    assert_books_clean(shop, supplier)


def test_voiding_a_paid_bill_leaves_its_payment_as_an_advance(
    shop: Any, owner: Any, make_supplier: Any, bill_of: Any
) -> None:
    """BR-4 / PUR-04 FR-2d — void a bill ₹600 was paid on: the payment stays `recorded`, its
    allocation is deleted and its unallocated amount grows by 600, the void names it in
    `meta.released_payments`, the bill's `amount_paid` goes back to zero, and the supplier is
    left +600 in advance (the bill's credit reversed, the payment's debit standing)."""
    supplier = make_supplier()
    data = bill_of(supplier, "1000.00")
    payment = pay(owner, party_id=str(supplier.id), mode_breakup=cash("600.00")).json()["data"]
    assert bill(data["id"]).status == "partially_paid"

    response = void(owner, data["id"], "Wrong supplier")
    assert response.status_code == 200, response.json()
    meta = response.json()["meta"]
    assert meta["released_payments"] == [
        {"payment_id": payment["id"], "number": payment["number"], "amount": "600.00"}
    ]
    assert meta["party_balance"] == "600.00"
    voided = bill(data["id"])
    assert (voided.status, voided.amount_paid) == ("void", Decimal("0.00"))
    kept = Payment.objects.get(pk=payment["id"])
    assert (kept.status, kept.unallocated_amount) == ("recorded", Decimal("600.00"))
    assert Allocation.objects.filter(payment=kept).count() == 0
    audit = AuditLog.objects.get(action=AuditAction.PURCHASE_BILL_VOIDED, entity_id=data["id"])
    assert audit.metadata["released_payment_ids"] == [payment["id"]]
    # And the released payment can still be voided on its own afterwards.
    assert void_payment(owner, payment["id"]).status_code == 200
    assert_books_clean(shop, supplier)


def test_a_retried_payment_with_the_same_key_posts_once(
    shop: Any, owner: Any, make_supplier: Any, bill_of: Any
) -> None:
    """Idempotency — the same Idempotency-Key replays the first 201: one payment, one allocation,
    one khata line, the bill moved once; a different body under the key is a 409."""
    supplier = make_supplier()
    data = bill_of(supplier, "1000.00")
    key = str(uuid.uuid4())
    first = pay(owner, key=key, party_id=str(supplier.id), mode_breakup=cash("400.00"))
    again = pay(owner, key=key, party_id=str(supplier.id), mode_breakup=cash("400.00"))
    assert (first.status_code, again.status_code) == (201, 201)
    assert first.json()["data"]["id"] == again.json()["data"]["id"]
    assert Payment.objects.count() == 1
    assert LedgerEntry.objects.filter(entry_type="payment_out").count() == 1
    assert bill(data["id"]).amount_due == Decimal("600.00")
    changed = pay(owner, key=key, party_id=str(supplier.id), mode_breakup=cash("500.00"))
    assert changed.status_code == 409
    assert_books_clean(shop, supplier)


def test_money_out_settles_only_purchase_bills() -> None:
    """CR-2026-09-28-INT-A — the purchase bill is the ONE target for `direction='out'`. A second
    out-target (a customer's credit note, say) would let FIFO settle it with a supplier
    payment; SAL-04's refund voucher uses `allocations='none'` precisely to avoid that."""
    from apps.payments.services.targets import targets_for_direction

    assert [t.document_type for t in targets_for_direction("out")] == ["purchase_document"]
    assert [t.document_type for t in targets_for_direction("in")] == ["sales_document"]


def test_the_khata_names_the_bill_and_the_voucher(
    owner: Any, make_supplier: Any, bill_of: Any
) -> None:
    """LED-10 FR-5 — the supplier's khata links both lines to their documents by number: the
    bill's credit (a resolver purchases now registers) and the payment's debit."""
    supplier = make_supplier()
    data = bill_of(supplier, "1000.00")
    pay(owner, party_id=str(supplier.id), mode_breakup=cash("1000.00"))
    from apps.ledger.selectors.sources import resolve_sources

    entries = LedgerEntry.objects.filter(party=supplier)
    found = resolve_sources(entries)
    kinds = sorted((s["kind"], s["number"]) for s in found.values())
    assert kinds == [("payment_out", "PAYOUT/26-27/0001"), ("purchase_bill", data["number"])]


# ── PUR-01 FR-6h — "Paid now" at record ────────────────────────────────────


def test_paid_now_records_a_payout_allocated_to_the_new_bill(
    shop: Any, owner: Any, make_item: Any, make_supplier: Any
) -> None:
    """T-PUR-01-5 / AC-3 — ₹1,000 cash with the §17.7.0 bill: a PAYOUT allocated ₹1,000, the bill
    `partially_paid` with ₹1,921 due, the khata a −2,921 credit then a +1,000 debit, balance
    −1,921, and `meta.payment` names the voucher for the toast."""
    supplier = make_supplier()
    rice = make_item("Rice", "40.00", unit_code="NOS")
    sugar = make_item("Sugar", "35.00", unit_code="KGS")
    created = draft(
        owner,
        party_id=str(supplier.id),
        lines=[
            line(rice, "20", "46"),
            line(sugar, "50", "38", discount_type="percent", discount_value="2"),
        ],
    ).json()["data"]
    response = record(
        owner,
        created["id"],
        version=created["version"],
        payment={"mode_breakup": cash("1000.00")},
    )
    assert response.status_code == 200, response.json()
    data, meta = response.json()["data"], response.json()["meta"]
    assert (data["status"], data["amount_paid"], data["amount_due"]) == (
        "partially_paid",
        "1000.00",
        "1921.00",
    )
    assert meta["party_balance"] == "-1921.00"
    assert meta["payment"]["number"] == "PAYOUT/26-27/0001"
    assert meta["payment"]["amount"] == "1000.00"
    lines = list(
        LedgerEntry.objects.filter(party=supplier)
        .order_by("created_at")
        .values_list("entry_type", "direction", "amount")
    )
    assert lines == [
        ("purchase_bill", "credit", Decimal("2921.00")),
        ("payment_out", "debit", Decimal("1000.00")),
    ]
    assert [p["number"] for p in data["payments"]] == ["PAYOUT/26-27/0001"]
    assert_books_clean(shop, supplier)


def test_paid_now_above_the_total_is_advance_and_create_and_record_takes_it_too(
    shop: Any, owner: Any, make_item: Any, make_supplier: Any
) -> None:
    """FR-6h via `POST /purchases/bills?record=true` — ₹1,200 on a ₹1,000 bill settles it and
    keeps ₹200 as advance (the payment's `unallocated_amount`, the supplier at +200)."""
    supplier = make_supplier()
    item = make_item("Cement", "1000.00", "GST0")
    response = owner.post(
        f"{reverse('v1:purchase-bill-list')}?record=true",
        {
            "party_id": str(supplier.id),
            "lines": [line(item, "1", "1000.00")],
            "payment": {"mode_breakup": [{"mode": "upi", "amount": "1200.00", "reference": "U1"}]},
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )
    assert response.status_code == 201, response.json()
    assert response.json()["data"]["status"] == "paid"
    assert response.json()["meta"]["party_balance"] == "200.00"
    assert Payment.objects.get().unallocated_amount == Decimal("200.00")
    assert_books_clean(shop, supplier)


def test_a_bad_paid_now_line_refuses_the_record_and_writes_nothing(
    owner: Any, make_item: Any, make_supplier: Any
) -> None:
    """FR-6h — the mode lines are validated before anything is written: an unknown mode is 400
    under `payment.mode_breakup.0.mode`, the bill is still a draft, no number was consumed."""
    supplier = make_supplier()
    item = make_item("Cement", "500.00", "GST0")
    created = draft(owner, party_id=str(supplier.id), lines=[line(item, "1")]).json()["data"]
    response = record(
        owner,
        created["id"],
        version=created["version"],
        payment={"mode_breakup": [{"mode": "barter", "amount": "100.00"}]},
    )
    assert response.status_code == 400
    assert "payment.mode_breakup.0.mode" in response.json()["error"]["details"]
    assert bill(created["id"]).status == "draft"
    assert Payment.objects.count() == 0 and LedgerEntry.objects.count() == 0


def test_a_member_who_cannot_pay_suppliers_cannot_record_with_paid_now(
    shop: Any, api_as: Any, make_item: Any, make_supplier: Any
) -> None:
    """T-PUR-01-11 — staff denied `payments.payment.write` may record the bill on credit, and
    "Paid now" is 403 `permission_denied` naming `details.payment` — the whole request, never a
    bill silently recorded unpaid."""
    _, member = api_as(shop, RoleCode.STAFF.value)
    member.permissions_override = {"deny": ["payments.payment.write"]}
    member.permissions_version += 1
    member.save()
    staff = APIClient()
    staff.credentials(HTTP_AUTHORIZATION=f"Bearer {build_access_token(member)}")
    supplier = make_supplier()
    item = make_item("Cement", "500.00", "GST0")
    created = draft(staff, party_id=str(supplier.id), lines=[line(item, "1")]).json()["data"]
    refused = record(
        staff, created["id"], version=created["version"], payment={"mode_breakup": cash("500.00")}
    )
    assert refused.status_code == 403
    assert refused.json()["error"]["code"] == "permission_denied"
    assert "payment" in refused.json()["error"]["details"]
    assert bill(created["id"]).status == "draft"
    on_credit = record(staff, created["id"], version=created["version"])
    assert on_credit.status_code == 200, on_credit.json()
