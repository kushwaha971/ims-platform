"""`void_bill()` — PUR-04: cancel a recorded bill with a reason, keeping every row.

Void never deletes (BR-1). The bill keeps its number (BR-2), its lines and
its figures, gains `status='void'`, `voided_at`, `voided_by`, `void_reason`,
and three sets of rows are ADDED:

* a `reversal` stock movement for every `purchase_in` the bill posted —
  `qty = −original`, `reverses = original`, dated today (NFR: a valuation as
  of a date before the void still shows the goods). It goes through
  `inventory.post_movements`, so the negative-stock policy applies: goods
  already sold refuse the void with 409 `insufficient_stock` naming every
  short line (FR-2b, EC-1, AC-4) unless the shop allows negative stock;
* a debit `reversal` of the supplier credit, dated today (C6, BR-6);
* whatever the payments app does to release allocations (FR-2d, PUR-02
  BR-4) — see `payment_seam.py`: each supplier payment stays recorded and
  what it had put on this bill becomes advance on the khata. The bill's own
  `amount_paid` returns to zero with it.

── The average cost after a void (CR-2026-09-24-INV-A) ──────────────────────
PUR-04 FR-4 and BR-4 say the average is not recalculated on a void — "the
outbound rule", a documented approximation. That text predates
CR-2026-09-24-INV-A, which decided the other way and is the rule this code
follows: a reversal row is folded through `costing.apply_weighted_average`'s
"reversal of an inbound" case, which REMOVES the value the purchase blended
in — `(on_hand × avg − qty × c) / (on_hand − qty)`, zero when nothing is left.
Applied in ARRIVAL order (`sequence_no`) by the same function `recalc_stock`
replays, so the cache equals the replay by construction and a void needs no
recompute job. The consequence the FRD's dialog text must lose: the average
DOES change on a void ("Average cost unchanged" would now be false).

── Lock order ───────────────────────────────────────────────────────────────
Bill row, then its standing ledger line, then the supplier (L1), then the
stock rows (L2, inside `post_movements`) — the order `record_bill` takes, so a
void and a record touching the same party and items cannot deadlock.
"""

from __future__ import annotations

from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.common.exceptions import BusinessRuleViolation
from apps.common.money import ZERO
from apps.ledger.services.corrections import _validate_reason
from apps.purchases.constants import VOIDABLE_STATUSES, DocumentStatus
from apps.purchases.services.drafts import ENTITY, lock_document, snapshot
from apps.purchases.services.ledger_link import reverse_bill_credit, standing_bill_entry
from apps.purchases.services.payment_seam import (
    release_payments_on_void,
    released_payment_ids,
)


def _reverse_stock(ctx: Ctx, document: Any, reason: str) -> list[Any]:
    """FR-2a/b — one reversal per standing `purchase_in` of this bill, through `post_movements`."""
    from apps.inventory.constants import MovementSource, MovementType
    from apps.inventory.models import StockMovement
    from apps.inventory.services.stock import MovementLine, post_movements

    originals = list(
        StockMovement.objects.filter(
            tenant=ctx.tenant,
            source_type=MovementSource.PURCHASE_DOCUMENT,
            source_id=document.id,
            movement_type=MovementType.PURCHASE_IN,
        )
        .select_related("item", "item__unit", "location")
        .order_by("sequence_no", "id")
    )
    already = set(
        StockMovement.objects.filter(
            tenant=ctx.tenant, reverses__in=[m.id for m in originals]
        ).values_list("reverses_id", flat=True)
    )
    line_index = {line.item_id: line.line_no - 1 for line in document.lines.all() if line.item_id}
    today = tenant_today(ctx.tenant)
    lines = [
        MovementLine(
            item=original.item,
            qty=-original.qty,
            movement_type=MovementType.REVERSAL,
            movement_date=today,
            source_type=MovementSource.PURCHASE_DOCUMENT,
            source_id=document.id,
            unit_cost=original.unit_cost,
            reason="void",
            reverses=original,
            location=original.location,
            index=line_index.get(original.item_id, 0),
        )
        for original in originals
        if original.id not in already
    ]
    return post_movements(ctx=ctx, lines=lines)


@transaction.atomic
def void_bill(*, ctx: Ctx, document_id: Any, reason: Any) -> dict:
    """Void one bill. Returns `{document, party_balance, reversal_entry_id, reversal_movement_ids,
    released_payments}` (PUR-04 §14)."""
    from apps.parties.constants import PartyStatus
    from apps.parties.services.balance import lock_party

    clean_reason = _validate_reason(reason)
    document = lock_document(ctx.tenant, document_id)
    if document.status == DocumentStatus.VOID:
        raise BusinessRuleViolation(
            "document_already_void",
            "This bill has already been voided.",
            details={"number": document.number},
        )
    if document.status not in VOIDABLE_STATUSES:
        raise BusinessRuleViolation(
            "document_not_recorded",
            "A draft is deleted, not voided.",
            details={"status": document.status},
        )

    before = snapshot(document)
    original = standing_bill_entry(tenant=ctx.tenant, document_id=document.id)
    party = lock_party(tenant=ctx.tenant, party_id=document.party_id)
    if party is not None and party.status == PartyStatus.ARCHIVED:
        raise BusinessRuleViolation(
            "party_archived",
            "This supplier is archived. Restore them to void this bill.",
            details={"party_id": str(party.id), "name": party.name},
        )

    posted = _reverse_stock(ctx, document, clean_reason)

    balance = None
    reversal_id: str | None = None
    if original is not None and party is not None:
        reversal, balance = reverse_bill_credit(
            ctx=ctx, original=original, party=party, reason=clean_reason, document=document
        )
        reversal_id = str(reversal.id)

    released = release_payments_on_void(ctx, document)

    document.status = DocumentStatus.VOID
    document.voided_at = timezone.now()
    document.voided_by = ctx.actor if ctx.actor_type == "user" else None
    document.void_reason = clean_reason
    # PUR-02 BR-4 — the payments were released as advances, so the void bill is
    # paid by nothing: Σ allocations (now none) = `amount_paid` (the PUR-02 §1
    # invariant), and a paid-then-voided bill reads exactly like an unpaid void.
    document.amount_paid = ZERO
    document.amount_due = document.grand_total
    document.version += 1
    document.save(
        update_fields=[
            "status",
            "voided_at",
            "voided_by",
            "void_reason",
            "amount_paid",
            "amount_due",
            "version",
            "updated_at",
        ]
    )

    movement_ids = [str(p.movement.id) for p in posted]
    write_audit(
        ctx=ctx,
        action=AuditAction.PURCHASE_BILL_VOIDED,
        entity_type=ENTITY,
        entity_id=document.id,
        before=before,
        after=snapshot(document),
        metadata={
            "reason": clean_reason,
            "reversal_movement_ids": movement_ids,
            "reversal_ledger_entry_id": reversal_id,
            "released_payment_ids": released_payment_ids(released),
            "idempotency_key": ctx.idempotency_key,
        },
    )
    return {
        "document": document,
        "party_balance": balance,
        "reversal_entry_id": reversal_id,
        "reversal_movement_ids": movement_ids,
        "released_payments": released,
    }
