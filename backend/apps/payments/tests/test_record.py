"""PAY-01 / PAY-02 — recording a payment: allocation, invariants, the khata line, the lock order."""

from __future__ import annotations

import io
from decimal import Decimal
from typing import Any

import pytest
from django.core.management import call_command
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.common.audit import AuditAction
from apps.ledger.constants import EntryType, SourceType
from apps.ledger.models import LedgerEntry
from apps.parties.models import Party
from apps.payments.models import Allocation, Payment
from apps.payments.tests.conftest import cash_lines, pay, payment_url, upi, void
from apps.platform_app.models import AuditLog
from apps.sales.models import SalesDocument

pytestmark = pytest.mark.django_db


def _doc(data: dict) -> SalesDocument:
    return SalesDocument.objects.get(pk=data["id"])


def _balance(party: Any) -> Decimal:
    return Party.objects.get(pk=party.pk).balance


def assert_books_clean() -> None:
    out = io.StringIO()
    call_command("recalc_balances", stdout=out)
    assert "0 found" in out.getvalue(), out.getvalue()


def test_partial_payment_auto_allocates_and_moves_the_khata_exactly(
    owner: Any, make_party: Any, invoice_for: Any
) -> None:
    """AC-1 / T-LED-10-5 step 2 — ₹500 UPI against INV ₹898: partially paid, due ₹398,
    one `payment_in` credit of ₹500 with mode UPI and the UTR, balance exactly ₹398."""
    ramesh = make_party()
    inv = invoice_for(ramesh, "898.00")
    response = pay(owner, party_id=str(ramesh.id), mode_breakup=upi("500.00", "UTR123"))
    assert response.status_code == 201, response.json()
    body = response.json()
    data = body["data"]
    assert data["number"] == "RCT/26-27/0001"
    assert data["amount"] == "500.00" and data["unallocated_amount"] == "0.00"
    assert data["mode_breakup"] == [{"mode": "upi", "amount": "500.00", "reference": "UTR123"}]
    assert data["allocations"][0]["number"] == inv["number"]
    assert data["allocations"][0]["amount"] == "500.00"
    assert body["meta"]["party_balance"] == "398.00"
    assert body["meta"]["documents"][0]["status"] == "partially_paid"
    doc = _doc(inv)
    assert (doc.status, doc.amount_paid, doc.amount_due) == (
        "partially_paid",
        Decimal("500.00"),
        Decimal("398.00"),
    )
    entry = LedgerEntry.objects.get(source_type=SourceType.PAYMENT)
    assert (entry.entry_type, entry.direction, entry.amount) == (
        EntryType.PAYMENT_IN,
        "credit",
        Decimal("500.00"),
    )
    assert entry.payment_mode == "upi" and entry.reference == "UTR123"
    assert entry.source_id == Payment.objects.get().id
    assert _balance(ramesh) == Decimal("398.00")
    assert_books_clean()


def test_fifo_settles_the_oldest_bill_first_and_keeps_the_rest_as_advance(
    owner: Any, make_party: Any, invoice_for: Any
) -> None:
    """T-PAY-01-1 / AC-2 / AC-5 — three bills, oldest first by document date; the
    remainder after every bill is paid becomes `unallocated_amount`."""
    party = make_party()
    newest = invoice_for(party, "300.00", days_ago=1)
    oldest = invoice_for(party, "898.00", days_ago=8)
    middle = invoice_for(party, "200.00", days_ago=4)
    response = pay(owner, party_id=str(party.id), mode_breakup=cash_lines("1000.00"))
    data = response.json()["data"]
    assert [a["number"] for a in data["allocations"]] == [oldest["number"], middle["number"]]
    assert [a["amount"] for a in data["allocations"]] == ["898.00", "102.00"]
    assert _doc(oldest).status == "paid"
    assert _doc(middle).status == "partially_paid" and _doc(middle).amount_due == Decimal("98.00")
    assert _doc(newest).status == "issued"

    # Then more than everything owed: every bill paid, ₹102 kept as advance.
    more = pay(owner, party_id=str(party.id), mode_breakup=cash_lines("500.00")).json()
    assert more["data"]["unallocated_amount"] == "102.00"
    assert more["meta"]["party_balance"] == "-102.00"
    assert all(_doc(d).status == "paid" for d in (oldest, middle, newest))
    assert_books_clean()


def test_manual_allocation_pays_only_the_chosen_bill(
    owner: Any, make_party: Any, invoice_for: Any
) -> None:
    """AC-3 — ₹500 to INV/0042 only: the older bill stays issued, ₹500 unallocated."""
    party = make_party()
    older = invoice_for(party, "898.00", days_ago=5)
    newer = invoice_for(party, "898.00", days_ago=1)
    response = pay(
        owner,
        party_id=str(party.id),
        mode_breakup=cash_lines("1000.00"),
        allocations=[
            {"document_type": "sales_document", "document_id": newer["id"], "amount": "500"}
        ],
    )
    assert response.status_code == 201, response.json()
    assert response.json()["data"]["unallocated_amount"] == "500.00"
    assert _doc(older).status == "issued"
    assert _doc(newer).status == "partially_paid"


def test_an_allocation_over_the_bill_is_refused_with_the_current_due(
    owner: Any, make_party: Any, invoice_for: Any
) -> None:
    """T-PAY-01-3 / EC-1 — "Max ₹898" on the row; nothing written."""
    party = make_party()
    inv = invoice_for(party, "898.00")
    response = pay(
        owner,
        party_id=str(party.id),
        mode_breakup=cash_lines("1500.00"),
        allocations=[{"document_id": inv["id"], "amount": "1500.00"}],
    )
    assert response.status_code == 400
    assert response.json()["error"]["details"]["allocations.0.amount"] == ["Max ₹898.00"]
    assert (
        not Payment.objects.exists()
        and not LedgerEntry.objects.filter(source_type=SourceType.PAYMENT).exists()
    )


def test_allocations_above_the_payment_are_refused(
    owner: Any, make_party: Any, invoice_for: Any
) -> None:
    """BR-2 by the service — Σ allocations ≤ amount."""
    party = make_party()
    a = invoice_for(party, "300.00", days_ago=2)
    b = invoice_for(party, "300.00", days_ago=1)
    response = pay(
        owner,
        party_id=str(party.id),
        mode_breakup=cash_lines("400.00"),
        allocations=[
            {"document_id": a["id"], "amount": "300.00"},
            {"document_id": b["id"], "amount": "300.00"},
        ],
    )
    assert response.status_code == 400
    assert response.json()["error"]["details"]["allocations"] == ["Allocations exceed the payment."]


def test_modes_must_add_up_and_appear_once(owner: Any, make_party: Any) -> None:
    """T-PAY-01-2 / T-PAY-02-2 / T-PAY-02-3 — a declared amount the lines miss, a
    repeated mode, and a fifth line are all 400 with the field that is wrong."""
    party = make_party()
    mismatch = pay(owner, party_id=str(party.id), amount="1000.00", mode_breakup=upi("700.00"))
    assert mismatch.json()["error"]["details"]["mode_breakup"] == ["Modes must add up to ₹1000.00."]
    twice = pay(
        owner,
        party_id=str(party.id),
        mode_breakup=[{"mode": "upi", "amount": "1"}, {"mode": "upi", "amount": "2"}],
    )
    assert twice.status_code == 400 and "mode_breakup" in twice.json()["error"]["details"]
    five = pay(
        owner,
        party_id=str(party.id),
        mode_breakup=[{"mode": m, "amount": "1"} for m in ("cash", "upi", "bank", "card", "other")],
    )
    assert five.status_code == 400
    zero = pay(owner, party_id=str(party.id), mode_breakup=[{"mode": "cash", "amount": "0"}])
    assert zero.json()["error"]["details"]["mode_breakup.0.amount"]
    assert not Payment.objects.exists()


def test_a_split_payment_is_one_receipt_and_one_khata_line(
    owner: Any, make_party: Any, invoice_for: Any
) -> None:
    """PAY-02 AC-1 / BR-2 — UPI ₹700 + Cash ₹300: amount 1000, primary UPI (the largest),
    two mode lines, ONE ledger credit of ₹1,000 carrying mode UPI. A tie goes to the first."""
    party = make_party()
    invoice_for(party, "1000.00")
    split = [
        {"mode": "cash", "amount": "300.00"},
        {"mode": "upi", "amount": "700.00", "reference": "UTR9"},
    ]
    data = pay(owner, party_id=str(party.id), mode_breakup=split).json()["data"]
    assert data["amount"] == "1000.00" and data["primary_mode"] == "upi"
    assert data["reference"] == "UTR9"
    entries = LedgerEntry.objects.filter(source_type=SourceType.PAYMENT)
    assert entries.count() == 1 and entries.get().payment_mode == "upi"
    tie = [{"mode": "bank", "amount": "50.00"}, {"mode": "cash", "amount": "50.00"}]
    assert (
        pay(owner, party_id=str(party.id), mode_breakup=tie).json()["data"]["primary_mode"]
        == "bank"
    )


def test_a_retry_with_the_same_key_replays_and_posts_nothing_twice(
    owner: Any, make_party: Any, invoice_for: Any
) -> None:
    """T-PAY-01-7 — the counter's 2G connection loses the 201; the retry replays it."""
    party = make_party()
    invoice_for(party, "898.00")
    first = pay(owner, key="k-1", party_id=str(party.id), mode_breakup=cash_lines("500.00"))
    again = pay(owner, key="k-1", party_id=str(party.id), mode_breakup=cash_lines("500.00"))
    assert again.status_code == 201 and again["Idempotent-Replayed"] == "true"
    assert again.json()["data"]["number"] == first.json()["data"]["number"]
    assert Payment.objects.count() == 1
    assert LedgerEntry.objects.filter(source_type=SourceType.PAYMENT).count() == 1


def test_the_audit_row_carries_the_payment_and_each_bill_status_change(
    owner: Any, make_party: Any, invoice_for: Any
) -> None:
    """§16 — `payment.recorded` with its allocations; `invoice.status_changed` per bill."""
    party = make_party()
    inv = invoice_for(party, "898.00")
    pay(owner, party_id=str(party.id), mode_breakup=cash_lines("898.00"))
    row = AuditLog.objects.get(action=AuditAction.PAYMENT_RECORDED)
    assert row.after["allocations"][0]["document_id"] == inv["id"]
    changed = AuditLog.objects.get(action=AuditAction.INVOICE_STATUS_CHANGED)
    assert changed.before == {"status": "issued"} and changed.after["status"] == "paid"


def test_status_recomputes_overdue_immediately(
    owner: Any, make_party: Any, invoice_for: Any
) -> None:
    """T-PAY-01-4 / BR-4 — a bill past its due date that is still owed after the
    payment is `overdue` at once, not `partially_paid` until the nightly job."""
    party = make_party()
    inv = invoice_for(party, "898.00", days_ago=30, due_days=10)
    pay(owner, party_id=str(party.id), mode_breakup=cash_lines("100.00"))
    assert _doc(inv).status == "overdue"
    pay(owner, party_id=str(party.id), mode_breakup=cash_lines("798.00"))
    assert _doc(inv).status == "paid"


def test_documents_are_locked_in_date_number_id_order(
    owner: Any, make_party: Any, invoice_for: Any
) -> None:
    """Sprint 8 exit criterion — a payment across three bills locks them with
    `ORDER BY document_date, number, id … FOR UPDATE`, the one order recording
    and voiding share, so two payments on the same bills cannot deadlock."""
    party = make_party()
    docs = [invoice_for(party, "100.00", days_ago=d) for d in (1, 3, 2)]
    with CaptureQueriesContext(connection) as queries:
        pay(owner, party_id=str(party.id), mode_breakup=cash_lines("300.00"))
    locks = [
        q["sql"]
        for q in queries.captured_queries
        if "FOR UPDATE" in q["sql"] and '"sales_document"' in q["sql"]
    ]
    assert locks, "the bills were never locked"
    assert all(
        'ORDER BY "sales_document"."document_date" ASC, "sales_document"."number" ASC, '
        '"sales_document"."id" ASC' in sql
        for sql in locks
    ), locks
    assert len(Allocation.objects.all()) == len(docs)


def test_another_tenants_party_or_bill_is_not_found(
    owner: Any, make_party: Any, invoice_for: Any, other_tenant: Any
) -> None:
    """Canon §0.11 rule 2 — a foreign id is 404, never 403, and nothing is written."""
    from tests.factories.parties import PartyFactory

    stranger = PartyFactory(tenant=other_tenant)
    assert pay(owner, party_id=str(stranger.id), mode_breakup=cash_lines("1")).status_code == 404
    mine = make_party()
    theirs = make_party(name="Suresh")
    inv = invoice_for(theirs, "100.00")
    wrong_party = pay(
        owner,
        party_id=str(mine.id),
        mode_breakup=cash_lines("100.00"),
        allocations=[{"document_id": inv["id"], "amount": "100.00"}],
    )
    assert wrong_party.status_code == 404
    assert not Payment.objects.exists()


def test_a_paid_bill_is_no_longer_open(owner: Any, make_party: Any, invoice_for: Any) -> None:
    """§9 — 409 `document_not_open` when a listed bill was settled meanwhile."""
    party = make_party()
    inv = invoice_for(party, "100.00")
    pay(owner, party_id=str(party.id), mode_breakup=cash_lines("100.00"))
    again = pay(
        owner,
        party_id=str(party.id),
        mode_breakup=cash_lines("50.00"),
        allocations=[{"document_id": inv["id"], "amount": "50.00"}],
    )
    assert again.status_code == 409 and again.json()["error"]["code"] == "document_not_open"


def test_an_archived_party_takes_no_new_payment(owner: Any, make_party: Any) -> None:
    party = make_party(status="archived")
    response = pay(owner, party_id=str(party.id), mode_breakup=cash_lines("10.00"))
    assert response.status_code == 409 and response.json()["error"]["code"] == "party_archived"


def test_money_out_debits_the_khata_and_carries_no_mode_on_the_line(
    owner: Any, make_party: Any
) -> None:
    """PAY-01 out (PUR-02's path, no bills yet) — a `payment_out` DEBIT; its modes stay
    on the payment, because a debit line carries none (`ck_ledger_entry_debit_has_no_mode`)."""
    supplier = make_party(name="Tempo Bhai")
    data = pay(
        owner, direction="out", party_id=str(supplier.id), mode_breakup=upi("1200.00", "UTR7")
    ).json()
    assert data["data"]["number"] == "PAYOUT/26-27/0001"
    assert data["data"]["unallocated_amount"] == "1200.00"
    entry = LedgerEntry.objects.get(entry_type=EntryType.PAYMENT_OUT)
    assert entry.direction == "debit" and entry.payment_mode is None
    assert _balance(supplier) == Decimal("1200.00")


def test_accountant_reads_payments_and_cannot_record(
    shop: Any, api_as: Any, owner: Any, make_party: Any
) -> None:
    """T-PAY-01-11 — accountant POST 403; GET 200."""
    party = make_party()
    pay(owner, party_id=str(party.id), mode_breakup=cash_lines("10.00"))
    accountant, _ = api_as(shop, role="accountant")
    assert pay(accountant, party_id=str(party.id), mode_breakup=cash_lines("1")).status_code == 403
    listed = accountant.get("/api/v1/payments")
    assert listed.status_code == 200 and listed.json()["meta"]["totals"]["amount_in"] == "10.00"
    detail = accountant.get(payment_url(Payment.objects.get().id))
    assert detail.status_code == 200


def test_the_list_filters_and_totals_the_filtered_set(owner: Any, make_party: Any) -> None:
    """FR-10 — direction and mode filter; totals over the filtered set; a split matches each mode."""
    a = make_party()
    pay(owner, party_id=str(a.id), mode_breakup=cash_lines("100.00"))
    pay(
        owner,
        party_id=str(a.id),
        mode_breakup=[{"mode": "upi", "amount": "70"}, {"mode": "cash", "amount": "30"}],
    )
    pay(owner, direction="out", party_id=str(a.id), mode_breakup=upi("40.00"))
    everything = owner.get("/api/v1/payments").json()
    assert everything["meta"]["totals"] == {
        "count": 3,
        "count_in": 2,
        "count_out": 1,
        "amount_in": "200.00",
        "amount_out": "40.00",
    }
    upi_only = owner.get("/api/v1/payments?mode=upi").json()
    assert upi_only["meta"]["totals"]["count"] == 2
    received = owner.get("/api/v1/payments?direction=in").json()
    assert [row["direction"] for row in received["data"]] == ["in", "in"]


def test_each_money_card_counts_its_own_recorded_payments(owner: Any, make_party: Any) -> None:
    """QA P-D6 — the header's "6 payments" sat under the Received card and counted
    every row, voids and money paid out included. `count_in` / `count_out` count the
    recorded payments of one direction, so each card states its own number."""
    a = make_party()
    kept = pay(owner, party_id=str(a.id), mode_breakup=cash_lines("100.00")).json()["data"]
    voided = pay(owner, party_id=str(a.id), mode_breakup=cash_lines("50.00")).json()["data"]
    pay(owner, direction="out", party_id=str(a.id), mode_breakup=upi("40.00"))
    assert void(owner, voided["id"]).status_code == 200
    totals = owner.get("/api/v1/payments").json()["meta"]["totals"]
    assert (totals["count_in"], totals["count_out"]) == (1, 1)
    assert totals["amount_in"] == "100.00" and kept["id"] != voided["id"]


def test_open_documents_are_listed_oldest_first(
    owner: Any, make_party: Any, invoice_for: Any
) -> None:
    """FR-2 — the allocation panel's rows, FIFO order, with what each can still take."""
    party = make_party()
    new = invoice_for(party, "300.00", days_ago=1)
    old = invoice_for(party, "200.00", days_ago=6)
    rows = owner.get(f"/api/v1/payments/open-documents?party_id={party.id}").json()["data"]
    assert [r["document_id"] for r in rows] == [old["id"], new["id"]]
    assert rows[0]["amount_due"] == "200.00"
