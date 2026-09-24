"""The movement log's guarantees (Part 32 §32.9.6 exit criteria).

- `UPDATE inventory_stock_movement` raises from the trigger, as does DELETE.
- Locks are taken in `item_id` order, and two adjustments touching the same two
  items in opposite line orders complete without deadlock.
- The cache equals a full replay — including the backdated case the spec got
  wrong (Part 42 BE-01), decided by CR-2026-09-24-INV-A — and `recalc_stock`
  reports zero drift on a large fuzzed book.
"""

from __future__ import annotations

import datetime as dt
import random
import threading
from decimal import Decimal
from io import StringIO
from typing import Any
from unittest import mock

import pytest
from django.core.management import call_command
from django.db import DatabaseError, connection, transaction

from apps.common.context import Ctx
from apps.inventory.models import ItemStock, StockMovement
from apps.inventory.selectors.drift import stock_drift
from apps.inventory.services.adjustments import post_adjustment
from apps.inventory.services.stock import MovementLine, post_movements, replay

pytestmark = pytest.mark.django_db


def adjust(ctx: Any, lines: list[tuple[Any, str, str | None]], on: dt.date | None = None) -> Any:
    return post_adjustment(
        ctx=ctx,
        payload={
            "reason": "count",
            "adjustment_date": (on or dt.date.today()).isoformat(),
            "lines": [{"item_id": str(i.id), "qty": q, "unit_cost": c} for i, q, c in lines],
        },
    )


# ── immutability ────────────────────────────────────────────────────────────


def test_update_and_delete_are_refused_by_the_database(ctx: Any, make_item: Any) -> None:
    """The trigger, not the ORM: `QuerySet.update()` never calls `Model.save()`."""
    make_item("Rice", opening=("10", "40"))
    with pytest.raises(DatabaseError, match="immutable"), transaction.atomic():
        StockMovement.objects.update(qty=Decimal("11"))
    with pytest.raises(DatabaseError, match="never deleted"), transaction.atomic():
        StockMovement.objects.all().delete()
    with pytest.raises(DatabaseError), transaction.atomic(), connection.cursor() as cursor:
        cursor.execute("UPDATE inventory_stock_movement SET avg_cost_after = 0")


def test_the_model_refuses_save_of_an_existing_row(ctx: Any, make_item: Any) -> None:
    make_item("Rice", opening=("10", "40"))
    row = StockMovement.objects.get()
    with pytest.raises(ValueError, match="immutable"):
        row.save()


# ── lock ordering (rule L2) ─────────────────────────────────────────────────


def test_stock_rows_are_locked_in_item_id_order(ctx: Any, make_item: Any) -> None:
    """The SQL that takes the locks orders by item_id, whatever the line order."""
    a, b, c = (make_item(n, opening=("5", "1")) for n in ("A", "B", "C"))
    seen: list[str] = []

    def capture(execute: Any, sql: str, params: Any, many: bool, context: Any) -> Any:
        if "FOR UPDATE" in sql and "inventory_item_stock" in sql:
            seen.append(sql)
        return execute(sql, params, many, context)

    with connection.execute_wrapper(capture):
        adjust(ctx, [(c, "-1", None), (a, "-1", None), (b, "-1", None)])
    locking = [sql for sql in seen if '"inventory_item_stock"."item_id" IN' in sql]
    assert locking, seen
    assert 'ORDER BY "inventory_item_stock"."item_id" ASC' in locking[0]


@pytest.mark.django_db(transaction=True)
def test_opposite_line_orders_do_not_deadlock(tenant: Any, main: Any, reference: Any) -> None:
    """Two threads post adjustments over the same two items in opposite orders.
    Both commit; the final on-hand is exactly the sum of what was posted."""
    from apps.inventory.services.items import create_item
    from apps.inventory.tests.conftest import unit

    ctx = Ctx.system(tenant)
    nos = str(unit("NOS").id)
    a = create_item(
        ctx=ctx,
        payload={"name": "A", "unit_id": nos, "opening_stock": {"qty": "100", "unit_cost": "1"}},
    )["item"]
    b = create_item(
        ctx=ctx,
        payload={"name": "B", "unit_id": nos, "opening_stock": {"qty": "100", "unit_cost": "1"}},
    )["item"]
    errors: list[BaseException] = []
    barrier = threading.Barrier(2)

    def worker(first: Any, second: Any) -> None:
        try:
            barrier.wait()
            for _ in range(10):
                adjust(ctx, [(first, "-1", None), (second, "-1", None)])
        except BaseException as exc:  # noqa: BLE001 — surfaced below
            errors.append(exc)
        finally:
            connection.close()

    threads = [threading.Thread(target=worker, args=pair) for pair in ((a, b), (b, a))]
    for t in threads:
        t.start()
    for t in threads:
        t.join(60)
    assert not errors, errors
    assert ItemStock.objects.get(item=a).on_hand == Decimal("80.000")
    assert ItemStock.objects.get(item=b).on_hand == Decimal("80.000")
    assert stock_drift() == []


# ── the ordering rule: the backdated case (CR-2026-09-24-INV-A) ─────────────


def test_a_backdated_inbound_between_two_outbounds_matches_the_replay(
    ctx: Any, make_item: Any
) -> None:
    """The case Part 42 BE-01 says fails: an inbound dated BEFORE two earlier-posted
    outbounds. With one order (arrival) for the cache, the row caches and the
    replay, all three agree — to the paisa — and the row says it is backdated."""
    today = dt.date.today()
    rice = make_item("Rice", opening=("10", "40", (today - dt.timedelta(days=10)).isoformat()))
    adjust(ctx, [(rice, "-3", None)], on=today - dt.timedelta(days=5))
    adjust(ctx, [(rice, "-2", None)], on=today - dt.timedelta(days=3))
    # The supplier's bill for goods that arrived a week ago is entered now.
    adjust(ctx, [(rice, "20", "46")], on=today - dt.timedelta(days=7))
    adjust(ctx, [(rice, "-4", None)], on=today)

    rows = list(StockMovement.objects.filter(item=rice).order_by("sequence_no"))
    on_hand, avg, per_row = replay(rows)
    assert (on_hand, avg) == (Decimal("21.000"), Decimal("44.8000"))  # (5×40 + 20×46)/25
    stock = ItemStock.objects.get(item=rice)
    assert (stock.on_hand, stock.avg_cost) == (on_hand, avg)
    for movement, want_on_hand, want_avg in per_row:
        assert (movement.on_hand_after, movement.avg_cost_after) == (want_on_hand, want_avg)
    assert stock_drift() == []

    from apps.inventory.selectors.items import annotate_backdated

    annotate_backdated(rows)
    assert [r.is_backdated for r in rows] == [False, False, False, True, False]


def test_quantity_as_of_a_date_is_exact_whatever_the_arrival_order(
    api_as: Any, tenant: Any, ctx: Any, make_item: Any
) -> None:
    """INV-08 historical: on-hand as of a date sums the movements DATED on or before it."""
    from django.urls import reverse

    from apps.common.constants import RoleCode

    today = dt.date.today()
    rice = make_item("Rice", opening=("10", "40", (today - dt.timedelta(days=10)).isoformat()))
    adjust(ctx, [(rice, "-3", None)], on=today - dt.timedelta(days=5))
    adjust(ctx, [(rice, "20", "46")], on=today - dt.timedelta(days=7))  # backdated
    client = api_as(tenant, RoleCode.OWNER.value)[0]
    asof = (today - dt.timedelta(days=6)).isoformat()
    body = client.get(reverse("v1:stock-summary"), {"as_of": asof}).json()
    assert body["meta"]["historical"] is True
    assert body["data"][0]["on_hand"] == "30.000"  # 10 + 20, not the −3 dated later
    before_opening = (today - dt.timedelta(days=11)).isoformat()
    assert client.get(reverse("v1:stock-summary"), {"as_of": before_opening}).json()["data"] == []


# ── recalc_stock and drift ──────────────────────────────────────────────────


def test_recalc_stock_reports_and_repairs_a_tampered_cache(ctx: Any, make_item: Any) -> None:
    rice = make_item("Rice", opening=("10", "40"))
    ItemStock.objects.filter(item=rice).update(on_hand=Decimal("99"))
    out = StringIO()
    call_command("recalc_stock", stdout=out)
    assert "1 drifted found" in out.getvalue()
    assert ItemStock.objects.get(item=rice).on_hand == Decimal("99.000")  # report-only
    call_command("recalc_stock", "--apply", stdout=StringIO())
    assert ItemStock.objects.get(item=rice).on_hand == Decimal("10.000")
    assert stock_drift() == []


def test_zero_drift_on_a_ten_thousand_movement_fuzzed_book(
    ctx: Any, make_item: Any, tenant: Any
) -> None:
    """Part 32 §32.9.6 — 10,000 movements with backdates, reversals, negatives and
    resets, posted through the real writer; the replay agrees row for row."""
    from apps.inventory.constants import MovementSource, MovementType
    from apps.platform_app.models import TenantSetting

    TenantSetting.objects.create(
        tenant=tenant, key="inventory.allow_negative_stock", value={"value": True}
    )
    rng = random.Random(20260924)
    items = [make_item(f"Item {n}") for n in range(40)]
    today = dt.date.today()
    posted = 0
    with mock.patch("apps.inventory.services.low_stock.enqueue"):
        while posted < 10_000:
            batch = rng.sample(items, 25)
            lines = []
            for index, item in enumerate(batch):
                qty = Decimal(rng.randint(-30, 40) or 1)
                cost = Decimal(rng.randint(100, 99_999)) / 100 if qty > 0 else None
                lines.append(
                    MovementLine(
                        item=item,
                        qty=qty,
                        unit_cost=cost,
                        movement_type=(
                            MovementType.ADJUST_IN if qty > 0 else MovementType.ADJUST_OUT
                        ),
                        movement_date=today - dt.timedelta(days=rng.randint(0, 400)),
                        source_type=MovementSource.STOCK_ADJUSTMENT,
                        index=index,
                    )
                )
            post_movements(ctx=ctx, lines=lines)
            posted += len(lines)
        # a few value reversals of inbounds, as a void will post them
        for original in StockMovement.objects.filter(qty__gt=0).order_by("?")[:50]:
            post_movements(
                ctx=ctx,
                lines=[
                    MovementLine(
                        item=original.item,
                        qty=-original.qty,
                        movement_type=MovementType.REVERSAL,
                        movement_date=today,
                        source_type=MovementSource.STOCK_ADJUSTMENT,
                        reverses=original,
                    )
                ],
            )
    assert StockMovement.objects.count() >= 10_000
    assert stock_drift() == []
