"""What a void does to money already received — the seam PAY-01 fills (SAL-05 FR-2, FR-6, BR-4).

A void never voids a payment (Part 22 §22.14 step 4, BR-4): the allocations to
the invoice are removed, the payment stays `recorded` and becomes an advance
for the party, and the response tells the caller which payments are now
unallocated so the UI can ask "Refund or keep as advance?".

Today the only money a sales document can hold is a WALK-IN sale's payment at
issue, which lives on the document as `meta.payment` (see payment_seam.py) and
has no party to become an advance for. It is reported with `walk_in: true` so
the client offers FR-7's single follow-up — the money goes back over the
counter — and it stays in `meta.payment` as the record that it was taken.

PAY-01 replaces `release_invoice_payments` with: delete this invoice's
`payments_allocation` rows, recompute each payment's `unallocated_amount`, and
return one entry per payment touched. The caller and the return shape stay.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from apps.common.context import Ctx

ZERO = Decimal("0.00")


def release_invoice_payments(*, ctx: Ctx, document: Any) -> list[dict]:
    """Detach every payment from the LOCKED invoice. Returns `[{payment_id, number, amount, walk_in}]`."""
    if document.amount_paid <= ZERO:
        return []
    if document.party_id is None:
        return [
            {
                "payment_id": None,
                "number": None,
                "amount": str(document.amount_paid),
                "walk_in": True,
            }
        ]
    # A party invoice cannot hold a payment until PAY-01 (payment_seam.py
    # refuses one at issue), so there is nothing to detach.
    return []
