"""INV-07 — low-stock crossings, stored as a state transition (Part 32 §32.9.7).

The crossing is a TRANSITION, not a predicate. `inventory_item_stock.alert_level`
holds the level an item was last evaluated at (`ok` / `low` / `out`); every
movement, every reorder-point edit and the nightly scan compute the level now
and compare. A move to a WORSE level is a crossing: one `LowStockAlert` row is
written in the same transaction and one `inventory.low_stock_notify` job is
enqueued for it. A level that merely persists — the scan finding the same low
item every night, a second sale while already low — writes nothing. A move to a
better level updates the stored state silently, which is what re-arms the next
crossing (AC-2: rise to 20, fall to 5, a new alert).

This replaces FR-4's "compare to MAX(created_at) of movements above the
reorder point" query with one stored column, which Part 32 §32.9.4 asks for by
name ("the crossing-state field"). `LowStockAlert` is the evidence.

── The notification hand-off (the notifications inbox is another track) ─────
Inventory may not import `notifications` (Part 20 §20.1.4). So the job calls
every function registered through `register_low_stock_sink()`, passing a plain
`LowStockEvent`; the notifications app registers its inbox writer from its own
`AppConfig.ready()` with a deferred import. Until something registers, the
alert rows stand on their own and `notified_at` stays null, so a sink wired
later can backfill every crossing it missed.
"""

from __future__ import annotations

import logging
from dataclasses import asdict, dataclass
from decimal import Decimal
from typing import Any, Callable

from django.db import transaction
from django.utils import timezone

from apps.common.context import Ctx
from apps.common.jobs import enqueue
from apps.inventory.constants import ALERT_SEVERITY, AlertLevel, ItemStatus, ItemType
from apps.inventory.models import Item, ItemStock, LowStockAlert

logger = logging.getLogger("ub.inventory")

NOTIFY_JOB = "inventory.low_stock_notify"


@dataclass(frozen=True)
class LowStockEvent:
    """What a sink receives. Strings throughout — it may be serialised anywhere."""

    alert_id: str
    tenant_id: str
    item_id: str
    item_name: str
    sku: str
    unit_code: str
    level: str  # "low" | "out"
    on_hand: str
    reorder_point: str | None
    trigger: str
    route: str

    def as_dict(self) -> dict:
        return asdict(self)


LowStockSink = Callable[[LowStockEvent], None]
_SINKS: list[LowStockSink] = []


def register_low_stock_sink(sink: LowStockSink) -> None:
    """Idempotent: registering the same function twice registers it once."""
    if sink not in _SINKS:
        _SINKS.append(sink)


def unregister_low_stock_sink(sink: LowStockSink) -> None:
    if sink in _SINKS:
        _SINKS.remove(sink)


def registered_sinks() -> tuple[LowStockSink, ...]:
    return tuple(_SINKS)


def level_for(*, on_hand: Decimal, reorder_point: Decimal | None) -> str:
    """BR-1 — thresholds inclusive: ≤ 0 is out, ≤ reorder point is low."""
    if on_hand <= 0:
        return AlertLevel.OUT
    if reorder_point is not None and on_hand <= reorder_point:
        return AlertLevel.LOW
    return AlertLevel.OK


def evaluate_crossing(
    *, ctx: Ctx, item: Item, stock: ItemStock, trigger: str
) -> LowStockAlert | None:
    """Compare the level now with the stored one; alert on a worsening.

    The caller holds the stock row's lock (a movement post, an item edit, the
    scan), so two evaluations of one item cannot both see the old level.
    """
    if item.item_type != ItemType.GOODS or not item.track_stock or item.status != ItemStatus.ACTIVE:
        return None
    new_level = level_for(on_hand=stock.on_hand, reorder_point=item.reorder_point)
    old_level = stock.alert_level
    if new_level == old_level:
        return None
    now = timezone.now()
    ItemStock.objects.filter(pk=stock.pk).update(alert_level=new_level, alert_level_changed_at=now)
    stock.alert_level = new_level
    stock.alert_level_changed_at = now
    if ALERT_SEVERITY[new_level] <= ALERT_SEVERITY[old_level]:
        return None  # better, not worse: re-arms the next crossing, notifies nothing
    alert = LowStockAlert.objects.create(
        tenant=ctx.tenant,
        item=item,
        location_id=stock.location_id,
        level=new_level,
        on_hand=stock.on_hand,
        reorder_point=item.reorder_point,
        trigger=trigger,
    )
    enqueue(
        job_type=NOTIFY_JOB,
        payload={"alert_id": str(alert.id)},
        tenant=ctx.tenant,
        idempotency_token=f"low_stock:{alert.id}",
        request_id=ctx.request_id,
    )
    return alert


def initialise_level(*, item: Item, stock: ItemStock) -> None:
    """Set the stored level without alerting — for a row that has never crossed.

    A new tracked item with no opening stock is at 0, which is "out", but it
    never went out: nothing was ever there. Alerting on creation would be a
    notification for every item a merchant types in.
    """
    level = level_for(on_hand=stock.on_hand, reorder_point=item.reorder_point)
    if stock.alert_level != level:
        ItemStock.objects.filter(pk=stock.pk).update(alert_level=level)
        stock.alert_level = level


def event_for(alert: LowStockAlert) -> LowStockEvent:
    item = alert.item
    return LowStockEvent(
        alert_id=str(alert.id),
        tenant_id=str(alert.tenant_id),
        item_id=str(item.id),
        item_name=item.name,
        sku=item.sku,
        unit_code=item.unit.code,
        level=alert.level,
        on_hand=str(alert.on_hand),
        reorder_point=str(alert.reorder_point) if alert.reorder_point is not None else None,
        trigger=alert.trigger,
        route=f"/items/{item.id}",
    )


def deliver_alert(alert_id: Any) -> dict:
    """The job body: hand one alert to every sink, exactly once.

    Idempotent on the alert (the job's own token is `low_stock:<alert id>`):
    the row is locked, the sinks run and `notified_at` is stamped in ONE
    transaction. A sink writes inside that transaction (`notify()` does), so a
    retried or duplicated job either sees `notified_at` set and returns, or
    finds the whole earlier attempt rolled back — never a delivered-but-
    unstamped alert that would notify twice.
    """
    with transaction.atomic():
        alert = (
            LowStockAlert.objects.select_for_update(of=("self",))
            .select_related("item", "item__unit")
            .filter(pk=alert_id)
            .first()
        )
        if alert is None:
            return {"delivered": 0, "reason": "missing"}
        if alert.notified_at is not None:
            return {"delivered": 0, "reason": "already_notified"}
        sinks = registered_sinks()
        if not sinks:
            # Not an error: the crossing is recorded, and a sink wired later finds
            # every alert with `notified_at IS NULL`.
            return {"delivered": 0, "reason": "no_sink"}
        event = event_for(alert)
        for sink in sinks:
            sink(event)
        LowStockAlert.objects.filter(pk=alert.pk, notified_at__isnull=True).update(
            notified_at=timezone.now(), sinks_delivered=len(sinks)
        )
    return {"delivered": len(sinks)}


def scan_low_stock(*, tenant: Any = None) -> dict:
    """FR-5 — evaluate every tracked active item; alert only on a worsening.

    Each row is re-read under its lock in its own short transaction, so a scan
    of ten thousand items never holds ten thousand locks, and a movement posted
    mid-scan is evaluated by exactly one of the two.
    """
    from apps.inventory.constants import AlertTrigger

    rows = ItemStock.objects.filter(
        item__item_type=ItemType.GOODS,
        item__track_stock=True,
        item__status=ItemStatus.ACTIVE,
        item__deleted_at__isnull=True,
    ).order_by("item_id")
    if tenant is not None:
        rows = rows.filter(tenant=tenant)
    checked = alerted = 0
    for pk in rows.values_list("pk", flat=True).iterator(chunk_size=500):
        with transaction.atomic():
            stock = (
                ItemStock.objects.select_for_update().select_related("item", "tenant").get(pk=pk)
            )
            checked += 1
            ctx = Ctx.system(stock.tenant, job="inventory.scan_low_stock")
            if evaluate_crossing(ctx=ctx, item=stock.item, stock=stock, trigger=AlertTrigger.SCAN):
                alerted += 1
    logger.info("inventory.scan_low_stock", extra={"checked": checked, "alerted": alerted})
    return {"checked": checked, "alerted": alerted}
