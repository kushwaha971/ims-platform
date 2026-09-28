"""A sales document's lines in the party's khata (SAL-02 FR-7, SAL-04 FR-6/FR-7, SAL-05 FR-2).

Built from the ledger's own parts, exactly as `expenses/services/ledger_link.py`
is and for the same reason: `ledger.services.entries.post_entry` writes MANUAL
entries, and LED-10's `post_source_entry` / `reverse_source_entries` do not
exist yet. So every row goes through `validate_entry_payload`, the balance
moves through `apply_entry` (the one writer of the party cache, which
`recalc_balances` replays), and the audit row is the ledger's own snapshot.
When LED-10 lands each function here becomes a one-line call into it.

`source_type='sales_document'`, `source_id=<document>` on every row — the pair
that lets the timeline link back to the document and lets LED-03 refuse to
correct it directly (`use_document_void`).

── A void is a DOCUMENT void (C6, decided 23 Sep 2026) ──────────────────────
LED-03's manual reversal carries the original's date and `source_type=
'ledger_entry'`; a document void carries the VOID date (today, tenant zone)
and the DOCUMENT as its source (LED-10 BR-5/BR-6, SAL-05 BR-6). The khata shows
the bill on the day it was made and its cancellation on the day it was
cancelled, and a closed period is never written into.
"""

from __future__ import annotations

from decimal import Decimal
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
    """ "Invoice INV/26-27/0001" — stored on an immutable row, so it reads for ever."""
    word = "Credit note" if document.kind == "credit_note" else "Invoice"
    return f"{word} {document.number}"[:255]


def _post(
    *,
    ctx: Ctx,
    document: Any,
    party: Any,
    direction: str,
    amount: Decimal,
    entry_type: str,
    note: str,
    via: str,
) -> tuple[LedgerEntry, Any]:
    row = validate_entry_payload(
        {
            "direction": direction,
            "amount": amount,
            "entry_date": document.document_date,
            "note": note,
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
        entry_type=entry_type,
        source_type=SourceType.SALES_DOCUMENT,
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
            "via": via,
            "document_id": str(document.id),
            "party_id": str(party.id),
            "balance_after": str(balance),
        },
    )
    return entry, balance


def post_invoice_debit(*, ctx: Ctx, document: Any, party: Any) -> tuple[LedgerEntry, Any]:
    """Debit `party` (LOCKED by the caller) by the grand total. Returns `(entry, balance)`."""
    return _post(
        ctx=ctx,
        document=document,
        party=party,
        direction=Direction.DEBIT,
        amount=document.grand_total,
        entry_type=EntryType.INVOICE,
        note=ledger_note_for(document),
        via="invoice",
    )


def post_credit_note_credit(*, ctx: Ctx, document: Any, party: Any) -> tuple[LedgerEntry, Any]:
    """SAL-04 FR-6 — credit `party` (LOCKED) by the credit note's grand total."""
    return _post(
        ctx=ctx,
        document=document,
        party=party,
        direction=Direction.CREDIT,
        amount=document.grand_total,
        entry_type=EntryType.CREDIT_NOTE,
        note=ledger_note_for(document),
        via="credit_note",
    )


def post_refund_debit(
    *, ctx: Ctx, document: Any, party: Any, amount: Decimal
) -> tuple[LedgerEntry, Any]:
    """SAL-04 BR-4 — the refund handed over: a `payment_out` debit (see refund_seam.py)."""
    return _post(
        ctx=ctx,
        document=document,
        party=party,
        direction=Direction.DEBIT,
        amount=amount,
        entry_type=EntryType.PAYMENT_OUT,
        note=f"Refund · {ledger_note_for(document)}"[:255],
        via="credit_note_refund",
    )


def standing_entries(*, tenant: Any, document_id: Any, entry_types: tuple[str, ...]) -> list:
    """The POSTED rows this document produced of `entry_types`, locked (two voids race)."""
    return list(
        LedgerEntry.objects.filter(
            tenant=tenant,
            source_type=SourceType.SALES_DOCUMENT,
            source_id=document_id,
            entry_type__in=entry_types,
            status=EntryStatus.POSTED,
        )
        .select_for_update()
        .order_by("created_at", "id")
    )


def reverse_document_entry(
    *, ctx: Ctx, original: LedgerEntry, party: Any, reason: str, document: Any
) -> tuple[LedgerEntry, Any]:
    """Undo one row: a reversal dated TODAY sourced to the document, and mark the original.

    The same two writes LED-03's `_write_reversal` makes, in the same order
    (original marked first so `reversed_by` points at a row that exists). No
    `payment_mode`: `ck_ledger_entry_debit_has_no_mode` forbids one on a debit,
    and a reversal of a document moved no money.
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
        source_type=SourceType.SALES_DOCUMENT,
        source_id=document.id,
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
            "via": f"{document.kind}_void",
            "document_id": str(document.id),
            "reason": reason,
            "reversal_id": str(reversal.id),
            "party_id": str(party.id),
            "balance_after": str(balance),
        },
    )
    return reversal, balance
