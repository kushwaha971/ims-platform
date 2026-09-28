"""An unpaid expense's line in the party's khata, and its undoing (EXP-01 FR-4, FR-12).

── Why this file posts, rather than calling `post_entry` ────────────────────
`ledger.services.entries.post_entry` writes MANUAL entries: it derives
`entry_type` from the direction (`manual_gave` / `manual_got`) and stamps
`source_type='manual'`, because a "You gave" is its own source. An expense's
line is not manual — FR-4 and AC-3 require `entry_type='expense'`,
`source_type='expense'` and `source_id=<the expense>`, which is what lets
LED-03 refuse to correct it directly (`use_document_void`) and what lets the
void below find it again. The post now goes through LED-10's
`post_source_entry`; the reversal below keeps its own two writes (C6's rules
are the same ones `reverse_source_entries` applies). No rule is restated:

* the row goes through `validate_entry_payload` (amount, date, note) exactly
  as a write-off and an opening do;
* the balance moves through `apply_entry`, the one function that writes the
  party cache, so `recalc_balances` replays it like any other row;
* the audit row is the ledger's own `ledger.entry.created` snapshot.

Part 20 §20.1.4 lets `expenses` import `ledger`, so no port is needed (the
write-off needed one because `parties` may not import `ledger`). When LED-10
lands, both functions here become one-line calls into it.

── Why the reversal is dated TODAY and points at the expense ────────────────
C6 (decided 23 Sep 2026): both reversal dating rules stand and `source_type`
is the discriminator. LED-03's manual reversal carries the original's date and
`source_type='ledger_entry'`; a document void carries the VOID date and the
DOCUMENT as its source (LED-10 BR-5, BR-6). Voiding an expense is a document
void: the landlord's khata shows the credit on the day it was recorded and the
reversal on the day it was withdrawn, which is what an accountant expects of a
void and the only rule that survives the original period being closed.
"""

from __future__ import annotations

from typing import Any

from apps.common.audit import AuditAction, write_audit
from apps.common.constants import Direction
from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.ledger.constants import EntryStatus, EntryType, SourceType
from apps.ledger.models import LedgerEntry
from apps.ledger.services.entries import _audit_snapshot, validate_entry_payload
from apps.ledger.services.postings import post_source_entry
from apps.parties.services.balance import apply_entry


def _actor(ctx: Ctx) -> Any:
    return ctx.actor if ctx.actor_type == "user" else None


def ledger_note_for(expense: Any) -> str:
    """The khata row's title: "Rent · EXP/26-27/0001", plus the merchant's note.

    Stored on an immutable row, so it has to read correctly for ever and in
    either locale: the category name is the tenant's own word (never
    translated, EXP-02 §5) and the number is a number. Without it the row would
    fall through to the ledger's direction label and say nothing about rent.
    """
    head = f"{expense.category.name} · {expense.number}"
    note = (expense.note or "").strip()
    text = f"{head} — {note}" if note else head
    return text[:255]


def post_expense_payable(*, ctx: Ctx, expense: Any, party: Any) -> tuple[LedgerEntry, Any]:
    """Write the unpaid expense's credit against `party`, which the caller LOCKED.

    A credit: the business owes the party more (canon §0.2 — a supplier
    document is a credit). No credit-limit check, for the reason LED-01 FR-6
    gives: a credit only ever reduces what the party owes the shop. The amount
    and date go through the ledger's own validator first (they become a row).
    Returns `(entry, balance_after)`.
    """
    row = validate_entry_payload(
        {
            "direction": Direction.CREDIT,
            "amount": expense.amount,
            "entry_date": expense.expense_date,
            "note": ledger_note_for(expense),
        },
        tenant=ctx.tenant,
        needs_mode=False,
    )
    return post_source_entry(
        ctx=ctx,
        party=party,
        amount=row["amount"],
        entry_date=row["entry_date"],
        entry_type=EntryType.EXPENSE,
        source_type=SourceType.EXPENSE,
        source_id=expense.id,
        note=row["note"],
        source_number=expense.number,
    )


def standing_expense_entry(*, tenant: Any, expense_id: Any) -> LedgerEntry | None:
    """The POSTED ledger line this expense produced, locked, or None.

    `ix_ledger_source` serves the lookup. Locked because the void reverses it,
    and two voids racing must not both find it standing.
    """
    return (
        LedgerEntry.objects.filter(
            tenant=tenant,
            source_type=SourceType.EXPENSE,
            source_id=expense_id,
            entry_type=EntryType.EXPENSE,
            status=EntryStatus.POSTED,
        )
        .select_for_update()
        .first()
    )


def reverse_expense_payable(
    *, ctx: Ctx, original: LedgerEntry, party: Any, reason: str, expense: Any
) -> tuple[LedgerEntry, Any]:
    """Undo the credit: a reversal row, and the one permitted change to the original.

    The same two writes LED-03's `_write_reversal` makes, in the same order
    (original marked first so `reversed_by` points at a row that exists), with
    the two differences C6 requires: dated today in the tenant's timezone, and
    sourced to the expense. No `payment_mode`: the reversal of a credit is a
    debit, and `ck_ledger_entry_debit_has_no_mode` forbids a debit a mode.
    Returns `(reversal, balance_after)`.
    """
    direction = Direction.DEBIT if original.direction == Direction.CREDIT else Direction.CREDIT
    before = _audit_snapshot(original)
    reversal = LedgerEntry.objects.create(
        tenant=ctx.tenant,
        created_by=_actor(ctx),
        party=party,
        direction=direction,
        amount=original.amount,
        entry_date=tenant_today(ctx.tenant),
        entry_type=EntryType.REVERSAL,
        source_type=SourceType.EXPENSE,
        source_id=expense.id,
        reverses=original,
        reason=reason,
        status=EntryStatus.POSTED,
    )
    original.status = EntryStatus.REVERSED
    original.reversed_by = reversal
    original.save(update_fields=["status", "reversed_by"])
    balance = apply_entry(party=party, direction=direction, amount=original.amount)
    write_audit(
        ctx=ctx,
        action=AuditAction.LEDGER_ENTRY_REVERSED,
        entity_type="ledger_entry",
        entity_id=original.id,
        before=before,
        after=_audit_snapshot(original),
        metadata={
            "via": "expense_void",
            "expense_id": str(expense.id),
            "reason": reason,
            "reversal_id": str(reversal.id),
            "party_id": str(party.id),
            "balance_after": str(balance),
        },
    )
    return reversal, balance
