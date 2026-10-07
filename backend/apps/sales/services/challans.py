"""Delivery challans (Shop item 4, SAL-09's smallest useful part) — goods that leave
before the bill: supply on approval, job work, a branch transfer, samples.

A `sales_document` of kind `delivery_challan`, written by the bill's draft
lifecycle and totals engine (FR-3: the challan shows GST indicatively, as Rule
55 asks), with its type and transport details in `meta.challan`. The walk:

* `draft → issued`: numbered `DC/26-27/0001`, and the goods LEAVE — every tracked
  line posts `sale_out` at today's average, frozen on the line as
  `unit_cost_snapshot` (FR-4, BR-2). Nothing posts to the khata or a payment
  (BR-1): `due_on` stays empty and `amount_due` stays 0.
* `issued → converted`: a DRAFT invoice with the challan's party, lines and rates,
  carrying `meta.from_challan`. When that invoice is issued, the quantities the
  challan already took out of stock are NOT taken out again
  (`delivered_quantities` / `issue.issue_invoice`), and their cost on the bill is
  the cost the challan froze, so the bill's profit is the goods' real cost.
* `issued → void`, with a reason: the goods came back, so the challan's own
  movements are reversed. A converted challan is not voided — void its invoice,
  which frees the challan to be billed again (the estimate's rule, SAL-05 EC-9).

Not modelled: part conversion and part returns (`meta.converted_qty`,
`meta.returned_qty`, EC-1), the weekly open-challan reminder (BR-5) and e-way
bill generation. The whole challan becomes one bill; goods kept back are edited
on the bill, and come back by voiding the challan before it is billed.
Permissions are the invoice's (SAL-09 §12): staff issue and convert, an owner voids.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation, ValidationFailed
from apps.sales.constants import DocumentKind, DocumentStatus
from apps.sales.services import documents as drafts
from apps.sales.services.estimate_convert import convert_to_invoice
from apps.sales.services.issue_parts import party_snapshot, post_stock
from apps.sales.services.payload import apply_payload

CHALLAN_KINDS: tuple[str, ...] = (DocumentKind.DELIVERY_CHALLAN,)
CHALLAN_TYPES: tuple[str, ...] = (
    "supply_on_approval",
    "job_work",
    "branch_transfer",
    "sample",
    "other",
)
TRANSPORT_FIELDS: tuple[str, ...] = ("transporter", "vehicle_number", "eway_bill_number")
TRANSPORT_MAX = 60
VOID_REASON_MIN = 3
VOID_REASON_MAX = 160


def _apply_challan_fields(document: Any, payload: dict) -> None:
    """`meta.challan` = `{type, transporter, vehicle_number, eway_bill_number}` (FR-2)."""
    current = dict((document.meta or {}).get("challan") or {})
    errors: dict[str, list[str]] = {}
    if "challan_type" in payload:
        kind = payload.get("challan_type") or "other"
        if kind not in CHALLAN_TYPES:
            errors["challan_type"] = [f"Choose one of {', '.join(CHALLAN_TYPES)}."]
        current["type"] = kind
    current.setdefault("type", "other")
    for name in TRANSPORT_FIELDS:
        if name in payload:
            text = " ".join(str(payload.get(name) or "").split())
            if len(text) > TRANSPORT_MAX:
                errors[name] = [f"Keep this under {TRANSPORT_MAX} characters."]
            current[name] = text.upper() if name == "vehicle_number" else text
    if errors:
        raise ValidationFailed(errors)
    document.meta = {**(document.meta or {}), "challan": current}
    document.due_on = None
    document.valid_until = None


@transaction.atomic
def create_challan(*, ctx: Ctx, payload: dict) -> dict:
    result = drafts.create_draft(ctx=ctx, payload=payload, kind=DocumentKind.DELIVERY_CHALLAN)
    _apply_challan_fields(result["document"], payload)
    result["document"].save(update_fields=["meta", "due_on", "valid_until", "updated_at"])
    return result


@transaction.atomic
def update_challan(*, ctx: Ctx, document_id: Any, payload: dict) -> dict:
    result = drafts.update_draft(
        ctx=ctx, document_id=document_id, payload=payload, kinds=CHALLAN_KINDS
    )
    _apply_challan_fields(result["document"], payload)
    result["document"].save(update_fields=["meta", "due_on", "valid_until", "updated_at"])
    return result


def _snapshot(document: Any) -> dict:
    return {"number": document.number, "status": document.status}


@transaction.atomic
def issue(*, ctx: Ctx, document_id: Any, version: Any = None) -> dict:
    """`draft → issued`: numbered, and the goods leave stock (FR-4)."""
    from apps.platform_app.services.sequences import allocate_number

    document = drafts.lock_document(ctx.tenant, document_id, CHALLAN_KINDS)
    if document.status != DocumentStatus.DRAFT:
        raise BusinessRuleViolation(
            "document_not_draft",
            "This challan has already been issued.",
            details={"status": document.status, "number": document.number},
        )
    if version is not None:
        drafts.check_version(document, version)
    outcome = apply_payload(ctx, document, {}, strict=True)
    rows = outcome["rows"]
    errors: dict[str, list[str]] = {}
    if not rows:
        errors["lines"] = ["Add at least one item"]
    if document.party_id is None:
        errors["party_id"] = ["Choose the party the goods go to."]
    if errors:
        raise ValidationFailed(errors)
    party = document.party
    if party.status == "archived":
        raise ValidationFailed({"party_id": ["Party is archived; restore first"]})

    unit_costs = post_stock(ctx, document, rows)
    document.number = allocate_number(
        tenant=ctx.tenant, kind=DocumentKind.DELIVERY_CHALLAN, on_date=document.document_date
    )
    document.party_snapshot = party_snapshot(party, document)
    document.party_gstin_snapshot = party.gstin or None
    document.supplier_gstin_snapshot = ctx.tenant.gstin or None
    document.status = DocumentStatus.ISSUED
    document.issued_at = timezone.now()
    document.amount_paid = document.amount_due = 0
    document.due_on = None
    document.version += 1
    document.save()
    for row in rows:
        row["unit_cost_snapshot"] = unit_costs.get(row["line_no"])
    drafts.replace_lines(document, rows)
    write_audit(
        ctx=ctx,
        action=AuditAction.CHALLAN_ISSUED,
        entity_type="sales_document",
        entity_id=document.id,
        after=_snapshot(document),
        metadata={"movements": len(unit_costs)},
    )
    return {"document": document, "warnings": list(outcome["warnings"])}


def convert(*, ctx: Ctx, document_id: Any) -> dict:
    """`issued → converted`: a DRAFT invoice that remembers the goods already went."""
    result = convert_to_invoice(
        ctx=ctx,
        document_id=document_id,
        kinds=CHALLAN_KINDS,
        statuses=(DocumentStatus.ISSUED,),
        refusal="Issue the challan first; a voided challan cannot be billed.",
        action=AuditAction.CHALLAN_CONVERTED,
    )
    invoice, challan = result["document"], result["estimate"]
    invoice.meta = {
        **(invoice.meta or {}),
        "from_challan": {"challan_id": str(challan.id), "number": challan.number},
    }
    invoice.save(update_fields=["meta", "updated_at"])
    return {"document": invoice, "challan": challan, "warnings": result["warnings"]}


@transaction.atomic
def void(*, ctx: Ctx, document_id: Any, reason: str) -> dict:
    """`issued → void`: the goods came back; the challan's movements are reversed."""
    from apps.sales.services.stock_link import reverse_document_stock

    reason = (reason or "").strip()
    if len(reason) < VOID_REASON_MIN:
        raise ValidationFailed({"reason": ["Say why, in a few words."]})
    document = drafts.lock_document(ctx.tenant, document_id, CHALLAN_KINDS)
    if document.status != DocumentStatus.ISSUED:
        raise BusinessRuleViolation(
            "document_not_open",
            (
                "Delete a draft challan instead."
                if document.status == DocumentStatus.DRAFT
                else (
                    "Void the invoice made from this challan first."
                    if document.status == DocumentStatus.CONVERTED
                    else "This challan is already void."
                )
            ),
            details={"status": document.status, "number": document.number},
        )
    movements = reverse_document_stock(ctx, document)
    before = _snapshot(document)
    document.status = DocumentStatus.VOID
    document.voided_at = timezone.now()
    document.void_reason = reason[:VOID_REASON_MAX]
    document.version += 1
    document.save(update_fields=["status", "voided_at", "void_reason", "version", "updated_at"])
    write_audit(
        ctx=ctx,
        action=AuditAction.CHALLAN_VOIDED,
        entity_type="sales_document",
        entity_id=document.id,
        before=before,
        after=_snapshot(document),
        metadata={"reason": reason[:VOID_REASON_MAX], "reversal_movements": movements},
    )
    return {"document": document, "warnings": []}


# ── The invoice side: what the challan already took out of stock ────────────


def delivered_quantities(invoice: Any) -> dict[Any, list[Decimal]]:
    """`{item_id: [qty the challan moved, its frozen unit cost]}` for an invoice
    converted from a challan; empty for any other invoice."""
    from apps.sales.models import SalesDocument

    source = (invoice.meta or {}).get("from_challan") or {}
    if not source.get("challan_id"):
        return {}
    challan = (
        SalesDocument.objects.filter(
            tenant_id=invoice.tenant_id,
            pk=source["challan_id"],
            kind=DocumentKind.DELIVERY_CHALLAN,
        )
        .exclude(status=DocumentStatus.VOID)
        .first()
    )
    if challan is None:
        return {}
    delivered: dict[Any, list[Decimal]] = {}
    for line in challan.lines.filter(item__isnull=False, unit_cost_snapshot__isnull=False):
        entry = delivered.setdefault(line.item_id, [Decimal("0"), line.unit_cost_snapshot])
        entry[0] += Decimal(line.qty)
    return delivered


def split_delivered(
    rows: list[dict], delivered: dict[Any, list[Decimal]]
) -> tuple[list[dict], dict[int, Decimal]]:
    """The rows stock must still move for, and the frozen cost of each line the challan
    already covered in full. A line asking for more than the challan carried moves
    only the extra."""
    to_move: list[dict] = []
    covered_costs: dict[int, Decimal] = {}
    left = {item_id: entry[0] for item_id, entry in delivered.items()}
    for row in rows:
        item = row.get("item")
        have = left.get(item.id, Decimal("0")) if item is not None else Decimal("0")
        if have <= 0:
            to_move.append(row)
            continue
        qty = Decimal(row["qty"])
        taken = min(have, qty)
        left[item.id] = have - taken
        if taken == qty:
            covered_costs[row["line_no"]] = delivered[item.id][1]
        else:
            to_move.append({**row, "qty": qty - taken})
    return to_move, covered_costs
