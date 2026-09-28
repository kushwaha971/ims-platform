"""LED-10 — the one service every document posts its khata line through.

FR-1 and FR-2: an invoice, a credit note, a purchase bill, a payment and an
unpaid party expense each post ONE ledger entry inside the caller's
transaction, and each void reverses it the same way. Before this module the
sales and expenses apps each carried a stand-in built from the ledger's parts
(`ledger_link.py`); both now call here, so the matrix below is enforced once.

── What the caller owns and what this owns ──────────────────────────────────
The CALLER holds the transaction and has LOCKED the party (`lock_party`) —
its own lock order (party L1, documents L3, sequence L4) is the deadlock
argument, and this module must not take a lock out of turn. This module
validates the posting (§10), writes the row, moves the balance through
`apply_entry` (the one writer of the cache, which `recalc_balances` replays)
and writes the ledger's own audit row with `metadata.via='document'`.

── Idempotent by (source_type, source_id, entry_type) (BR-1) ────────────────
A second call for a source that already has a POSTED entry of that type
returns the standing one and moves nothing. That is what makes a retried
issue call behind an idempotency key harmless even if the handler re-ran
(EC-5), and it is the reason the lookup uses `ix_ledger_source`.

── Reversals are dated TODAY and point at the DOCUMENT (BR-5, BR-6, C6) ──────
LED-03's manual reversal keeps the original's date and names the entry it
undoes (`source_type='ledger_entry'`). A document void is a new business event:
the reversal carries the void date in the tenant's timezone and the document's
own `(source_type, source_id)`, so `reverse_source_entries` and the statement
can group a document's rows, and a closed period is never re-opened by a void.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from django.db import connection

from apps.common.audit import AuditAction, write_audit
from apps.common.constants import Direction, PaymentMode, UpiApp
from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.ledger.constants import NOTE_MAX_LENGTH, EntryStatus, EntryType, SourceType
from apps.ledger.models import LedgerEntry
from apps.ledger.services.entries import _audit_snapshot
from apps.parties.services.balance import apply_entry, lock_party


class LedgerPostingError(RuntimeError):
    """§10 — a programming error, not user input. The handler maps it to a 500."""


#: FR-3's posting matrix: which entry types a source may post, and the
#: direction each one always carries (BR-2). A caller passing anything else is
#: a defect this refuses loudly rather than a row that confuses a statement.
POSTING_MATRIX: dict[str, dict[str, str]] = {
    SourceType.SALES_DOCUMENT: {
        EntryType.INVOICE: Direction.DEBIT,
        EntryType.CREDIT_NOTE: Direction.CREDIT,
    },
    SourceType.PURCHASE_DOCUMENT: {
        EntryType.PURCHASE_BILL: Direction.CREDIT,
        EntryType.DEBIT_NOTE: Direction.DEBIT,
    },
    SourceType.PAYMENT: {
        EntryType.PAYMENT_IN: Direction.CREDIT,
        EntryType.PAYMENT_OUT: Direction.DEBIT,
    },
    SourceType.EXPENSE: {
        EntryType.EXPENSE: Direction.CREDIT,
    },
}


def _actor(ctx: Ctx) -> Any:
    return ctx.actor if getattr(ctx, "actor_type", "user") == "user" else None


def _opposite(direction: str) -> str:
    return Direction.DEBIT if direction == Direction.CREDIT else Direction.CREDIT


def _assert_atomic() -> None:
    """FR-1 — a posting outside the caller's transaction is a half-written document."""
    if not connection.in_atomic_block:
        raise LedgerPostingError("post_source_entry must run inside the caller's transaction")


def standing_source_entry(
    *, tenant: Any, source_type: str, source_id: Any, entry_type: str
) -> LedgerEntry | None:
    """The POSTED entry this source produced of `entry_type`, or None (BR-1)."""
    return LedgerEntry.objects.filter(
        tenant=tenant,
        source_type=source_type,
        source_id=source_id,
        entry_type=entry_type,
        status=EntryStatus.POSTED,
    ).first()


def post_source_entry(
    *,
    ctx: Ctx,
    party: Any,
    amount: Decimal,
    entry_date: dt.date,
    entry_type: str,
    source_type: str,
    source_id: Any,
    note: str = "",
    payment_mode: str | None = None,
    upi_app: str | None = None,
    reference: str = "",
    source_number: str | None = None,
) -> tuple[LedgerEntry, Decimal]:
    """Write one document's ledger line against `party` (LOCKED by the caller).

    Returns `(entry, balance_after)`. The direction is not a parameter: it is
    a function of `entry_type` (BR-2), and a caller that could pass it could
    pass the wrong one.
    """
    _assert_atomic()
    allowed = POSTING_MATRIX.get(source_type)
    if allowed is None or entry_type not in allowed:
        raise LedgerPostingError(f"{entry_type!r} is not posted by {source_type!r}")
    if source_id is None:
        raise LedgerPostingError("a document posting needs its source_id")
    if party is None or party.tenant_id != ctx.tenant.id:
        raise LedgerPostingError("the party does not belong to this tenant")
    if amount is None or Decimal(amount) <= 0:
        raise LedgerPostingError("a posting amount must be greater than zero")

    existing = standing_source_entry(
        tenant=ctx.tenant, source_type=source_type, source_id=source_id, entry_type=entry_type
    )
    if existing is not None:
        return existing, party.balance

    direction = allowed[entry_type]
    # A debit carries no mode (`ck_ledger_entry_debit_has_no_mode`): a payment
    # OUT keeps its modes on the payment row, not on the khata line.
    if direction != Direction.CREDIT or payment_mode not in PaymentMode.values:
        payment_mode = None
    if payment_mode != PaymentMode.UPI or upi_app not in UpiApp.values:
        upi_app = None
    entry = LedgerEntry.objects.create(
        tenant=ctx.tenant,
        created_by=_actor(ctx),
        party=party,
        direction=direction,
        amount=amount,
        entry_date=entry_date,
        entry_type=entry_type,
        source_type=source_type,
        source_id=source_id,
        note=(note or "")[:NOTE_MAX_LENGTH],
        payment_mode=payment_mode,
        upi_app=upi_app,
        reference=(reference or "")[:64] if payment_mode else "",
        status=EntryStatus.POSTED,
    )
    balance = apply_entry(party=party, direction=direction, amount=entry.amount)
    write_audit(
        ctx=ctx,
        action=AuditAction.LEDGER_ENTRY_CREATED,
        entity_type="ledger_entry",
        entity_id=entry.id,
        after=_audit_snapshot(entry),
        metadata={
            "via": "document",
            "source": {"type": source_type, "id": str(source_id), "number": source_number},
            "party_id": str(party.id),
            "balance_after": str(balance),
        },
    )
    return entry, balance


def reverse_source_entries(
    *,
    ctx: Ctx,
    source_type: str,
    source_id: Any,
    reason: str,
    entry_date: dt.date | None = None,
) -> tuple[list[LedgerEntry], Decimal | None]:
    """FR-2 — reverse every POSTED line this source wrote. Returns `(reversals, balance)`.

    `balance` is the last touched party's balance after the reversals, or
    None when the source had nothing standing (a walk-in document, or a second
    void — which is therefore harmless here, and refused by the caller's own
    status check before it gets this far).

    Locks the standing rows, then their party, then writes: the same order
    LED-03 uses, so a correction and a void racing on one party serialise.
    """
    _assert_atomic()
    standing = list(
        LedgerEntry.objects.filter(
            tenant=ctx.tenant,
            source_type=source_type,
            source_id=source_id,
            status=EntryStatus.POSTED,
        )
        .exclude(entry_type=EntryType.REVERSAL)
        .select_for_update()
        .order_by("created_at", "id")
    )
    when = entry_date or tenant_today(ctx.tenant)
    reversals: list[LedgerEntry] = []
    balance: Decimal | None = None
    for original in standing:
        party = lock_party(tenant=ctx.tenant, party_id=original.party_id)
        before = _audit_snapshot(original)
        direction = _opposite(original.direction)
        reversal = LedgerEntry.objects.create(
            tenant=ctx.tenant,
            created_by=_actor(ctx),
            party=party,
            direction=direction,
            amount=original.amount,
            entry_date=when,
            entry_type=EntryType.REVERSAL,
            source_type=source_type,
            source_id=source_id,
            reverses=original,
            note=f"Reversal of {original.note}"[:NOTE_MAX_LENGTH] if original.note else "",
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
                "via": "document_void",
                "source": {"type": source_type, "id": str(source_id)},
                "void_reason": reason,
                "reversal_id": str(reversal.id),
                "party_id": str(party.id),
                "balance_after": str(balance),
            },
        )
        reversals.append(reversal)
    return reversals, balance
