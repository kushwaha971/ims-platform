"""Turning request lines into stored lines: item defaults, validation, rates by date.

Shared by draft save and issue, with one switch — `strict`. A draft is saved
even when it cannot be issued yet (SAL-06 §10): an unresolvable tax code is a
WARNING there and a 400 at issue. What can never be stored — a negative price,
a zero quantity, an item from another tenant — is refused in both modes,
because the columns and their CHECKs could not hold it anyway.
"""

from __future__ import annotations

import datetime as dt
import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Any

from apps.common.money import D, q2
from apps.sales.services.tax_engine import EngineLine

HSN_RE = re.compile(r"^(\d{4}|\d{6}|\d{8})$")
ZERO_RATE = Decimal("0.000")


@dataclass
class BuiltLines:
    rows: list[dict] = field(default_factory=list)
    engine: list[EngineLine] = field(default_factory=list)
    items: dict[Any, Any] = field(default_factory=dict)
    warnings: list[dict] = field(default_factory=list)


def _decimal(raw: Any, places: int) -> Decimal | None:
    if raw is None or raw == "":
        return None
    try:
        value = D(raw)
    except (InvalidOperation, TypeError, ValueError):
        return None
    if not value.is_finite():
        return None
    exponent = value.as_tuple().exponent
    if isinstance(exponent, int) and -exponent > places:
        return None
    return value


def _rate_message(tenant: Any, code: str, on_date: dt.date) -> str:
    from apps.tax.selectors.rates import rates_on

    current = [r["code"] for r in rates_on(tenant=tenant, on_date=on_date) if r["rate"] != "0.000"]
    choose = " or ".join(current[:2]) if current else "a current rate"
    return f"Rate {code} is not applicable on {on_date.isoformat()}; choose {choose}."


def build_lines(
    *,
    tenant: Any,
    document_date: dt.date,
    raw_lines: list[dict],
    strict: bool,
    allow_free_text: bool,
    errors: dict,
) -> BuiltLines:
    """Validate and default each line; resolve `(tax_code, document_date)` (FR-17)."""
    from apps.inventory.constants import ItemStatus
    from apps.inventory.models import Item
    from apps.tax.selectors.rates import code_exists, rate_for

    built = BuiltLines()
    item_ids = [raw.get("item_id") for raw in raw_lines if raw.get("item_id")]
    items = {
        str(item.id): item
        for item in Item.objects.filter(tenant=tenant, pk__in=item_ids).select_related("unit")
    }
    rate_cache: dict[str, Any] = {}

    for index, raw in enumerate(raw_lines):
        prefix = f"lines.{index}"
        item = None
        if raw.get("item_id"):
            item = items.get(str(raw["item_id"]))
            if item is None:
                errors[f"{prefix}.item_id"] = ["Choose an item from your list."]
                continue
            if strict and item.status == ItemStatus.ARCHIVED:
                errors[f"{prefix}.item_id"] = ["This item is archived."]
        elif not allow_free_text and strict:
            errors[f"{prefix}.item_id"] = ["Choose an item from your list."]

        def pick(name: str, fallback: Any) -> Any:
            value = raw.get(name)
            return fallback if value is None else value

        description = str(pick("description", item.name if item else "")).strip()[:255]
        hsn = pick("hsn_sac", item.hsn_sac if item else None) or None
        unit_code = str(pick("unit_code", item.unit.code if item else "NOS"))[:8]
        tax_code = str(pick("tax_code", item.tax_code if item else "GST0"))
        inclusive = bool(pick("tax_inclusive", item.tax_inclusive_selling if item else False))
        qty = _decimal(raw.get("qty"), 3)
        price = _decimal(pick("unit_price", item.selling_price if item else None), 4)
        d_type = raw.get("discount_type") or None
        d_value = _decimal(raw.get("discount_value"), 2) if d_type else None

        if not description:
            errors[f"{prefix}.description"] = ["Describe the item."]
        if qty is None or qty <= 0:
            errors[f"{prefix}.qty"] = ["Enter a quantity above zero, up to 3 decimals."]
        elif item is not None and not item.unit.allow_decimal and qty != qty.to_integral_value():
            errors[f"{prefix}.qty"] = [f"Quantity must be a whole number for {unit_code}."]
        if price is None or price < 0:
            errors[f"{prefix}.unit_price"] = ["Price cannot be negative (up to 4 decimals)."]
        if hsn is not None and not HSN_RE.match(str(hsn)):
            errors[f"{prefix}.hsn_sac"] = ["HSN must be 4, 6 or 8 digits."]
        if d_type not in (None, "percent", "amount"):
            errors[f"{prefix}.discount_type"] = ["Choose percent or amount."]
        elif d_type and (d_value is None or d_value < 0):
            errors[f"{prefix}.discount_value"] = ["Enter a discount."]
        elif d_type == "percent" and d_value is not None and d_value > 100:
            errors[f"{prefix}.discount_value"] = ["Discount must be between 0 and 100 %."]
        elif d_type == "amount" and qty and price is not None and d_value is not None:
            if d_value > q2(qty * price):
                errors[f"{prefix}.discount_value"] = ["Discount cannot exceed the line amount."]
        if not code_exists(tenant=tenant, code=tax_code):
            errors[f"{prefix}.tax_code"] = [f"Unknown tax code {tax_code}."]
            continue

        if tax_code not in rate_cache:
            rate_cache[tax_code] = rate_for(tenant=tenant, code=tax_code, on_date=document_date)
        row = rate_cache[tax_code]
        rate = cess = ZERO_RATE
        if row is None:
            message = _rate_message(tenant, tax_code, document_date)
            if strict:
                errors[f"{prefix}.tax_code"] = [message]
            else:
                built.warnings.append(
                    {
                        "code": "rate_not_applicable",
                        "message": message,
                        "details": {"line_index": index, "tax_code": tax_code},
                    }
                )
        else:
            rate, cess = row.rate, row.cess_rate

        if f"{prefix}.qty" in errors or f"{prefix}.unit_price" in errors:
            continue
        built.rows.append(
            {
                "item": item,
                "description": description,
                "hsn_sac": hsn,
                "qty": qty,
                "unit_code": unit_code,
                "unit_price": price,
                "tax_inclusive": inclusive,
                "discount_type": d_type,
                "discount_value": d_value,
                "tax_code": tax_code,
            }
        )
        built.engine.append(
            EngineLine(
                qty=qty,  # type: ignore[arg-type]
                unit_price=price,  # type: ignore[arg-type]
                tax_inclusive=inclusive,
                discount_type=d_type,
                discount_value=d_value,
                rate=rate,
                cess_rate=cess,
            )
        )
        if item is not None:
            built.items[item.id] = item
    return built
