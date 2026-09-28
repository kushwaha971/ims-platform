"""RPT-03 sales register and RPT-04 purchase register — one query each.

Both are the documents of a period, with every money column SIGNED the way a
return reads it and the totals over the FILTERED set (FR-4), so the screen,
the file and the GST summary (RPT-07) all start from the same rows.

── The sign convention (RPT-03 BR-1, FR-2) ──────────────────────────────────
Credit notes are stored with positive amounts — `compute_document_totals`
produced them — and the register NEGATES every money column of a credit note,
so a column sum nets returns against sales exactly (AC-1: +1,772.00 and
−465.81 net to 1,306.19). `amount_paid` and `amount_due` are negated too: on a
credit note they are the refund paid out and the credit still open (SAL-04
FR-8), so Σ due is the receivable net of open credit and Σ paid is cash in net
of cash refunded. A VOID row, listed only on request (FR-5), carries zero in
every money column, so including it changes the count and nothing else.

── What is read, and what is not ────────────────────────────────────────────
Figures are the STORED document columns, never recomputed from a rate: the
register, the printed invoice and RPT-07 can then never disagree (RPT-07
BR-3). Party identity is the FROZEN snapshot (BR-2) — editing a party today
never moves a filed period. Rows are chosen by `document_date` (EC-2).

── SAL-04 on a branch that does not have it yet ──────────────────────────────
`against` (the credit note's invoice) is read only when the model has the
field, so this module runs unchanged before and after SAL-04 merges.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db.models import (
    BooleanField,
    Case,
    CharField,
    Count,
    DecimalField,
    ExpressionWrapper,
    F,
    Q,
    QuerySet,
    Sum,
    Value,
    When,
)
from django.db.models.functions import Coalesce

from apps.purchases.models import PurchaseDocument, PurchaseDocumentLine
from apps.reports.constants_tax import (
    CREDIT_NOTE,
    DRAFT,
    PURCHASE_REGISTER_KINDS,
    REGISTER_ORDERINGS,
    SALES_REGISTER_KINDS,
    VOID,
)
from apps.sales.models import SalesDocument, SalesDocumentLine

ZERO = Decimal("0.00")
MONEY = DecimalField(max_digits=16, decimal_places=2)
QTY = DecimalField(max_digits=16, decimal_places=3)

#: Document money columns, and the name each signed annotation takes.
DOC_MONEY: tuple[str, ...] = (
    "subtotal",
    "discount_amount",
    "taxable_total",
    "cgst_total",
    "sgst_total",
    "igst_total",
    "cess_total",
    "round_off",
    "grand_total",
    "amount_paid",
    "amount_due",
)
LINE_MONEY: tuple[str, ...] = (
    "discount_amount",
    "taxable_value",
    "cgst",
    "sgst",
    "igst",
    "cess",
    "line_total",
)


def has_field(model: Any, name: str) -> bool:
    """Whether `model` declares `name` — the SAL-04 seam (see the module docstring)."""
    return any(f.name == name for f in model._meta.get_fields())


def signed(field: str, *, prefix: str = "") -> Case:
    """A money column as the register reads it: void → 0, credit note → negative."""
    kind, status = f"{prefix}kind", f"{prefix}status"
    return Case(
        When(**{status: VOID}, then=Value(ZERO)),
        When(**{kind: CREDIT_NOTE}, then=-F(field)),
        default=F(field),
        output_field=MONEY,
    )


def _annotate_signed(queryset: QuerySet, fields: tuple[str, ...], prefix: str = "") -> QuerySet:
    return queryset.annotate(**{f"s_{name}": signed(name, prefix=prefix) for name in fields})


# ── Sales register (RPT-03) ─────────────────────────────────────────────────


def _sales_base(*, tenant: Any, params: Any) -> QuerySet:
    """The FILTERED document set; every register figure is computed over it."""
    queryset = SalesDocument.objects.filter(
        tenant=tenant,
        kind__in=params.kinds or SALES_REGISTER_KINDS,
        document_date__gte=params.date_from,
        document_date__lte=params.date_to,
    ).exclude(status=DRAFT)
    if not params.include_void:
        queryset = queryset.exclude(status=VOID)
    if params.statuses:
        queryset = queryset.filter(status__in=params.statuses)
    if params.party_id:
        queryset = queryset.filter(party_id=params.party_id)
    if params.b2b is True:
        queryset = queryset.filter(party_gstin_snapshot__isnull=False).exclude(
            party_gstin_snapshot=""
        )
    elif params.b2b is False:
        queryset = queryset.filter(
            Q(party_gstin_snapshot__isnull=True) | Q(party_gstin_snapshot="")
        )
    if params.inter_state is not None:
        queryset = queryset.filter(is_inter_state=params.inter_state)
    if params.series:
        queryset = queryset.filter(number__startswith=params.series)
    if params.created_by:
        queryset = queryset.filter(created_by_id=params.created_by)
    if params.tax_code:
        queryset = queryset.filter(
            id__in=SalesDocumentLine.objects.filter(tax_code=params.tax_code).values("document_id")
        )
    return queryset


def sales_register(*, tenant: Any, params: Any) -> QuerySet:
    """FR-2 — document rows, signed, ordered (EC-5: number ties broken by date)."""
    queryset = _annotate_signed(_sales_base(tenant=tenant, params=params), DOC_MONEY)
    queryset = queryset.annotate(
        is_b2b=ExpressionWrapper(
            Q(party_gstin_snapshot__isnull=False) & ~Q(party_gstin_snapshot=""),
            output_field=BooleanField(),
        ),
        created_by_name=Coalesce(F("created_by__full_name"), Value(""), output_field=CharField()),
    )
    related = ["created_by"]
    if has_field(SalesDocument, "against"):
        queryset = queryset.annotate(against_number=F("against__number"))
    return queryset.select_related(*related).order_by(*REGISTER_ORDERINGS[params.ordering])


def _sum(name: str) -> Coalesce:
    return Coalesce(Sum(name), Value(ZERO), output_field=MONEY)


def sales_register_totals(*, tenant: Any, params: Any) -> dict:
    """FR-4 — Σ every money column, count by kind, and the B2B/B2C split.

    B2B is `party_gstin_snapshot` present (BR-3); B2C is everything else,
    walk-ins included (EC-4).
    """
    base = _annotate_signed(_sales_base(tenant=tenant, params=params), DOC_MONEY)
    b2b = Q(party_gstin_snapshot__isnull=False) & ~Q(party_gstin_snapshot="")
    tax = F("s_cgst_total") + F("s_sgst_total") + F("s_igst_total") + F("s_cess_total")
    sums = base.aggregate(
        count=Count("id"),
        **{name: _sum(f"s_{name}") for name in DOC_MONEY},
        b2b_count=Count("id", filter=b2b),
        b2b_taxable=Coalesce(Sum("s_taxable_total", filter=b2b), Value(ZERO), output_field=MONEY),
        b2b_tax=Coalesce(Sum(tax, filter=b2b), Value(ZERO), output_field=MONEY),
        b2c_count=Count("id", filter=~b2b),
        b2c_taxable=Coalesce(Sum("s_taxable_total", filter=~b2b), Value(ZERO), output_field=MONEY),
        b2c_tax=Coalesce(Sum(tax, filter=~b2b), Value(ZERO), output_field=MONEY),
    )
    by_kind = dict(base.values_list("kind").annotate(n=Count("id")).values_list("kind", "n"))
    return {
        "count": sums["count"],
        "count_by_kind": {kind: by_kind.get(kind, 0) for kind in SALES_REGISTER_KINDS},
        **{_total_key(name): sums[name] for name in DOC_MONEY},
        "b2b": {"count": sums["b2b_count"], "taxable": sums["b2b_taxable"], "tax": sums["b2b_tax"]},
        "b2c": {"count": sums["b2c_count"], "taxable": sums["b2c_taxable"], "tax": sums["b2c_tax"]},
    }


def _total_key(name: str) -> str:
    """`cgst_total` → `cgst` in the totals block (§14's key names)."""
    return {
        "discount_amount": "discount",
        "cgst_total": "cgst",
        "sgst_total": "sgst",
        "igst_total": "igst",
        "cess_total": "cess",
    }.get(name, name)


def sales_register_lines(*, tenant: Any, params: Any) -> QuerySet:
    """FR-3 — one row per line of the same filtered documents, signed by the document.

    `taxable_value` is post-document-discount (BR-4), so Σ lines per document
    is the document's `taxable_total` exactly.
    """
    documents = _sales_base(tenant=tenant, params=params)
    queryset = SalesDocumentLine.objects.filter(document__in=documents).select_related("document")
    queryset = _annotate_signed(queryset, LINE_MONEY, prefix="document__")
    queryset = queryset.annotate(
        s_qty=Case(
            When(document__status=VOID, then=Value(Decimal("0.000"))),
            When(document__kind=CREDIT_NOTE, then=-F("qty")),
            default=F("qty"),
            output_field=QTY,
        )
    )
    ordering = tuple(f"document__{f}" for f in REGISTER_ORDERINGS[params.ordering]) + ("line_no",)
    return queryset.order_by(*ordering)


# ── Purchase register (RPT-04) ──────────────────────────────────────────────


def itc_claimable(tenant: Any) -> bool:
    """EC-1 — only a regular GST tenant may claim input tax; the rest pay it as cost."""
    return getattr(tenant, "gst_type", "") == "regular"


def _itc_expression(tenant: Any, prefix: str = "") -> Any:
    if not itc_claimable(tenant):
        return Value(False, output_field=BooleanField())
    return ExpressionWrapper(Q(**{f"{prefix}itc_eligible": True}), output_field=BooleanField())


def _purchase_base(*, tenant: Any, params: Any) -> QuerySet:
    queryset = PurchaseDocument.objects.filter(
        tenant=tenant,
        kind__in=params.kinds or PURCHASE_REGISTER_KINDS,
        document_date__gte=params.date_from,
        document_date__lte=params.date_to,
    ).exclude(status=DRAFT)
    if not params.include_void:
        queryset = queryset.exclude(status=VOID)
    if params.statuses:
        queryset = queryset.filter(status__in=params.statuses)
    if params.party_id:
        queryset = queryset.filter(party_id=params.party_id)
    if params.inter_state is not None:
        queryset = queryset.filter(is_inter_state=params.inter_state)
    if params.itc is not None:
        if not itc_claimable(tenant):
            # Nothing is claimable for a composition or unregistered buyer, so
            # "ITC eligible" is the empty set and "not eligible" is everything.
            queryset = queryset if params.itc is False else queryset.none()
        else:
            queryset = queryset.filter(itc_eligible=params.itc)
    if params.series:
        queryset = queryset.filter(number__startswith=params.series)
    if params.created_by:
        queryset = queryset.filter(created_by_id=params.created_by)
    if params.tax_code:
        queryset = queryset.filter(
            id__in=PurchaseDocumentLine.objects.filter(tax_code=params.tax_code).values(
                "document_id"
            )
        )
    return queryset


def purchase_register(*, tenant: Any, params: Any) -> QuerySet:
    """FR-2 — bill rows with the supplier's own number and date and effective ITC."""
    queryset = _annotate_signed(_purchase_base(tenant=tenant, params=params), DOC_MONEY)
    queryset = queryset.annotate(
        itc_effective=_itc_expression(tenant),
        created_by_name=Coalesce(F("created_by__full_name"), Value(""), output_field=CharField()),
    )
    return queryset.select_related("created_by").order_by(*REGISTER_ORDERINGS[params.ordering])


def purchase_register_totals(*, tenant: Any, params: Any) -> dict:
    """FR-4 / BR-2 — Σ per column; ITC-eligible tax excludes RCM, which is its own figure."""
    base = _annotate_signed(_purchase_base(tenant=tenant, params=params), DOC_MONEY)
    claimable = itc_claimable(tenant)
    # A composition or unregistered buyer claims nothing (EC-1): the eligible
    # filter is then a flag no row carries, which is always-false SQL rather
    # than an empty `IN ()` Django would have to special-case.
    eligible = (
        Q(itc_eligible=True, reverse_charge=False)
        if claimable
        else Q(itc_eligible=True) & Q(itc_eligible=False)
    )
    rcm = Q(reverse_charge=True)
    heads = ("cgst_total", "sgst_total", "igst_total", "cess_total")
    tax = F("s_cgst_total") + F("s_sgst_total") + F("s_igst_total") + F("s_cess_total")
    sums = base.aggregate(
        count=Count("id"),
        **{name: _sum(f"s_{name}") for name in DOC_MONEY},
        **{
            f"itc_{name}": Coalesce(
                Sum(f"s_{name}", filter=eligible), Value(ZERO), output_field=MONEY
            )
            for name in heads
        },
        rcm_tax=Coalesce(Sum(tax, filter=rcm), Value(ZERO), output_field=MONEY),
        not_claimable=Coalesce(Sum(tax, filter=~eligible & ~rcm), Value(ZERO), output_field=MONEY),
    )
    return {
        "count": sums["count"],
        "count_by_kind": {"purchase_bill": sums["count"]},
        **{_total_key(name): sums[name] for name in DOC_MONEY},
        "itc_eligible": {_total_key(name): sums[f"itc_{name}"] for name in heads},
        "rcm_tax": sums["rcm_tax"],
        "not_claimable_tax": sums["not_claimable"],
    }


def purchase_register_lines(*, tenant: Any, params: Any) -> QuerySet:
    """FR-3 — lines, plus `unit_cost` (gated by the view) and the bill's effective ITC."""
    documents = _purchase_base(tenant=tenant, params=params)
    queryset = PurchaseDocumentLine.objects.filter(document__in=documents).select_related(
        "document"
    )
    queryset = _annotate_signed(queryset, LINE_MONEY, prefix="document__")
    queryset = queryset.annotate(
        s_qty=Case(
            When(document__status=VOID, then=Value(Decimal("0.000"))),
            default=F("qty"),
            output_field=QTY,
        ),
        itc_effective=_itc_expression(tenant, prefix="document__"),
    )
    ordering = tuple(f"document__{f}" for f in REGISTER_ORDERINGS[params.ordering]) + ("line_no",)
    return queryset.order_by(*ordering)
