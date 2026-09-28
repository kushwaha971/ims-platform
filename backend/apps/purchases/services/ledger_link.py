"""The bill's line in the supplier's khata, and its undoing (PUR-01 FR-6g, PUR-04 FR-2c).

Built from the ledger's own parts, exactly as `sales/services/ledger_link.py`
and `expenses/services/ledger_link.py` are and for the same reason:
`ledger.services.entries.post_entry` writes MANUAL entries and LED-10's
`post_source_entry` does not exist yet. So the row goes through
`validate_entry_payload`, the balance moves through `apply_entry` (the one
writer of the party cache, which `recalc_balances` replays), and the audit row
is the ledger's own `ledger.entry.created` / `ledger.entry.reversed`.

Directions (canon §0.2, §17.7.0): a purchase bill is a CREDIT — the business
owes the supplier more, and the balance goes negative ("You will give"). The
void is a DEBIT `reversal` of the same amount.

`entry_type='purchase_bill'`, `source_type='purchase_document'`,
`source_id=<bill>` — the pair that lets the timeline link to the bill and lets
LED-03 refuse to correct the line directly (`use_document_void`).

── The void's reversal is dated TODAY and sourced to the BILL ────────────────
C6 (decided 23 Sep 2026): a document void carries the VOID date and the
document as its source (LED-10 BR-5/BR-6, PUR-04 BR-6), unlike LED-03's manual
reversal. The supplier's khata shows the credit on the day the bill was dated
and the reversal on the day it was withdrawn.
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
from apps.parties.services.balance import apply_entry


def _actor(ctx: Ctx) -> Any:
    return ctx.actor if ctx.actor_type == "user" else None


def ledger_note_for(document: Any) -> str:
    """ "Purchase bill PB/26-27/0007 · AT/778" — stored on an immutable row, so it reads for ever."""
    text = f"Purchase bill {document.number}"
    if document.supplier_invoice_number:
        text = f"{text} · {document.supplier_invoice_number}"
    return text[:255]


def post_bill_credit(*, ctx: Ctx, document: Any, party: Any) -> tuple[LedgerEntry, Any]:
    """Credit `party` (LOCKED by the caller) by the grand total. Returns `(entry, balance)`.

    No credit-limit check: a credit only ever reduces what the party owes the
    shop (LED-01 FR-6's reasoning).
    """
    row = validate_entry_payload(
        {
            "direction": Direction.CREDIT,
            "amount": document.grand_total,
            "entry_date": document.document_date,
            "note": ledger_note_for(document),
        },
        tenant=ctx.tenant,
        needs_mode=False,
    )
    entry = LedgerEntry.objects.create(
        tenant=ctx.tenant,
        created_by=_actor(ctx),
        party=party,
        direction=row["direction"],
        amount=row["amount"],
        entry_date=row["entry_date"],
        entry_type=EntryType.PURCHASE_BILL,
        source_type=SourceType.PURCHASE_DOCUMENT,
        source_id=document.id,
        note=row["note"],
        status=EntryStatus.POSTED,
    )
    balance = apply_entry(party=party, direction=row["direction"], amount=row["amount"])
    write_audit(
        ctx=ctx,
        action=AuditAction.LEDGER_ENTRY_CREATED,
        entity_type="ledger_entry",
        entity_id=entry.id,
        after=_audit_snapshot(entry),
        metadata={
            "via": "purchase_bill",
            "document_id": str(document.id),
            "party_id": str(party.id),
            "balance_after": str(balance),
        },
    )
    return entry, balance


def standing_bill_entry(*, tenant: Any, document_id: Any) -> LedgerEntry | None:
    """The POSTED credit this bill produced, locked, or None (a ₹0 bill posts none).

    Locked because the void reverses it and two voids racing must not both find
    it standing; `ix_ledger_source` serves the lookup.
    """
    return (
        LedgerEntry.objects.filter(
            tenant=tenant,
            source_type=SourceType.PURCHASE_DOCUMENT,
            source_id=document_id,
            entry_type=EntryType.PURCHASE_BILL,
            status=EntryStatus.POSTED,
        )
        .select_for_update()
        .first()
    )


def reverse_bill_credit(
    *, ctx: Ctx, original: LedgerEntry, party: Any, reason: str, document: Any
) -> tuple[LedgerEntry, Any]:
    """Undo the credit: a reversal row, and the one permitted change to the original.

    The same two writes LED-03's `_write_reversal` makes, in the same order
    (original marked first so `reversed_by` points at a row that exists), with
    C6's two differences: dated today, sourced to the bill. No `payment_mode` —
    the reversal of a credit is a debit, and a debit may not carry one.
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
        source_type=SourceType.PURCHASE_DOCUMENT,
        source_id=document.id,
        reverses=original,
        reason=reason,
        note=f"Void {ledger_note_for(document)}"[:255],
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
            "via": "purchase_bill_void",
            "document_id": str(document.id),
            "reason": reason,
            "reversal_id": str(reversal.id),
            "party_id": str(party.id),
            "balance_after": str(balance),
        },
    )
    return reversal, balance
