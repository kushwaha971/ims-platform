"""Turning request lines into stored bill lines: item defaults, validation, rates by date.

The purchase counterpart of `apps/sales/services/lines.py`, and deliberately
not an import of it (purchases may not import sales, Part 20 §20.1.4). What
differs is exactly what PUR-01 FR-3 changes: the price is a COST, defaulting
to the item's `purchase_price` rather than its selling price; there is no
"inclusive of GST" switch (EC-5 — "Enter cost before GST"); and the tax code
is the item's but editable, "because supplier bills may differ".

`strict=False` is the draft's relaxed validation (an unresolvable tax code is
a warning, a line with no item is allowed until record); `strict=True` is
record's. What can never be stored — a negative cost, a zero quantity, an item
from another tenant — is refused in both modes.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Any

from apps.common.money import D, q2
from apps.tax.services.tax_engine import EngineLine

ZERO_RATE = Decimal("0.000")
#: §10 — `qty ≤ 9999999999.999`.
MAX_QTY = Decimal("9999999999.999")


@dataclass
class BuiltLines:
    rows: list[dict] = field(default_factory=list)
    engine: list[EngineLine] = field(default_factory=list)
    warnings: list[dict] = field(default_factory=list)


def parse_decimal(raw: Any, places: int) -> Decimal | None:
    """A finite Decimal with at most `places` decimals, or None."""
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


def build_lines(
    *,
    tenant: Any,
    document_date: dt.date,
    raw_lines: list[dict],
    strict: bool,
    allow_free_text: bool,
    errors: dict,
) -> BuiltLines:
    """Validate and default each line; resolve `(tax_code, document_date)` (§17.7.0)."""
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
                # Canon §0.11 rule 2 — another tenant's item is "not found", never "forbidden".
                errors[f"{prefix}.item_id"] = ["Item not found."]
                continue
            if strict and item.status == ItemStatus.ARCHIVED:
                errors[f"{prefix}.item_id"] = ["This item is archived."]
        elif strict and not allow_free_text:
            errors[f"{prefix}.item_id"] = ["Choose an item from your list."]

        def pick(name: str, fallback: Any, raw: dict = raw) -> Any:
            value = raw.get(name)
            return fallback if value is None else value

        description = str(pick("description", item.name if item else "")).strip()[:255]
        hsn = pick("hsn_sac", item.hsn_sac if item else None) or None
        unit_code = str(pick("unit_code", item.unit.code if item else "NOS"))[:8]
        tax_code = str(pick("tax_code", item.tax_code if item else "GST0"))
        qty = parse_decimal(raw.get("qty"), 3)
        cost = parse_decimal(pick("unit_cost", item.purchase_price if item else None), 4)
        d_type = raw.get("discount_type") or None
        d_value = parse_decimal(raw.get("discount_value"), 2) if d_type else None

        if not description:
            errors[f"{prefix}.description"] = ["Describe the item."]
        if qty is None or qty <= 0 or qty > MAX_QTY:
            errors[f"{prefix}.qty"] = ["Enter a quantity above zero, up to 3 decimals."]
        elif item is not None and not item.unit.allow_decimal and qty != qty.to_integral_value():
            errors[f"{prefix}.qty"] = [f"Quantity must be a whole number for {unit_code}."]
        if cost is None or cost < 0:
            errors[f"{prefix}.unit_cost"] = ["Cost cannot be negative (up to 4 decimals)."]
        if d_type not in (None, "percent", "amount"):
            errors[f"{prefix}.discount_type"] = ["Choose percent or amount."]
        elif d_type and (d_value is None or d_value < 0):
            errors[f"{prefix}.discount_value"] = ["Enter a discount."]
        elif d_type == "percent" and d_value is not None and d_value > 100:
            errors[f"{prefix}.discount_value"] = ["Discount must be between 0 and 100 %."]
        elif d_type == "amount" and qty and cost is not None and d_value is not None:
            if d_value > q2(qty * cost):
                errors[f"{prefix}.discount_value"] = ["Discount exceeds line amount."]
        if not code_exists(tenant=tenant, code=tax_code):
            errors[f"{prefix}.tax_code"] = [f"Unknown tax code {tax_code}."]
            continue

        if tax_code not in rate_cache:
            rate_cache[tax_code] = rate_for(tenant=tenant, code=tax_code, on_date=document_date)
        row = rate_cache[tax_code]
        rate = cess = ZERO_RATE
        if row is None:
            message = f"{tax_code} is not valid on {document_date.strftime('%d/%m/%Y')}."
            if strict:
                errors[f"{prefix}.tax_code"] = [message]
            else:
                built.warnings.append(
                    {
                        "code": "tax_rate_inactive",
                        "message": message,
                        "details": {"line_index": index, "tax_code": tax_code},
                    }
                )
        else:
            rate, cess = row.rate, row.cess_rate

        if f"{prefix}.qty" in errors or f"{prefix}.unit_cost" in errors:
            continue
        built.rows.append(
            {
                "item": item,
                "description": description,
                "hsn_sac": str(hsn)[:8] if hsn else None,
                "qty": qty,
                "unit_code": unit_code,
                "unit_cost": cost,
                "discount_type": d_type,
                "discount_value": d_value,
                "tax_code": tax_code,
            }
        )
        built.engine.append(
            EngineLine(
                qty=qty,  # type: ignore[arg-type]
                unit_price=cost,  # type: ignore[arg-type]
                tax_inclusive=False,
                discount_type=d_type,
                discount_value=d_value,
                rate=rate,
                cess_rate=cess,
            )
        )
    return built
