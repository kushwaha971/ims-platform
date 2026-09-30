"""`void_invoice()` — SAL-05 FR-2, every reversal in one transaction.

── The order ────────────────────────────────────────────────────────────────
1. Lock the invoice. A draft is deleted, not voided (400); a void is 409
   `document_already_void`, which the client treats as success (§9).
2. Refuse while a non-void credit note stands against it (FR-3) — the note's
   returned quantities, restock and credit all hang off this invoice.
3. The party (L1) is locked FIRST, before the invoice itself — see
   `parties.services.balance.lock_party_of` for the order and the deadlock it
   removed.
4. Stock: one `reversal` per `sale_out` the issue wrote, dated today, at the
   snapshot cost (BR-2) — through `inventory.post_movements` (L2).
5. Ledger: the invoice debit reversed by a credit dated today, sourced to the
   invoice (C6 document-void rule, BR-3, BR-6).
6. Credit applications from OTHER credit notes are removed and those notes
   return to open credit (BR-5); a party's payments are detached, never voided
   (BR-4) — a WALK-IN bill's counter receipt is voided with it (UAT D3,
   `void_seam`), because the money goes back over the counter.
7. The number is kept (BR-1) — the sequence is not touched — and the document
   becomes `void` with its reason; audit `invoice.voided`.
"""

from __future__ import annotations

from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation, ValidationFailed
from apps.sales.constants import (
    VOID_REASON_MAX,
    VOID_REASON_MIN,
    VOIDABLE_STATUSES,
    DocumentKind,
    DocumentStatus,
)
from apps.sales.services.amounts import ZERO, refresh_credit_note
from apps.sales.services.documents import lock_document
from apps.sales.services.ledger_link import reverse_document_entries
from apps.sales.services.origins import guard_origin_void, notify_origin_void
from apps.sales.services.stock_link import reverse_document_stock
from apps.sales.services.void_seam import release_invoice_payments


def clean_void_reason(raw: Any) -> str:
    """§10 `voidReasonSchema` — 3 to 160 characters after trimming."""
    reason = " ".join(str(raw or "").split())
    if not VOID_REASON_MIN <= len(reason) <= VOID_REASON_MAX:
        raise ValidationFailed({"reason": ["Give a reason (at least 3 characters)."]})
    return reason


def refuse_unless_voidable(document: Any) -> None:
    if document.status == DocumentStatus.VOID:
        raise BusinessRuleViolation(
            "document_already_void",
            "This document is already void.",
            details={"number": document.number},
        )
    if document.status == DocumentStatus.DRAFT:
        raise ValidationFailed({"non_field_errors": ["Drafts are deleted, not voided."]})


def _release_credit_applications(ctx: Ctx, invoice: Any) -> list[dict]:
    """BR-5 — other notes' credit comes back to them as open credit."""
    from apps.sales.models import SalesCreditApplication, SalesDocument

    rows = list(SalesCreditApplication.objects.filter(invoice=invoice).order_by("created_at"))
    released = [{"credit_note_id": str(r.credit_note_id), "amount": str(r.amount)} for r in rows]
    note_ids = sorted({r.credit_note_id for r in rows}, key=str)
    SalesCreditApplication.objects.filter(pk__in=[r.pk for r in rows]).delete()
    for note in SalesDocument.objects.select_for_update().filter(pk__in=note_ids).order_by("id"):
        refresh_credit_note(note)
    return released


@transaction.atomic
def void_invoice(
    *,
    ctx: Ctx,
    document_id: Any,
    reason: Any,
    confirm_origin: bool = False,
    from_origin: bool = False,
) -> dict:
    """Void an issued invoice. Returns `{document, reversals, unallocated_payments, party_balance}`.

    ── A5 ── (R55, FRD 00 PLT-X05 §6) an invoice the document port issued asks its origin's
    `check_void` after `refuse_unless_voidable` — a block or an unconfirmed question is a 409
    before anything is reversed — and calls `on_void` last, inside this transaction, so a
    listener that raises rolls the whole void back. `from_origin=True` is the port's own
    `void_document`: the module asked, so it is not called back (`services/origins.py`).
    """
    from apps.parties.services.balance import lock_party_of
    from apps.sales.models import SalesDocument

    reason = clean_void_reason(reason)
    # L1 before the document (`parties.services.balance.lock_party_of`): the
    # order was document → party here and payment → party → document in
    # `void_payment`, which deadlocked when an invoice and its payment were
    # voided at the same moment.
    party = lock_party_of(
        tenant=ctx.tenant, rows=SalesDocument.objects.filter(tenant=ctx.tenant), pk=document_id
    )
    document = lock_document(ctx.tenant, document_id)
    refuse_unless_voidable(document)
    if not from_origin:
        guard_origin_void(tenant=ctx.tenant, document=document, confirm_origin=confirm_origin)
    if document.status not in VOIDABLE_STATUSES:  # pragma: no cover - statuses are closed
        raise ValidationFailed({"non_field_errors": ["This invoice cannot be voided."]})
    blocking = (
        SalesDocument.objects.filter(
            tenant=ctx.tenant, kind=DocumentKind.CREDIT_NOTE, against=document
        )
        .exclude(status__in=(DocumentStatus.VOID, DocumentStatus.DRAFT))
        .order_by("document_date")
        .first()
    )
    if blocking is not None:
        raise ValidationFailed(
            {"non_field_errors": [f"Void credit note {blocking.number} first."]},
            message=f"Void credit note {blocking.number} first.",
        )

    movement_ids = reverse_document_stock(ctx, document)
    reversal_id = None
    balance = None
    if party is not None:
        reversals_written, balance = reverse_document_entries(
            ctx=ctx, document=document, reason=reason
        )
        reversal_id = str(reversals_written[-1].id) if reversals_written else None

    released_credit = _release_credit_applications(ctx, document)
    unallocated = release_invoice_payments(ctx=ctx, document=document, reason=reason)
    # `void_payment` un-applied the walk-in receipt on the bill's row itself;
    # re-read so this save does not write back the stale in-memory figures.
    document.refresh_from_db()
    before = {
        "status": document.status,
        "amount_paid": str(document.amount_paid),
        "amount_due": str(document.amount_due),
    }
    document.status = DocumentStatus.VOID
    document.voided_at = timezone.now()
    document.void_reason = reason
    document.amount_paid = ZERO
    document.amount_due = ZERO
    document.version += 1
    document.save()
    reversals = {"stock_movement_ids": movement_ids, "ledger_entry_id": reversal_id}
    write_audit(
        ctx=ctx,
        action=AuditAction.INVOICE_VOIDED,
        entity_type="sales_document",
        entity_id=document.id,
        before=before,
        after={"status": DocumentStatus.VOID, "void_reason": reason},
        metadata={
            "number": document.number,
            "reversal_ids": reversals,
            "released_credit": released_credit,
            "unallocated_payments": unallocated,
        },
    )
    if not from_origin:
        notify_origin_void(ctx=ctx, document=document, reason=reason)
    return {
        "document": document,
        "reversals": reversals,
        "unallocated_payments": unallocated,
        "released_credit": released_credit,
        "party_balance": balance,
    }
