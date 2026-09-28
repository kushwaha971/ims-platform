"""The invoice's line in the party's khata (SAL-02 FR-7, BR-16 step 7, BR-18).

A one-line call into LED-10's `post_source_entry`, which owns the posting
matrix, the idempotency guard (one POSTED `invoice` entry per document), the
balance move through `apply_entry` and the ledger's own audit row.

`entry_type='invoice'`, `source_type='sales_document'`, `source_id=<invoice>` —
the pair that lets the timeline link back to the invoice and lets LED-03
refuse to correct it directly (`use_document_void`).
"""

from __future__ import annotations

from typing import Any

from apps.common.context import Ctx
from apps.ledger.constants import EntryType, SourceType
from apps.ledger.models import LedgerEntry
from apps.ledger.services.postings import post_source_entry


def ledger_note_for(document: Any) -> str:
    """ "Invoice INV/26-27/0001" — stored on an immutable row, so it reads for ever."""
    return f"Invoice {document.number}"[:255]


def post_invoice_debit(*, ctx: Ctx, document: Any, party: Any) -> tuple[LedgerEntry, Any]:
    """Debit `party` (LOCKED by the caller) by the grand total. Returns `(entry, balance)`."""
    return post_source_entry(
        ctx=ctx,
        party=party,
        amount=document.grand_total,
        entry_date=document.document_date,
        entry_type=EntryType.INVOICE,
        source_type=SourceType.SALES_DOCUMENT,
        source_id=document.id,
        note=ledger_note_for(document),
        source_number=document.number,
    )
