"""RPT-07 GST summary — the return-shaped aggregation of the register rows.

RPT-03/RPT-04 list documents; this sums the same documents' LINES into the
shapes GSTR-1 and GSTR-3B ask for, and names the return table on every row
(FR-2) so an accountant can transcribe it.

── Four rules the arithmetic keeps (BR-1, BR-3, BR-6, BR-7) ─────────────────
1. Every figure is a SUM of stored line columns — `taxable_value`, `cgst`,
   `sgst`, `igst`, `cess` — never a rate re-applied. The engine rounded each
   line half-up at issue (ADR-010); re-deriving tax from a total would round a
   second time and disagree with the printed invoice by a paisa.
2. The document is FROZEN: party GSTIN, place of supply and `is_inter_state`
   are the snapshot columns written at issue. Editing a party today never
   moves a filed period.
3. Drafts and voids contribute nothing; a void is counted only in the
   document-series table as cancelled (BR-1).
4. A credit note is NEGATIVE in every aggregate — rate-wise, HSN, GSTR-3B — so
   3.1(a) is net of returns; it is additionally its own POSITIVE CDNR row in
   the nature table, because GSTR-1 reports table 9B separately.

The result reconciles to the paisa: Σ `outward.by_rate` taxable = Σ `hsn`
taxable = the sales register's `taxable_total` for the same period, and the
inward rate table = the purchase register's (`test_gst_summary.py`).

── SAL-04 on a branch that does not have it yet ──────────────────────────────
CDNUR needs the credit note's original invoice (`against`), which SAL-04
adds. Without the field every unregistered credit note nets into B2CS —
the portal's own rule for a note not linked to a B2CL invoice (BR-5).
"""

from __future__ import annotations

import datetime as dt
from collections import Counter
from decimal import Decimal
from typing import Any

from django.db.models import (
    BooleanField,
    Case,
    CharField,
    Count,
    DecimalField,
    F,
    Q,
    QuerySet,
    Sum,
    Value,
    When,
)
from django.db.models.functions import Coalesce, NullIf

from apps.common.money import q2
from apps.purchases.models import PurchaseDocumentLine
from apps.reports.constants_tax import (
    B2CL_THRESHOLD_DEFAULT,
    B2CL_THRESHOLD_SETTING,
    COMPOSITION_RATE_DEFAULT,
    COMPOSITION_RATE_SETTING,
    CREDIT_NOTE,
    DRAFT,
    GSTR1_TABLE,
    HSN_DESCRIPTION_MAX,
    MISSING_HSN,
    NATURE_ORDER,
    NIL_EXEMPT_CODES,
    NON_GST_CODES,
    SALES_REGISTER_KINDS,
    VOID,
)
from apps.reports.selectors.registers import has_field, itc_claimable, signed
from apps.sales.models import SalesDocument, SalesDocumentLine

ZERO = Decimal("0.00")
MONEY = DecimalField(max_digits=16, decimal_places=2)
QTY = DecimalField(max_digits=16, decimal_places=3)
HEADS: tuple[str, ...] = ("taxable_value", "cgst", "sgst", "igst", "cess")
ZERO_CODES = NIL_EXEMPT_CODES | NON_GST_CODES
HAS_GSTIN = Q(document__party_gstin_snapshot__isnull=False) & ~Q(document__party_gstin_snapshot="")


# ── Settings (CR-RPT-3) ─────────────────────────────────────────────────────


def _setting(tenant: Any, key: str) -> Any:
    from apps.platform_app.models import TenantSetting

    row = TenantSetting.objects.filter(tenant=tenant, key=key).first()
    return None if row is None else row.value


def b2cl_thresholds(tenant: Any) -> tuple[tuple[dt.date, Decimal], ...]:
    """BR-4 — `{"effective": [{"from": "2024-11-01", "amount": "100000.00"}, …]}`.

    Anything unreadable falls back to the notified schedule: a malformed
    setting must never turn every B2C invoice into a B2CL one.
    """
    value = _setting(tenant, B2CL_THRESHOLD_SETTING)
    try:
        rows = tuple(
            sorted(
                (dt.date.fromisoformat(r["from"]), Decimal(str(r["amount"])))
                for r in (value or {})["effective"]
            )
        )
    except (KeyError, TypeError, ValueError, ArithmeticError):
        rows = ()
    return rows or B2CL_THRESHOLD_DEFAULT


def b2cl_threshold_on(tenant: Any, on: dt.date) -> Decimal:
    thresholds = b2cl_thresholds(tenant)
    current = thresholds[0][1]
    for start, amount in thresholds:
        if start <= on:
            current = amount
    return current


def composition_rate(tenant: Any) -> Decimal:
    value = _setting(tenant, COMPOSITION_RATE_SETTING)
    raw = value.get("rate") if isinstance(value, dict) else value
    try:
        rate = Decimal(str(raw)) if raw is not None else COMPOSITION_RATE_DEFAULT
    except ArithmeticError:
        rate = COMPOSITION_RATE_DEFAULT
    return rate if Decimal("0") <= rate <= Decimal("100") else COMPOSITION_RATE_DEFAULT


# ── Expressions ─────────────────────────────────────────────────────────────


def _threshold_expression(tenant: Any, date_field: str, total_field: str) -> Q:
    """`grand_total > threshold(document_date)` as SQL, strictly greater (EC-4)."""
    thresholds = b2cl_thresholds(tenant)
    condition = Q()
    for index, (start, amount) in enumerate(thresholds):
        end = thresholds[index + 1][0] if index + 1 < len(thresholds) else None
        window = Q(**{f"{date_field}__gte": start}) if index else Q()
        if end is not None:
            window &= Q(**{f"{date_field}__lt": end})
        condition |= window & Q(**{f"{total_field}__gt": amount})
    return condition


def _nature_expression(tenant: Any) -> Case:
    """FR-4's population rules, evaluated per LINE (a nil line of a B2B bill is table 8)."""
    credit = Q(document__kind=CREDIT_NOTE)
    b2cl = (
        Q(document__is_inter_state=True)
        & ~HAS_GSTIN
        & _threshold_expression(tenant, "document__document_date", "document__grand_total")
    )
    whens = [
        When(tax_code__in=sorted(ZERO_CODES), then=Value("nil_exempt")),
        When(credit & HAS_GSTIN, then=Value("cdnr")),
    ]
    if has_field(SalesDocument, "against"):
        original_b2cl = Q(document__against__is_inter_state=True) & _threshold_expression(
            tenant, "document__against__document_date", "document__against__grand_total"
        )
        whens.append(When(credit & original_b2cl, then=Value("cdnur")))
    whens += [
        # BR-5 — any other unregistered credit note nets INTO B2CS.
        When(credit, then=Value("b2cs")),
        When(HAS_GSTIN & Q(document__reverse_charge=True), then=Value("b2b_rcm")),
        When(HAS_GSTIN, then=Value("b2b")),
        When(b2cl, then=Value("b2cl")),
    ]
    return Case(*whens, default=Value("b2cs"), output_field=CharField())


def _sums(prefix: str = "document__") -> dict:
    return {
        head: Coalesce(Sum(signed(head, prefix=prefix)), Value(ZERO), output_field=MONEY)
        for head in HEADS
    }


def _money_row(row: dict) -> dict:
    return {head: row.get(head) or ZERO for head in HEADS}


def _total(rows: list[dict]) -> dict:
    return {head: sum((r[head] for r in rows), ZERO) for head in HEADS}


# ── Base sets ───────────────────────────────────────────────────────────────


def outward_lines(*, tenant: Any, date_from: dt.date, date_to: dt.date) -> QuerySet:
    """BR-8's WHERE: the tax documents of the period, neither draft nor void."""
    return SalesDocumentLine.objects.filter(
        document__tenant=tenant,
        document__kind__in=SALES_REGISTER_KINDS,
        document__document_date__gte=date_from,
        document__document_date__lte=date_to,
    ).exclude(document__status__in=(DRAFT, VOID))


def inward_lines(*, tenant: Any, date_from: dt.date, date_to: dt.date) -> QuerySet:
    return PurchaseDocumentLine.objects.filter(
        document__tenant=tenant,
        document__kind="purchase_bill",
        document__document_date__gte=date_from,
        document__document_date__lte=date_to,
    ).exclude(document__status__in=(DRAFT, VOID))


def contributing_documents(*, tenant: Any, date_from: dt.date, date_to: dt.date) -> int:
    """RPT-08 BR-3 — the GST summary's size is its documents, not its output rows."""
    return (
        SalesDocument.objects.filter(
            tenant=tenant,
            kind__in=SALES_REGISTER_KINDS,
            document_date__gte=date_from,
            document_date__lte=date_to,
        )
        .exclude(status__in=(DRAFT, VOID))
        .count()
    )


# ── Outward sections ────────────────────────────────────────────────────────


def _box_for(code: str) -> str:
    if code in NON_GST_CODES:
        return "3.1(e)"
    if code in NIL_EXEMPT_CODES:
        return "3.1(c)"
    return "3.1(a)"


def outward_by_rate(lines: QuerySet) -> dict:
    """FR-3 — one row per `(tax_code, tax_rate, is_inter_state)`, the BR-8 statement."""
    grouped = (
        lines.values("tax_code", "tax_rate", "document__is_inter_state")
        .annotate(**_sums(), invoice_count=Count("document", distinct=True))
        .order_by("tax_rate", "document__is_inter_state", "tax_code")
    )
    rows = [
        {
            "tax_code": g["tax_code"],
            "tax_rate": g["tax_rate"],
            "is_inter_state": g["document__is_inter_state"],
            **_money_row(g),
            "invoice_count": g["invoice_count"],
            "gstr3b_box": _box_for(g["tax_code"]),
        }
        for g in grouped
    ]
    return {"rows": rows, "total": _total(rows)}


def outward_by_nature(lines: QuerySet, *, tenant: Any) -> dict:
    """FR-4 — the GSTR-1 shape. CDNR/CDNUR rows are POSITIVE (BR-7)."""
    annotated = lines.annotate(nature=_nature_expression(tenant))
    grouped = {
        g["nature"]: g
        for g in annotated.values("nature").annotate(
            **_sums(), document_count=Count("document", distinct=True)
        )
    }
    values = _invoice_values(annotated)
    rows = []
    for nature in NATURE_ORDER:
        if nature == "advances":
            # BR-11 — considered and excluded, so it is a row that says so.
            rows.append(
                {
                    "nature": nature,
                    "gstr1_table": GSTR1_TABLE[nature],
                    "applicable": False,
                    "document_count": 0,
                    **{head: ZERO for head in HEADS},
                    "invoice_value": None,
                    "note": "not_modelled",
                }
            )
            continue
        group = grouped.get(nature)
        if group is None and nature in ("b2b_rcm", "cdnur"):
            continue  # only when the period has one
        money = _money_row(group or {})
        if nature in ("cdnr", "cdnur"):
            money = {head: -value for head, value in money.items()}
        rows.append(
            {
                "nature": nature,
                "gstr1_table": GSTR1_TABLE[nature],
                "applicable": True,
                "document_count": (group or {}).get("document_count", 0),
                **money,
                "invoice_value": values.get(nature),
            }
        )
    return {"rows": rows}


def _invoice_values(annotated: QuerySet) -> dict[str, Decimal]:
    """Invoice value of the invoice-wise tables — each document's grand total once.

    A document can have lines in two natures (a B2B bill with an exempt line),
    so its grand total is attributed to the nature of its taxable lines, which
    is where GSTR-1 reports the invoice.
    """
    per_doc: dict[Any, tuple[str, Decimal]] = {}
    taxable_lines = annotated.exclude(nature="nil_exempt").order_by()
    for doc_id, nature, total in taxable_lines.values_list(
        "document_id", "nature", "document__grand_total"
    ).distinct():
        per_doc.setdefault(doc_id, (nature, total))
    values: dict[str, Decimal] = {}
    for nature, total in per_doc.values():
        if nature in ("b2b", "b2b_rcm", "b2cl", "cdnr", "cdnur"):
            values[nature] = values.get(nature, ZERO) + total
    return values


def outward_b2cs(lines: QuerySet, *, tenant: Any) -> list[dict]:
    """BR-5 — B2CS is rate-wise and STATE-wise, never invoice-wise."""
    grouped = (
        lines.annotate(nature=_nature_expression(tenant))
        .filter(nature="b2cs")
        .values("document__place_of_supply_state", "tax_rate", "document__is_inter_state")
        .annotate(**_sums())
        .order_by("document__place_of_supply_state", "tax_rate", "document__is_inter_state")
    )
    return [
        {
            "pos_state": g["document__place_of_supply_state"],
            "tax_rate": g["tax_rate"],
            "is_inter_state": g["document__is_inter_state"],
            "gstr1_table": "7B" if g["document__is_inter_state"] else "7A",
            **_money_row(g),
        }
        for g in grouped
    ]


def outward_nil_exempt(lines: QuerySet) -> list[dict]:
    """GSTR-1 table 8 — nil, exempt and non-GST by registered × inter/intra."""
    registered = Case(
        When(HAS_GSTIN, then=Value(True)), default=Value(False), output_field=BooleanField()
    )
    grouped = (
        lines.filter(tax_code__in=sorted(ZERO_CODES))
        .annotate(registered=registered)
        .values("registered", "document__is_inter_state")
        .annotate(
            nil=Coalesce(
                Sum(
                    signed("taxable_value", prefix="document__"),
                    filter=Q(tax_code__in=["GST0", "NIL"]),
                ),
                Value(ZERO),
                output_field=MONEY,
            ),
            exempt=Coalesce(
                Sum(signed("taxable_value", prefix="document__"), filter=Q(tax_code="EXEMPT")),
                Value(ZERO),
                output_field=MONEY,
            ),
            non_gst=Coalesce(
                Sum(
                    signed("taxable_value", prefix="document__"),
                    filter=Q(tax_code__in=sorted(NON_GST_CODES)),
                ),
                Value(ZERO),
                output_field=MONEY,
            ),
        )
        .order_by("-document__is_inter_state", "-registered")
    )
    return [
        {
            "registered": g["registered"],
            "is_inter_state": g["document__is_inter_state"],
            "nil": g["nil"],
            "exempt": g["exempt"],
            "non_gst": g["non_gst"],
            "gstr1_table": "8",
        }
        for g in grouped
    ]


def hsn_summary(lines: QuerySet) -> dict:
    """FR-5 — table 12, one row per `(hsn, uqc, rate, b2b|b2c)`; a missing HSN is kept (EC-5)."""
    keyed = lines.annotate(
        hsn=Coalesce(NullIf("hsn_sac", Value("")), Value(MISSING_HSN), output_field=CharField()),
        supply=Case(
            When(HAS_GSTIN, then=Value("b2b")), default=Value("b2c"), output_field=CharField()
        ),
    )
    keys = ("hsn", "unit_code", "tax_rate", "supply")
    grouped = (
        keyed.values(*keys)
        .annotate(
            **_sums(),
            total_qty=Coalesce(
                Sum(
                    Case(
                        When(document__kind=CREDIT_NOTE, then=-F("qty")),
                        default=F("qty"),
                        output_field=QTY,
                    )
                ),
                Value(Decimal("0.000")),
                output_field=QTY,
            ),
        )
        .order_by("hsn", "unit_code", "tax_rate", "supply")
    )
    descriptions: dict[tuple, Counter] = {}
    for row in keyed.values(*keys, "description").annotate(n=Count("id")):
        descriptions.setdefault(tuple(row[k] for k in keys), Counter())[row["description"]] = row[
            "n"
        ]
    rows = []
    for g in grouped:
        counter = descriptions.get(tuple(g[k] for k in keys), Counter())
        # Most frequent, ties broken alphabetically so the file is stable.
        best = min(counter.items(), key=lambda kv: (-kv[1], kv[0]))[0] if counter else ""
        money = _money_row(g)
        rows.append(
            {
                "hsn_sac": g["hsn"],
                "description": best[:HSN_DESCRIPTION_MAX],
                "uqc": g["unit_code"],
                "supply_type": g["supply"],
                "total_qty": g["total_qty"],
                "tax_rate": g["tax_rate"],
                **money,
                "total_value": sum(money.values(), ZERO),
                "gstr1_table": "12",
            }
        )
    total = _total(rows)
    return {"rows": rows, "total": {**total, "total_value": sum(total.values(), ZERO)}}


def document_series(*, tenant: Any, date_from: dt.date, date_to: dt.date) -> list[dict]:
    """FR-6 — table 13: from, to, total and cancelled per series (EC-9).

    The series is the number with its trailing digits removed (`INV/26-27/`),
    and from/to are chosen by the NUMERIC suffix, so `INV/…/10000` follows
    `INV/…/9999` rather than sorting before it. Voids are counted — their
    numbers were issued and are never reused (§21.3.1).
    """
    from apps.reports.constants_tax import DOC_NATURE_FOR_KIND

    numbers = (
        SalesDocument.objects.filter(
            tenant=tenant,
            kind__in=SALES_REGISTER_KINDS,
            document_date__gte=date_from,
            document_date__lte=date_to,
            number__isnull=False,
        )
        .exclude(status=DRAFT)
        .values_list("kind", "number", "status")
    )
    series: dict[tuple[str, str], dict] = {}
    for kind, number, status in numbers.iterator(chunk_size=2000):
        digits = len(number) - len(number.rstrip("0123456789"))
        prefix, suffix = number[: len(number) - digits], number[len(number) - digits :]
        key = (DOC_NATURE_FOR_KIND.get(kind, kind), prefix)
        entry = series.setdefault(key, {"min": None, "max": None, "total": 0, "cancelled": 0})
        position = (int(suffix) if suffix else 0, number)
        entry["min"] = position if entry["min"] is None or position < entry["min"] else entry["min"]
        entry["max"] = position if entry["max"] is None or position > entry["max"] else entry["max"]
        entry["total"] += 1
        entry["cancelled"] += status == VOID
    return [
        {
            "nature": nature,
            "series_prefix": prefix,
            "from_number": entry["min"][1],
            "to_number": entry["max"][1],
            "total_count": entry["total"],
            "cancelled_count": entry["cancelled"],
            "net_issued": entry["total"] - entry["cancelled"],
            "gstr1_table": "13",
        }
        for (nature, prefix), entry in sorted(series.items())
    ]


# ── Inward (FR-7) ───────────────────────────────────────────────────────────


def _inward_itc(tenant: Any) -> Any:
    if not itc_claimable(tenant):
        return Value(False, output_field=BooleanField())
    return Case(
        When(document__itc_eligible=True, then=Value(True)),
        default=Value(False),
        output_field=BooleanField(),
    )


def inward_by_rate(lines: QuerySet, *, tenant: Any) -> dict:
    """FR-7 — the purchases mirror of FR-3, split by ITC eligibility and reverse charge."""
    grouped = (
        lines.annotate(itc=_inward_itc(tenant))
        .values(
            "tax_code", "tax_rate", "document__is_inter_state", "itc", "document__reverse_charge"
        )
        .annotate(**_sums(), bill_count=Count("document", distinct=True))
        .order_by("tax_rate", "document__is_inter_state", "-itc", "document__reverse_charge")
    )
    rows = []
    for g in grouped:
        rcm = g["document__reverse_charge"]
        box = "3.1(d)" if rcm else ("4(A)(5)" if g["itc"] else None)
        rows.append(
            {
                "tax_code": g["tax_code"],
                "tax_rate": g["tax_rate"],
                "is_inter_state": g["document__is_inter_state"],
                "itc_eligible": g["itc"],
                "reverse_charge": rcm,
                **_money_row(g),
                "bill_count": g["bill_count"],
                "gstr3b_box": box,
                "itc_box": "4(A)(3)" if rcm and g["itc"] else None,
            }
        )
    return {"rows": rows, "total": _total(rows)}


def _tax_heads(rows: list[dict]) -> dict:
    return {head: sum((r[head] for r in rows), ZERO) for head in ("igst", "cgst", "sgst", "cess")}


def itc_block(inward: dict) -> dict:
    """EC-10 — what is claimable, what is RCM, and what is not claimable (the caption)."""
    rows = inward["rows"]
    eligible = _tax_heads([r for r in rows if r["itc_eligible"] and not r["reverse_charge"]])
    rcm_eligible = _tax_heads([r for r in rows if r["itc_eligible"] and r["reverse_charge"]])
    blocked = _tax_heads([r for r in rows if not r["itc_eligible"] and not r["reverse_charge"]])
    rcm = _tax_heads([r for r in rows if r["reverse_charge"]])
    return {
        "eligible": {**eligible, "total": sum(eligible.values(), ZERO)},
        "rcm_eligible": {**rcm_eligible, "total": sum(rcm_eligible.values(), ZERO)},
        "rcm_tax": sum(rcm.values(), ZERO),
        "not_claimable": sum(blocked.values(), ZERO),
    }


# ── GSTR-3B (FR-8, BR-9, BR-10) ─────────────────────────────────────────────


def _box(lines: QuerySet) -> dict:
    sums = lines.aggregate(**_sums())
    return {
        "taxable": sums["taxable_value"],
        "igst": sums["igst"],
        "cgst": sums["cgst"],
        "sgst": sums["sgst"],
        "cess": sums["cess"],
    }


def gstr3b(outward: QuerySet, inward: QuerySet, *, tenant: Any) -> dict:
    """BR-9, box by box. EC-14: an RCM SALE is the recipient's to pay — not in 3.1(a)."""
    taxable_supply = outward.filter(tax_rate__gt=0).exclude(tax_code__in=sorted(ZERO_CODES))
    zero = {"taxable": ZERO, "igst": ZERO, "cgst": ZERO, "sgst": ZERO, "cess": ZERO}
    box_a = _box(taxable_supply.exclude(document__reverse_charge=True))
    box_d = _box(inward.filter(document__reverse_charge=True))
    claimable = itc_claimable(tenant)
    itc_a3 = (
        _box(inward.filter(document__reverse_charge=True, document__itc_eligible=True))
        if claimable
        else dict(zero)
    )
    itc_a5 = (
        _box(inward.filter(document__reverse_charge=False, document__itc_eligible=True))
        if claimable
        else dict(zero)
    )
    state_wise = (
        taxable_supply.filter(document__is_inter_state=True)
        .exclude(document__reverse_charge=True)
        .filter(~HAS_GSTIN)
        .values("document__place_of_supply_state")
        .annotate(**_sums())
        .order_by("document__place_of_supply_state")
    )
    exempt_inward = inward.filter(tax_rate=0)
    five = exempt_inward.aggregate(
        inter=Coalesce(
            Sum("taxable_value", filter=Q(document__is_inter_state=True)),
            Value(ZERO),
            output_field=MONEY,
        ),
        intra=Coalesce(
            Sum("taxable_value", filter=Q(document__is_inter_state=False)),
            Value(ZERO),
            output_field=MONEY,
        ),
    )
    heads = ("igst", "cgst", "sgst", "cess")
    output = {h: box_a[h] + box_d[h] for h in heads}
    credit = {h: itc_a3[h] + itc_a5[h] for h in heads}
    net = {h: output[h] - credit[h] for h in heads}
    return {
        "3.1(a)": box_a,
        "3.1(b)": {**zero, "note": "not_modelled"},
        "3.1(c)": _box(outward.filter(tax_code__in=sorted(NIL_EXEMPT_CODES))),
        "3.1(d)": box_d,
        "3.1(e)": _box(outward.filter(tax_code__in=sorted(NON_GST_CODES))),
        "3.2": [
            {
                "pos_state": s["document__place_of_supply_state"],
                "taxable": s["taxable_value"],
                "igst": s["igst"],
            }
            for s in state_wise
        ],
        "4(A)(3)": itc_a3,
        "4(A)(5)": itc_a5,
        "4(B)": {**zero, "note": "not_modelled"},
        "5": five,
        # BR-10 — the SIMPLE head-wise figure, labelled as such by the client.
        # A negative head is credit carried forward, never silently zeroed.
        "net_payable": {
            **net,
            "total": sum(net.values(), ZERO),
            "output_tax": sum(output.values(), ZERO),
            "itc": sum(credit.values(), ZERO),
            "method": "simple_head_wise",
        },
    }


def composition_block(outward: QuerySet, *, tenant: Any) -> dict:
    """BR-12 — CMP-08: turnover net of returns × the notified rate."""
    turnover = outward.aggregate(**_sums())["taxable_value"]
    rate = composition_rate(tenant)
    return {
        "turnover": turnover,
        "rate": rate,
        "tax": q2(turnover * rate / Decimal("100")),
        "box": "CMP-08 3",
    }
