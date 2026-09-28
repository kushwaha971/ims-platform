"""The weighted-average step (Part 21 §21.3.6 (2), normative).

A pure function of one movement and the pair before it. `post_movements`
applies it inside the locked section; `recalc_stock` applies the SAME function
to every row in `sequence_no` order. Two callers of one function is what makes
"the cache equals the replay" a property rather than a hope.

| Case                      | Condition                                  | avg after                                  |
|---------------------------|--------------------------------------------|--------------------------------------------|
| Inbound with a cost       | qty > 0, cost given, on_hand > 0           | (on_hand×avg + qty×cost) / (on_hand + qty) |
| Inbound, reset            | qty > 0, cost given, on_hand ≤ 0           | cost — a restart, not a blend              |
| Inbound without a cost    | qty > 0, cost None                         | unchanged                                  |
| Plain outbound            | qty < 0, not a reversal                    | unchanged (row snapshots avg as its cost)  |
| Reversal of an inbound    | qty < 0, reverses a qty > 0 row at cost c  | (on_hand×avg − |qty|×c) / (on_hand − |qty|); 0 when on_hand after ≤ 0 |
| Reversal of an outbound   | qty > 0, reverses a qty < 0 row at cost c  | as an inbound at c                         |

Rounding: the numerator at full Decimal precision, the quotient quantised to
4 dp ROUND_HALF_UP; `on_hand` to 3 dp. Intermediate products are never
quantised — a 3-dp quantity times a 4-dp cost would lose paisa on every receipt.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from apps.common.money import q3, q4

ZERO3 = Decimal("0.000")
ZERO4 = Decimal("0.0000")


@dataclass(frozen=True, slots=True)
class Step:
    on_hand_after: Decimal
    avg_after: Decimal
    #: The cost the row RECORDS: entered for an inbound, the snapshot for a
    #: plain outbound, the reversed row's cost for a reversal.
    unit_cost: Decimal | None


def apply_weighted_average(
    *,
    on_hand: Decimal,
    avg_cost: Decimal,
    qty: Decimal,
    unit_cost: Decimal | None,
    reversed_qty: Decimal | None = None,
    reversed_unit_cost: Decimal | None = None,
) -> Step:
    """One step of the replay. `reversed_*` are set only for a `reversal` row."""
    on_hand_after = q3(on_hand + qty)

    if reversed_qty is not None:
        cost = reversed_unit_cost if reversed_unit_cost is not None else avg_cost
        if reversed_qty > 0 and qty < 0:
            # Reversal of an inbound: remove the value that inbound blended in.
            if on_hand_after <= 0:
                return Step(on_hand_after, ZERO4, q4(cost))
            value = on_hand * avg_cost - (-qty) * cost
            return Step(on_hand_after, q4(value / on_hand_after), q4(cost))
        # Reversal of an outbound: back in at the cost the goods left at.
        return _inbound(on_hand, avg_cost, qty, cost, on_hand_after)

    if qty < 0:
        return Step(on_hand_after, q4(avg_cost), q4(avg_cost))
    if unit_cost is None:
        return Step(on_hand_after, q4(avg_cost), q4(avg_cost))
    return _inbound(on_hand, avg_cost, qty, unit_cost, on_hand_after)


def _inbound(
    on_hand: Decimal, avg_cost: Decimal, qty: Decimal, cost: Decimal, on_hand_after: Decimal
) -> Step:
    if on_hand <= 0 or on_hand_after == 0:
        return Step(on_hand_after, q4(cost), q4(cost))
    value = on_hand * avg_cost + qty * cost
    return Step(on_hand_after, q4(value / (on_hand + qty)), q4(cost))
