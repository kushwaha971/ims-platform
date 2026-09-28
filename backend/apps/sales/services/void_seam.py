"""What a void does to money already received (SAL-05 FR-2, FR-6, BR-4).

A void never voids a payment (Part 22 §22.14 step 4, BR-4): the invoice's
`payments_allocation` rows are deleted through PAY-05's
`release_document_allocations`, each payment stays `recorded` with its
`unallocated_amount` grown by what it had put on this bill — an advance on
the party's khata — and the response names every payment touched so the UI
can say "₹500 payment stays as advance" (or, for a walk-in bill, offer the
money back over the counter: a walk-in payment has no party to be an advance
for, so it is reported with `walk_in: true`).

Sales may not import payments at module level (Part 20 §20.1.4, rule D5), so
the call is a deferred import — the same pattern as `payment_seam.py`.
"""

from __future__ import annotations

from typing import Any

from apps.common.context import Ctx


def release_invoice_payments(*, ctx: Ctx, document: Any) -> list[dict]:
    """Detach every payment from the LOCKED invoice.

    Returns `[{payment_id, number, amount, walk_in}]`.
    """
    from apps.payments.services.void import release_document_allocations

    released = release_document_allocations(
        ctx=ctx, document_type="sales_document", document_id=document.id
    )
    walk_in = document.party_id is None
    return [{**row, "walk_in": walk_in} for row in released]
