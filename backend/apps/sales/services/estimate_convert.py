"""`convert_estimate()` — SAL-01 FR-6, FR-7, BR-4…BR-6, EC-1…EC-6, SAL-05 EC-9.

One transaction: lock the estimate, create a DRAFT invoice (or bill of
supply — the tenant's CURRENT `gst_type` decides, EC-3) carrying the party,
lines, discounts and notes, and link the pair both ways.

── What is copied and what is refreshed ─────────────────────────────────────
Prices, quantities and discounts are copied as they are: nothing is re-priced
(FR-7), because the customer agreed to those numbers. The TAX CODE of every
item line is refreshed from the item master, and the rate is resolved on the
invoice's date (today, BR-5) by the ordinary draft path, so a line whose code
or rate moved since the quote comes back as a `warnings[]` entry (FR-7, EC-4)
rather than silently. The party snapshot is not copied — an invoice snapshots
its party at issue (BR-4).

── Converting twice ─────────────────────────────────────────────────────────
One conversion per estimate (BR-6, EC-5): a second call is 409
`document_not_draft` "Estimate already converted" — UNLESS the invoice it
became has since been voided (SAL-05 EC-9) or its draft was discarded (the
link is then NULL), in which case converting again is how the merchant gets
the bill they still need.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db import transaction

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.common.exceptions import BusinessRuleViolation, ValidationFailed
from apps.sales.constants import CONVERTIBLE_STATUSES, DocumentKind, DocumentStatus
from apps.sales.services import documents as drafts
from apps.sales.services.payload import kind_for

ESTIMATE_KINDS: tuple[str, ...] = (DocumentKind.ESTIMATE,)


def _line_payload(line: Any) -> dict:
    return {
        "item_id": line.item_id,
        "description": line.description,
        "hsn_sac": line.hsn_sac,
        "qty": line.qty,
        "unit_code": line.unit_code,
        "unit_price": line.unit_price,
        "tax_inclusive": line.tax_inclusive,
        "discount_type": line.discount_type,
        "discount_value": line.discount_value,
        # FR-7 — the item's code as it stands today; free text keeps its own.
        "tax_code": line.item.tax_code if line.item is not None else line.tax_code,
    }


def _refuse_second_conversion(estimate: Any) -> None:
    from apps.sales.models import SalesDocument

    if estimate.converted_to_id is None:
        return
    target = SalesDocument.objects.filter(pk=estimate.converted_to_id).first()
    if target is not None and target.status != DocumentStatus.VOID:
        raise BusinessRuleViolation(
            "document_not_draft",
            "Estimate already converted",
            details={"invoice_id": str(target.id), "number": target.number},
        )


def _warnings(estimate_lines: list, invoice: Any, tenant: Any) -> list[dict]:
    warnings: list[dict] = []
    new_lines = list(invoice.lines.all())
    for index, (old, new) in enumerate(zip(estimate_lines, new_lines)):
        if old.tax_code != new.tax_code:
            warnings.append(
                {
                    "code": "tax_code_changed",
                    "message": f"Line {index + 1}: tax code is now {new.tax_code} (was {old.tax_code}).",
                    "details": {"line_index": index, "from": old.tax_code, "to": new.tax_code},
                }
            )
        elif Decimal(old.tax_rate) != Decimal(new.tax_rate):
            warnings.append(
                {
                    "code": "tax_rate_changed",
                    "message": f"Line {index + 1}: rate is now {new.tax_rate} % (was {old.tax_rate} %).",
                    "details": {
                        "line_index": index,
                        "from": str(old.tax_rate),
                        "to": str(new.tax_rate),
                    },
                }
            )
    had_tax = estimate_lines and any(Decimal(line.tax_rate) > 0 for line in estimate_lines)
    if had_tax and tenant.gst_type != "regular":
        warnings.append(
            {
                "code": "gst_type_changed",
                "message": "Your GST registration changed since this estimate; totals may differ.",
                "details": {"gst_type": tenant.gst_type},
            }
        )
    return warnings


@transaction.atomic
def convert_estimate(*, ctx: Ctx, document_id: Any) -> dict:
    """Returns `{document: <draft invoice>, estimate, warnings}`."""
    estimate = drafts.lock_document(ctx.tenant, document_id, ESTIMATE_KINDS)
    _refuse_second_conversion(estimate)
    if estimate.status not in CONVERTIBLE_STATUSES and estimate.status != DocumentStatus.CONVERTED:
        raise BusinessRuleViolation(
            "document_not_open",
            "Only a sent, accepted or expired estimate can be converted.",
            details={"status": estimate.status},
        )
    party = estimate.party
    if party is not None and party.status == "archived":
        raise ValidationFailed({"party_id": ["Party is archived; restore first"]})

    lines = list(estimate.lines.select_related("item").all())
    payload = {
        "party_id": estimate.party_id,
        "walk_in_name": estimate.walk_in_name,
        "walk_in_mobile": estimate.walk_in_mobile,
        "document_date": tenant_today(ctx.tenant),
        "round_off_enabled": estimate.round_off_enabled,
        "discount_type": estimate.discount_type,
        "discount_value": estimate.discount_value,
        "notes": estimate.notes,
        "terms": estimate.terms,
        "lines": [_line_payload(line) for line in lines],
    }
    result = drafts.create_draft(ctx=ctx, payload=payload, kind=kind_for(ctx.tenant, None))
    invoice = result["document"]
    invoice.converted_from = estimate
    invoice.save(update_fields=["converted_from", "updated_at"])

    before = {"status": estimate.status, "converted_to_id": str(estimate.converted_to_id or "")}
    estimate.converted_to = invoice
    estimate.status = DocumentStatus.CONVERTED
    estimate.version += 1
    estimate.save(update_fields=["converted_to", "status", "version", "updated_at"])
    warnings = list(result["warnings"]) + _warnings(lines, invoice, ctx.tenant)
    write_audit(
        ctx=ctx,
        action=AuditAction.ESTIMATE_CONVERTED,
        entity_type="sales_document",
        entity_id=estimate.id,
        before=before,
        after={"status": estimate.status},
        metadata={"invoice_id": str(invoice.id), "warnings": [w["code"] for w in warnings]},
    )
    return {"document": invoice, "estimate": estimate, "warnings": warnings}
