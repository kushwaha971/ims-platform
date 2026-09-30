"""`issue_credit_note()` — SAL-04 FR-5…FR-8, BR-2…BR-5, every side effect in one transaction.

── The order ────────────────────────────────────────────────────────────────
1. Lock the draft note, then its invoice (rule L0 — documents first).
2. Recompute from the inputs, strictly: the reason, at least one line, the
   date on or after the invoice's.
3. Lock the party (L1).
4. Lock the invoice's lines and re-check every cap on the LOCKED rows, then
   move `returned_qty` (BR-2, EC-9) — two notes racing for the last unit
   serialise here and the second one is refused. A15: the value cap (R51) is
   re-checked here too, on the same locks, and a VALUE line moves no
   `returned_qty` — it returned nothing.
5. Restock through `inventory.post_movements` when asked (L2, FR-5) — quantity
   lines only; a value credit never moves stock.
6. Allocate the number last of the locks (L4, BR-8).
7. Ledger credit for the grand total (FR-6); apply it to the invoice's due
   first (BR-3); refund what is left if asked (FR-7, refund_seam.py); the
   note is `applied` when nothing is left open (FR-8).
8. Audit `credit_note.issued`.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.dates import fy_bounds, tenant_today
from apps.common.exceptions import BusinessRuleViolation, ValidationFailed
from apps.sales.constants import CreditMode, DocumentKind, DocumentStatus, Settlement
from apps.sales.services import documents as drafts
from apps.sales.services.amounts import ZERO, refresh_credit_note, refresh_invoice_amounts
from apps.sales.services.credit_note_lines import (
    cap_message,
    credited,
    quantity_value,
    remaining,
    value_cap_message,
    value_left,
)
from apps.sales.services.credit_notes import CREDIT_NOTE_KINDS, invoice_for_credit, recompute
from apps.sales.services.issue_parts import party_snapshot
from apps.sales.services.ledger_link import post_credit_note_credit
from apps.sales.services.refund_seam import clean_refund, record_refund
from apps.sales.services.stock_link import restock_rows


def _is_value(row: dict) -> bool:
    return row.get("credit_mode") == CreditMode.VALUE


def _take_quantities(invoice: Any, rows: list[dict]) -> None:
    """BR-2 and R51 on LOCKED invoice lines: refuse every over-cap line at
    once, then move the cache for the quantity lines."""
    from apps.sales.models import SalesDocumentLine

    locked = {
        line.id: line
        for line in SalesDocumentLine.objects.select_for_update()
        .filter(document=invoice)
        .order_by("line_no")
    }
    # Read AFTER the lock: a note that issued while this one waited is counted.
    done = credited(locked.values())
    errors: dict[str, list[str]] = {}
    for index, row in enumerate(rows):
        line = locked[row["against_line"].id]
        if _is_value(row):
            if Decimal(row["taxable_value"]) > value_left(line, done):
                errors[f"lines.{index}.taxable_value"] = [value_cap_message(value_left(line, done))]
            continue
        if Decimal(row["qty"]) > remaining(line):
            errors[f"lines.{index}.qty"] = [cap_message(line)]
        elif line.id in done.by_value and quantity_value(line, row["qty"]) > value_left(line, done):
            errors[f"lines.{index}.qty"] = [value_cap_message(value_left(line, done))]
    if errors:
        raise ValidationFailed(errors)
    for row in rows:
        if _is_value(row):
            continue
        line = locked[row["against_line"].id]
        line.returned_qty = Decimal(line.returned_qty) + Decimal(row["qty"])
        line.save(update_fields=["returned_qty"])


def apply_credit(credit_note: Any, invoice: Any, amount: Decimal) -> None:
    """Write (or add to) the application row; the caller refreshes both documents."""
    from apps.sales.models import SalesCreditApplication

    row = (
        SalesCreditApplication.objects.select_for_update()
        .filter(credit_note=credit_note, invoice=invoice)
        .first()
    )
    if row is None:
        SalesCreditApplication.objects.create(
            tenant=credit_note.tenant, credit_note=credit_note, invoice=invoice, amount=amount
        )
    else:
        row.amount = row.amount + amount
        row.save(update_fields=["amount", "updated_at"])


def _previous_fy_warning(ctx: Ctx, invoice: Any) -> dict | None:
    """FR-13 — Sec 34 allows a note for last year's bill until 30 Nov of this year."""
    start = fy_bounds(ctx.tenant, tenant_today(ctx.tenant))[0]
    if invoice is None or invoice.document_date >= start:
        return None
    return {
        "code": "previous_fy_invoice",
        "message": f"Declare in GSTR-1 by 30 Nov {start.year} for tax effect",
        "details": {"deadline": f"{start.year}-11-30"},
    }


@transaction.atomic
def issue_credit_note(
    *, ctx: Ctx, document_id: Any, version: Any = None, refund: dict | None = None
) -> dict:
    """Issue a draft note. Returns `{document, invoice, warnings, ledger_entry_id, party_balance}`."""
    from apps.parties.services.balance import lock_party_of, relock_if_moved
    from apps.platform_app.services.sequences import allocate_number
    from apps.sales.models import SalesDocument

    # L1 before the note and its invoice (`lock_party_of`).
    party = lock_party_of(
        tenant=ctx.tenant, rows=SalesDocument.objects.filter(tenant=ctx.tenant), pk=document_id
    )
    note = drafts.lock_document(ctx.tenant, document_id, CREDIT_NOTE_KINDS)
    if note.status != DocumentStatus.DRAFT:
        raise BusinessRuleViolation(
            "document_not_draft",
            "This credit note has already been issued.",
            details={"status": note.status, "number": note.number},
        )
    if version is not None:
        drafts.check_version(note, version)
    invoice = (
        invoice_for_credit(ctx.tenant, note.against_id, lock=True) if note.against_id else None
    )
    outcome = recompute(ctx, note, {}, strict=True, invoice=invoice)
    rows = outcome["rows"]
    meta = dict(note.meta or {})
    errors: dict[str, list[str]] = {}
    if not rows:
        errors["lines"] = ["Add at least one item to return"]
    if not (meta.get("reason") or {}).get("code"):
        errors["reason"] = ["Choose a reason"]
    if note.party_id is None:
        errors["party_id"] = ["Choose a party"]
    if errors:
        raise ValidationFailed(errors)
    requested_refund = clean_refund(refund) if refund is not None else meta.get("refund_request")
    settlement = meta.get("settlement") or Settlement.HOLD_ADVANCE
    if settlement == Settlement.REFUND and not requested_refund:
        raise ValidationFailed({"refund": ["Enter how the money was refunded."]})

    party = relock_if_moved(tenant=ctx.tenant, party=party, party_id=note.party_id)
    if invoice is not None:
        _take_quantities(invoice, rows)
    quantity_rows = [row for row in rows if not _is_value(row)]
    movement_ids = restock_rows(ctx, note, quantity_rows) if meta.get("restock", True) else []

    note.number = allocate_number(
        tenant=ctx.tenant, kind=DocumentKind.CREDIT_NOTE, on_date=note.document_date
    )
    note.party_snapshot = (
        dict(invoice.party_snapshot) if invoice is not None else party_snapshot(party, note)
    )
    note.party_gstin_snapshot = (note.party_snapshot or {}).get("gstin") or None
    note.supplier_gstin_snapshot = ctx.tenant.gstin or None
    note.status = DocumentStatus.ISSUED
    note.issued_at = timezone.now()
    note.amount_paid = ZERO
    note.amount_due = note.grand_total
    note.version += 1
    meta["restock_movement_ids"] = movement_ids
    note.meta = meta
    note.save()
    drafts.replace_lines(note, rows)

    ledger_entry_id, balance = None, None
    if note.grand_total > 0:
        entry, balance = post_credit_note_credit(ctx=ctx, document=note, party=party)
        ledger_entry_id = str(entry.id)
    applied = ZERO
    if invoice is not None and invoice.amount_due > 0 and note.grand_total > 0:
        applied = min(note.grand_total, invoice.amount_due)
        apply_credit(note, invoice, applied)
        refresh_invoice_amounts(invoice, ctx=ctx)
    refunded = ZERO
    if settlement == Settlement.REFUND and requested_refund:
        refunded, _entry, balance = record_refund(
            ctx=ctx,
            document=note,
            party=party,
            refund=requested_refund,
            open_credit=note.grand_total - applied,
        )
        note.save(update_fields=["meta", "amount_paid", "updated_at"])
    refresh_credit_note(note)

    warnings = list(outcome["warnings"])
    warning = _previous_fy_warning(ctx, invoice)
    if warning:
        warnings.append(warning)
    write_audit(
        ctx=ctx,
        action=AuditAction.CREDIT_NOTE_ISSUED,
        entity_type="sales_document",
        entity_id=note.id,
        after={
            "number": note.number,
            "status": note.status,
            "grand_total": str(note.grand_total),
            "restock": bool(meta.get("restock", True)),
            "settlement": settlement,
            "applied": str(applied),
            "refunded": str(refunded),
        },
        metadata={"against_id": str(note.against_id or ""), "movement_ids": movement_ids},
    )
    return {
        "document": note,
        "invoice": invoice,
        "warnings": warnings,
        "ledger_entry_id": ledger_entry_id,
        "party_balance": balance,
    }
