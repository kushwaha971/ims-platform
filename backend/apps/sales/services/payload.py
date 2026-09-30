"""Validating a draft payload and computing its figures (SAL-02 FR-1, FR-5, FR-13..FR-17).

Split from `documents.py` so that file stays the lifecycle (create, update,
delete) and this one the rules. `strict=False` is the draft's relaxed
validation (SAL-06 §10); `strict=True` is issue's.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from apps.common.context import Ctx
from apps.common.dates import fy_label_for, tenant_today
from apps.common.exceptions import BusinessRuleViolation, ValidationFailed
from apps.common.money import D
from apps.sales.constants import KIND_FOR_GST_TYPE, NOTES_MAX, WALK_IN_NAME_MAX
from apps.sales.models import SalesDocument, SalesDocumentLine
from apps.sales.services import settings as sales_settings
from apps.sales.services.lines import BuiltLines, build_lines
from apps.tax.services.tax_engine import EngineDocument, compute_document_totals

HEADER_FIELDS = (
    "party_id",
    "walk_in_name",
    "walk_in_mobile",
    "document_date",
    "due_on",
    "place_of_supply_state",
    "reverse_charge",
    "round_off_enabled",
    "discount_type",
    "discount_value",
    "notes",
    "terms",
)


def kind_for(tenant: Any, requested: str | None) -> str:
    """BR-12 / FR-1 — the server chooses; a conflicting request is 400 `kind_not_allowed`."""
    kind = KIND_FOR_GST_TYPE.get(tenant.gst_type, "invoice")
    if requested and requested != kind:
        raise BusinessRuleViolation(
            "kind_not_allowed",
            "This document type is not allowed for your GST registration.",
            details={"kind": [f"Your business issues {kind}."]},
        )
    return kind


def resolve_party(tenant: Any, party_id: Any, errors: dict) -> Any:
    from apps.parties.models import Party

    if not party_id:
        return None
    party = Party.objects.filter(tenant=tenant, pk=party_id).first()
    if party is None:
        errors["party_id"] = ["Choose a party from your list."]
    return party


def default_pos(tenant: Any, party: Any) -> str:
    """FR-5 — party state, then the party's billing-address state, then the tenant's."""
    if party is not None:
        if party.state_code:
            return str(party.state_code)
        code = (party.billing_address or {}).get("state_code")
        if code:
            return str(code)
    return str(tenant.state_code)


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


def apply_payload(
    ctx: Ctx,
    document: SalesDocument,
    payload: dict,
    *,
    strict: bool,
    built: BuiltLines | None = None,
) -> dict:
    """Validate the header and lines, compute totals, write them onto `document`.

    `built` is a caller's own lines (a credit note's return lines, priced at
    the invoice's snapshot rates — SAL-04 BR-1); otherwise `payload["lines"]`
    is built at the document date's rates. Returns `{rows, warnings, items}`.
    Raises 400 with every field error at once.
    """
    tenant = ctx.tenant
    errors: dict[str, list[str]] = {}
    today = tenant_today(tenant)
    for name in HEADER_FIELDS:
        if name in payload:
            setattr(document, name if name != "party_id" else "party_id", payload[name])

    party = resolve_party(tenant, payload.get("party_id", document.party_id), errors)
    document.party = party
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
        errors["due_on"] = ["Due date cannot be before the invoice date."]
    document.due_on = due_on
    document.place_of_supply_state = (
        payload.get("place_of_supply_state") or document.place_of_supply_state or ""
    ) or default_pos(tenant, party)
    if len(document.place_of_supply_state) != 2 or not document.place_of_supply_state.isdigit():
        errors["place_of_supply_state"] = ["Choose place of supply."]
    if party is not None:
        document.walk_in_name = document.walk_in_mobile = None
    else:
        document.walk_in_name = (document.walk_in_name or "").strip()[:WALK_IN_NAME_MAX] or None
        document.walk_in_mobile = (document.walk_in_mobile or "").strip() or None
    if document.walk_in_mobile and not _valid_mobile(document.walk_in_mobile):
        errors["walk_in_mobile"] = ["Enter a valid 10-digit mobile."]
    for text in ("notes", "terms"):
        if len(getattr(document, text) or "") > NOTES_MAX:
            errors[text] = ["Keep this under 2,000 characters."]
    if document.discount_type not in (None, "", "percent", "amount"):
        errors["discount_type"] = ["Choose percent or amount."]
    document.discount_type = document.discount_type or None
    if document.discount_type is None:
        document.discount_value = None
    elif document.discount_value is None or D(document.discount_value) < 0:
        errors["discount_value"] = ["Enter a discount."]
    elif document.discount_type == "percent" and D(document.discount_value) > 100:
        errors["discount_value"] = ["Discount must be between 0 and 100 %."]

    if built is None:
        raw_lines = payload.get("lines")
        if raw_lines is None:
            raw_lines = (
                [_line_as_payload(line) for line in document.lines.all()] if document.pk else []
            )
        built = build_lines(
            tenant=tenant,
            document_date=doc_date,
            raw_lines=list(raw_lines),
            strict=strict,
            # ── A5 ── a module's document describes its supply ("Quarterly membership, 1 Oct –
            # 31 Dec 2026", PLT-X05 §8): the counter's free-text switch does not apply to it.
            allow_free_text=(
                sales_settings.allow_free_text_lines(tenant) or bool(document.origin_type)
            ),
            errors=errors,
        )
    if errors:
        raise ValidationFailed(errors)

    result = compute_document_totals(
        EngineDocument(
            lines=built.engine,
            gst_type=tenant.gst_type,
            tenant_state=str(tenant.state_code),
            place_of_supply=document.place_of_supply_state,
            round_off_enabled=bool(document.round_off_enabled),
            discount_type=document.discount_type,
            discount_value=(
                D(document.discount_value) if document.discount_value is not None else None
            ),
        )
    )
    if document.discount_type == "amount" and D(document.discount_value) > result.subtotal:
        if strict or result.subtotal > 0:
            raise ValidationFailed({"discount_value": ["Discount cannot exceed subtotal."]})
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
    return {"rows": rows, "warnings": built.warnings, "items": built.items}


def _valid_mobile(value: str) -> bool:
    digits = value.replace("+91", "", 1) if value.startswith("+91") else value
    return len(digits) == 10 and digits.isdigit() and digits[0] in "6789"


def _line_as_payload(line: SalesDocumentLine) -> dict:
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
        "tax_code": line.tax_code,
    }
