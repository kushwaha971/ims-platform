"""Cache-versus-replay comparison — the one implementation behind `recalc_stock`,
the nightly `inventory.recalc_stock` job and the drift test.

Per `(item, location)`: the movements in `sequence_no` order are folded through
`services.stock.replay` (the SAME costing step the writer applies), and three
things are compared — the cached `on_hand` / `avg_cost` / `stock_value`, and
every movement row's own `on_hand_after` / `avg_cost_after` / `value_after`
(when the row carries one). The replay reads only the immutable fact columns,
never the caches it checks.

`checked` counts the `(item, location)` pairs looked at, for the nightly
summary (`apps.inventory.services.integrity.check_stock`).
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from itertools import groupby
from typing import Any

from apps.inventory.models import ItemStock, StockMovement


@dataclass(frozen=True)
class Drift:
    stock_id: Any
    item_id: Any
    location_id: Any
    cached_on_hand: Decimal
    replay_on_hand: Decimal
    cached_avg_cost: Decimal
    replay_avg_cost: Decimal
    bad_rows: int
    replay_last_sequence_no: int
    cached_stock_value: Decimal = Decimal("0.0000000")
    replay_stock_value: Decimal = Decimal("0.0000000")


def stock_drift(*, tenant_id: Any = None, item_id: Any = None) -> list[Drift]:
    """Every drifted `(item, location)`. Reads only; never corrects."""
    return stock_drift_counted(tenant_id=tenant_id, item_id=item_id)[1]


def stock_drift_counted(*, tenant_id: Any = None, item_id: Any = None) -> tuple[int, list[Drift]]:
    """`(pairs_checked, drifted)`."""
    from apps.inventory.services.stock import replay_with_value

    stocks = ItemStock.objects.all()
    movements = StockMovement.objects.all()
    if tenant_id:
        stocks = stocks.filter(tenant_id=tenant_id)
        movements = movements.filter(tenant_id=tenant_id)
    if item_id:
        stocks = stocks.filter(item_id=item_id)
        movements = movements.filter(item_id=item_id)
    cache = {(s.item_id, s.location_id): s for s in stocks}

    found: list[Drift] = []
    seen: set[tuple] = set()
    ordered = movements.order_by("item_id", "location_id", "sequence_no").iterator(chunk_size=2000)
    for pair, rows in groupby(ordered, key=lambda m: (m.item_id, m.location_id)):
        seen.add(pair)
        rows = list(rows)
        on_hand, avg, value, per_row = replay_with_value(rows)
        bad = sum(
            1
            for movement, exp_on_hand, exp_avg, exp_value in per_row
            if movement.on_hand_after != exp_on_hand
            or movement.avg_cost_after != exp_avg
            or (movement.value_after is not None and movement.value_after != exp_value)
        )
        stock = cache.get(pair)
        cached_on_hand = stock.on_hand if stock else Decimal("0.000")
        cached_avg = stock.avg_cost if stock else Decimal("0.0000")
        cached_value = stock.stock_value if stock else Decimal("0.0000000")
        last_seq = rows[-1].sequence_no
        if (
            bad
            or cached_on_hand != on_hand
            or cached_avg != avg
            or cached_value != value
            or (stock is not None and stock.last_sequence_no != last_seq)
        ):
            found.append(
                Drift(
                    stock.pk if stock else None,
                    pair[0],
                    pair[1],
                    cached_on_hand,
                    on_hand,
                    cached_avg,
                    avg,
                    bad,
                    last_seq,
                    cached_value,
                    value,
                )
            )
    zero3, zero4 = Decimal("0.000"), Decimal("0.0000")
    for pair, stock in cache.items():
        if pair not in seen and (
            stock.on_hand != 0 or stock.avg_cost != 0 or stock.stock_value != 0
        ):
            found.append(
                Drift(
                    stock.pk,
                    pair[0],
                    pair[1],
                    stock.on_hand,
                    zero3,
                    stock.avg_cost,
                    zero4,
                    0,
                    0,
                    stock.stock_value,
                    Decimal("0.0000000"),
                )
            )
    return len(seen | set(cache)), found
