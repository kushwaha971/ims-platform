"""Validating a bill payload and computing its figures (PUR-01 FR-2…FR-4, §10, §17.7.0).

Split from `drafts.py` so that file stays the lifecycle (create, update,
delete) and this one the rules — the shape `apps/sales/services/payload.py`
has, for the reviewer who reads both in one sitting (Part 32 §32.12.2).

`strict=False` is the draft's relaxed validation (FR-8: a half-entered bill
is kept); `strict=True` is record's.

── Which state is "the other side" ──────────────────────────────────────────
For a sale the place of supply is the CUSTOMER's state. For a purchase the
supply comes from the supplier to the shop, so `place_of_supply_state` is the
tenant's own state (FR-6c) and inter-state means the SUPPLIER is elsewhere:
`party.state_code`, else the first two digits of `party.gstin`, else unknown —
which is treated as intra-state with a warning (EC-13), because charging IGST
on a guess would be worse than the merchant correcting one field.

The engine is `apps.tax.services.tax_engine`, called with
`gst_type="regular"` whatever the tenant is: a supplier charges GST to a
composition shop too (FR-11). Whether that tax is claimable is `itc_eligible`,
forced off here for anyone but a regular tenant.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from apps.common.context import Ctx
from apps.common.dates import fy_label_for, tenant_today
from apps.common.exceptions import ValidationFailed
from apps.common.money import D
from apps.purchases.constants import NOTES_MAX, SUPPLIER_INVOICE_MAX
from apps.purchases.models import PurchaseDocument, PurchaseDocumentLine
from apps.purchases.services import settings as purchase_settings
from apps.purchases.services.lines import build_lines
from apps.tax.services.tax_engine import EngineDocument, compute_document_totals

HEADER_FIELDS = (
    "party_id",
    "supplier_invoice_number",
    "supplier_invoice_date",
    "document_date",
    "due_on",
    "reverse_charge",
    "itc_eligible",
    "round_off_enabled",
    "discount_type",
    "discount_value",
    "notes",
)


def normalise_invoice_number(raw: Any) -> str | None:
    """§19 — trimmed, inner whitespace folded; blank is "no number" (EC-2)."""
    text = " ".join(str(raw or "").split())
    return text or None


def supplier_state(party: Any) -> str | None:
    """`party.state_code`, else the GSTIN's first two digits, else None (§17.7.0)."""
    if party is None:
        return None
    if party.state_code:
        return str(party.state_code)
    gstin = (party.gstin or "").strip()
    if len(gstin) >= 2 and gstin[:2].isdigit():
        return gstin[:2]
    return None


def resolve_party(tenant: Any, party_id: Any, errors: dict) -> Any:
    from apps.parties.models import Party

    if not party_id:
        return None
    party = Party.objects.filter(tenant=tenant, pk=party_id).first()
    if party is None:
        errors["party_id"] = ["Choose a supplier from your list."]
    return party


def _parse_date(raw: Any, name: str, errors: dict) -> dt.date | None:
    if raw in (None, ""):
        return None
    if isinstance(raw, dt.date):
        return raw
    try:
        return dt.date.fromisoformat(str(raw))
    except ValueError:
        errors[name] = ["Enter a date as YYYY-MM-DD."]
        return None


def apply_payload(ctx: Ctx, document: PurchaseDocument, payload: dict, *, strict: bool) -> dict:
    """Validate the header and lines, compute totals, write them onto `document`.

    Returns `{rows, warnings}`. Raises 400 with every field error at once.
    """
    tenant = ctx.tenant
    errors: dict[str, list[str]] = {}
    warnings: list[dict] = []
    today = tenant_today(tenant)
    for name in HEADER_FIELDS:
        if name in payload:
            setattr(document, name, payload[name])

    party = resolve_party(tenant, payload.get("party_id", document.party_id), errors)
    document.party = party
    if strict and party is None and "party_id" not in errors:
        errors["party_id"] = ["Choose a supplier."]
    elif strict and party is not None and not party.is_supplier:
        errors["party_id"] = ["Choose a supplier. Mark this party as a supplier first."]

    doc_date = _parse_date(
        payload.get("document_date", document.document_date), "document_date", errors
    )
    doc_date = doc_date or today
    if doc_date > today:
        errors["document_date"] = ["Date cannot be in the future."]
    document.document_date = doc_date
    document.fy_label = fy_label_for(tenant, doc_date)

    due_on = _parse_date(payload.get("due_on", document.due_on), "due_on", errors)
    if due_on is not None and due_on < doc_date:
        errors["due_on"] = ["Due date before bill date."]
    document.due_on = due_on

    document.supplier_invoice_number = normalise_invoice_number(document.supplier_invoice_number)
    if len(document.supplier_invoice_number or "") > SUPPLIER_INVOICE_MAX:
        errors["supplier_invoice_number"] = ["Keep this under 48 characters."]
    inv_date = _parse_date(
        payload.get("supplier_invoice_date", document.supplier_invoice_date),
        "supplier_invoice_date",
        errors,
    )
    if inv_date is not None and inv_date > today:
        errors["supplier_invoice_date"] = ["Cannot be in the future."]
    document.supplier_invoice_date = inv_date

    # FR-2 / FR-11 — ITC is a regular tenant's to claim; hidden and false for others.
    if tenant.gst_type != "regular":
        document.itc_eligible = False
    document.itc_eligible = bool(document.itc_eligible)
    document.reverse_charge = bool(document.reverse_charge)

    document.place_of_supply_state = str(tenant.state_code)
    other_state = supplier_state(party)
    if party is not None and other_state is None:
        warnings.append(
            {
                "code": "supplier_state_unknown",
                "message": f"Supplier state unknown — assumed {tenant.state_code}.",
                "details": {"assumed": str(tenant.state_code)},
            }
        )

    if len(document.notes or "") > NOTES_MAX:
        errors["notes"] = ["Keep this under 2,000 characters."]
    if document.discount_type not in (None, "", "percent", "amount"):
        errors["discount_type"] = ["Choose percent or amount."]
    document.discount_type = document.discount_type or None
    if document.discount_type is None:
        document.discount_value = None
    elif document.discount_value is None or D(document.discount_value) < 0:
        errors["discount_value"] = ["Enter a discount."]
    elif document.discount_type == "percent" and D(document.discount_value) > 100:
        errors["discount_value"] = ["Discount must be between 0 and 100 %."]

    raw_lines = payload.get("lines")
    if raw_lines is None:
        raw_lines = [_line_as_payload(line) for line in document.lines.all()] if document.pk else []
    built = build_lines(
        tenant=tenant,
        document_date=doc_date,
        raw_lines=list(raw_lines),
        strict=strict,
        allow_free_text=purchase_settings.allow_free_text_lines(tenant),
        errors=errors,
    )
    if errors:
        raise ValidationFailed(errors)

    result = compute_document_totals(
        EngineDocument(
            lines=built.engine,
            gst_type="regular",
            tenant_state=str(tenant.state_code),
            place_of_supply=other_state or str(tenant.state_code),
            round_off_enabled=bool(document.round_off_enabled),
            discount_type=document.discount_type,
            discount_value=(
                D(document.discount_value) if document.discount_value is not None else None
            ),
        )
    )
    if document.discount_type == "amount" and D(document.discount_value) > result.subtotal:
        if strict or result.subtotal > 0:
            raise ValidationFailed({"discount_value": ["Discount exceeds the subtotal."]})
    for name in (
        "is_inter_state",
        "subtotal",
        "discount_amount",
        "taxable_total",
        "cgst_total",
        "sgst_total",
        "igst_total",
        "cess_total",
        "round_off",
        "grand_total",
    ):
        setattr(document, name, getattr(result, name))
    document.meta = {
        **(document.meta or {}),
        "doc_discount_allocation": result.doc_discount_allocation,
    }
    rows = []
    for number, (row, line) in enumerate(zip(built.rows, result.lines), start=1):
        rows.append(
            {
                **row,
                "line_no": number,
                "discount_amount": line.discount_amount,
                "taxable_value": line.taxable_value,
                "tax_rate": line.tax_rate,
                "cess_rate": line.cess_rate,
                "cgst": line.cgst,
                "sgst": line.sgst,
                "igst": line.igst,
                "cess": line.cess,
                "line_total": line.line_total,
            }
        )
    return {"rows": rows, "warnings": [*warnings, *built.warnings]}


def _line_as_payload(line: PurchaseDocumentLine) -> dict:
    return {
        "item_id": line.item_id,
        "description": line.description,
        "hsn_sac": line.hsn_sac,
        "qty": line.qty,
        "unit_code": line.unit_code,
        "unit_cost": line.unit_cost,
        "discount_type": line.discount_type,
        "discount_value": line.discount_value,
        "tax_code": line.tax_code,
    }
