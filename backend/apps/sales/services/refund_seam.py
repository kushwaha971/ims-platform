"""A credit note's cash refund, recorded through PAY-01 (SAL-04 FR-7, BR-4, FR-10).

FR-7 wants a `payments_payment` (`direction='out'`) for the money handed back.
`record_refund` records it through `payments.services.record.record_payment`
with no allocation (`allocations="none"`) and `meta.credit_note_id` naming the
note — payments has no credit-note allocation target, and the note's own
`amount_paid` cache is what says how much of its credit went back in cash.
The PAYMENT posts the `payment_out` debit (sourced to the payment, LED-10), so
a fully refunded return nets to zero on the khata (BR-4) and PAY-05 can undo it.

FR-10: a refunded note cannot be voided until its refund is. Voiding the
refund payment (`void_payment`) calls `release_refund` below, which gives the
amount back to the note as open credit; after that the note voids normally.

Sales may not import payments at module level (Part 20 §20.1.4, rule D5), so
the call into it is a deferred import — the same pattern as `payment_seam.py`.
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
    """Refund against the LOCKED note and party. Returns `(amount, payment, balance)`.

    The caller saves the note's `meta` and `amount_paid` afterwards.
    """
    from apps.payments.services.record import record_payment

    amount = refund_total(refund)
    if amount > open_credit:
        raise ValidationFailed({"refund": [f"Refund cannot exceed ₹{open_credit}"]})
    payment_date = refund["payment_date"] or document.document_date.isoformat()
    mode_breakup = [
        {k: v for k, v in row.items() if k != "reference" or v} for row in refund["mode_breakup"]
    ]
    result = record_payment(
        ctx=ctx,
        payload={
            "direction": "out",
            "party_id": str(party.id),
            "payment_date": payment_date,
            "mode_breakup": mode_breakup,
            "note": refund["note"] or f"Refund · Credit note {document.number}"[:255],
            "allocations": "none",
            "context": "refund",
            "meta": {
                "credit_note_id": str(document.id),
                "credit_note_number": document.number,
            },
        },
    )
    payment = result["payment"]
    document.meta = {
        **(document.meta or {}),
        "refund": {
            **refund,
            "payment_date": payment_date,
            "payment_id": str(payment.id),
            "number": payment.number,
        },
    }
    document.amount_paid = amount
    return amount, payment, result["party_balance"]


def release_refund(*, ctx: Ctx, credit_note_id: Any, payment_id: Any, amount: Decimal) -> Any:
    """FR-10 — the refund payment was voided: its amount is the note's open credit again.

    Called by PAY-05's `void_payment` inside its transaction, after it has
    locked the payment and the party (L1); the note is locked here (L3).
    Returns the note, or None when it is gone or already void.
    """
    from apps.common.audit import AuditAction, write_audit
    from apps.sales.constants import DocumentKind, DocumentStatus
    from apps.sales.models import SalesDocument
    from apps.sales.services.amounts import refresh_credit_note

    note = (
        SalesDocument.objects.select_for_update()
        .filter(tenant=ctx.tenant, pk=credit_note_id, kind=DocumentKind.CREDIT_NOTE)
        .first()
    )
    if note is None or note.status in (DocumentStatus.VOID, DocumentStatus.DRAFT):
        return None
    meta = dict(note.meta or {})
    refund = dict(meta.get("refund") or {})
    if refund.get("payment_id") not in (None, str(payment_id)):
        return None  # a different payment is this note's refund
    before = {"amount_paid": str(note.amount_paid), "status": note.status}
    note.amount_paid = max(note.amount_paid - Decimal(amount), ZERO)
    if refund:
        meta["refund"] = {**refund, "voided": True}
    note.meta = meta
    note.save(update_fields=["amount_paid", "meta", "updated_at"])
    refresh_credit_note(note)
    write_audit(
        ctx=ctx,
        action=AuditAction.CREDIT_NOTE_REFUND_RELEASED,
        entity_type="sales_document",
        entity_id=note.id,
        before=before,
        after={"amount_paid": str(note.amount_paid), "open_credit": str(note.amount_due)},
        metadata={"payment_id": str(payment_id), "amount": str(amount)},
    )
    return note
