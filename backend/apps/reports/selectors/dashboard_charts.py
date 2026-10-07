"""The dashboard's graphs — what the competitors lead with, from the same books.

Owner, 6 Oct 2026: "see how on dashboard that competitors showing graph, want
that as well", then "via graph user able to see sales, profit, purchase, based
on day, monthly, week, year, all time". Vyapar's sale graph, myBillBook's sales
report and Zoho's income-and-expense chart all do the same two things: a RANGE
(this month, this financial year, custom…) and a GROUPING (daily, weekly,
monthly, yearly). This module is that, over our books:

* **The trend**: sales, purchases, gross profit and expenses per bucket.
  - Sales net of credit notes on the date each note was issued (RPT-01 BR-2,
    the Today's sales tile's rule); drafts, voids and estimates are not sales.
  - Purchases are recorded bills.
  - Gross profit is `invoice_profit`'s arithmetic summed: taxable value of
    what stayed sold minus the cost written onto the line at issue. A line
    whose cost was never known is left out of BOTH sides and counted in
    `uncosted_lines`, so the figure is never better than its data.
  - Expenses are recorded expenses by their date, paid or not (accrual, the
    same basis as sales and purchases).
* **Money in and out**: receipts in; payouts plus PAID expenses out — the day
  book's cash terms, so a bar and the day book cannot disagree.
* **Top items** (by value or quantity) and **top customers**, over the range.
* **Receivables by age**, LED-09's buckets as of the range's last day.

Every series is a separate permission (§12) and an unreadable one is ABSENT,
never zero: a cashier shown "₹0 purchases" is told something false. Profit
and expenses need `reports.financial.read` (INV-08 EC-4).

Buckets are complete — a day with no sale is a zero bar, not a missing one —
and capped at `MAX_BUCKETS`, so "all time by day" is refused with a reason
rather than drawn as a thousand slivers.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from django.db.models import DateField, DecimalField, ExpressionWrapper, F, Min, Sum
from django.db.models.functions import Coalesce, TruncDay, TruncMonth, TruncWeek, TruncYear

from apps.common.money import ZERO
from apps.reports.constants import (
    CREDIT_NOTE_KIND,
    CREDIT_NOTE_LIVE_STATUSES,
    DRAFT,
    SALE_KINDS,
    VOID,
)

_MONEY = DecimalField(max_digits=18, decimal_places=2)
_WIDE = DecimalField(max_digits=24, decimal_places=6)

#: The ranges the dashboard offers. "custom" takes a from–to of at most
#: `CUSTOM_MAX_DAYS`; "all" runs from the business's first dated record.
RANGES: tuple[str, ...] = (
    "7d",
    "30d",
    "month",
    "last_month",
    "quarter",
    "fy",
    "last_fy",
    "12m",
    "all",
    "custom",
)
GROUPS: tuple[str, ...] = ("day", "week", "month", "year")
DEFAULT_RANGE = "7d"
CUSTOM_MAX_DAYS = 3660
#: More bars than this is noise on a 360 px phone and a slow query on a desk.
MAX_BUCKETS = 120
METRICS: tuple[str, ...] = ("sales", "purchases", "profit", "expenses")
TOP_LIMIT = 5

_TRUNC = {"day": TruncDay, "week": TruncWeek, "month": TruncMonth, "year": TruncYear}


class ChartRequestError(ValueError):
    """A range or grouping the reader can fix; `field` names the control."""

    def __init__(self, field: str, message: str) -> None:
        super().__init__(message)
        self.field = field


def _money(value: Decimal | None) -> str:
    return str((value or ZERO).quantize(Decimal("0.01")))


def _month_start(day: dt.date, back: int) -> dt.date:
    """The first of the month `back` months before `day`'s month (negative: after)."""
    index = day.year * 12 + (day.month - 1) - back
    return dt.date(index // 12, index % 12 + 1, 1)


def _first_record(tenant: Any) -> dt.date | None:
    """The earliest dated sale, purchase, payment or expense — "all time" starts there."""
    from apps.expenses.models import Expense
    from apps.payments.models import Payment
    from apps.purchases.models import PurchaseDocument
    from apps.sales.models import SalesDocument

    firsts = [
        SalesDocument.objects.filter(tenant=tenant)
        .exclude(status=DRAFT)
        .aggregate(d=Min("document_date"))["d"],
        PurchaseDocument.objects.filter(tenant=tenant)
        .exclude(status=DRAFT)
        .aggregate(d=Min("document_date"))["d"],
        Payment.objects.filter(tenant=tenant).aggregate(d=Min("payment_date"))["d"],
        Expense.objects.filter(tenant=tenant).aggregate(d=Min("expense_date"))["d"],
    ]
    known = [day for day in firsts if day is not None]
    return min(known) if known else None


def default_group(first: dt.date, last: dt.date) -> str:
    """The grouping a range opens on: days for a month, weeks for a quarter, then months, years."""
    days = (last - first).days + 1
    if days <= 31:
        return "day"
    if days <= 92:
        return "week"
    if days <= 3 * 366:
        return "month"
    return "year"


def window(
    range_: str,
    today: dt.date,
    *,
    tenant: Any = None,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
) -> tuple[dt.date, dt.date]:
    """The inclusive first and last day of a range."""
    from apps.common.dates import fy_bounds

    if range_ == "7d":
        return today - dt.timedelta(days=6), today
    if range_ == "30d":
        return today - dt.timedelta(days=29), today
    if range_ == "month":
        return today.replace(day=1), today
    if range_ == "last_month":
        first = _month_start(today, 1)
        return first, today.replace(day=1) - dt.timedelta(days=1)
    if range_ == "quarter":
        return _month_start(today, (today.month - 1) % 3), today
    if range_ == "12m":
        return _month_start(today, 11), today
    if range_ == "fy":
        return fy_bounds(tenant, today)[0], today
    if range_ == "last_fy":
        this_start = fy_bounds(tenant, today)[0]
        return fy_bounds(tenant, this_start - dt.timedelta(days=1))
    if range_ == "all":
        first = _first_record(tenant) if tenant is not None else None
        return min(first or today, today), today
    if date_from is None or date_to is None:
        raise ChartRequestError("from", "Choose a from and a to date.")
    if date_from > date_to:
        raise ChartRequestError("from", "The from date is after the to date.")
    if date_to > today:
        raise ChartRequestError("to", "The to date cannot be in the future.")
    if (date_to - date_from).days + 1 > CUSTOM_MAX_DAYS:
        raise ChartRequestError("from", "Choose at most ten years.")
    return date_from, date_to


def _bucket_of(day: dt.date, group: str) -> dt.date:
    if group == "day":
        return day
    if group == "week":
        return day - dt.timedelta(days=day.weekday())  # ISO week: Monday
    if group == "month":
        return day.replace(day=1)
    return day.replace(month=1, day=1)


def bucket_starts(first: dt.date, last: dt.date, group: str) -> list[dt.date]:
    """Oldest first: the start of every bucket that touches `first`…`last`."""
    starts: list[dt.date] = []
    cursor = _bucket_of(first, group)
    while cursor <= last:
        starts.append(cursor)
        if group == "day":
            cursor += dt.timedelta(days=1)
        elif group == "week":
            cursor += dt.timedelta(days=7)
        elif group == "month":
            cursor = _month_start(cursor, -1)
        else:
            cursor = cursor.replace(year=cursor.year + 1)
    return starts


def _series(rows: Any, starts: list[dt.date]) -> list[Decimal]:
    """Grouped rows `{period_start, total}` laid onto every bucket, zeros filled in."""
    found: dict[dt.date, Decimal] = {}
    for row in rows:
        key = row["period_start"]
        key = key.date() if isinstance(key, dt.datetime) else key
        found[key] = found.get(key, ZERO) + (row["total"] or ZERO)
    return [found.get(start, ZERO) for start in starts]


def _grouped(queryset: Any, date_field: str, amount: Any, group: str) -> Any:
    return (
        queryset.annotate(period_start=_TRUNC[group](date_field, output_field=DateField()))
        .values("period_start")
        .annotate(total=Coalesce(Sum(amount), Decimal("0.00"), output_field=_MONEY))
        .order_by()
    )


class _Span:
    """One range, grouped: what every series below is computed over."""

    def __init__(self, tenant: Any, first: dt.date, last: dt.date, group: str) -> None:
        self.tenant, self.first, self.last, self.group = tenant, first, last, group
        self.starts = bucket_starts(first, last, group)

    def between(self, field: str) -> dict[str, dt.date]:
        return {f"{field}__gte": self.first, f"{field}__lte": self.last}


def sales_series(span: _Span) -> list[Decimal]:
    from apps.sales.models import SalesDocument

    in_range = SalesDocument.objects.filter(tenant=span.tenant, **span.between("document_date"))
    sold = in_range.filter(kind__in=SALE_KINDS).exclude(status__in=(DRAFT, VOID))
    credited = in_range.filter(kind=CREDIT_NOTE_KIND, status__in=CREDIT_NOTE_LIVE_STATUSES)
    sold_series = _series(_grouped(sold, "document_date", "grand_total", span.group), span.starts)
    credit_series = _series(
        _grouped(credited, "document_date", "grand_total", span.group), span.starts
    )
    return [s - c for s, c in zip(sold_series, credit_series, strict=True)]


def purchase_series(span: _Span) -> list[Decimal]:
    from apps.purchases.models import PurchaseDocument

    bills = PurchaseDocument.objects.filter(
        tenant=span.tenant, **span.between("document_date")
    ).exclude(status__in=(DRAFT, VOID))
    return _series(_grouped(bills, "document_date", "grand_total", span.group), span.starts)


def profit_series(span: _Span) -> tuple[list[Decimal], int]:
    """Gross profit per bucket by bill date, and how many lines had no cost to count."""
    # The profit report's own line arithmetic, so the graph and the report agree.
    from apps.reports.selectors.profit import line_figures, sold_lines

    lines = sold_lines(tenant=span.tenant, date_from=span.first, date_to=span.last)
    fig = line_figures()
    margin = ExpressionWrapper(fig["costed_sale"] - fig["cost"], output_field=_WIDE)
    rows = _grouped(lines, "document__document_date", margin, span.group)
    uncosted = lines.filter(unit_cost_snapshot__isnull=True).count()
    return _series(rows, span.starts), uncosted


def expense_series(span: _Span) -> list[Decimal]:
    from apps.expenses.models import Expense

    expenses = Expense.objects.filter(tenant=span.tenant, **span.between("expense_date")).exclude(
        status="void"
    )
    return _series(_grouped(expenses, "expense_date", "amount", span.group), span.starts)


def money_series(span: _Span) -> tuple[list[Decimal], list[Decimal]]:
    """Receipts in; payouts and PAID expenses out. Voids are not money."""
    from apps.expenses.models import Expense
    from apps.payments.models import Payment

    payments = Payment.objects.filter(tenant=span.tenant, **span.between("payment_date")).exclude(
        status="void"
    )
    money_in = _series(
        _grouped(payments.filter(direction="in"), "payment_date", "amount", span.group),
        span.starts,
    )
    paid_out = _series(
        _grouped(payments.filter(direction="out"), "payment_date", "amount", span.group),
        span.starts,
    )
    paid_expenses = Expense.objects.filter(
        tenant=span.tenant, paid=True, **span.between("expense_date")
    ).exclude(status="void")
    spent = _series(_grouped(paid_expenses, "expense_date", "amount", span.group), span.starts)
    return money_in, [p + e for p, e in zip(paid_out, spent, strict=True)]


def top_items(span: _Span, *, by: str = "value") -> list[dict[str, Any]]:
    """The items that sold the most — by value before GST, or by quantity. Free text is no item."""
    from apps.sales.models import SalesDocumentLine

    order = "-qty_total" if by == "qty" else "-total"
    rows = (
        SalesDocumentLine.objects.filter(
            document__tenant=span.tenant,
            document__kind__in=SALE_KINDS,
            document__document_date__gte=span.first,
            document__document_date__lte=span.last,
            item__isnull=False,
        )
        .exclude(document__status__in=(DRAFT, VOID))
        .values("item_id", name=F("item__name"), unit=F("item__unit__code"))
        .annotate(total=Sum("taxable_value"), qty_total=Sum("qty"))
        .order_by(order, "name")[:TOP_LIMIT]
    )
    return [
        {
            "id": str(row["item_id"]),
            "name": row["name"],
            "amount": _money(row["total"]),
            "qty": str(row["qty_total"]),
            "unit": row["unit"],
        }
        for row in rows
        if row["total"] and row["total"] > 0
    ]


def top_customers(span: _Span) -> list[dict[str, Any]]:
    """The parties billed the most in the range. Walk-in sales have nobody to rank."""
    from apps.sales.models import SalesDocument

    rows = (
        SalesDocument.objects.filter(
            tenant=span.tenant,
            kind__in=SALE_KINDS,
            party__isnull=False,
            **span.between("document_date"),
        )
        .exclude(status__in=(DRAFT, VOID))
        .values("party_id", name=F("party__name"))
        .annotate(total=Sum("grand_total"))
        .order_by("-total", "name")[:TOP_LIMIT]
    )
    return [
        {"id": str(row["party_id"]), "name": row["name"], "amount": _money(row["total"])}
        for row in rows
        if row["total"] and row["total"] > 0
    ]


def receivable_aging(*, tenant: Any, as_of: dt.date) -> list[dict[str, str]]:
    from apps.ledger.selectors.aging import BUCKET_KEYS, aging_rows, aging_totals

    totals = aging_totals(aging_rows(tenant=tenant, as_of=as_of, kind="receivable"))
    return [{"key": key, "amount": _money(totals[key])} for key in BUCKET_KEYS]


def _block(dates: list[str], series: dict[str, list[Decimal]]) -> dict[str, Any]:
    return {
        "series": list(series),
        "points": [
            {"date": date, **{name: _money(values[index]) for name, values in series.items()}}
            for index, date in enumerate(dates)
        ],
        "totals": {name: _money(sum(values, ZERO)) for name, values in series.items()},
    }


def dashboard_charts(
    *,
    tenant: Any,
    today: dt.date,
    range_: str,
    granted: frozenset[str],
    modules: frozenset[str],
    group: str | None = None,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    top_by: str = "value",
) -> dict[str, Any]:
    """The reader's graphs for a range and grouping; a series they may not read is absent."""
    first, last = window(range_, today, tenant=tenant, date_from=date_from, date_to=date_to)
    group = group or default_group(first, last)
    span = _Span(tenant, first, last, group)
    if len(span.starts) > MAX_BUCKETS:
        raise ChartRequestError(
            "group", f"That is {len(span.starts)} bars — group by a longer step."
        )
    dates = [start.isoformat() for start in span.starts]
    financial = "reports.financial.read" in granted
    sales_ok = "sales.invoice.read" in granted
    body: dict[str, Any] = {
        "range": range_,
        "group": group,
        "from": first.isoformat(),
        "to": last.isoformat(),
    }

    trend: dict[str, list[Decimal]] = {}
    if sales_ok:
        trend["sales"] = sales_series(span)
    if "purchases.bill.read" in granted:
        trend["purchases"] = purchase_series(span)
    if sales_ok and financial:
        trend["profit"], body["uncosted_lines"] = profit_series(span)
    if financial and "expenses" in modules:
        trend["expenses"] = expense_series(span)
    if trend:
        body["trend"] = _block(dates, trend)

    # The cash tile's rule: a sum over payments AND expenses, so with either off
    # it would be a figure missing half its terms.
    if financial and {"payments", "expenses"} <= modules:
        money_in, money_out = money_series(span)
        body["money"] = _block(dates, {"in": money_in, "out": money_out})

    if sales_ok:
        body["top_items"] = top_items(span, by=top_by)
        if "parties.party.read" in granted:
            body["top_customers"] = top_customers(span)
    if "parties.party.read" in granted:
        body["receivable_aging"] = receivable_aging(tenant=tenant, as_of=last)
    return body


__all__ = [
    "DEFAULT_RANGE",
    "GROUPS",
    "MAX_BUCKETS",
    "METRICS",
    "RANGES",
    "ChartRequestError",
    "bucket_starts",
    "dashboard_charts",
    "default_group",
    "window",
]
