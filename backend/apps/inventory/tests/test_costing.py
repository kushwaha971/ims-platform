"""The weighted-average step, paisa-exact (Part 21 §21.3.6 (2); Part 32 §32.9.6).

Pure-function tests: no database. The worked example is §17.6.0's table, row for
row, including the `on_hand ≤ 0` reset that a naive blend gets wrong.
"""

from __future__ import annotations

from decimal import Decimal as D

import pytest

from apps.inventory.services.costing import apply_weighted_average

# (qty, unit_cost-or-None-for-outbound, expected on_hand after, expected avg after)
WORKED_EXAMPLE = [
    ("10", "40.0000", "10.000", "40.0000"),  # 1 opening, reset from 0
    ("20", "46.0000", "30.000", "44.0000"),  # 2 purchase: 1320/30
    ("-25", None, "5.000", "44.0000"),  # 3 sale, unchanged
    ("-8", None, "-3.000", "44.0000"),  # 4 damage into negative (allowed for the table)
    ("12", "50.0000", "9.000", "50.0000"),  # 5 purchase with on_hand ≤ 0: RESET, not blend
    ("-4", None, "5.000", "50.0000"),  # 6 purchase return
    ("3", "41.0000", "8.000", "46.6250"),  # 7 purchase: 373/8
]


def test_the_worked_example_of_17_6_0_row_for_row() -> None:
    """Protects the normative formula, above all the reset in row 5: averaging
    −3 × 44 into the new cost would give 51.5556, a number nobody paid."""
    on_hand, avg = D("0.000"), D("0.0000")
    for qty, cost, want_on_hand, want_avg in WORKED_EXAMPLE:
        step = apply_weighted_average(
            on_hand=on_hand, avg_cost=avg, qty=D(qty), unit_cost=D(cost) if cost else None
        )
        on_hand, avg = step.on_hand_after, step.avg_after
        assert (str(on_hand), str(avg)) == (want_on_hand, want_avg), qty


def test_a_plain_outbound_snapshots_the_average_as_its_cost() -> None:
    """COGS is frozen at issue: the row records the average it left at."""
    step = apply_weighted_average(
        on_hand=D("5"), avg_cost=D("44.0000"), qty=D("-3"), unit_cost=D("99")
    )
    assert step.unit_cost == D("44.0000")
    assert step.avg_after == D("44.0000")


def test_an_inbound_without_a_cost_leaves_the_average() -> None:
    step = apply_weighted_average(on_hand=D("5"), avg_cost=D("44.0000"), qty=D("2"), unit_cost=None)
    assert step.avg_after == D("44.0000")
    assert step.on_hand_after == D("7.000")


def test_rounding_is_half_up_on_the_quotient_only() -> None:
    """The numerator is exact; only the quotient is quantised. (10×0 + 20×50)/30 =
    33.33333… → 33.3333 (INV-05 EC-1), and 1/3-weighted costs never drift a paisa."""
    step = apply_weighted_average(on_hand=D("10"), avg_cost=D("0"), qty=D("20"), unit_cost=D("50"))
    assert step.avg_after == D("33.3333")
    half = apply_weighted_average(
        on_hand=D("1"), avg_cost=D("0.0001"), qty=D("1"), unit_cost=D("0.0000")
    )
    assert half.avg_after == D("0.0001")  # 0.00005 rounds UP, never to even


def test_reversing_an_inbound_removes_the_value_it_blended_in() -> None:
    """BE-02: a voided bill must take its cost back out of the average. 10 @ 40 then
    10 @ 400 (typo) → 220; reversing the typo returns exactly to 40."""
    step = apply_weighted_average(
        on_hand=D("20"),
        avg_cost=D("220.0000"),
        qty=D("-10"),
        unit_cost=None,
        reversed_qty=D("10"),
        reversed_unit_cost=D("400.0000"),
    )
    assert (step.on_hand_after, step.avg_after, step.unit_cost) == (
        D("10.000"),
        D("40.0000"),
        D("400.0000"),
    )


def test_reversing_an_inbound_to_zero_zeroes_the_average() -> None:
    step = apply_weighted_average(
        on_hand=D("10"),
        avg_cost=D("40"),
        qty=D("-10"),
        unit_cost=None,
        reversed_qty=D("10"),
        reversed_unit_cost=D("40"),
    )
    assert step.avg_after == D("0.0000")


def test_reversing_an_outbound_comes_back_at_the_cost_it_left_at() -> None:
    step = apply_weighted_average(
        on_hand=D("5"),
        avg_cost=D("50.0000"),
        qty=D("3"),
        unit_cost=None,
        reversed_qty=D("-3"),
        reversed_unit_cost=D("44.0000"),
    )
    assert step.avg_after == D("47.7500")  # (5×50 + 3×44) / 8


@pytest.mark.parametrize("qty", ["0.001", "1", "9999999999.999"])
def test_on_hand_is_quantised_to_three_places(qty: str) -> None:
    step = apply_weighted_average(on_hand=D("0"), avg_cost=D("0"), qty=D(qty), unit_cost=D("1"))
    assert step.on_hand_after.as_tuple().exponent == -3
