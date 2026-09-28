"""Voiding an invoice and its payment at the same moment must not deadlock (Sprint 12).

Before the fix the two voids took their locks in opposite orders:

* `void_invoice`: the INVOICE, then the party, then (releasing its allocation)
  the payment row;
* `void_payment`: the PAYMENT, then the party, then the invoice.

Two clerks pressing Void on the bill and on its receipt at once each held the
row the other needed next, PostgreSQL chose a victim, and one of them got a 500.
The fix is one order everywhere — party first (`lock_party_of`), then
documents, then payments — so the second transaction waits at the party lock
holding nothing.

The race is made deterministic rather than hoped for: the document thread starts
first and sleeps just before it asks for the PARTY lock; the payment thread
starts 0.15 s later. Under the old order the document thread already held the
invoice (or bill) at that point, which is exactly the window the payment void
needed to take the party and block on the document — a deadlock every time
(verified against the pre-fix code). Under the new order the document thread
holds nothing yet, so the payment void simply finishes first.
"""

from __future__ import annotations

import threading
import time
from decimal import Decimal
from typing import Any

import pytest
from django.db import connection

from apps.common.context import Ctx
from apps.payments.tests.conftest import cash_lines, pay

pytestmark = pytest.mark.django_db(transaction=True)


def _race(first: Any, second: Any, *, slow_thread: str, monkeypatch: Any) -> dict[str, str]:
    """Run two callables on two real connections, the `slow_thread` one delayed at L1."""
    from apps.parties.services import balance

    original = balance.lock_party

    def slow_lock_party(**kwargs: Any) -> Any:
        if threading.current_thread().name == slow_thread:
            time.sleep(0.6)
        return original(**kwargs)

    monkeypatch.setattr(balance, "lock_party", slow_lock_party)
    barrier = threading.Barrier(2)
    outcomes: dict[str, str] = {}

    def run(name: str, fn: Any) -> None:
        try:
            barrier.wait()
            if name != slow_thread:
                # Let the slow thread take whatever it takes FIRST before this
                # one starts, so the interleaving does not depend on luck.
                time.sleep(0.15)
            fn()
            outcomes[name] = "ok"
        except Exception as exc:  # noqa: BLE001 — the outcome IS the assertion
            outcomes[name] = f"{type(exc).__name__}: {exc}"
        finally:
            connection.close()

    threads = [
        threading.Thread(target=run, name="invoice", args=("invoice", first)),
        threading.Thread(target=run, name="payment", args=("payment", second)),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)
    assert not any(t.is_alive() for t in threads), "a void hung"
    return outcomes


def test_voiding_an_invoice_and_its_payment_together_neither_deadlocks_nor_fails(
    shop: Any, owner: Any, make_party: Any, invoice_for: Any, monkeypatch: Any
) -> None:
    """Both voids succeed, one after the other; the books end exactly consistent."""
    from apps.payments.models import Payment
    from apps.payments.services.void import void_payment
    from apps.sales.models import SalesDocument
    from apps.sales.services.void import void_invoice
    from apps.sales.tests.conftest import recalc_clean

    party = make_party(name="Race Traders")
    invoice = invoice_for(party, "500.00")
    paid = pay(owner, party_id=str(party.id), mode_breakup=cash_lines("500.00")).json()["data"]
    assert SalesDocument.objects.get(pk=invoice["id"]).status == "paid"

    outcomes = _race(
        lambda: void_invoice(ctx=Ctx.system(shop), document_id=invoice["id"], reason="Wrong bill"),
        lambda: void_payment(ctx=Ctx.system(shop), payment_id=paid["id"], reason="Wrong receipt"),
        slow_thread="invoice",
        monkeypatch=monkeypatch,
    )

    assert outcomes == {"invoice": "ok", "payment": "ok"}, outcomes
    assert SalesDocument.objects.get(pk=invoice["id"]).status == "void"
    payment = Payment.objects.get(pk=paid["id"])
    assert payment.status == "void"
    assert payment.unallocated_amount == Decimal("0.00")
    party.refresh_from_db()
    assert party.balance == Decimal("0.00")
    recalc_clean()


def test_voiding_a_bill_and_its_supplier_payment_together_neither_deadlocks_nor_fails(
    shop: Any, owner: Any, make_item: Any, make_party: Any, monkeypatch: Any
) -> None:
    """The purchases side of the same order: bill void took bill → party, too."""
    from apps.common.dates import tenant_today
    from apps.payments.models import Payment
    from apps.payments.services.void import void_payment
    from apps.purchases.models import PurchaseDocument
    from apps.purchases.services.drafts import create_draft
    from apps.purchases.services.record import record_bill
    from apps.purchases.services.void import void_bill
    from apps.purchases.tests.conftest import line

    supplier = make_party(name="Race Supplies", is_supplier=True, is_customer=False)
    item = make_item("Sugar", "40.00", "GST0", stock=None)
    ctx = Ctx.system(shop)
    bill = create_draft(
        ctx=ctx,
        payload={
            "party_id": supplier.id,
            "supplier_invoice_number": "RACE/BILL/1",
            "document_date": tenant_today(shop).isoformat(),
            "lines": [line(item, "5", "40.00")],
        },
    )["document"]
    record_bill(ctx=ctx, document_id=bill.id)
    bill.refresh_from_db()
    paid = pay(
        owner, direction="out", party_id=str(supplier.id), mode_breakup=cash_lines("200.00")
    ).json()["data"]
    assert PurchaseDocument.objects.get(pk=bill.id).amount_paid == Decimal("200.00")

    outcomes = _race(
        lambda: void_bill(ctx=Ctx.system(shop), document_id=bill.id, reason="Wrong bill"),
        lambda: void_payment(ctx=Ctx.system(shop), payment_id=paid["id"], reason="Wrong voucher"),
        slow_thread="invoice",
        monkeypatch=monkeypatch,
    )

    assert outcomes == {"invoice": "ok", "payment": "ok"}, outcomes
    assert PurchaseDocument.objects.get(pk=bill.id).status == "void"
    assert Payment.objects.get(pk=paid["id"]).status == "void"
    supplier.refresh_from_db()
    assert supplier.balance == Decimal("0.00")
