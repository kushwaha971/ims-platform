"""INV-07 `/stock/low` and INV-08 `/stock/summary` reads.

── Historical `as_of` under CR-2026-09-24-INV-A ─────────────────────────────
On-hand as of a date is `SUM(qty) WHERE movement_date ≤ as_of` — exact and
order-independent, whatever order the movements arrived in. The average cost as
of a date is the `avg_cost_after` of the latest-ARRIVED movement dated on or
before it: the average as the book held it, which is the only average this
design ever computes. For a book with no backdated movements (every book whose
merchant enters things on the day) that is exactly the replay-by-date average;
with a backdated movement it can include a cost that arrived later but is dated
after `as_of`. The CR records the trade.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from django.db.models import (
    Case,
    CharField,
    DecimalField,
    ExpressionWrapper,
    F,
    OuterRef,
    Q,
    QuerySet,
    Subquery,
    Sum,
    Value,
    When,
)
from django.db.models.functions import Coalesce, Round

from apps.inventory.constants import ItemStatus, ItemType, StockStatus
from apps.inventory.models import Item, StockMovement
from apps.inventory.selectors.items import COST, MONEY, QTY, with_stock


def summary_queryset(
    *,
    tenant: Any,
    location_id: Any,
    as_of: dt.date | None,
    q: str = "",
    category_id: Any = None,
) -> QuerySet:
    """BR-1 — tracked goods only; archived excluded (archive requires zero stock)."""
    qs = Item.objects.filter(
        tenant=tenant, item_type=ItemType.GOODS, track_stock=True, status=ItemStatus.ACTIVE
    ).select_related("unit", "category")
    text = (q or "").strip()[:80]
    if text:
        qs = qs.filter(
            Q(name__icontains=text) | Q(sku__istartswith=text) | Q(barcode__startswith=text)
        )
    if category_id:
        qs = qs.filter(Q(category_id=category_id) | Q(category__parent_id=category_id))
    if as_of is None:
        return with_stock(qs, location_id=location_id).annotate(
            last_movement_at=Subquery(
                StockMovement.objects.filter(item=OuterRef("pk"))
                .order_by("-sequence_no")
                .values("created_at")[:1]
            )
        )

    scoped = StockMovement.objects.filter(
        item=OuterRef("pk"), location_id=location_id, movement_date__lte=as_of
    )
    qty_asof = Subquery(
        scoped.values("item").annotate(total=Sum("qty")).values("total")[:1], output_field=QTY
    )
    last = scoped.order_by("-sequence_no")
    qs = qs.annotate(
        on_hand=Coalesce(qty_asof, Value(Decimal("0.000")), output_field=QTY),
        avg_cost=Coalesce(
            Subquery(last.values("avg_cost_after")[:1], output_field=COST),
            Value(Decimal("0.0000")),
            output_field=COST,
        ),
        last_movement_at=Subquery(last.values("created_at")[:1]),
        has_history=Subquery(last.values("id")[:1]),
    ).filter(
        has_history__isnull=False
    )  # EC-1: nothing yet at that date → not listed
    return qs.annotate(
        stock_value=Round(ExpressionWrapper(F("on_hand") * F("avg_cost"), output_field=MONEY), 2),
        stock_status=Case(
            When(on_hand__lte=0, then=Value(StockStatus.OUT)),
            When(
                reorder_point__isnull=False,
                on_hand__lte=F("reorder_point"),
                then=Value(StockStatus.LOW),
            ),
            default=Value(StockStatus.OK),
            output_field=CharField(),
        ),
    )


SUMMARY_STATUS = {
    "in": Q(stock_status=StockStatus.OK),
    "low": Q(stock_status=StockStatus.LOW),
    "out": Q(stock_status=StockStatus.OUT),
    "negative": Q(on_hand__lt=0),
}


def filtered_summary(
    *,
    tenant: Any,
    location_id: Any,
    as_of: dt.date | None,
    today: dt.date,
    q: str = "",
    category_id: Any = None,
    status: str | None = None,
    hide_zero: bool = True,
    ordering: str = "name",
) -> tuple[QuerySet, bool]:
    """INV-08's list exactly as `/stock/summary` shows it: filtered and ordered.

    Returns `(queryset, historical)`. One function for both entry points — the
    screen (`StockSummaryView`) and RPT-06's file (`/reports/stock-summary`) —
    so the export is the screen (RPT-08 BR-1) by construction rather than by
    two copies of the same six filters agreeing.
    """
    historical = as_of is not None and as_of < today
    qs = summary_queryset(
        tenant=tenant,
        location_id=location_id,
        as_of=as_of if historical else None,
        q=q,
        category_id=category_id,
    )
    if status in SUMMARY_STATUS:
        qs = qs.filter(SUMMARY_STATUS[status])
    if hide_zero:
        qs = qs.exclude(on_hand=0)
    field = {"value": "stock_value"}.get(ordering.lstrip("-"), ordering.lstrip("-"))
    expr = (
        F(field).desc(nulls_last=True)
        if ordering.startswith("-")
        else F(field).asc(nulls_last=True)
    )
    return qs.order_by(expr, "name", "id"), historical


def summary_totals(qs: QuerySet) -> dict:
    """FR-8 — the total is the sum of ROUNDED rows, so it equals the rows displayed."""
    from apps.inventory.selectors.items import aggregate_values

    agg = aggregate_values(qs)
    return {"items": agg["items"], "value": str(agg["stock_value"])}


def low_stock_queryset(*, tenant: Any, location_id: Any) -> QuerySet:
    """FR-6 — low and out, out first, then by on-hand as a share of the reorder point."""
    qs = with_stock(
        Item.objects.filter(
            tenant=tenant, item_type=ItemType.GOODS, track_stock=True, status=ItemStatus.ACTIVE
        ).select_related("unit"),
        location_id=location_id,
    ).filter(stock_status__in=[StockStatus.LOW, StockStatus.OUT])
    ratio = Case(
        When(
            reorder_point__gt=0,
            then=ExpressionWrapper(
                F("on_hand") / F("reorder_point"),
                output_field=DecimalField(max_digits=20, decimal_places=6),
            ),
        ),
        default=Value(Decimal("0")),
        output_field=DecimalField(max_digits=20, decimal_places=6),
    )
    return qs.annotate(
        _out_first=Case(When(stock_status=StockStatus.OUT, then=Value(0)), default=Value(1)),
        _ratio=ratio,
    ).order_by("_out_first", "_ratio", "name", "id")


def suggested_qty(*, on_hand: Decimal, reorder_point: Decimal | None) -> Decimal:
    """§7 — `max(reorder_point × 2 − on_hand, 0)`, display only."""
    if reorder_point is None:
        return max(-on_hand, Decimal("0.000"))
    return max(reorder_point * 2 - on_hand, Decimal("0.000"))
