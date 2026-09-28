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

Rounding: `on_hand` to 3 dp; the average quantised to 4 dp ROUND_HALF_UP.
Intermediate products are never quantised — a 3-dp quantity times a 4-dp cost
would lose paisa on every receipt.

── Carry the value, derive the average (H3, the 140.0001 defect) ─────────────
The step used to rebuild the stock's value as `on_hand × avg` — a product of
the ROUNDED average — so a receipt followed by its void came back 0.0001 off
(3 @ 140, +6 @ 150 → 146.6667; void → 140.0001). The cache now carries the
value itself, `stock_value` numeric(24,7), and derives the average from it.

How each case moves the value:

- inbound with a cost, and the reversal of an outbound: + qty × cost, exactly;
- the reversal of an inbound: − |qty| × the reversed row's cost, exactly;
- an inbound without a cost: + qty × avg, exactly (the average stands);
- a plain outbound: its proportional share, `value × on_hand_after / on_hand`,
  rounded half-up to 7 dp — the average stands (§21.3.6 (2)), and so does the
  value per unit. Removing `|qty| × avg` instead would leave the rounding
  residue of the average in the remaining stock and amplify it: sell half the
  shelf and the residue per unit doubles;
- a reset, or any row that leaves on-hand ≤ 0: `on_hand × avg` — a restart,
  and an empty or negative book carries no hidden residue.

The invariant this buys, checked after every step: whenever on-hand is
positive, `q4(value / on_hand) == avg`. (If the 7-dp rounding of an outbound's
share would ever break it, the value snaps to `on_hand × avg`, which is exact
at 7 dp.) So a receipt and its reversal with nothing in between add and remove
the same exact 7-dp product, put back precisely the value that stood before,
and derive precisely the average that stood before — whatever came earlier.

A row written before value carrying (`value_after` NULL) replays with
`value = on_hand × avg`, which is what the old step computed, so pre-existing
history still replays to the figures it recorded.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from apps.common.money import half_up, q3, q4

ZERO3 = Decimal("0.000")
ZERO4 = Decimal("0.0000")
ZERO7 = Decimal("0.0000000")
SEVEN = Decimal("0.0000001")


def exact_value(value: Decimal) -> Decimal:
    """Normalise to the column's 7 dp. Every product that reaches here is exact at
    7 dp (3-dp qty × 4-dp cost), so this never rounds; it only fixes the exponent."""
    return value.quantize(SEVEN)


@dataclass(frozen=True, slots=True)
class Step:
    on_hand_after: Decimal
    avg_after: Decimal
    #: The cost the row RECORDS: entered for an inbound, the snapshot for a
    #: plain outbound, the reversed row's cost for a reversal.
    unit_cost: Decimal | None
    #: The exact stock value after this row (numeric(24,7)).
    value_after: Decimal = ZERO7


def apply_weighted_average(
    *,
    on_hand: Decimal,
    avg_cost: Decimal,
    qty: Decimal,
    unit_cost: Decimal | None,
    reversed_qty: Decimal | None = None,
    reversed_unit_cost: Decimal | None = None,
    value: Decimal | None = None,
) -> Step:
    """One step of the replay. `reversed_*` are set only for a `reversal` row.

    `value` is the carried stock value before the row; None (a caller or a
    history row that predates value carrying) means `on_hand × avg_cost`.
    """
    # The row stores qty at 3 dp and costs at 4 dp, and the replay reads the
    # stored figures; computing with anything finer would make the live step
    # and the replay disagree, and the value inexact.
    qty = q3(qty)
    unit_cost = q4(unit_cost) if unit_cost is not None else None
    reversed_unit_cost = q4(reversed_unit_cost) if reversed_unit_cost is not None else None
    if value is None:
        value = on_hand * avg_cost
    on_hand_after = q3(on_hand + qty)

    if reversed_qty is not None:
        cost = reversed_unit_cost if reversed_unit_cost is not None else avg_cost
        if reversed_qty > 0 and qty < 0:
            # Reversal of an inbound: remove the value that inbound blended in.
            if on_hand_after <= 0:
                return _settle(on_hand_after, ZERO4, q4(cost), None)
            value_after = value - (-qty) * cost
            return _settle(on_hand_after, q4(value_after / on_hand_after), q4(cost), value_after)
        # Reversal of an outbound: back in at the cost the goods left at.
        return _inbound(on_hand, value, qty, cost, on_hand_after)

    avg = q4(avg_cost)
    if qty < 0:
        # Plain outbound: the average stands and the row records it as COGS;
        # the value keeps its per-unit figure (see the module docstring).
        if on_hand <= 0 or on_hand_after <= 0:
            return _settle(on_hand_after, avg, avg, None)
        share = half_up(value * on_hand_after / on_hand, SEVEN)
        if q4(share / on_hand_after) != avg:
            share = on_hand_after * avg
        return _settle(on_hand_after, avg, avg, share)
    if unit_cost is None:
        # An inbound without a cost comes in at the average it leaves standing.
        return _settle(on_hand_after, avg, avg, value + qty * avg)
    return _inbound(on_hand, value, qty, unit_cost, on_hand_after)


def _inbound(
    on_hand: Decimal, value: Decimal, qty: Decimal, cost: Decimal, on_hand_after: Decimal
) -> Step:
    if on_hand <= 0 or on_hand_after == 0:
        # A restart, not a blend: the value is what is now on hand, at this cost.
        return _settle(on_hand_after, q4(cost), q4(cost), None)
    value_after = value + qty * cost
    return _settle(on_hand_after, q4(value_after / on_hand_after), q4(cost), value_after)


def _settle(
    on_hand_after: Decimal, avg_after: Decimal, unit_cost: Decimal, value_after: Decimal | None
) -> Step:
    """Fix the value: `on_hand × avg` when none was carried or when stock is gone."""
    if value_after is None or on_hand_after <= 0:
        value_after = on_hand_after * avg_after
    return Step(on_hand_after, avg_after, unit_cost, exact_value(value_after))
