"""A sales document's lines in the party's khata (SAL-02 FR-7, SAL-04 FR-6, SAL-05 FR-2).

One-line calls into LED-10 (`apps/ledger/services/postings.py`), which owns
the posting matrix, the idempotency guard (one POSTED `invoice` / `credit_note`
entry per document), the balance move through `apply_entry` and the ledger's
own audit row. The caller holds the transaction and has LOCKED the party.

`source_type='sales_document'`, `source_id=<document>` on every row — the pair
that lets the timeline link back to the document and lets LED-03 refuse to
correct it directly (`use_document_void`).

A credit note's cash refund is NOT posted here: it is a `payments_payment`
(`direction='out'`) and the payment posts its own `payment_out` debit, sourced
to the payment (see `refund_seam.py`).

── A void is a DOCUMENT void (C6, decided 23 Sep 2026) ──────────────────────
LED-03's manual reversal carries the original's date and `source_type=
'ledger_entry'`; a document void carries the VOID date (today, tenant zone)
and the DOCUMENT as its source (LED-10 BR-5/BR-6, SAL-05 BR-6). The khata shows
the bill on the day it was made and its cancellation on the day it was
cancelled, and a closed period is never written into. `reverse_source_entries`
defaults the date to today, which is exactly that rule.
"""

from __future__ import annotations

from typing import Any

from apps.common.context import Ctx
from apps.ledger.constants import EntryType, SourceType
from apps.ledger.models import LedgerEntry
from apps.ledger.services.postings import post_source_entry, reverse_source_entries


def ledger_note_for(document: Any) -> str:
    """ "Invoice INV/26-27/0001" — stored on an immutable row, so it reads for ever."""
    word = "Credit note" if document.kind == "credit_note" else "Invoice"
    return f"{word} {document.number}"[:255]


def _post(*, ctx: Ctx, document: Any, party: Any, entry_type: str) -> tuple[LedgerEntry, Any]:
    return post_source_entry(
        ctx=ctx,
        party=party,
        amount=document.grand_total,
        entry_date=document.document_date,
        entry_type=entry_type,
        source_type=SourceType.SALES_DOCUMENT,
        source_id=document.id,
        note=ledger_note_for(document),
        source_number=document.number,
    )


def post_invoice_debit(*, ctx: Ctx, document: Any, party: Any) -> tuple[LedgerEntry, Any]:
    """Debit `party` (LOCKED by the caller) by the grand total. Returns `(entry, balance)`."""
    return _post(ctx=ctx, document=document, party=party, entry_type=EntryType.INVOICE)


def post_credit_note_credit(*, ctx: Ctx, document: Any, party: Any) -> tuple[LedgerEntry, Any]:
    """SAL-04 FR-6 — credit `party` (LOCKED) by the credit note's grand total."""
    return _post(ctx=ctx, document=document, party=party, entry_type=EntryType.CREDIT_NOTE)


def reverse_document_entries(
    *, ctx: Ctx, document: Any, reason: str
) -> tuple[list[LedgerEntry], Any]:
    """Undo every POSTED line the document wrote: reversals dated TODAY, sourced to it.

    Returns `(reversals, balance)`; `balance` is None when nothing stood (a
    walk-in invoice has no khata line).
    """
    return reverse_source_entries(
        ctx=ctx, source_type=SourceType.SALES_DOCUMENT, source_id=document.id, reason=reason
    )
