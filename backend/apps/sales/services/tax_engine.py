"""`compute_document_totals()` — SAL-02 BR-1…BR-12, pure (no DB, no Django).

The single most-tested function in the product (Part 32 §32.10.2). Its fixture
table, `features/sales/view-model/taxEngine.cases.json`, was written from the
FRD before this file and is consumed verbatim by the frontend mirror
(`view-model/taxEngine.ts`), so the preview a merchant watches while typing and
the figure the server stores cannot disagree without failing CI on both sides.

── Order, because order IS the rule ─────────────────────────────────────────
1. gross = q2(qty × unit_price) — rounded ONCE (BR-2).
2. line discount on the gross, capped at it (BR-3); net = gross − discount.
3. taxable_line = net (exclusive) or q2(net / (1 + (rate+cess)/100)) (BR-4).
4. document discount on Σ taxable_line, apportioned proportionally; the
   rounding residual goes to the LARGEST taxable_line, ties to the LOWEST
   line number (BR-5). Not `money.allocate_proportional`, whose tie rule is the
   last line — BR-5 says the first, and the fixture proves it.
5. tax per line on taxable_value: CGST = q2(t × r/200), SGST = q2(t × r/100) −
   CGST intra; IGST = q2(t × r/100) inter; cess = q2(t × c/100) (BR-6).
6. totals are sums of the line figures (BR-7) — never recomputed from a total.
7. round-off to the rupee, HALF-UP (BR-8).

Rates arrive RESOLVED: the caller looks `(code, document_date)` up (BR-1,
FR-17) and passes `rate`/`cess_rate`; `resolve_rate()` below is the pure form of
that lookup, used by the fixture harness on both stacks. Composition and
unregistered tenants force every rate to 0 here (BR-1, BR-12) whatever the
caller resolved, so no call site can forget it.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Iterable, Sequence

from apps.common.money import D, q2, to_rupee

ZERO = Decimal("0.00")
ZERO_RATE = Decimal("0.000")
HUNDRED = Decimal("100")

#: gst_type values whose documents carry no tax (BR-12).
TAX_FREE_GST_TYPES = frozenset({"composition", "unregistered"})

PERCENT = "percent"
AMOUNT = "amount"


@dataclass(frozen=True)
class EngineLine:
    qty: Decimal
    unit_price: Decimal
    tax_inclusive: bool = False
    discount_type: str | None = None
    discount_value: Decimal | None = None
    rate: Decimal = ZERO_RATE
    cess_rate: Decimal = ZERO_RATE


@dataclass(frozen=True)
class EngineDocument:
    lines: Sequence[EngineLine]
    gst_type: str = "regular"
    tenant_state: str = ""
    place_of_supply: str = ""
    round_off_enabled: bool = True
    discount_type: str | None = None
    discount_value: Decimal | None = None


@dataclass
class LineResult:
    gross: Decimal
    discount_amount: Decimal
    taxable_line: Decimal
    doc_discount_share: Decimal
    taxable_value: Decimal
    tax_rate: Decimal
    cess_rate: Decimal
    cgst: Decimal
    sgst: Decimal
    igst: Decimal
    cess: Decimal
    line_total: Decimal


@dataclass
class DocumentResult:
    is_inter_state: bool
    subtotal: Decimal
    discount_amount: Decimal
    taxable_total: Decimal
    cgst_total: Decimal
    sgst_total: Decimal
    igst_total: Decimal
    cess_total: Decimal
    grand_raw: Decimal
    round_off: Decimal
    grand_total: Decimal
    lines: list[LineResult] = field(default_factory=list)

    @property
    def doc_discount_allocation(self) -> dict[str, str]:
        """`meta.doc_discount_allocation` — shares keyed by 1-based line_no (BR-5)."""
        return {
            str(index + 1): str(line.doc_discount_share)
            for index, line in enumerate(self.lines)
            if line.doc_discount_share != ZERO
        }


class RateNotApplicable(Exception):
    """FR-17 — no `tax_rate` row for the code on the document date."""

    def __init__(self, *, line_index: int, tax_code: str) -> None:
        super().__init__(f"Rate {tax_code} is not applicable (line {line_index + 1})")
        self.line_index = line_index
        self.tax_code = tax_code


def resolve_rate(rates: Iterable[dict], code: str, on_date: dt.date) -> dict | None:
    """The row `code` resolves to on `on_date` from an in-memory table (BR-1).

    `effective_to` is inclusive — GST12 is valid ON 2025-09-21 and not after.
    """
    for row in rates:
        if row["code"] != code:
            continue
        start = dt.date.fromisoformat(str(row["effective_from"]))
        end_raw = row.get("effective_to")
        end = dt.date.fromisoformat(str(end_raw)) if end_raw else None
        if start <= on_date and (end is None or end >= on_date):
            return row
    return None


def _line_discount(gross: Decimal, kind: str | None, value: Decimal | None) -> Decimal:
    """BR-3 — percent of the gross, or an amount; capped at the gross, never negative."""
    if not kind or value is None:
        return ZERO
    raw = q2(gross * D(value) / HUNDRED) if kind == PERCENT else q2(value)
    return max(min(raw, gross), ZERO)


def _taxable_line(net: Decimal, *, inclusive: bool, rate: Decimal, cess: Decimal) -> Decimal:
    """BR-4 — exclusive is the net; inclusive backs the tax (rate + cess) out of it."""
    if not inclusive or (rate + cess) == 0:
        return net
    return q2(net / (1 + (rate + cess) / HUNDRED))


def _allocate(discount: Decimal, weights: list[Decimal]) -> list[Decimal]:
    """BR-5 — proportional shares; residual to the largest weight, ties → lowest index."""
    subtotal = sum(weights, ZERO)
    if discount == 0 or subtotal == 0:
        return [ZERO for _ in weights]
    shares = [q2(discount * w / subtotal) for w in weights]
    residual = discount - sum(shares, ZERO)
    if residual != 0:
        # max() keeps the FIRST maximal element, which is the lowest line_no.
        target = max(range(len(weights)), key=lambda i: weights[i])
        shares[target] = q2(shares[target] + residual)
    return shares


def compute_document_totals(doc: EngineDocument) -> DocumentResult:
    """Every amount on a sales document, from its editable inputs (BR-1…BR-9)."""
    tax_free = doc.gst_type in TAX_FREE_GST_TYPES
    inter = bool(doc.place_of_supply) and doc.place_of_supply != doc.tenant_state

    staged: list[tuple[Decimal, Decimal, Decimal, Decimal, Decimal]] = []
    for line in doc.lines:
        rate = ZERO_RATE if tax_free else D(line.rate)
        cess = ZERO_RATE if tax_free else D(line.cess_rate)
        gross = q2(D(line.qty) * D(line.unit_price))
        discount = _line_discount(gross, line.discount_type, line.discount_value)
        taxable_line = _taxable_line(
            gross - discount, inclusive=line.tax_inclusive, rate=rate, cess=cess
        )
        staged.append((gross, discount, taxable_line, rate, cess))

    subtotal = sum((s[2] for s in staged), ZERO)
    doc_discount = _line_discount(subtotal, doc.discount_type, doc.discount_value)
    shares = _allocate(doc_discount, [s[2] for s in staged])

    lines: list[LineResult] = []
    for (gross, discount, taxable_line, rate, cess), share in zip(staged, shares):
        taxable = taxable_line - share
        cgst = sgst = igst = ZERO
        if inter:
            igst = q2(taxable * rate / HUNDRED)
        else:
            tax = q2(taxable * rate / HUNDRED)
            cgst = q2(taxable * rate / 200)
            sgst = tax - cgst
        cess_amount = q2(taxable * cess / HUNDRED)
        lines.append(
            LineResult(
                gross=gross,
                discount_amount=discount,
                taxable_line=taxable_line,
                doc_discount_share=share,
                taxable_value=taxable,
                tax_rate=rate.quantize(ZERO_RATE),
                cess_rate=cess.quantize(ZERO_RATE),
                cgst=cgst,
                sgst=sgst,
                igst=igst,
                cess=cess_amount,
                line_total=taxable + cgst + sgst + igst + cess_amount,
            )
        )

    def total(attr: str) -> Decimal:
        return sum((getattr(line, attr) for line in lines), ZERO)

    taxable_total = total("taxable_value")
    grand_raw = total("line_total")
    grand_total = to_rupee(grand_raw).quantize(ZERO) if doc.round_off_enabled else grand_raw
    result = DocumentResult(
        is_inter_state=inter,
        subtotal=subtotal,
        discount_amount=doc_discount,
        taxable_total=taxable_total,
        cgst_total=total("cgst"),
        sgst_total=total("sgst"),
        igst_total=total("igst"),
        cess_total=total("cess"),
        grand_raw=grand_raw,
        round_off=grand_total - grand_raw,
        grand_total=grand_total,
        lines=lines,
    )
    assert_invariants(result)
    return result


def assert_invariants(result: DocumentResult) -> None:
    """BR-9 — the service-level CHECK. A violation is a defect, never a user error."""
    assert result.taxable_total + result.discount_amount == result.subtotal, "BR-9 discount"
    assert result.grand_total == result.grand_raw + result.round_off, "BR-9 round-off"
    assert (
        result.taxable_total
        + result.cgst_total
        + result.sgst_total
        + result.igst_total
        + result.cess_total
        == result.grand_raw
    ), "BR-9 grand"
