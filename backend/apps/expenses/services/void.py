"""EXP-01 FR-12 — voiding an expense, with a reason, reversing any ledger line.

Void is terminal (BR-8) and never deletes: the row keeps its number, its
amount and its category, gains `status='void'`, `voided_at`, `voided_by` and
`void_reason`, and disappears from the cashbook for the day it was recorded
(EXP-03 FR-12) because the cashbook reads `status='recorded'` only.

── Lock order ───────────────────────────────────────────────────────────────
The expense row first (two voids racing must not both pass the status check),
then its standing ledger line, then the party. `record_expense` locks the party
and then the sequence and never an expense row, so the two cannot deadlock.

── Why an archived party refuses the void ───────────────────────────────────
PTY-04 archives only at a zero balance, so an archived party with an unpaid
expense standing is a party whose other entries net it to zero (EXP-01 EC-6).
Reversing the credit would move the balance of somebody who appears in no
list, silently, which is the reason LED-03 refuses corrections there too. The
merchant restores them — one tap — and the change happens on a khata that is
on screen.

── Payments are not here yet ────────────────────────────────────────────────
FR-12 also deletes `payments_allocation` rows against the expense and
recomputes the paying payment's unallocated amount. There is no payments table
on this branch, so there is nothing to delete; PAY-01 adds that step here when
allocations exist.
"""

from __future__ import annotations

from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation, NotFound
from apps.expenses.constants import ExpenseStatus
from apps.expenses.models import Expense
from apps.expenses.services.ledger_link import reverse_expense_payable, standing_expense_entry
from apps.expenses.services.record import expense_snapshot
from apps.ledger.services.corrections import _validate_reason
from apps.parties.constants import PartyStatus
from apps.parties.services.balance import lock_party


def _lock_expense(*, ctx: Ctx, expense_id: Any) -> Expense:
    expense = (
        Expense.objects.for_tenant(ctx.tenant)
        .select_for_update()
        .select_related("category")
        .filter(pk=expense_id)
        .first()
    )
    if expense is None:
        raise NotFound("No such expense.")
    return expense


@transaction.atomic
def void_expense(*, ctx: Ctx, expense_id: Any, reason: Any) -> dict:
    """Void one expense. Returns `{expense, party_balance, reversal_entry_id}`.

    The reason is LED-03's reason rule (3–160 characters) — the same bar a
    correction clears, for the same purpose: the row that survives says what
    was withdrawn, and the reason says why.
    """
    clean_reason = _validate_reason(reason)
    expense = _lock_expense(ctx=ctx, expense_id=expense_id)
    if expense.status == ExpenseStatus.VOID:
        raise BusinessRuleViolation(
            "expense_already_void",
            "This expense has already been voided.",
            details={"expense_id": str(expense.id), "number": expense.number},
        )

    before = expense_snapshot(expense)
    balance = None
    reversal_id: str | None = None
    original = standing_expense_entry(tenant=ctx.tenant, expense_id=expense.id)
    if original is not None:
        party = lock_party(tenant=ctx.tenant, party_id=original.party_id)
        if party is not None and party.status == PartyStatus.ARCHIVED:
            raise BusinessRuleViolation(
                "party_archived",
                "This party is archived. Restore them to void this expense.",
                details={"party_id": str(party.id), "name": party.name},
            )
        reversal, balance = reverse_expense_payable(
            ctx=ctx, original=original, party=party, reason=clean_reason, expense=expense
        )
        reversal_id = str(reversal.id)

    expense.status = ExpenseStatus.VOID
    expense.voided_at = timezone.now()
    expense.voided_by = ctx.actor if ctx.actor_type == "user" else None
    expense.void_reason = clean_reason
    expense.save(update_fields=["status", "voided_at", "voided_by", "void_reason", "updated_at"])

    write_audit(
        ctx=ctx,
        action=AuditAction.EXPENSE_VOIDED,
        entity_type="expenses_expense",
        entity_id=expense.id,
        before=before,
        after={"status": expense.status, "void_reason": clean_reason},
        metadata={
            "reason": clean_reason,
            **({"reversal_entry_id": reversal_id} if reversal_id else {}),
        },
    )
    return {"expense": expense, "party_balance": balance, "reversal_entry_id": reversal_id}
