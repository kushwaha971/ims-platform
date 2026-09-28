"""Item reads — list, lookup, detail, movements (INV-02 / INV-03). Selectors never write.

Stock figures come from the `inventory_item_stock` cache at the default
location (BR-3: never recomputed from movements on a list request). MVP is
single-location (INV-11 is Phase 2), so "the item's stock" is its `MAIN` row.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from django.db.models import (
    Case,
    CharField,
    Count,
    DecimalField,
    ExpressionWrapper,
    F,
    OuterRef,
    Q,
    QuerySet,
    Subquery,
    Value,
    When,
)
from django.db.models.functions import Coalesce, Round

from apps.inventory.constants import (
    MOVEMENTS_RECENT,
    ItemStatus,
    ItemType,
    MovementSource,
    MovementType,
    StockStatus,
)
from apps.inventory.models import Category, Item, ItemStock, StockAdjustment, StockMovement

QTY = DecimalField(max_digits=14, decimal_places=3)
COST = DecimalField(max_digits=14, decimal_places=4)
MONEY = DecimalField(max_digits=16, decimal_places=2)


def _stock_subquery(field: str, location_id: Any) -> Subquery:
    return Subquery(
        ItemStock.objects.filter(item=OuterRef("pk"), location_id=location_id).values(field)[:1],
        output_field=QTY if field == "on_hand" else COST,
    )


def with_stock(qs: QuerySet, *, location_id: Any) -> QuerySet:
    """Annotate `on_hand`, `avg_cost`, `stock_value`, `stock_status` (§17.6.0 tones).

    Untracked goods and services carry NULLs, which the wire sends as null and
    the list renders as "—" — a zero would claim a stock count nobody took.
    """
    tracked = Q(track_stock=True, item_type=ItemType.GOODS)
    qs = qs.annotate(
        _on_hand=Coalesce(
            _stock_subquery("on_hand", location_id), Value(Decimal("0.000")), output_field=QTY
        ),
        _avg=Coalesce(
            _stock_subquery("avg_cost", location_id), Value(Decimal("0.0000")), output_field=COST
        ),
    )
    return qs.annotate(
        on_hand=Case(When(tracked, then=F("_on_hand")), default=None, output_field=QTY),
        avg_cost=Case(When(tracked, then=F("_avg")), default=None, output_field=COST),
        stock_value=Case(
            When(
                tracked,
                then=Round(ExpressionWrapper(F("_on_hand") * F("_avg"), output_field=MONEY), 2),
            ),
            default=None,
            output_field=MONEY,
        ),
        stock_status=Case(
            When(~tracked, then=Value(None)),
            When(_on_hand__lte=0, then=Value(StockStatus.OUT)),
            When(
                reorder_point__isnull=False,
                _on_hand__lte=F("reorder_point"),
                then=Value(StockStatus.LOW),
            ),
            default=Value(StockStatus.OK),
            output_field=CharField(),
        ),
    )


def search(qs: QuerySet, q: str) -> QuerySet:
    """FR-2 — trigram-served name substring, SKU prefix, barcode prefix; `match_field`."""
    text = (q or "").strip()[:80]
    if not text:
        return qs.annotate(match_field=Value(None, output_field=CharField()))
    qs = qs.filter(Q(name__icontains=text) | Q(sku__istartswith=text) | Q(barcode__startswith=text))
    return qs.annotate(
        match_field=Case(
            When(barcode=text, then=Value("barcode")),
            When(sku__iexact=text, then=Value("sku")),
            When(name__icontains=text, then=Value("name")),
            When(sku__istartswith=text, then=Value("sku")),
            When(barcode__startswith=text, then=Value("barcode")),
            default=Value(None),
            output_field=CharField(),
        )
    )


def item_list(
    *,
    tenant: Any,
    location_id: Any,
    q: str = "",
    item_type: str | None = None,
    category_id: Any = None,
    status: str | None = ItemStatus.ACTIVE,
) -> QuerySet:
    """Every filter except `stock` — which `counts` must ignore (FR-4 delta)."""
    qs = Item.objects.filter(tenant=tenant).select_related("unit", "category")
    if status in ItemStatus.values:
        qs = qs.filter(status=status)
    if item_type in ItemType.values:
        qs = qs.filter(item_type=item_type)
    if category_id:
        # A parent category includes its children (INV-04 AC-4).
        qs = qs.filter(Q(category_id=category_id) | Q(category__parent_id=category_id))
    qs = search(qs, q)
    return with_stock(qs, location_id=location_id)


STOCK_FILTER = {
    "in": Q(stock_status=StockStatus.OK),
    "low": Q(stock_status=StockStatus.LOW),
    "out": Q(stock_status=StockStatus.OUT),
}


def filter_stock(qs: QuerySet, stock: str | None) -> QuerySet:
    return qs.filter(STOCK_FILTER[stock]) if stock in STOCK_FILTER else qs


def aggregate_values(qs: QuerySet) -> dict:
    """`{items, stock_value}` — Σ of the per-row ROUNDED values (INV-08 FR-8).

    Aggregated in an outer query over the annotated rows. `qs.aggregate(Sum(
    "stock_value"))` directly is what Django 5.2 compiles to `SUM("stock_value")`
    against the base table — the annotation's alias, not its expression — and
    Postgres answers "column does not exist" (found by the first request with
    no rows to page, which skipped nothing else).
    """
    from django.db import connection

    inner, params = qs.order_by().values("id", "stock_value").query.sql_with_params()
    with connection.cursor() as cursor:
        cursor.execute(
            f"SELECT COUNT(*), COALESCE(SUM(sub.stock_value), 0) FROM ({inner}) sub",  # noqa: S608 — inner is ORM-built
            params,
        )
        count, total = cursor.fetchone()
    return {"items": count, "stock_value": Decimal(total).quantize(Decimal("0.01"))}


def list_meta(qs_without_stock: QuerySet, qs_filtered: QuerySet) -> dict:
    """`totals` over the filtered set; `counts` over the set without `stock` (§14)."""
    counts = qs_without_stock.aggregate(
        all=Count("id"),
        **{
            key: Count("id", filter=Q(stock_status=value))
            for key, value in (
                ("in", StockStatus.OK),
                ("low", StockStatus.LOW),
                ("out", StockStatus.OUT),
            )
        },
    )
    totals = aggregate_values(qs_filtered)
    return {
        "totals": {"items": totals["items"], "stock_value": str(totals["stock_value"])},
        "counts": counts,
    }


def lookup_by_barcode(
    *, tenant: Any, location_id: Any, code: str, include_archived: bool
) -> Item | None:
    """BR-4 — exact barcode, then exact SKU; archived excluded unless asked."""
    base = Item.objects.filter(tenant=tenant).select_related("unit", "category")
    if not include_archived:
        base = base.filter(status=ItemStatus.ACTIVE)
    base = with_stock(base, location_id=location_id).annotate(match_field=Value("barcode"))
    found = base.filter(barcode=code).first()
    if found is None:
        found = base.filter(sku=code).annotate(match_field=Value("sku")).first()
    return found


def item_detail(*, tenant: Any, location_id: Any, item_id: Any) -> Item | None:
    try:
        return with_stock(
            Item.objects.filter(tenant=tenant, pk=item_id).select_related("unit", "category"),
            location_id=location_id,
        ).first()
    except (ValueError, TypeError):
        return None


def stock_rows(*, item: Item) -> list[ItemStock]:
    return list(
        ItemStock.objects.filter(item=item).select_related("location").order_by("location__code")
    )


def opening_movement(*, item: Item) -> StockMovement | None:
    return StockMovement.objects.filter(item=item, movement_type=MovementType.OPENING).first()


def movements(
    *,
    tenant: Any,
    item: Item,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    types: list[str] | None = None,
) -> QuerySet:
    """Newest ARRIVAL first — the order the running figures were written in."""
    qs = StockMovement.objects.filter(tenant=tenant, item=item).select_related("created_by")
    if date_from:
        qs = qs.filter(movement_date__gte=date_from)
    if date_to:
        qs = qs.filter(movement_date__lte=date_to)
    if types:
        qs = qs.filter(movement_type__in=types)
    return qs


def recent_movements(*, tenant: Any, item: Item) -> list[StockMovement]:
    return list(movements(tenant=tenant, item=item).order_by("-sequence_no")[:MOVEMENTS_RECENT])


def annotate_backdated(rows: list[StockMovement]) -> None:
    """`is_backdated` — dated before a movement that ARRIVED earlier.

    One query per page: the running max `movement_date` of everything older
    than the page's oldest row, then a walk up the page in arrival order.
    """
    if not rows:
        return
    by_item: dict[Any, list[StockMovement]] = {}
    for row in rows:
        by_item.setdefault((row.item_id, row.location_id), []).append(row)
    for (item_id, location_id), group in by_item.items():
        group.sort(key=lambda r: r.sequence_no)
        prior = (
            StockMovement.objects.filter(
                item_id=item_id, location_id=location_id, sequence_no__lt=group[0].sequence_no
            )
            .order_by("-movement_date")
            .values_list("movement_date", flat=True)
            .first()
        )
        high = prior
        for row in group:
            row.is_backdated = high is not None and row.movement_date < high
            if high is None or row.movement_date > high:
                high = row.movement_date


def resolve_sources(rows: list[StockMovement]) -> dict[Any, str]:
    """`source.number` for a page in one query per source type (≤ 3 queries/page)."""
    adjustment_ids = {
        row.source_id
        for row in rows
        if row.source_type == MovementSource.STOCK_ADJUSTMENT and row.source_id
    }
    if not adjustment_ids:
        return {}
    return dict(StockAdjustment.objects.filter(pk__in=adjustment_ids).values_list("id", "number"))


def category_tree(*, tenant: Any) -> list[dict]:
    """FR-4 — top-level categories with their children and live item counts."""
    rows = list(
        Category.objects.filter(tenant=tenant)
        .annotate(item_count=Count("items", filter=Q(items__deleted_at__isnull=True)))
        .order_by("sort_order", "name")
    )
    children: dict[Any, list[dict]] = {}
    for row in rows:
        if row.parent_id:
            children.setdefault(row.parent_id, []).append(
                {
                    "id": str(row.id),
                    "name": row.name,
                    "parent_id": str(row.parent_id),
                    "item_count": row.item_count,
                }
            )
    return [
        {
            "id": str(row.id),
            "name": row.name,
            "parent_id": None,
            "item_count": row.item_count,
            "children": children.get(row.id, []),
        }
        for row in rows
        if row.parent_id is None
    ]
