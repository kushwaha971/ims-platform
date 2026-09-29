"""The seam PUR-02 plugs into — supplier payments are recorded by the payments app.

PUR-02 (supplier payment) is `payments.services.record.record_payment` with
`direction='out'` — "no second implementation" (Part 32 §32.12.3). Neither
app imports the other at module level (Part 20 §20.1.4; since A14, ADR-056,
`payments` no longer imports `purchases` either). So this module offers the
payments app its doors and owns nothing about a payment itself:

1. `apply_payment(document=…, amount=±x, today=…)` — the ONE function that moves
   `amount_paid` / `amount_due` / `status` on a bill. The purchase target
   (`purchases/services/payment_target.py`) calls it with a
   positive amount for each allocation (after locking the bills with
   `lock_payable_bills`, in `(document_date, number, id)` order — Part 32
   §32.11.4); a payment VOID calls it with the negative. The status rule lives
   here once (PUR-01 BR-5): `paid` at zero due, `partially_paid` above zero
   paid, else `recorded` — or `overdue` when un-paying a bill whose due date
   has already gone, rather than waiting for tonight's job.

2. `register_void_listener(fn)` — PUR-04 FR-2d / PUR-02 BR-4: voiding a bill
   deletes its `payments_allocation` rows so the payments become unallocated
   advances on the supplier's khata. `PurchasesConfig.ready()` registers
   payments' `release_purchase_bill`, `fn(ctx, document) -> [{payment_id,
   number, amount}]` (a deferred import, A14); `void_bill` calls every
   listener inside its own transaction.

3. `validate_payment` / `record_bill_payment` — PUR-01 FR-6h "Paid now": the
   money handed over at the counter when the bill is recorded, as a real
   `PAYOUT` payment allocated to this bill, in the record's transaction. The
   calls into payments are DEFERRED imports (rule D5's pattern, exactly as
   `sales/services/payment_seam.py` does for money taken at issue).
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any
from collections.abc import Callable

from apps.common.exceptions import BusinessRuleViolation
from apps.common.money import ZERO
from apps.purchases.constants import DocumentStatus

VoidListener = Callable[[Any, Any], list]

_VOID_LISTENERS: list[VoidListener] = []

PAYABLE_STATUSES = (
    DocumentStatus.RECORDED,
    DocumentStatus.PARTIALLY_PAID,
    DocumentStatus.OVERDUE,
    DocumentStatus.PAID,
)


def register_void_listener(listener: VoidListener) -> None:
    """Idempotent: a module imported twice registers once."""
    if listener not in _VOID_LISTENERS:
        _VOID_LISTENERS.append(listener)


def release_payments_on_void(ctx: Any, document: Any) -> list[Any]:
    """PUR-04 FR-2d — what every listener released, in the caller's transaction.

    The payments listener answers `{payment_id, number, amount}` per payment
    (what the "₹500 stays as advance" follow-up names); a bare id from any
    other listener is passed through as a string.
    """
    released: list[Any] = []
    for listener in _VOID_LISTENERS:
        for row in listener(ctx, document) or []:
            released.append(row if isinstance(row, dict) else str(row))
    return released


def released_payment_ids(released: list[Any]) -> list[str]:
    """The ids alone, for the void's audit row."""
    return [str(row["payment_id"]) if isinstance(row, dict) else str(row) for row in released]


def lock_payable_bills(*, tenant: Any, ids: list[Any]) -> list[Any]:
    """The bills a payment allocates to, locked in the canonical order (no deadlock)."""
    from apps.purchases.models import PurchaseDocument

    return list(
        PurchaseDocument.objects.select_for_update()
        .filter(tenant=tenant, pk__in=ids)
        .order_by("document_date", "number", "id")
    )


def status_for(*, amount_paid: Decimal, amount_due: Decimal, due_on: Any, today: dt.date) -> str:
    """PUR-01 BR-5 (with overdue derived at once when un-paying a late bill)."""
    if amount_due == ZERO:
        return DocumentStatus.PAID
    if due_on is not None and due_on < today:
        return DocumentStatus.OVERDUE
    if amount_paid > ZERO:
        return DocumentStatus.PARTIALLY_PAID
    return DocumentStatus.RECORDED


def apply_payment(*, document: Any, amount: Decimal, today: dt.date) -> Any:
    """Move a LOCKED bill's paid/due by `amount` (negative to undo). Saves and returns it."""
    if document.status not in PAYABLE_STATUSES:
        raise BusinessRuleViolation(
            "document_not_open",
            "This bill cannot take a payment.",
            details={"document_id": str(document.id), "status": document.status},
        )
    paid = document.amount_paid + amount
    due = document.grand_total - paid
    if paid < ZERO or due < ZERO:
        raise BusinessRuleViolation(
            "over_allocated",
            "That is more than this bill has left to pay.",
            details={"document_id": str(document.id), "amount_due": str(document.amount_due)},
        )
    document.amount_paid = paid
    document.amount_due = due
    document.status = status_for(
        amount_paid=paid, amount_due=due, due_on=document.due_on, today=today
    )
    document.version += 1
    document.save(update_fields=["amount_paid", "amount_due", "status", "version", "updated_at"])
    return document


# ── PUR-01 FR-6h — "Paid now" ───────────────────────────────────────────────


def validate_payment(*, payment: dict | None) -> dict | None:
    """The cleaned "Paid now" payment, or None for a bill left on credit.

    Runs before anything is written, so a mistyped mode line refuses the record
    (400 `details.payment.mode_breakup…`) rather than recording the bill and
    failing its payment. An empty `mode_breakup` is "Pay later".
    """
    from apps.payments.services.record import mode_total, validate_mode_breakup

    rows = (payment or {}).get("mode_breakup") or []
    if not rows:
        return None
    lines = validate_mode_breakup(rows, prefix="payment.mode_breakup")
    raw_date = (payment or {}).get("payment_date")
    return {
        "payment_date": str(raw_date) if raw_date else "",
        "mode_breakup": lines,
        "note": str((payment or {}).get("note") or "")[:255],
        "total": mode_total(lines),
    }


def record_bill_payment(*, ctx: Any, document: Any, payment: dict | None) -> dict | None:
    """Pay the RECORDED bill (already saved, credit posted) through PAY-01.

    Up to the grand total settles the bill; anything above it stays on the
    supplier's khata as an advance (PUR-02 US-4). The khata gets TWO lines —
    the bill's credit and the payment's debit — so the statement reads like the
    paper bill book (LED-10 BR-4, T-PUR-01-5). Returns `{payment_id, number,
    amount, party_balance}` or None when nothing was paid.
    """
    if payment is None:
        return None
    from apps.payments.services.record import record_payment

    share = min(payment["total"], document.grand_total)
    result = record_payment(
        ctx=ctx,
        payload={
            "direction": "out",
            "party_id": str(document.party_id),
            "payment_date": payment["payment_date"] or document.document_date.isoformat(),
            "mode_breakup": payment["mode_breakup"],
            "note": payment["note"],
            "context": "bill",
            "meta": {"document_id": str(document.id), "document_number": document.number},
            "allocations": (
                []
                if share <= ZERO
                else [
                    {
                        "document_type": "purchase_document",
                        "document_id": str(document.id),
                        "amount": str(share),
                    }
                ]
            ),
        },
    )
    recorded = result["payment"]
    return {
        "payment_id": str(recorded.id),
        "number": recorded.number,
        "amount": str(recorded.amount),
        "party_balance": result["party_balance"],
    }
