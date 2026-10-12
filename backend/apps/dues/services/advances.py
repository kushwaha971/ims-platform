"""DUE-02 step 6 — open advances applied to the dues a run just posted (FRD 00 DUE-02 §9, DUE-03 BR-6).

A member who paid ₹2,400 in September has ₹1,200 left as an advance when
October's due posts; without this the khata shows the advance and the due side
by side, the due turns overdue, and the merchant chases somebody who has paid.

Only ledger-mode charge dues (the `dues_due` target, bucket `main`), only what
`open_advances` offers (never an earmark, a refund voucher or a module refund,
R61), oldest payment first, onto the dues THIS run posted, oldest due first —
through `allocate_existing`, the one writer of a payment's later allocations, so
the receipt, its audit row and "Paid from advance of 3 Sep" are the same as when
a merchant applies an advance by hand. A schedule whose plan says
`auto_apply_advance = false` is left alone. Expectation dues are lending's call
(BR-6), and document dues had their advances applied as the invoice was issued.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from apps.common.money import ZERO
from apps.dues.constants import OPEN_DUE_STATUSES, Mode, Posting
from apps.dues.models import DuesDue, DuesSchedule
from apps.dues.services.settlement import TARGET_DUE, outstanding


def applies_advances(schedule: DuesSchedule) -> bool:
    return (
        schedule.mode == Mode.CHARGE
        and schedule.posting == Posting.LEDGER
        and bool((schedule.terms or {}).get("auto_apply_advance", True))
    )


def apply_advances(*, ctx: Any, schedule: DuesSchedule, due_ids: list[Any]) -> int:
    """Apply the party's open `main` advances to these just-posted dues. Returns how many
    allocations were made. The caller holds the party, schedule and due locks."""
    from apps.payments.selectors.payments import open_advances
    from apps.payments.services.allocate import allocate_existing

    if not due_ids or not applies_advances(schedule):
        return 0
    made = 0
    for payment in open_advances(tenant=ctx.tenant, party_id=schedule.party_id, bucket="shop"):
        left = Decimal(payment.unallocated_amount)
        rows: list[dict] = []
        dues = (
            DuesDue.objects.filter(pk__in=due_ids)
            .prefetch_related("components")
            .order_by("due_on", "seq", "id")
        )
        for due in dues:
            owed = outstanding(due)
            if owed <= ZERO or left <= ZERO or due.status not in OPEN_DUE_STATUSES:
                continue
            take = min(owed, left)
            rows.append(
                {"document_type": TARGET_DUE, "document_id": str(due.id), "amount": str(take)}
            )
            left -= take
        if not rows:
            break
        allocate_existing(ctx=ctx, payment_id=payment.id, allocations=rows)
        made += len(rows)
    return made
