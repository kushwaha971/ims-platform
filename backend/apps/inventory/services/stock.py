"""`post_movements()` — the single writer of `inventory_stock_movement` (Part 20 §20.6.2).

Every quantity change in the product goes through here: opening stock (INV-05),
adjustments (INV-06) today; the purchase bill (PUR-01), the invoice (SAL-02), a
credit note and a void next sprint. A second writer would be a second copy of
the weighted-average rule and of the negative-stock policy, and the two would
first disagree on the one tenant who noticed.

── The order of operations is the safety argument ───────────────────────────
1. Ensure every `(item, location)` has a stock row (insert-or-ignore, so two
   first posts of a new item cannot both create one).
2. LOCK the stock rows `ORDER BY item_id` (Part 20 §20.11.2 rule L2). Two
   documents touching the same two items in opposite line order take the locks
   in the same order and serialise instead of deadlocking.
3. Check availability for EVERY line against the locked figures, applying
   earlier lines of the same request first (INV-06 BR-4), and refuse with all
   offending lines at once (§17.6.0) — the client highlights them together.
4. Apply the costing step (`costing.apply_weighted_average`) per line in the
   caller's order, write the movement with its running pair, move the cache.
5. Evaluate the low-stock crossing per touched item (INV-07 FR-2).

── The one ordering rule (CR-2026-09-24-INV-A) ──────────────────────────────
`sequence_no` is allocated from the locked row's `last_sequence_no`, so arrival
order is a total order per item and location, and it is the order the costing
step is applied in. A backdated movement is the next arrival like any other;
`is_backdated` on the wire is only a label, derived from `max_movement_date`.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Iterable

from django.db import transaction
from django.utils import timezone

from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation, ValidationFailed
from apps.common.money import q3
from apps.inventory.constants import (
    DEFAULT_LOCATION_CODE,
    NEGATIVE_STOCK_SETTING_KEY,
    AlertTrigger,
    ItemStatus,
    ItemType,
    MovementType,
)
from apps.inventory.models import Item, ItemStock, Location, StockMovement
from apps.inventory.services.costing import ZERO3, ZERO4, apply_weighted_average


@dataclass
class MovementLine:
    """One requested movement. `index` is the caller's line number, echoed in errors."""

    item: Item
    qty: Decimal
    movement_type: str
    movement_date: dt.date
    source_type: str
    source_id: Any = None
    unit_cost: Decimal | None = None
    reason: str | None = None
    reverses: StockMovement | None = None
    location: Location | None = None
    index: int = 0


@dataclass
class PostedLine:
    line: MovementLine
    movement: StockMovement
    on_hand_before: Decimal
    avg_cost_before: Decimal
    stock: ItemStock = field(repr=False)


def allow_negative_stock(tenant: Any) -> bool:
    """`inventory.allow_negative_stock` (§17.6.0), default False.

    Read once per post, unlocked: the setting is an owner's policy, and a policy
    changed during a post applying to the next one is correct. The value is a
    JSON blob — `{"value": true}` as onboarding writes the other booleans, or a
    bare `true` a support script might write — and anything else is False, the
    safe reading.
    """
    from apps.platform_app.models import TenantSetting

    row = TenantSetting.objects.filter(tenant=tenant, key=NEGATIVE_STOCK_SETTING_KEY).first()
    value = row.value if row is not None else None
    if isinstance(value, dict):
        value = value.get("value")
    return value is True


def default_location(tenant: Any) -> Location:
    """`MAIN`, created at onboarding (PLT-03 FR-6) — and here, if a tenant predates that."""
    location = (
        Location.objects.filter(tenant=tenant, is_default=True).order_by("created_at").first()
    )
    if location is not None:
        return location
    location, _created = Location.objects.get_or_create(
        tenant=tenant,
        code=DEFAULT_LOCATION_CODE,
        defaults={"name": "Main", "is_default": True, "is_active": True},
    )
    return location


def ensure_stock_rows(*, tenant: Any, pairs: Iterable[tuple[Any, Any]]) -> None:
    """Insert-or-ignore a zero stock row for each `(item_id, location_id)`."""
    rows = [
        ItemStock(tenant=tenant, item_id=item_id, location_id=location_id)
        for item_id, location_id in sorted(set(pairs), key=lambda p: (str(p[0]), str(p[1])))
    ]
    if rows:
        ItemStock.objects.bulk_create(rows, ignore_conflicts=True)


def lock_stock_rows(*, tenant: Any, pairs: Iterable[tuple[Any, Any]]) -> dict[tuple, ItemStock]:
    """Rule L2 — `SELECT … FOR UPDATE` in `item_id` order. Returns them keyed by pair."""
    wanted = set(pairs)
    item_ids = sorted({item_id for item_id, _loc in wanted}, key=str)
    rows = (
        ItemStock.objects.select_for_update()
        .filter(tenant=tenant, item_id__in=item_ids)
        .order_by("item_id", "location_id")
    )
    locked = {(row.item_id, row.location_id): row for row in rows}
    return {pair: locked[pair] for pair in wanted}


def validate_qty_for_unit(qty: Decimal, *, allow_decimal: bool) -> str | None:
    """§17.6.0 quantity rule — returns the field code, or None when fine."""
    if not allow_decimal and qty != qty.to_integral_value():
        return "qty_must_be_whole"
    return None


@transaction.atomic
def post_movements(
    *, ctx: Ctx, lines: list[MovementLine], allow_negative: bool | None = None
) -> list[PostedLine]:
    """Write the movements atomically. Raises 409 `insufficient_stock` for every short line."""
    if not lines:
        return []
    location = None
    for line in lines:
        if line.location is None:
            location = location or default_location(ctx.tenant)
            line.location = location
        if line.qty == 0:
            raise ValidationFailed({"qty": ["Quantity cannot be zero."]})
        item = line.item
        # Services never move stock (SAL-02 BR-19); callers filter, this refuses.
        if item.item_type != ItemType.GOODS or not item.track_stock:
            raise BusinessRuleViolation(
                "track_stock_not_allowed",
                "This item does not track stock.",
                details={"item_id": str(item.id), "index": line.index},
            )

    pairs = [(line.item.id, line.location.id) for line in lines]
    ensure_stock_rows(tenant=ctx.tenant, pairs=pairs)
    stock_rows = lock_stock_rows(tenant=ctx.tenant, pairs=pairs)

    # Items are re-read under the stock lock for the archive check: archiving
    # takes the same lock (services/items.archive_item), so the two cannot
    # interleave and move stock on an item that has just been archived.
    statuses = dict(Item.objects.filter(pk__in=[p[0] for p in pairs]).values_list("id", "status"))
    for line in lines:
        if statuses.get(line.item.id) == ItemStatus.ARCHIVED:
            raise BusinessRuleViolation(
                "item_archived",
                "This item is archived.",
                details={"item_id": str(line.item.id), "index": line.index},
            )

    if allow_negative is None:
        allow_negative = allow_negative_stock(ctx.tenant)
    running = {pair: row.on_hand for pair, row in stock_rows.items()}
    short: list[dict] = []
    for line in lines:
        pair = (line.item.id, line.location.id)
        before = running[pair]
        running[pair] = before + line.qty
        if line.qty < 0 and not allow_negative and before + line.qty < 0:
            short.append(
                {
                    "index": line.index,
                    "item_id": str(line.item.id),
                    "item_name": line.item.name,
                    "requested": str(q3(-line.qty)),
                    "available": str(q3(max(before, ZERO3))),
                    "unit_code": line.item.unit.code,
                }
            )
    if short:
        raise BusinessRuleViolation(
            "insufficient_stock",
            "Not enough stock.",
            details={"lines": short, "allow_negative_stock": False},
        )

    now = timezone.now()
    actor = ctx.actor if ctx.actor_type == "user" else None
    posted: list[PostedLine] = []
    touched: dict[tuple, ItemStock] = {}
    for line in lines:
        pair = (line.item.id, line.location.id)
        stock = stock_rows[pair]
        on_hand_before, avg_before = stock.on_hand, stock.avg_cost
        step = apply_weighted_average(
            on_hand=on_hand_before,
            avg_cost=avg_before,
            qty=line.qty,
            unit_cost=line.unit_cost,
            reversed_qty=line.reverses.qty if line.reverses is not None else None,
            reversed_unit_cost=line.reverses.unit_cost if line.reverses is not None else None,
        )
        stock.last_sequence_no += 1
        movement = StockMovement.objects.create(
            tenant=ctx.tenant,
            created_by=actor,
            item=line.item,
            location=line.location,
            sequence_no=stock.last_sequence_no,
            movement_type=line.movement_type,
            qty=q3(line.qty),
            unit_cost=step.unit_cost,
            avg_cost_after=step.avg_after,
            on_hand_after=step.on_hand_after,
            reason=line.reason,
            source_type=line.source_type,
            source_id=line.source_id,
            reverses=line.reverses,
            movement_date=line.movement_date,
        )
        stock.on_hand = step.on_hand_after
        stock.avg_cost = step.avg_after
        stock.last_movement_at = now
        if stock.max_movement_date is None or line.movement_date > stock.max_movement_date:
            stock.max_movement_date = line.movement_date
        touched[pair] = stock
        posted.append(PostedLine(line, movement, on_hand_before, avg_before, stock))

    for stock in touched.values():
        ItemStock.objects.filter(pk=stock.pk).update(
            on_hand=stock.on_hand,
            avg_cost=stock.avg_cost,
            last_movement_at=stock.last_movement_at,
            last_sequence_no=stock.last_sequence_no,
            max_movement_date=stock.max_movement_date,
            updated_at=now,
        )

    from apps.inventory.services.low_stock import evaluate_crossing

    items = {line.item.id: line.item for line in lines}
    for (item_id, _location_id), stock in touched.items():
        evaluate_crossing(ctx=ctx, item=items[item_id], stock=stock, trigger=AlertTrigger.MOVEMENT)
    return posted


def post_movement(
    *, ctx: Ctx, line: MovementLine, allow_negative: bool | None = None
) -> PostedLine:
    """The one-line form of `post_movements`, for callers with a single movement."""
    return post_movements(ctx=ctx, lines=[line], allow_negative=allow_negative)[0]


def replay(movements: Iterable[StockMovement]) -> tuple[Decimal, Decimal, list[tuple]]:
    """`recalc_stock`'s authority: fold the costing step over rows in `sequence_no` order.

    Returns `(on_hand, avg_cost, per_row)` where `per_row` is
    `(movement, expected_on_hand_after, expected_avg_after)`. A pure function of
    the immutable columns — it never reads the caches it is checking.
    """
    on_hand, avg = ZERO3, ZERO4
    per_row: list[tuple] = []
    by_id: dict[Any, StockMovement] = {}
    for movement in movements:
        reversed_row = by_id.get(movement.reverses_id) if movement.reverses_id else None
        step = apply_weighted_average(
            on_hand=on_hand,
            avg_cost=avg,
            qty=movement.qty,
            unit_cost=movement.unit_cost if movement.qty > 0 else None,
            reversed_qty=reversed_row.qty if reversed_row is not None else None,
            reversed_unit_cost=reversed_row.unit_cost if reversed_row is not None else None,
        )
        on_hand, avg = step.on_hand_after, step.avg_after
        per_row.append((movement, on_hand, avg))
        by_id[movement.id] = movement
    return on_hand, avg, per_row


__all__ = [
    "MovementLine",
    "PostedLine",
    "MovementType",
    "allow_negative_stock",
    "default_location",
    "post_movement",
    "post_movements",
    "replay",
]
