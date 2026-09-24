"""Money taken at issue — the seam PAY-01 replaces (SAL-07 FR-3/FR-4, SAL-02 FR-10).

PAY-01 (next wave) owns `payments_payment` and `payments_allocation`, and a
payment at issue will become `record_payment()` with an allocation to this
document. Until then this module is the whole of it, deliberately narrow:

* A WALK-IN sale must be paid in full, and that payment is recorded here —
  on the document as `meta.payment` (modes, amounts, references) with
  `amount_paid` as the cache. No ledger row, because there is no party
  (SAL-07 BR-2), so nothing PAY-01 migrates can double-post.
* A PARTY sale takes no payment at issue this wave. Recording "₹700 received"
  on a party invoice means a `payment_in` ledger credit, and writing that row
  here would be a second payment writer PAY-01 would have to find and replace.
  The invoice issues on credit; the payment is recorded in Payments.

`record_issue_payment` is the one function PAY-01 rewrites; its callers and
its return shape stay.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any

from apps.common.constants import PaymentMode
from apps.common.exceptions import ValidationFailed
from apps.common.money import D, q2

ZERO = Decimal("0.00")


def validate_payment(*, payment: dict | None, grand_total: Decimal, walk_in: bool) -> dict | None:
    """Return the cleaned payment, or raise 400 `details.payment` (FR-10, SAL-07 §10)."""
    if not walk_in:
        if payment and payment.get("mode_breakup"):
            raise ValidationFailed(
                {"payment": ["Record this payment from Payments; the invoice is issued on credit."]}
            )
        return None
    if grand_total == ZERO:
        return None  # EC-5 — a free sample needs no payment of zero
    rows = (payment or {}).get("mode_breakup") or []
    cleaned: list[dict] = []
    total = ZERO
    for index, row in enumerate(rows):
        mode = row.get("mode")
        try:
            amount = q2(D(row.get("amount")))
        except (InvalidOperation, TypeError, ValueError):
            amount = ZERO
        if mode not in PaymentMode.values:
            raise ValidationFailed(
                {f"payment.mode_breakup.{index}.mode": ["Choose a payment mode."]}
            )
        if amount <= 0:
            raise ValidationFailed({f"payment.mode_breakup.{index}.amount": ["Enter an amount."]})
        if mode == PaymentMode.CHEQUE and not (row.get("reference") or "").strip():
            raise ValidationFailed(
                {f"payment.mode_breakup.{index}.reference": ["Enter the cheque number."]}
            )
        total += amount
        cleaned.append(
            {"mode": mode, "amount": str(amount), "reference": (row.get("reference") or "")[:64]}
        )
    if total != grand_total:
        raise ValidationFailed({"payment": ["Walk-in sale must be paid in full"]})
    return {
        "payment_date": str((payment or {}).get("payment_date") or ""),
        "mode_breakup": cleaned,
        "note": str((payment or {}).get("note") or "")[:255],
    }


def record_issue_payment(*, document: Any, payment: dict | None) -> Decimal:
    """Write the payment onto the document and return `amount_paid`."""
    if payment is None:
        return ZERO
    if not payment["payment_date"]:
        payment = {**payment, "payment_date": document.document_date.isoformat()}
    document.meta = {**(document.meta or {}), "payment": payment}
    return sum((D(row["amount"]) for row in payment["mode_breakup"]), ZERO)
