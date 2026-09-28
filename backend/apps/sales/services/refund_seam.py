"""A credit note's cash refund — the seam PAY-01 replaces (SAL-04 FR-7, BR-4, TSK-SAL-04-04).

FR-7 wants a `payments_payment` (`direction='out'`) allocated to the credit
note. `sales` may not import `payments` (Part 20 §20.1.4), and PAY-01 lands in
parallel, so until it does the refund is recorded the way the walk-in payment
at issue is (payment_seam.py): the mode breakup on the document as
`meta.refund`, the amount as the note's `amount_paid` cache — and, because a
refund moves a party's balance, the `payment_out` DEBIT the ledger needs
(BR-4: a fully refunded return nets to zero on the khata).

PAY-01 rewrites `record_refund` to call `record_payment(direction='out')` with
an allocation to the credit note and to let the payment post the debit; the
callers, the validation and the return value stay. A refunded note cannot be
voided until its refund is (FR-10) — with this seam that means not at all, and
PAY-05 is what lifts it.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any

from apps.common.constants import PaymentMode
from apps.common.context import Ctx
from apps.common.exceptions import ValidationFailed
from apps.common.money import D, q2

ZERO = Decimal("0.00")


def clean_refund(refund: dict | None) -> dict | None:
    """The refund's shape (§10): known modes, positive amounts, a cheque number. No totals yet."""
    rows = (refund or {}).get("mode_breakup") or []
    if not rows:
        return None
    cleaned: list[dict] = []
    for index, row in enumerate(rows):
        mode = row.get("mode")
        try:
            amount = q2(D(row.get("amount")))
        except (InvalidOperation, TypeError, ValueError):
            amount = ZERO
        if mode not in PaymentMode.values:
            raise ValidationFailed(
                {f"refund.mode_breakup.{index}.mode": ["Choose a payment mode."]}
            )
        if amount <= 0:
            raise ValidationFailed({f"refund.mode_breakup.{index}.amount": ["Enter an amount."]})
        if mode == PaymentMode.CHEQUE and not (row.get("reference") or "").strip():
            raise ValidationFailed(
                {f"refund.mode_breakup.{index}.reference": ["Enter the cheque number."]}
            )
        cleaned.append(
            {"mode": mode, "amount": str(amount), "reference": (row.get("reference") or "")[:64]}
        )
    return {
        "payment_date": str((refund or {}).get("payment_date") or ""),
        "mode_breakup": cleaned,
        "note": str((refund or {}).get("note") or "")[:255],
    }


def refund_total(refund: dict | None) -> Decimal:
    if not refund:
        return ZERO
    return sum((D(row["amount"]) for row in refund["mode_breakup"]), ZERO)


def record_refund(
    *, ctx: Ctx, document: Any, party: Any, refund: dict, open_credit: Decimal
) -> tuple[Decimal, Any, Any]:
    """Write the refund against the LOCKED note and party. Returns `(amount, entry, balance)`."""
    from apps.sales.services.ledger_link import post_refund_debit

    amount = refund_total(refund)
    if amount > open_credit:
        raise ValidationFailed({"refund": [f"Refund cannot exceed ₹{open_credit}"]})
    if not refund["payment_date"]:
        refund = {**refund, "payment_date": document.document_date.isoformat()}
    document.meta = {**(document.meta or {}), "refund": refund}
    document.amount_paid = amount
    entry, balance = post_refund_debit(ctx=ctx, document=document, party=party, amount=amount)
    return amount, entry, balance
