"""The invoice's line in the party's khata (SAL-02 FR-7, BR-16 step 7, BR-18).

Built from the ledger's own parts, exactly as `expenses/services/ledger_link.py`
is and for the same reason: `ledger.services.entries.post_entry` writes MANUAL
entries, and LED-10's `post_source_entry` does not exist yet. So the row goes
through `validate_entry_payload`, the balance moves through `apply_entry` (the
one writer of the party cache, which `recalc_balances` replays), and the audit
row is the ledger's own `ledger.entry.created` snapshot. When LED-10 lands this
becomes a one-line call into it.

`entry_type='invoice'`, `source_type='sales_document'`, `source_id=<invoice>` —
the pair that lets the timeline link back to the invoice and lets LED-03
refuse to correct it directly (`use_document_void`).
"""

from __future__ import annotations

from typing import Any

from apps.common.audit import AuditAction, write_audit
from apps.common.constants import Direction
from apps.common.context import Ctx
from apps.ledger.constants import EntryStatus, EntryType, SourceType
from apps.ledger.models import LedgerEntry
from apps.ledger.services.entries import _audit_snapshot, validate_entry_payload
from apps.parties.services.balance import apply_entry


def ledger_note_for(document: Any) -> str:
    """ "Invoice INV/26-27/0001" — stored on an immutable row, so it reads for ever."""
    return f"Invoice {document.number}"[:255]


def post_invoice_debit(*, ctx: Ctx, document: Any, party: Any) -> tuple[LedgerEntry, Any]:
    """Debit `party` (LOCKED by the caller) by the grand total. Returns `(entry, balance)`."""
    row = validate_entry_payload(
        {
            "direction": Direction.DEBIT,
            "amount": document.grand_total,
            "entry_date": document.document_date,
            "note": ledger_note_for(document),
        },
        tenant=ctx.tenant,
        needs_mode=False,
    )
    entry = LedgerEntry.objects.create(
        tenant=ctx.tenant,
        created_by=ctx.actor if ctx.actor_type == "user" else None,
        party=party,
        direction=row["direction"],
        amount=row["amount"],
        entry_date=row["entry_date"],
        entry_type=EntryType.INVOICE,
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
            "via": "invoice",
            "document_id": str(document.id),
            "party_id": str(party.id),
            "balance_after": str(balance),
        },
    )
    return entry, balance
