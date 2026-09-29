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

── Value credits (A15, R51, ADR-057) ────────────────────────────────────────
A line may name `taxable_value` instead of `qty`: an exact credit, in paise,
of the invoice line's taxable value, with the line's tax code and snapshotted
rates copied. It is one engine line of qty 1 at that value, exclusive, with no
discount — so the engine's taxable is the value to the paisa and its tax is the
invoice line's tax on it. It moves neither `returned_qty` nor stock.

Its cap is by VALUE, and counts every credit of the line in one unit:
`Σ taxable_value of issued, non-void credit lines against it ≤ its taxable
value` — value lines and quantity lines alike (contracts §1.5), so a later
quantity return is capped by value too. One note is one mode: a quantity
return carries a share of the invoice's document discount, which the engine
spreads over every line of the note, and would shave a value line's paise.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any

from apps.common.money import D, q2
from apps.sales.constants import CreditMode
from apps.sales.services.lines import BuiltLines
from apps.tax.services.tax_engine import EngineLine

ZERO = Decimal("0.00")


def remaining(line: Any) -> Decimal:
    return Decimal(line.qty) - Decimal(line.returned_qty)


def cap_message(line: Any) -> str:
    left = remaining(line).normalize()
    return f"Only {left:f} {line.unit_code} can be returned"


def _rupees(value: Decimal) -> str:
    """₹4,000.00 — Indian grouping, for a refusal a merchant reads."""
    whole, _, paise = f"{q2(value):.2f}".partition(".")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        whole = ",".join([*groups, tail])
    return f"₹{whole}.{paise}"


@dataclass(frozen=True)
class Credited:
    """What issued, non-void credit notes have already credited, per invoice line.

    `value` is Σ `taxable_value` of their lines (value and quantity lines alike);
    `by_value` holds the lines at least one VALUE credit has touched. The value
    cap binds a quantity return only on those lines: separate partial returns
    each round their taxable value to the paisa (SAL-04 EC-3, accepted), so on a
    line nobody credited by value their sum may pass the invoice figure by a
    paisa — and the quantity cap alone has always governed there.
    """

    value: dict[Any, Decimal]
    by_value: frozenset[Any]


def credited(lines: Any) -> Credited:
    """Drafts do not count (they have credited nothing yet); a void note stops
    counting the moment it is void."""
    from django.db.models import Count, Q, Sum

    from apps.sales.constants import DocumentKind, DocumentStatus
    from apps.sales.models import SalesDocumentLine

    rows = (
        SalesDocumentLine.objects.filter(
            against_line__in=list(lines),
            document__kind=DocumentKind.CREDIT_NOTE,
        )
        .exclude(document__status__in=(DocumentStatus.DRAFT, DocumentStatus.VOID))
        .values("against_line_id")
        .annotate(
            total=Sum("taxable_value"),
            values=Count("id", filter=Q(credit_mode=CreditMode.VALUE)),
        )
    )
    value: dict[Any, Decimal] = {}
    by_value: set[Any] = set()
    for row in rows:
        value[row["against_line_id"]] = Decimal(row["total"] or 0)
        if row["values"]:
            by_value.add(row["against_line_id"])
    return Credited(value=value, by_value=frozenset(by_value))


def value_left(line: Any, done: Credited) -> Decimal:
    return Decimal(line.taxable_value) - done.value.get(line.id, ZERO)


def quantity_value(line: Any, qty: Decimal) -> Decimal:
    """A quantity return's value before the note's own discount share — an
    upper bound on what it will credit, so the value cap errs to refusing."""
    return q2(Decimal(line.taxable_value) * Decimal(qty) / Decimal(line.qty))


def value_cap_message(left: Decimal) -> str:
    return f"At most {_rupees(max(left, ZERO))} can be credited on this line"


def _value(raw: Any) -> Decimal | None:
    try:
        value = D(raw)
    except (InvalidOperation, TypeError, ValueError):
        return None
    if not value.is_finite() or value <= 0 or value != q2(value):
        return None
    return q2(value)


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
    modes = {_is_value(raw) for raw in raw_lines}
    if len(modes) > 1:
        errors["lines"] = ["A credit note returns quantities or credits values, not both."]
        return built, doc_discount
    done = credited(invoice_lines.values())
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
        if _is_value(raw):
            _value_line(built, source, raw, prefix, errors, done)
            continue
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
        # A15: on a line a value credit has touched, the value cap binds a
        # quantity return too (see `Credited`).
        if source.id in done.by_value and quantity_value(source, qty) > value_left(source, done):
            errors[f"{prefix}.qty"] = [value_cap_message(value_left(source, done))]
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


def _is_value(raw: Any) -> bool:
    return isinstance(raw, dict) and raw.get("taxable_value") not in (None, "")


def _value_line(
    built: BuiltLines,
    source: Any,
    raw: dict,
    prefix: str,
    errors: dict,
    done: Credited,
) -> None:
    """One value credit (R51): qty 1, exclusive, no discount, the source's tax."""
    if raw.get("qty") not in (None, ""):
        errors[f"{prefix}.qty"] = ["Credit a quantity or a value, not both."]
        return
    value = _value(raw.get("taxable_value"))
    if value is None:
        errors[f"{prefix}.taxable_value"] = ["Enter an amount above zero, in rupees and paise."]
        return
    left = value_left(source, done)
    if value > left:
        errors[f"{prefix}.taxable_value"] = [value_cap_message(left)]
        return
    description = str(raw.get("description") or "").strip()[:255] or source.description
    built.rows.append(
        {
            "item": source.item,
            "description": description,
            "hsn_sac": source.hsn_sac,
            "qty": Decimal("1"),
            "unit_code": source.unit_code,
            "unit_price": value,
            "tax_inclusive": False,
            "discount_type": None,
            "discount_value": None,
            "tax_code": source.tax_code,
            "against_line": source,
            "unit_cost_snapshot": None,
            "credit_mode": CreditMode.VALUE,
        }
    )
    built.engine.append(
        EngineLine(
            qty=Decimal("1"),
            unit_price=value,
            tax_inclusive=False,
            discount_type=None,
            discount_value=None,
            rate=Decimal(source.tax_rate),
            cess_rate=Decimal(source.cess_rate),
        )
    )


def stored_return_request(document: Any) -> list[dict]:
    """A saved note's lines as the request that built them (a header-only PATCH)."""
    request = []
    for line in document.lines.all():
        if line.against_line_id is None:
            continue
        if line.credit_mode == CreditMode.VALUE:
            request.append(
                {
                    "against_line_id": str(line.against_line_id),
                    "taxable_value": line.taxable_value,
                    "description": line.description,
                }
            )
        else:
            request.append({"against_line_id": str(line.against_line_id), "qty": line.qty})
    return request
