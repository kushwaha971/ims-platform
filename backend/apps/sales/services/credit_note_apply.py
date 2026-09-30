"""Using and undoing a credit note: apply (SAL-04 FR-9) and void (FR-10, BR-7).

APPLY moves no money and no ledger line — the note's credit already reduced
the party's balance at issue. It only says WHICH invoice that credit settles:
a `sales_credit_application` row, the invoice's `amount_due` recomputed
(BR-9) and both statuses moved.

VOID undoes the issue in reverse: stock (a `reversal` per restock, which can
be refused with 409 `insufficient_stock` when the goods were sold again,
EC-10), the ledger credit (a document-void reversal dated today, C6), every
application (the invoices' dues come back, BR-7) and the invoice lines'
`returned_qty`. A refunded note is refused until the refund is voided (FR-10).
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation, ValidationFailed
from apps.common.money import D, q2
from apps.sales.constants import APPLICABLE_STATUSES, INVOICE_KINDS, CreditMode, DocumentStatus
from apps.sales.services import documents as drafts
from apps.sales.services.amounts import ZERO, refresh_credit_note, refresh_invoice_amounts
from apps.sales.services.credit_note_issue import apply_credit
from apps.sales.services.credit_notes import CREDIT_NOTE_KINDS
from apps.sales.services.ledger_link import reverse_document_entries
from apps.sales.services.origins import guard_origin_void, notify_origin_void
from apps.sales.services.stock_link import reverse_document_stock
from apps.sales.services.void import clean_void_reason, refuse_unless_voidable


def _amount(raw: Any) -> Decimal:
    try:
        value = q2(D(raw))
    except (InvalidOperation, TypeError, ValueError):
        value = ZERO
    if value <= 0:
        raise ValidationFailed({"amount": ["Enter an amount."]})
    return value


@transaction.atomic
def apply_credit_note(*, ctx: Ctx, document_id: Any, invoice_id: Any, amount: Any) -> dict:
    """Returns `{document: <note>, invoice}`."""
    from apps.parties.services.balance import lock_party_of
    from apps.sales.models import SalesDocument

    # L1 first, then the note and the invoice. Applying took the note and then
    # the invoice with no party lock at all, while invoice void takes party →
    # invoice → the notes applied to it: the two could each hold the document
    # the other wanted.
    lock_party_of(
        tenant=ctx.tenant, rows=SalesDocument.objects.filter(tenant=ctx.tenant), pk=document_id
    )
    note = drafts.lock_document(ctx.tenant, document_id, CREDIT_NOTE_KINDS)
    if note.status != DocumentStatus.ISSUED or note.amount_due <= 0:
        raise BusinessRuleViolation(
            "document_not_open",
            "This credit note has no credit left to apply.",
            details={"status": note.status, "open_credit": str(note.amount_due)},
        )
    invoice = (
        SalesDocument.objects.select_for_update()
        .filter(tenant=ctx.tenant, pk=invoice_id, kind__in=INVOICE_KINDS)
        .first()
    )
    if invoice is None:
        raise ValidationFailed({"invoice_id": ["Choose an invoice from your list."]})
    if invoice.party_id != note.party_id:
        raise ValidationFailed({"invoice_id": ["Choose an invoice of the same party."]})
    if invoice.status not in APPLICABLE_STATUSES or invoice.amount_due <= 0:
        raise ValidationFailed({"invoice_id": ["This invoice has nothing due."]})
    value = _amount(amount)
    ceiling = min(note.amount_due, invoice.amount_due)
    if value > ceiling:
        raise ValidationFailed({"amount": [f"Apply at most ₹{ceiling}"]})
    apply_credit(note, invoice, value)
    refresh_invoice_amounts(invoice, ctx=ctx)
    refresh_credit_note(note)
    write_audit(
        ctx=ctx,
        action=AuditAction.CREDIT_NOTE_APPLIED,
        entity_type="sales_document",
        entity_id=note.id,
        after={"status": note.status, "open_credit": str(note.amount_due)},
        metadata={"invoice_id": str(invoice.id), "amount": str(value)},
    )
    return {"document": note, "invoice": invoice}


def _release_applications(ctx: Ctx, note: Any) -> list[dict]:
    from apps.sales.models import SalesCreditApplication, SalesDocument

    rows = list(SalesCreditApplication.objects.filter(credit_note=note))
    released = [{"invoice_id": str(r.invoice_id), "amount": str(r.amount)} for r in rows]
    invoice_ids = sorted({r.invoice_id for r in rows}, key=str)
    SalesCreditApplication.objects.filter(pk__in=[r.pk for r in rows]).delete()
    for invoice in (
        SalesDocument.objects.select_for_update().filter(pk__in=invoice_ids).order_by("id")
    ):
        refresh_invoice_amounts(invoice, ctx=ctx)
    return released


def _give_back_quantities(note: Any) -> None:
    """BR-7 — `returned_qty` loses this note's quantities, on locked invoice lines."""
    from apps.sales.models import SalesDocumentLine

    # ── A15 ── a value credit (R51) returned no quantity, so it gives none back.
    returned = {
        line.against_line_id: Decimal(line.qty)
        for line in note.lines.all()
        if line.against_line_id is not None and line.credit_mode != CreditMode.VALUE
    }
    if not returned:
        return
    for line in (
        SalesDocumentLine.objects.select_for_update().filter(pk__in=returned).order_by("id")
    ):
        line.returned_qty = max(Decimal(line.returned_qty) - returned[line.id], Decimal("0"))
        line.save(update_fields=["returned_qty"])


@transaction.atomic
def void_credit_note(
    *,
    ctx: Ctx,
    document_id: Any,
    reason: Any,
    confirm_origin: bool = False,
    from_origin: bool = False,
) -> dict:
    """Returns `{document, reversals, released}`.

    ── A5 ── (R58) a note the document port issued asks its origin first and tells it last,
    exactly as `void_invoice` does (`services/origins.py`); `from_origin` is the port's own void.
    """
    from apps.parties.services.balance import lock_party_of
    from apps.sales.models import SalesDocument

    reason = clean_void_reason(reason)
    # L1 before the note, not after it (`lock_party_of`): the note's invoice
    # is released below, and invoice void takes party → invoice → notes.
    lock_party_of(
        tenant=ctx.tenant, rows=SalesDocument.objects.filter(tenant=ctx.tenant), pk=document_id
    )
    note = drafts.lock_document(ctx.tenant, document_id, CREDIT_NOTE_KINDS)
    refuse_unless_voidable(note)
    if not from_origin:
        guard_origin_void(tenant=ctx.tenant, document=note, confirm_origin=confirm_origin)
    if note.amount_paid > 0:
        raise ValidationFailed(
            {"non_field_errors": ["Void the refund payment first"]},
            message="Void the refund payment first",
        )
    movement_ids = reverse_document_stock(ctx, note)
    reversals_written, _balance = reverse_document_entries(ctx=ctx, document=note, reason=reason)
    reversal_id = str(reversals_written[-1].id) if reversals_written else None
    released = _release_applications(ctx, note)
    _give_back_quantities(note)
    before = {"status": note.status, "open_credit": str(note.amount_due)}
    note.status = DocumentStatus.VOID
    note.voided_at = timezone.now()
    note.void_reason = reason
    note.amount_due = ZERO
    note.version += 1
    note.save()
    reversals = {"stock_movement_ids": movement_ids, "ledger_entry_id": reversal_id}
    write_audit(
        ctx=ctx,
        action=AuditAction.CREDIT_NOTE_VOIDED,
        entity_type="sales_document",
        entity_id=note.id,
        before=before,
        after={"status": DocumentStatus.VOID, "void_reason": reason},
        metadata={"reversal_ids": reversals, "released": released},
    )
    if not from_origin:
        notify_origin_void(ctx=ctx, document=note, reason=reason)
    return {"document": note, "reversals": reversals, "released": released}
