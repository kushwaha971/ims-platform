"""Sales orders (Shop item 3) — what a customer has ordered, before it is billed.

Vyapar's and myBillBook's "Sale order → Convert to sale": the counter writes the
order when the customer asks, and the bill when the goods go. An order is a
`sales_document` of kind `sales_order` built by the SAME draft lifecycle and
totals engine as an estimate and an invoice, so a line priced on the order is
priced identically on the bill it becomes, and it converts through the
estimate's own path (`estimate_convert.convert_to_invoice`).

* The status walk: `draft → open` (confirmed: it takes its `SO/…` number and
  freezes its party, as sending an estimate does), then `open → converted` by
  conversion, or `open → cancelled` with a reason. A draft is deleted, not
  cancelled.
* No stock, no ledger, no payment, ever: `due_on` stays empty and `amount_due`
  stays 0, so no receivable, register, GST figure or profit report can count an
  order — every one of them reads tax-document kinds only.
* The whole order converts at once. Part-billing an order (backorders) is not
  modelled: Vyapar converts the whole order too, and a merchant who ships half
  edits the invoice it becomes.

Permissions are the estimate's (`sales.estimate.read` / `.write`): quotes and
orders are the same kind of promise, held by the same people.
"""

from __future__ import annotations

from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation, ValidationFailed
from apps.sales.constants import DocumentKind, DocumentStatus
from apps.sales.services import documents as drafts
from apps.sales.services.estimate_convert import convert_to_invoice
from apps.sales.services.issue_parts import party_snapshot
from apps.sales.services.payload import apply_payload

ORDER_KINDS: tuple[str, ...] = (DocumentKind.SALES_ORDER,)
CANCEL_REASON_MIN = 3
CANCEL_REASON_MAX = 160


def _no_receivable(document: Any) -> None:
    document.due_on = None
    document.valid_until = None


@transaction.atomic
def create_order(*, ctx: Ctx, payload: dict) -> dict:
    result = drafts.create_draft(ctx=ctx, payload=payload, kind=DocumentKind.SALES_ORDER)
    _no_receivable(result["document"])
    result["document"].save(update_fields=["due_on", "valid_until", "updated_at"])
    return result


@transaction.atomic
def update_order(*, ctx: Ctx, document_id: Any, payload: dict) -> dict:
    result = drafts.update_draft(
        ctx=ctx, document_id=document_id, payload=payload, kinds=ORDER_KINDS
    )
    _no_receivable(result["document"])
    result["document"].save(update_fields=["due_on", "valid_until", "updated_at"])
    return result


def _snapshot(document: Any) -> dict:
    return {
        "number": document.number,
        "status": document.status,
        "grand_total": str(document.grand_total),
    }


@transaction.atomic
def confirm(*, ctx: Ctx, document_id: Any, version: Any = None) -> dict:
    """`draft → open`: validated as strictly as an issue, then numbered and frozen."""
    from apps.platform_app.services.sequences import allocate_number

    document = drafts.lock_document(ctx.tenant, document_id, ORDER_KINDS)
    if document.status != DocumentStatus.DRAFT:
        raise BusinessRuleViolation(
            "document_not_draft",
            "This order has already been confirmed.",
            details={"status": document.status, "number": document.number},
        )
    if version is not None:
        drafts.check_version(document, version)
    outcome = apply_payload(ctx, document, {}, strict=True)
    errors: dict[str, list[str]] = {}
    if not outcome["rows"]:
        errors["lines"] = ["Add at least one item"]
    if document.party_id is None and not document.walk_in_name:
        errors["party_id"] = ["Choose a party or enter a name"]
    if errors:
        raise ValidationFailed(errors)
    party = document.party
    if party is not None and party.status == "archived":
        raise ValidationFailed({"party_id": ["Party is archived; restore first"]})

    document.number = allocate_number(
        tenant=ctx.tenant, kind=DocumentKind.SALES_ORDER, on_date=document.document_date
    )
    document.party_snapshot = party_snapshot(party, document)
    document.party_gstin_snapshot = (party.gstin if party is not None else None) or None
    document.supplier_gstin_snapshot = ctx.tenant.gstin or None
    document.status = DocumentStatus.OPEN
    document.issued_at = timezone.now()
    document.amount_paid = document.amount_due = 0
    _no_receivable(document)
    document.version += 1
    document.save()
    drafts.replace_lines(document, outcome["rows"])
    write_audit(
        ctx=ctx,
        action=AuditAction.SALES_ORDER_CONFIRMED,
        entity_type="sales_document",
        entity_id=document.id,
        after=_snapshot(document),
    )
    return {"document": document, "warnings": list(outcome["warnings"])}


@transaction.atomic
def cancel(*, ctx: Ctx, document_id: Any, reason: str) -> dict:
    """`open → cancelled`, with the customer's reason. A cancelled order keeps its number."""
    reason = (reason or "").strip()
    if len(reason) < CANCEL_REASON_MIN:
        raise ValidationFailed({"reason": ["Say why, in a few words."]})
    document = drafts.lock_document(ctx.tenant, document_id, ORDER_KINDS)
    if document.status != DocumentStatus.OPEN:
        raise BusinessRuleViolation(
            "document_not_open",
            (
                "Delete a draft order instead."
                if document.status == DocumentStatus.DRAFT
                else f"This order is {document.status} and cannot be cancelled."
            ),
            details={"status": document.status, "number": document.number},
        )
    before = _snapshot(document)
    document.status = DocumentStatus.CANCELLED
    document.meta = {**(document.meta or {}), "cancel_reason": reason[:CANCEL_REASON_MAX]}
    document.version += 1
    document.save(update_fields=["status", "meta", "version", "updated_at"])
    write_audit(
        ctx=ctx,
        action=AuditAction.SALES_ORDER_CANCELLED,
        entity_type="sales_document",
        entity_id=document.id,
        before=before,
        after=_snapshot(document),
        metadata={"reason": reason[:CANCEL_REASON_MAX]},
    )
    return {"document": document, "warnings": []}


def convert(*, ctx: Ctx, document_id: Any) -> dict:
    """`open → converted`: a DRAFT invoice carrying the order's party, lines and terms."""
    result = convert_to_invoice(
        ctx=ctx,
        document_id=document_id,
        kinds=ORDER_KINDS,
        statuses=(DocumentStatus.OPEN,),
        refusal="Confirm the order first; a cancelled order cannot be billed.",
        action=AuditAction.SALES_ORDER_CONVERTED,
    )
    return {
        "document": result["document"],
        "order": result["estimate"],
        "warnings": result["warnings"],
    }
