"""A credit note's return lines, priced from the invoice (SAL-04 FR-2, FR-4, BR-1, BR-2).

Against-invoice mode never looks a rate up. Every figure that decided the
invoice line's tax — `unit_price`, `tax_inclusive`, the line discount, the tax
code and its SNAPSHOTTED rate — is copied from that line, because a return
reverses the tax that was charged, not today's (BR-1, AC-5). The request
names only which invoice line and how many.

── Discounts on a partial return ────────────────────────────────────────────
* A percent line discount is the same percent of the smaller gross.
* An amount line discount is prorated: `q2(value × returned / invoiced)`.
* The invoice's DOCUMENT discount share for the line (`meta.doc_discount_
  allocation`) is prorated the same way (FR-4), and the credit note carries
  the sum as its own amount discount. The engine then spreads that sum over
  the returned lines by their taxable value — which is the same proportion
  the invoice used, so a full return reproduces the invoice's figures exactly
  and a partial one agrees to the paisa's rounding (EC-3, accepted).

── The cap ──────────────────────────────────────────────────────────────────
`qty ≤ invoiced − returned_qty` (BR-2). Checked here against what the rows
say, which is advisory on a draft; `credit_note_issue` re-checks it on rows it
has LOCKED, which is the check that holds across two notes at once (EC-9).
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any

from apps.common.money import D, q2
from apps.sales.services.lines import BuiltLines
from apps.sales.services.tax_engine import EngineLine

ZERO = Decimal("0.00")


def remaining(line: Any) -> Decimal:
    return Decimal(line.qty) - Decimal(line.returned_qty)


def cap_message(line: Any) -> str:
    left = remaining(line).normalize()
    return f"Only {left:f} {line.unit_code} can be returned"


def _qty(raw: Any) -> Decimal | None:
    try:
        value = D(raw)
    except (InvalidOperation, TypeError, ValueError):
        return None
    if not value.is_finite() or value < 0:
        return None
    exponent = value.as_tuple().exponent
    if isinstance(exponent, int) and -exponent > 3:
        return None
    return value


def build_return_lines(
    *, invoice: Any, raw_lines: list[dict], errors: dict
) -> tuple[BuiltLines, Decimal]:
    """Rows + engine lines for the returned quantities, and the prorated document discount."""
    invoice_lines = {str(line.id): line for line in invoice.lines.select_related("item__unit")}
    allocation = (invoice.meta or {}).get("doc_discount_allocation") or {}
    built = BuiltLines()
    doc_discount = ZERO
    seen: set[str] = set()
    for index, raw in enumerate(raw_lines):
        prefix = f"lines.{index}"
        ref = str(raw.get("against_line_id") or "")
        source = invoice_lines.get(ref)
        if source is None:
            errors[f"{prefix}.against_line_id"] = ["Choose a line from the invoice."]
            continue
        if ref in seen:
            errors[f"{prefix}.against_line_id"] = ["This line is already in the return."]
            continue
        seen.add(ref)
        qty = _qty(raw.get("qty"))
        if qty is None:
            errors[f"{prefix}.qty"] = ["Enter a quantity, up to 3 decimals."]
            continue
        if qty == 0:
            continue  # a line left at zero is simply not returned
        item = source.item
        if item is not None and not item.unit.allow_decimal and qty != qty.to_integral_value():
            errors[f"{prefix}.qty"] = [f"Quantity must be a whole number for {source.unit_code}."]
            continue
        if qty > remaining(source):
            errors[f"{prefix}.qty"] = [cap_message(source)]
            continue
        ratio = qty / Decimal(source.qty)
        d_value = source.discount_value
        if source.discount_type == "amount" and d_value is not None:
            d_value = q2(Decimal(d_value) * ratio)
        share = allocation.get(str(source.line_no))
        if share:
            doc_discount += q2(Decimal(share) * ratio)
        built.rows.append(
            {
                "item": item,
                "description": source.description,
                "hsn_sac": source.hsn_sac,
                "qty": qty,
                "unit_code": source.unit_code,
                "unit_price": source.unit_price,
                "tax_inclusive": source.tax_inclusive,
                "discount_type": source.discount_type,
                "discount_value": d_value,
                "tax_code": source.tax_code,
                "against_line": source,
                "unit_cost_snapshot": source.unit_cost_snapshot,
            }
        )
        built.engine.append(
            EngineLine(
                qty=qty,
                unit_price=Decimal(source.unit_price),
                tax_inclusive=source.tax_inclusive,
                discount_type=source.discount_type,
                discount_value=Decimal(d_value) if d_value is not None else None,
                rate=Decimal(source.tax_rate),
                cess_rate=Decimal(source.cess_rate),
            )
        )
        if item is not None:
            built.items[item.id] = item
    return built, doc_discount


def stored_return_request(document: Any) -> list[dict]:
    """A saved note's lines as the request that built them (a header-only PATCH)."""
    return [
        {"against_line_id": str(line.against_line_id), "qty": line.qty}
        for line in document.lines.all()
        if line.against_line_id is not None
    ]
