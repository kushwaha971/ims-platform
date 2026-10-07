"""Purchase orders (Shop item 3, PUR-05's smallest useful part) — what the shop asked a
supplier to send, turned into the purchase bill when the goods and the supplier's bill come.

A `purchases_document` of kind `purchase_order`, written by the bill's own draft
lifecycle and totals engine, so a line priced on the order is priced the same on
the bill. The walk:

* `draft → sent`: numbered `PO/26-27/0001` (the core `purchase_order` series) with
  the supplier frozen, as recording a bill freezes it. `due_on` is the date the
  goods are EXPECTED by — the one purchase date allowed to be in the future.
* `sent → billed`: "Create bill" makes a DRAFT purchase bill carrying the order's
  supplier, lines and costs, linked both ways (`meta.po_id` / `meta.bill_id`). The
  merchant fills in the supplier's bill number and records it as any bill — the
  bill, not the order, is what moves stock and the supplier's khata.
* `sent → cancelled`, with a reason. A draft is deleted, not cancelled.

An order is never payable (`amount_due` 0) and posts nothing. Every bill read and
write is limited to `BILL_KINDS` (`drafts.lock_document`, `selectors.bills`, the
reports), and a test holds the purchase figures unchanged by a sent order.

Not modelled (PUR-05/06, Phase 2): goods-received notes and part receipts, close
with what arrived, raising an order from the low-stock list, and sharing a PDF
link. The whole order becomes one bill; a short delivery is edited on the bill.
Permissions are the bill's: whoever may write a bill may order the goods for it.
"""

from __future__ import annotations

from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.common.exceptions import BusinessRuleViolation, ValidationFailed
from apps.purchases.constants import ORDER_KINDS, DocumentKind, DocumentStatus
from apps.purchases.services import drafts
from apps.purchases.services.payload import apply_payload

ENTITY = drafts.ENTITY
CANCEL_REASON_MIN = 3
CANCEL_REASON_MAX = 160


def create_order(*, ctx: Ctx, payload: dict) -> dict:
    return drafts.create_draft(ctx=ctx, payload=payload, kind=DocumentKind.PURCHASE_ORDER)


def update_order(*, ctx: Ctx, document_id: Any, payload: dict) -> dict:
    return drafts.update_draft(ctx=ctx, document_id=document_id, payload=payload, kinds=ORDER_KINDS)


def delete_order(*, ctx: Ctx, document_id: Any) -> None:
    drafts.delete_draft(ctx=ctx, document_id=document_id, kinds=ORDER_KINDS)


@transaction.atomic
def send(*, ctx: Ctx, document_id: Any, version: Any = None) -> dict:
    """`draft → sent`: validated as strictly as a bill, then numbered and frozen."""
    from apps.platform_app.services.sequences import allocate_number
    from apps.purchases.services.record import party_snapshot

    document = drafts.lock_document(ctx.tenant, document_id, ORDER_KINDS)
    if document.status != DocumentStatus.DRAFT:
        raise BusinessRuleViolation(
            "document_not_draft",
            "This order has already been sent.",
            details={"status": document.status, "number": document.number},
        )
    if version is not None:
        drafts.check_version(document, version)
    outcome = apply_payload(ctx, document, {}, strict=True)
    if not outcome["rows"]:
        raise ValidationFailed({"lines": ["Add at least one item"]})
    party = document.party
    if party.status == "archived":
        raise ValidationFailed({"party_id": ["This supplier is archived; restore them first."]})
    document.number = allocate_number(
        tenant=ctx.tenant, kind=DocumentKind.PURCHASE_ORDER, on_date=document.document_date
    )
    document.party_snapshot = party_snapshot(party)
    document.supplier_gstin_snapshot = party.gstin or None
    document.status = DocumentStatus.SENT
    document.recorded_at = timezone.now()
    document.amount_paid = document.amount_due = 0
    document.version += 1
    document.save()
    drafts.replace_lines(document, outcome["rows"])
    write_audit(
        ctx=ctx,
        action=AuditAction.PURCHASE_ORDER_SENT,
        entity_type=ENTITY,
        entity_id=document.id,
        after=drafts.snapshot(document),
    )
    return {"document": document, "warnings": list(outcome["warnings"])}


@transaction.atomic
def cancel(*, ctx: Ctx, document_id: Any, reason: str) -> dict:
    reason = (reason or "").strip()
    if len(reason) < CANCEL_REASON_MIN:
        raise ValidationFailed({"reason": ["Say why, in a few words."]})
    document = drafts.lock_document(ctx.tenant, document_id, ORDER_KINDS)
    if document.status != DocumentStatus.SENT:
        raise BusinessRuleViolation(
            "document_not_open",
            (
                "Delete a draft order instead."
                if document.status == DocumentStatus.DRAFT
                else f"This order is {document.status} and cannot be cancelled."
            ),
            details={"status": document.status, "number": document.number},
        )
    before = drafts.snapshot(document)
    document.status = DocumentStatus.CANCELLED
    document.meta = {**(document.meta or {}), "cancel_reason": reason[:CANCEL_REASON_MAX]}
    document.version += 1
    document.save(update_fields=["status", "meta", "version", "updated_at"])
    write_audit(
        ctx=ctx,
        action=AuditAction.PURCHASE_ORDER_CANCELLED,
        entity_type=ENTITY,
        entity_id=document.id,
        before=before,
        after=drafts.snapshot(document),
        metadata={"reason": reason[:CANCEL_REASON_MAX]},
    )
    return {"document": document, "warnings": []}


def _line_payload(line: Any) -> dict:
    return {
        "item_id": line.item_id,
        "description": line.description,
        "qty": line.qty,
        "unit_code": line.unit_code,
        "unit_cost": line.unit_cost,
        "discount_type": line.discount_type,
        "discount_value": line.discount_value,
        "tax_code": line.tax_code,
    }


def _bill_is_live(order: Any) -> bool:
    """The bill an order became still stands (not deleted as a draft, not voided)."""
    from apps.purchases.models import PurchaseDocument

    bill_id = (order.meta or {}).get("bill_id")
    if not bill_id:
        return False
    bill = PurchaseDocument.objects.filter(pk=bill_id).only("status").first()
    return bill is not None and bill.status != DocumentStatus.VOID


@transaction.atomic
def create_bill(*, ctx: Ctx, document_id: Any) -> dict:
    """`sent → billed`: a DRAFT bill with the order's supplier, lines and costs.

    A billed order whose bill was voided, or whose draft was deleted, may be billed
    again — the estimate's rule (SAL-05 EC-9), because the goods still came.
    """
    order = drafts.lock_document(ctx.tenant, document_id, ORDER_KINDS)
    billable = order.status == DocumentStatus.SENT or (
        order.status == DocumentStatus.BILLED and not _bill_is_live(order)
    )
    if not billable:
        raise BusinessRuleViolation(
            "document_not_open",
            (
                "This order already has its bill."
                if order.status == DocumentStatus.BILLED
                else "Send the order first; a cancelled order cannot be billed."
            ),
            details={"status": order.status, "bill_id": (order.meta or {}).get("bill_id")},
        )
    if order.party is not None and order.party.status == "archived":
        raise ValidationFailed({"party_id": ["This supplier is archived; restore them first."]})
    lines = list(order.lines.select_related("item").all())
    payload = {
        "party_id": order.party_id,
        "document_date": tenant_today(ctx.tenant),
        "reverse_charge": order.reverse_charge,
        "round_off_enabled": order.round_off_enabled,
        "discount_type": order.discount_type,
        "discount_value": order.discount_value,
        "notes": order.notes,
        "lines": [_line_payload(line) for line in lines],
    }
    result = drafts.create_draft(ctx=ctx, payload=payload)
    bill = result["document"]
    bill.meta = {**(bill.meta or {}), "po_id": str(order.id), "po_number": order.number}
    bill.save(update_fields=["meta", "updated_at"])
    before = drafts.snapshot(order)
    order.status = DocumentStatus.BILLED
    order.meta = {**(order.meta or {}), "bill_id": str(bill.id)}
    order.version += 1
    order.save(update_fields=["status", "meta", "version", "updated_at"])
    write_audit(
        ctx=ctx,
        action=AuditAction.PURCHASE_ORDER_BILLED,
        entity_type=ENTITY,
        entity_id=order.id,
        before=before,
        after=drafts.snapshot(order),
        metadata={"bill_id": str(bill.id)},
    )
    return {"document": bill, "order": order, "warnings": result["warnings"]}
