"""What a void does to money already received (SAL-05 FR-2, FR-6, BR-4).

A void never voids a payment (Part 22 §22.14 step 4, BR-4): the invoice's
`payments_allocation` rows are deleted through PAY-05's
`release_document_allocations`, each payment stays `recorded` with its
`unallocated_amount` grown by what it had put on this bill — an advance on
the party's khata — and the response names every payment touched so the UI
can say "₹500 payment stays as advance" (or, for a walk-in bill, offer the
money back over the counter: a walk-in payment has no party to be an advance
for, so it is reported with `walk_in: true`).

── A walk-in bill's counter receipt is VOIDED with it (UAT D3, lead decision) ──
A walk-in has no khata for an advance to sit in; the money is handed back over
the counter (the dialog says so). Leaving the receipt `recorded` kept that cash
in the cashbook, day book and dashboard "cash in hand" for money the shop no
longer holds. So a receipt allocated ONLY to this walk-in bill is voided through
PAY-05's `void_payment` with reason "Walk-in bill voided: <reason>", inside the
bill void's transaction (the bill is already locked; `void_payment` takes no
party lock for a walk-in and re-locks the same bill row, which this transaction
holds). A receipt that also settles another document is released as before —
voiding it would un-pay a bill nobody asked to touch. Party invoices keep BR-4:
payments stay as an advance.

Sales may not import payments at module level (Part 20 §20.1.4, rule D5), so
the call is a deferred import — the same pattern as `payment_seam.py`.
"""

from __future__ import annotations

from typing import Any

from apps.common.context import Ctx


def _void_walk_in_receipts(*, ctx: Ctx, document: Any, reason: str) -> list[dict]:
    """UAT D3 — void every live receipt that settles only this walk-in bill."""
    from apps.payments.models import Allocation
    from apps.payments.services.void import void_payment

    mine = Allocation.objects.filter(
        tenant=ctx.tenant, document_type="sales_document", document_id=document.id
    )
    elsewhere = (
        Allocation.objects.filter(tenant=ctx.tenant, payment_id__in=mine.values("payment_id"))
        .exclude(document_type="sales_document", document_id=document.id)
        .values("payment_id")
    )
    rows = list(
        mine.exclude(payment_id__in=elsewhere)
        .exclude(payment__status="void")
        .select_related("payment")
        .order_by("payment_id")
    )
    voided: list[dict] = []
    for row in rows:
        void_payment(ctx=ctx, payment_id=row.payment_id, reason=f"Walk-in bill voided: {reason}")
        voided.append(
            {
                "payment_id": str(row.payment_id),
                "number": row.payment.number,
                "amount": str(row.amount),
                "walk_in": True,
                "voided": True,
            }
        )
    return voided


def release_invoice_payments(*, ctx: Ctx, document: Any, reason: str = "") -> list[dict]:
    """Detach every payment from the LOCKED invoice (a walk-in's receipts are voided).

    Returns `[{payment_id, number, amount, walk_in, voided}]`.
    """
    from apps.payments.services.void import release_document_allocations

    walk_in = document.party_id is None
    voided = _void_walk_in_receipts(ctx=ctx, document=document, reason=reason) if walk_in else []
    released = release_document_allocations(
        ctx=ctx, document_type="sales_document", document_id=document.id
    )
    return voided + [{**row, "walk_in": walk_in, "voided": False} for row in released]
