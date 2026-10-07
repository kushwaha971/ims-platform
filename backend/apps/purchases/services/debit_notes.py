"""Debit notes — goods sent back to a supplier, or a bill the supplier priced wrong
(Shop P0, PUR-07's smallest useful part).

A `purchases_document` of kind `debit_note`, always written AGAINST one recorded
bill of the same supplier (FR-2, BR-9). There is no draft: the merchant picks the
bill's lines and how many went back, a reason, and whether the goods leave the
shelf, and the note is issued in one transaction:

1. The bill is locked, then its supplier (L1, `record_bill`'s order). What each
   bill line may still return is its quantity less what non-void notes against the
   bill already returned — computed from those notes under the bill's lock rather
   than cached on the line, so the cap cannot drift (BR-2, EC-5).
2. The lines are priced by the bill's own engine, AT THE BILL'S DATE, from the bill
   line's cost, discount and tax code (BR-1: a return is taxed at the rate it was
   bought at, not today's). A document discount in rupees is shared out by the
   returned part of the subtotal (FR-4); a percentage applies as it is.
3. `restock` (FR-5, default on): every tracked goods line posts
   `purchase_return_out` at the bill line's inbound cost. Off for a price
   correction where nothing physically moved. The negative-stock policy applies
   (409 `insufficient_stock`, EC-3).
4. One DEBIT `debit_note` line on the supplier's khata for the grand total — the
   shop owes less (BR-3).
5. Applied to the bill (FR-7f): `min(total, bill due)` comes off its due, held as
   `bill.meta.debit_applied` so the payment arithmetic (`payment_seam`) can keep
   `due = total − paid − debit notes`. Whatever is left stays as open credit with
   the supplier, which is what their khata balance already says.

VOID (owner, a reason) undoes each step: stock back, a reversal of the khata line,
and the bill's due restored. A bill with a standing debit note cannot be voided
(BR-10, 409 `has_dependent_documents`).

Not modelled: standalone notes with free lines (FR-3), applying open credit to
another bill (FR-9) and the refund flow (FR-8) — a refund is a "You got" on the
supplier's khata — the GST treatment codes and their report rows (FR-11, BR-8),
and a print (FR-14).
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.dates import fy_label_for, tenant_today
from apps.common.exceptions import BusinessRuleViolation, ValidationFailed
from apps.common.money import ZERO, D, q2
from apps.purchases.constants import (
    BILL_KINDS,
    DEBIT_NOTE_KINDS,
    DEBIT_NOTE_REASONS,
    DocumentKind,
    DocumentStatus,
)
from apps.purchases.models import PurchaseDocument
from apps.purchases.services import drafts
from apps.purchases.services.payload import apply_payload

ENTITY = drafts.ENTITY
#: The bills a note may be written against: recorded and not void.
RETURNABLE_STATUSES: tuple[str, ...] = (
    DocumentStatus.RECORDED,
    DocumentStatus.PARTIALLY_PAID,
    DocumentStatus.PAID,
    DocumentStatus.OVERDUE,
)
REASON_NOTE_MAX = 160
VOID_REASON_MIN = 3


def debit_applied(bill: Any) -> Decimal:
    """What standing debit notes have taken off this bill's due."""
    return q2(D((bill.meta or {}).get("debit_applied") or 0))


def _set_debit_applied(bill: Any, value: Decimal) -> None:
    bill.meta = {**(bill.meta or {}), "debit_applied": str(q2(value))}


def standing_notes(bill: Any) -> Any:
    return PurchaseDocument.objects.filter(
        tenant_id=bill.tenant_id,
        kind=DocumentKind.DEBIT_NOTE,
        status=DocumentStatus.ISSUED,
        meta__against__bill_id=str(bill.id),
    )


def returned_quantities(bill: Any) -> dict[int, Decimal]:
    """`{bill line_no: quantity already returned}` across the bill's standing notes."""
    returned: dict[int, Decimal] = {}
    for meta in standing_notes(bill).values_list("meta", flat=True):
        for row in (meta or {}).get("returns") or []:
            line_no = int(row["bill_line_no"])
            returned[line_no] = returned.get(line_no, ZERO) + D(row["qty"])
    return returned


def _clean_qty(raw: Any) -> Decimal | None:
    try:
        value = D(raw)
    except Exception:  # noqa: BLE001 — anything that is not a number
        return None
    return value


def _requested(bill: Any, raw_lines: list[dict]) -> list[tuple[Any, Decimal]]:
    """`[(bill line, return qty)]` for every line with a quantity, each within its cap."""
    lines = {line.line_no: line for line in bill.lines.select_related("item", "item__unit")}
    returned = returned_quantities(bill)
    errors: dict[str, list[str]] = {}
    picked: list[tuple[Any, Decimal]] = []
    seen: set[int] = set()
    for index, raw in enumerate(raw_lines):
        line_no = raw.get("bill_line_no")
        line = lines.get(int(line_no)) if str(line_no or "").isdigit() else None
        qty = _clean_qty(raw.get("qty"))
        key = f"lines.{index}.qty"
        if line is None or line.line_no in seen:
            errors[f"lines.{index}.bill_line_no"] = ["Choose a line of this bill."]
            continue
        seen.add(line.line_no)
        if qty is None or qty < 0:
            errors[key] = ["Enter a quantity."]
            continue
        if qty == 0:
            continue
        left = D(line.qty) - returned.get(line.line_no, ZERO)
        if qty > left:
            errors[key] = [f"Only {left.normalize():f} {line.unit_code} can be returned."]
            continue
        unit = getattr(line.item, "unit", None)
        if unit is not None and not unit.allow_decimal and qty != qty.to_integral_value():
            errors[key] = ["Use a whole number for this unit."]
            continue
        picked.append((line, qty))
    if errors:
        raise ValidationFailed(errors)
    if not picked:
        raise ValidationFailed({"lines": ["Enter a quantity to return."]})
    return picked


def _line_payload(line: Any, qty: Decimal) -> dict:
    """The bill line at the returned quantity; a rupee discount shrinks with it."""
    discount_value = line.discount_value
    if line.discount_type == "amount" and discount_value is not None:
        discount_value = q2(D(discount_value) * qty / D(line.qty))
    return {
        "item_id": line.item_id,
        "description": line.description,
        "hsn_sac": line.hsn_sac,
        "qty": qty,
        "unit_code": line.unit_code,
        "unit_cost": line.unit_cost,
        "discount_type": line.discount_type,
        "discount_value": discount_value,
        "tax_code": line.tax_code,
    }


def _document_discount(bill: Any, picked: list[tuple[Any, Decimal]]) -> tuple[Any, Any]:
    if bill.discount_type != "amount" or bill.discount_value is None:
        return bill.discount_type, bill.discount_value
    if not bill.subtotal:
        return None, None
    returned_gross = sum(
        (D(line.taxable_value) + D(line.discount_amount)) * qty / D(line.qty)
        for line, qty in picked
    )
    share = q2(D(bill.discount_value) * Decimal(returned_gross) / D(bill.subtotal))
    return ("amount", share) if share > 0 else (None, None)


def _lock_bill(ctx: Ctx, bill_id: Any) -> PurchaseDocument:
    from apps.common.exceptions import NotFound

    try:
        return drafts.lock_document(ctx.tenant, bill_id, BILL_KINDS)
    except NotFound as error:
        raise ValidationFailed({"against_id": ["Choose a bill from your list."]}) from error


def _post_stock(ctx: Ctx, note: Any, picked: list[tuple[Any, Decimal]]) -> list[Any]:
    from apps.inventory.constants import ItemType, MovementSource, MovementType
    from apps.inventory.services.stock import MovementLine, post_movements

    lines = [
        MovementLine(
            item=line.item,
            qty=-qty,
            movement_type=MovementType.PURCHASE_RETURN_OUT,
            movement_date=note.document_date,
            source_type=MovementSource.PURCHASE_DOCUMENT,
            source_id=note.id,
            unit_cost=line.inbound_unit_cost,
            index=index,
        )
        for index, (line, qty) in enumerate(picked)
        if line.item is not None and line.item.item_type == ItemType.GOODS and line.item.track_stock
    ]
    return post_movements(ctx=ctx, lines=lines)


def _move_bill_due(bill: Any, applied: Decimal) -> None:
    """Add `applied` (negative to undo) to the bill's debit-note total and recompute its due."""
    from apps.purchases.services.payment_seam import status_for

    _set_debit_applied(bill, debit_applied(bill) + applied)
    bill.amount_due = max(bill.grand_total - bill.amount_paid - debit_applied(bill), ZERO)
    bill.status = status_for(
        amount_paid=bill.amount_paid,
        amount_due=bill.amount_due,
        due_on=bill.due_on,
        today=tenant_today(bill.tenant),
    )
    bill.version += 1
    bill.save(update_fields=["meta", "amount_due", "status", "version", "updated_at"])


@transaction.atomic
def issue_debit_note(*, ctx: Ctx, payload: dict) -> dict:
    """Write and issue one note against `payload.against_id`. Returns `{document, bill, applied}`."""
    from apps.parties.constants import PartyStatus
    from apps.parties.services.balance import lock_party_of
    from apps.platform_app.services.sequences import allocate_number
    from apps.purchases.services.ledger_link import post_note_debit
    from apps.purchases.services.record import party_snapshot

    tenant = ctx.tenant
    errors: dict[str, list[str]] = {}
    reason = str(payload.get("reason") or "")
    if reason not in DEBIT_NOTE_REASONS:
        errors["reason"] = ["Choose a reason."]
    reason_note = " ".join(str(payload.get("reason_note") or "").split())
    if len(reason_note) > REASON_NOTE_MAX:
        errors["reason_note"] = [f"Keep this under {REASON_NOTE_MAX} characters."]
    if not payload.get("against_id"):
        errors["against_id"] = ["Choose the bill these goods came on."]
    if errors:
        raise ValidationFailed(errors)

    party = lock_party_of(
        tenant=tenant,
        rows=PurchaseDocument.objects.filter(tenant=tenant, kind__in=BILL_KINDS),
        pk=payload["against_id"],
    )
    bill = _lock_bill(ctx, payload["against_id"])
    if bill.status not in RETURNABLE_STATUSES:
        raise ValidationFailed(
            {
                "against_id": [
                    (
                        "This bill is void."
                        if bill.status == DocumentStatus.VOID
                        else "Record the bill first."
                    )
                ]
            }
        )
    if party is None or party.status == PartyStatus.ARCHIVED:
        raise BusinessRuleViolation(
            "party_archived",
            "This supplier is archived. Restore them first.",
            details={"party_id": str(bill.party_id)},
        )
    today = tenant_today(tenant)
    note_date = payload.get("document_date") or today
    if note_date > today:
        raise ValidationFailed({"document_date": ["Date cannot be in the future."]})
    if note_date < bill.document_date:
        raise ValidationFailed({"document_date": ["Cannot be before the bill date."]})

    picked = _requested(bill, list(payload.get("lines") or []))
    restock = payload.get("restock", True) is not False
    discount_type, discount_value = _document_discount(bill, picked)

    note = PurchaseDocument(
        tenant=tenant,
        created_by=drafts.actor_of(ctx),
        kind=DocumentKind.DEBIT_NOTE,
        status=DocumentStatus.DRAFT,
        round_off_enabled=bill.round_off_enabled,
        itc_eligible=bill.itc_eligible,
    )
    # Priced at the BILL's date (BR-1), then dated as the note.
    outcome = apply_payload(
        ctx,
        note,
        {
            "party_id": bill.party_id,
            "document_date": bill.document_date,
            "reverse_charge": bill.reverse_charge,
            "itc_eligible": bill.itc_eligible,
            "round_off_enabled": bill.round_off_enabled,
            "discount_type": discount_type,
            "discount_value": discount_value,
            # Not the supplier's bill number: that column is unique per supplier across
            # every recorded purchase document, so it stays on the bill (and in
            # `meta.against`), never on the note.
            "lines": [_line_payload(line, qty) for line, qty in picked],
        },
        strict=True,
    )
    note.document_date = note_date
    note.fy_label = fy_label_for(tenant, note_date)
    note.due_on = None
    note.notes = reason_note
    note.number = allocate_number(tenant=tenant, kind=DocumentKind.DEBIT_NOTE, on_date=note_date)
    note.party_snapshot = party_snapshot(party)
    note.supplier_gstin_snapshot = party.gstin or None
    note.status = DocumentStatus.ISSUED
    note.recorded_at = timezone.now()
    applied = min(note.grand_total, bill.amount_due)
    note.amount_paid = applied
    note.amount_due = note.grand_total - applied  # the open credit left with the supplier
    note.meta = {
        **(note.meta or {}),
        "against": {
            "bill_id": str(bill.id),
            "number": bill.number,
            "document_date": bill.document_date.isoformat(),
            "supplier_invoice_number": bill.supplier_invoice_number,
        },
        "returns": [{"bill_line_no": line.line_no, "qty": str(qty)} for line, qty in picked],
        "reason": reason,
        "restock": restock,
        "applied": str(applied),
    }
    note.save()
    drafts.replace_lines(note, outcome["rows"])

    posted = _post_stock(ctx, note, picked) if restock else []
    entry_id = None
    balance = None
    if note.grand_total > 0:
        entry, balance = post_note_debit(ctx=ctx, document=note, party=party)
        entry_id = str(entry.id)
    if applied > 0:
        _move_bill_due(bill, applied)

    write_audit(
        ctx=ctx,
        action=AuditAction.DEBIT_NOTE_ISSUED,
        entity_type=ENTITY,
        entity_id=note.id,
        after=drafts.snapshot(note),
        metadata={
            "bill_id": str(bill.id),
            "reason": reason,
            "applied": str(applied),
            "movement_ids": [str(p.movement.id) for p in posted],
            "ledger_entry_id": entry_id,
        },
    )
    return {
        "document": note,
        "bill": bill,
        "applied": applied,
        "party_balance": balance,
        "warnings": outcome["warnings"],
    }


@transaction.atomic
def void_debit_note(*, ctx: Ctx, document_id: Any, reason: str) -> dict:
    """`issued → void`: stock back, the khata line reversed, the bill's due restored."""
    from apps.parties.services.balance import lock_party_of
    from apps.purchases.services.ledger_link import reverse_bill_credit, standing_bill_entry
    from apps.purchases.services.void import _reverse_stock

    reason = " ".join(str(reason or "").split())
    if len(reason) < VOID_REASON_MIN:
        raise ValidationFailed({"reason": ["Say why, in a few words."]})
    party = lock_party_of(
        tenant=ctx.tenant,
        rows=PurchaseDocument.objects.filter(tenant=ctx.tenant, kind__in=DEBIT_NOTE_KINDS),
        pk=document_id,
    )
    note = drafts.lock_document(ctx.tenant, document_id, DEBIT_NOTE_KINDS)
    if note.status != DocumentStatus.ISSUED:
        raise BusinessRuleViolation(
            "document_already_void",
            "This debit note has already been voided.",
            details={"number": note.number},
        )
    bill_id = ((note.meta or {}).get("against") or {}).get("bill_id")
    bill = (
        PurchaseDocument.objects.select_for_update()
        .filter(tenant=ctx.tenant, pk=bill_id, kind__in=BILL_KINDS)
        .first()
    )
    before = drafts.snapshot(note)
    posted = _reverse_stock(ctx, note, reason, movement_type="purchase_return_out")
    original = standing_bill_entry(tenant=ctx.tenant, document_id=note.id, entry_type="debit_note")
    if original is not None and party is not None:
        reverse_bill_credit(ctx=ctx, original=original, party=party, reason=reason, document=note)
    applied = q2(D((note.meta or {}).get("applied") or 0))
    if bill is not None and applied > 0 and bill.status != DocumentStatus.VOID:
        _move_bill_due(bill, -applied)

    note.status = DocumentStatus.VOID
    note.voided_at = timezone.now()
    note.voided_by = drafts.actor_of(ctx)
    note.void_reason = reason[:160]
    note.amount_paid = ZERO
    note.amount_due = ZERO
    note.version += 1
    note.save(
        update_fields=[
            "status",
            "voided_at",
            "voided_by",
            "void_reason",
            "amount_paid",
            "amount_due",
            "version",
            "updated_at",
        ]
    )
    write_audit(
        ctx=ctx,
        action=AuditAction.DEBIT_NOTE_VOIDED,
        entity_type=ENTITY,
        entity_id=note.id,
        before=before,
        after=drafts.snapshot(note),
        metadata={
            "reason": reason[:160],
            "reversal_movement_ids": [str(p.movement.id) for p in posted],
        },
    )
    return {"document": note}


def refuse_bill_void_with_notes(bill: Any) -> None:
    """BR-10 — a bill with a standing debit note is voided only after the note is."""
    numbers = list(standing_notes(bill).values_list("number", flat=True)[:5])
    if numbers:
        raise BusinessRuleViolation(
            "has_dependent_documents",
            f"Void the debit note {', '.join(numbers)} first.",
            details={"documents": numbers},
        )
