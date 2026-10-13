"""What the shop made, by item, by customer, by category or by bill — and the P&L under it.

docs/platform/15 §1.4 item 5 (Shop item 1 of the 6 Oct order): Vyapar's
"item-wise profit & loss" and "party-wise profit & loss", myBillBook's
"profit on items", Marg's "bill-wise profit". A shopkeeper asks which items
carry the shop, which customers are worth the credit, and whether last month
made money after the rent.

── The arithmetic is `invoice_profit`'s, over many bills ─────────────────────
One line's figures, in SQL rather than Python:

* **kept** — `qty − returned_qty`: what stayed sold after credit-note returns.
* **sale** — the TAXABLE value of what was kept, less any value credit issued
  against the line (A15: a "₹50 off for the dent" credit moves no quantity, so
  `returned_qty` never sees it; without this the report would count money the
  shop gave back). GST is the government's, so it is never sale value.
* **cost** — `unit_cost_snapshot × kept`: the cost frozen on the line when the
  bill was issued, never today's average, so a past month's profit does not
  move when today's purchase price does.
* **profit** — sale less cost, over the lines whose cost is KNOWN. A line with
  no cost (a service, an item never bought) is in the sale value but not in
  the profit or the margin, and `uncosted_lines` says how many there were; a
  figure is never better than its data, and an uncosted line counted as pure
  profit would be exactly that.

Bills are by their own date: a return made in October against a September
bill reduces September, as it does on the bill's own profit panel. Drafts and
voids never count.

── The P&L ───────────────────────────────────────────────────────────────────
Gross profit (above) less the period's expenses (EXP-01, voids excluded, by
expense date) is the net profit — the "did we make money" line every one of
the three competitors puts at the top. Expenses are present only when the
expenses module is on; absent, never zero (§10), because a net profit that
silently ignored the rent would be the most flattering lie on the screen.

Everything here is `reports.financial.read`'s (INV-08 EC-4); the view enforces it.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from django.db.models import (
    Case,
    Count,
    DecimalField,
    ExpressionWrapper,
    F,
    IntegerField,
    OuterRef,
    Q,
    Subquery,
    Sum,
    Value,
    When,
)
from django.db.models.functions import Coalesce, Lower, NullIf

from apps.common.money import ZERO
from apps.reports.constants import CREDIT_NOTE_LIVE_STATUSES, DRAFT, SALE_KINDS, VOID

_WIDE = DecimalField(max_digits=24, decimal_places=6)
_ZERO_WIDE = Value(Decimal("0"), output_field=_WIDE)

#: The four ways to cut it. `item` first: it is the question asked most.
GROUPS: tuple[str, ...] = ("item", "party", "category", "bill")
#: Most profit first is the default; `profit` puts the loss-makers on top,
#: which is the other question this report exists to answer. Each column the
#: screen can sort by is here in both directions.
ORDERINGS: tuple[str, ...] = (
    "-profit",
    "profit",
    "-sale_value",
    "sale_value",
    "-margin",
    "margin",
    "name",
    "-name",
)
DEFAULT_ORDERING = "-profit"

# What each grouping groups by, and which of those fields is the row's name.
_KEYS: dict[str, tuple[str, ...]] = {
    "item": ("item_id", "item__name", "item__unit__code"),
    "party": ("document__party_id", "document__party__name"),
    "category": ("item__category_id", "item__category__name"),
    "bill": (
        "document_id",
        "document__number",
        "document__document_date",
        "document__party_id",
        "document__party__name",
    ),
}
_NAME: dict[str, str] = {
    "item": "item__name",
    "party": "document__party__name",
    "category": "item__category__name",
    "bill": "document__number",
}


def sold_lines(*, tenant: Any, date_from: dt.date, date_to: dt.date) -> Any:
    """Every live sale line on a bill dated in the period."""
    from apps.sales.models import SalesDocumentLine

    return SalesDocumentLine.objects.filter(
        document__tenant=tenant,
        document__kind__in=SALE_KINDS,
        document__document_date__gte=date_from,
        document__document_date__lte=date_to,
        qty__gt=0,
    ).exclude(document__status__in=(DRAFT, VOID))


def has_any_sale(*, tenant: Any) -> bool:
    """Whether this business has EVER made a live bill the profit report reads.

    No period and no search: the screen asks it to tell an empty book (one
    empty state, no period or view pickers) from a month with no sales (keep
    the controls — moving the period is how the merchant finds the bills).
    Drafts and voids never reach this report, so they do not count here.
    """
    from apps.sales.models import SalesDocument

    return (
        SalesDocument.objects.filter(tenant=tenant, kind__in=SALE_KINDS)
        .exclude(status__in=(DRAFT, VOID))
        .exists()
    )


def _value_credit() -> Any:
    """The taxable value credited against a line by live value-only credit notes."""
    from apps.sales.models import SalesDocumentLine

    credited = (
        SalesDocumentLine.objects.filter(
            against_line=OuterRef("pk"),
            credit_mode="value",
            document__status__in=CREDIT_NOTE_LIVE_STATUSES,
        )
        .order_by()
        .values("against_line")
        .annotate(total=Sum("taxable_value"))
        .values("total")[:1]
    )
    return Coalesce(Subquery(credited, output_field=_WIDE), _ZERO_WIDE)


def line_figures() -> dict[str, Any]:
    """Per-line expressions, each summed by its own `Sum` (see `item_trade._sale_figures`
    for why the queryset is never annotated with them before it is grouped)."""
    kept = F("qty") - Coalesce(F("returned_qty"), Value(Decimal("0")))
    sale = F("taxable_value") * kept / F("qty") - _value_credit()
    costed = Q(unit_cost_snapshot__isnull=False)
    return {
        "kept": ExpressionWrapper(kept, output_field=_WIDE),
        "sale": ExpressionWrapper(sale, output_field=_WIDE),
        "costed_sale": Case(When(costed, then=sale), default=_ZERO_WIDE, output_field=_WIDE),
        "cost": Case(
            When(costed, then=F("unit_cost_snapshot") * kept),
            default=_ZERO_WIDE,
            output_field=_WIDE,
        ),
        "costed": Case(
            When(costed & Q(qty__gt=F("returned_qty")), then=1),
            default=0,
            output_field=IntegerField(),
        ),
        # Fully returned lines have nothing left to cost, so they are not "missing" one.
        "uncosted": Case(
            When(Q(unit_cost_snapshot__isnull=True) & Q(qty__gt=F("returned_qty")), then=1),
            default=0,
            output_field=IntegerField(),
        ),
    }


def _sums() -> dict[str, Any]:
    fig = line_figures()
    return {
        "sum_qty": Coalesce(Sum(fig["kept"]), _ZERO_WIDE),
        "sum_sale": Coalesce(Sum(fig["sale"]), _ZERO_WIDE),
        "sum_costed_sale": Coalesce(Sum(fig["costed_sale"]), _ZERO_WIDE),
        "sum_cost": Coalesce(Sum(fig["cost"]), _ZERO_WIDE),
        "sum_costed": Coalesce(Sum(fig["costed"]), 0),
        "sum_uncosted": Coalesce(Sum(fig["uncosted"]), 0),
        "bills": Count("document_id", distinct=True),
    }


def _money(value: Decimal | None) -> str:
    return str((value or ZERO).quantize(Decimal("0.01")))


def _pct(profit: Decimal, sale: Decimal) -> str | None:
    if not sale or sale <= 0:
        return None
    return str((profit * Decimal("100") / sale).quantize(Decimal("0.1")))


def _figures(row: dict) -> dict[str, Any]:
    profit = (row["sum_costed_sale"] or ZERO) - (row["sum_cost"] or ZERO)
    # Nothing here has a known cost: "₹0.00 cost, ₹0.00 profit" would be a claim.
    unknown = not row["sum_costed"] and bool(row["sum_uncosted"])
    return {
        "bills": row["bills"],
        "sale_value": _money(row["sum_sale"]),
        "cost": None if unknown else _money(row["sum_cost"]),
        "profit": None if unknown else _money(profit),
        "margin_pct": _pct(profit, row["sum_costed_sale"] or ZERO),
        "uncosted_lines": int(row["sum_uncosted"] or 0),
    }


def grouped(
    *,
    tenant: Any,
    group: str,
    date_from: dt.date,
    date_to: dt.date,
    q: str = "",
    ordering: str = DEFAULT_ORDERING,
) -> Any:
    """One row per item, customer, category or bill, ordered and searchable."""
    lines = sold_lines(tenant=tenant, date_from=date_from, date_to=date_to)
    name = _NAME[group]
    if q:
        match = Q(**{f"{name}__icontains": q})
        if group == "bill":
            match |= Q(document__party__name__icontains=q)
        lines = lines.filter(match)
    rows = lines.values(*_KEYS[group]).annotate(**_sums())
    profit = F("sum_costed_sale") - F("sum_cost")
    rows = rows.annotate(
        sum_profit=ExpressionWrapper(profit, output_field=_WIDE),
        sum_margin=ExpressionWrapper(
            profit / NullIf(F("sum_costed_sale"), _ZERO_WIDE), output_field=_WIDE
        ),
    )
    key = _KEYS[group][0]
    tie = (Lower(name).asc(nulls_last=True), key)
    order = {
        "-profit": (F("sum_profit").desc(), *tie),
        "profit": (F("sum_profit").asc(), *tie),
        "-sale_value": (F("sum_sale").desc(), *tie),
        "sale_value": (F("sum_sale").asc(), *tie),
        "-margin": (F("sum_margin").desc(nulls_last=True), *tie),
        "margin": (F("sum_margin").asc(nulls_last=True), *tie),
        "name": tie,
        "-name": (Lower(name).desc(nulls_last=True), key),
    }[ordering]
    if group == "bill" and ordering in ("name", "-name"):
        # A bill's "name" is its number, and numbers sort as the days they were made.
        newest = ordering == "-name"
        date, number = F("document__document_date"), F("document__number")
        order = (date.desc(), number.desc(), key) if newest else (date.asc(), number.asc(), key)
    return rows.order_by(*order)


def row_json(group: str, row: dict) -> dict[str, Any]:
    """A grouped row as the screen and the file read it. `id` null is the catch-all row."""
    key = row[_KEYS[group][0]]
    body: dict[str, Any] = {"id": str(key) if key else None, "name": row[_NAME[group]]}
    if group == "item":
        body["qty"] = str((row["sum_qty"] or ZERO).quantize(Decimal("0.001")))
        body["unit"] = row["item__unit__code"]
    if group == "bill":
        body["date"] = row["document__document_date"].isoformat()
        party = row["document__party_id"]
        body["party"] = {"id": str(party), "name": row["document__party__name"]} if party else None
    return {**body, **_figures(row)}


def expenses_total(*, tenant: Any, date_from: dt.date, date_to: dt.date) -> Decimal:
    from apps.expenses.models import Expense

    return (
        # DEC-019 (QA B10) — the Shop's profit counts the Shop's expenses only.
        Expense.objects.filter(
            tenant=tenant, app="shop", expense_date__gte=date_from, expense_date__lte=date_to
        )
        .exclude(status="void")
        .aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))["total"]
    )


def summary(
    *, tenant: Any, date_from: dt.date, date_to: dt.date, with_expenses: bool
) -> dict[str, Any]:
    """The period's totals over EVERY line (not the page, not the search), and the P&L."""
    lines = sold_lines(tenant=tenant, date_from=date_from, date_to=date_to)
    totals = _figures(lines.aggregate(**_sums()))
    if with_expenses:
        expenses = expenses_total(tenant=tenant, date_from=date_from, date_to=date_to)
        totals["expenses"] = _money(expenses)
        totals["net_profit"] = _money(Decimal(totals["profit"]) - expenses)
    return totals


__all__ = [
    "DEFAULT_ORDERING",
    "GROUPS",
    "ORDERINGS",
    "expenses_total",
    "grouped",
    "has_any_sale",
    "line_figures",
    "row_json",
    "sold_lines",
    "summary",
]
