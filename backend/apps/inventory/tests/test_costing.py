"""The weighted-average step, paisa-exact (Part 21 §21.3.6 (2); Part 32 §32.9.6).

Pure-function tests: no database. The worked example is §17.6.0's table, row for
row, including the `on_hand ≤ 0` reset that a naive blend gets wrong.
"""

from __future__ import annotations

import random
from decimal import Decimal as D

import pytest

from apps.common.money import q4
from apps.inventory.services.costing import Step, apply_weighted_average

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


# ── carried value (H3: the 140.0001 defect) ─────────────────────────────────

SEVEN = D("0.0000001")


def _step(
    on_hand: D,
    avg: D,
    value: D | None,
    qty: str,
    cost: str | None,
    reverses: tuple[D, D] | None = None,
) -> Step:
    return apply_weighted_average(
        on_hand=on_hand,
        avg_cost=avg,
        qty=D(qty),
        unit_cost=D(cost) if cost is not None else None,
        reversed_qty=reverses[0] if reverses else None,
        reversed_unit_cost=reverses[1] if reverses else None,
        value=value,
    )


def test_a_receipt_and_its_reversal_restore_the_average_exactly() -> None:
    """QA's 140.0001: 3 @ 140, +6 @ 150 → 146.6667. Rebuilding the value as
    9 × 146.6667 = 1320.0003 and removing 900 left 420.0003 / 3 = 140.0001. The
    carried value is 1320 exactly, so the reversal lands on 420 and 140.0000."""
    bought = _step(D("3.000"), D("140.0000"), D("420"), "6", "150")
    assert (bought.avg_after, bought.value_after) == (D("146.6667"), D("1320.0000000"))
    back = _step(
        bought.on_hand_after,
        bought.avg_after,
        bought.value_after,
        "-6",
        None,
        reverses=(D("6"), D("150.0000")),
    )
    assert (back.on_hand_after, back.avg_after, back.value_after) == (
        D("3.000"),
        D("140.0000"),
        D("420.0000000"),
    )


def test_without_a_carried_value_the_step_is_the_old_step() -> None:
    """`value=None` (a history row from before value carrying) folds from
    on_hand × avg — which reproduces the old 140.0001 deliberately, so rows the
    old step wrote still replay to the figures they recorded."""
    bought = _step(D("3.000"), D("140.0000"), None, "6", "150")
    back = _step(
        bought.on_hand_after, bought.avg_after, None, "-6", None, reverses=(D("6"), D("150"))
    )
    assert back.avg_after == D("140.0001")


def test_a_plain_outbound_keeps_the_average_and_the_value_per_unit() -> None:
    """§21.3.6 (2): the average stands; the value leaves in proportion, so the
    value per unit the next receipt blends with is still the one on screen.
    Taking |qty| × the ROUNDED average out instead would leave its residue on
    the shelf and double it per unit every time half the stock is sold."""
    step = _step(D("9.000"), D("146.6667"), D("1320"), "-4", None)
    assert step.avg_after == D("146.6667")
    assert step.unit_cost == D("146.6667")
    assert step.value_after == D("733.3333333")  # 1320 × 5 / 9, half-up at 7 dp


def test_after_any_step_the_average_is_the_rounded_value_per_unit() -> None:
    """The invariant that makes a void exact: q4(value / on_hand) == avg."""
    rng = random.Random(7)
    on_hand, avg, value = D("0.000"), D("0.0000"), D("0")
    for _ in range(5_000):
        qty = D(rng.randint(1, 9_999)) / 1000
        if rng.random() < 0.5:
            step = _step(on_hand, avg, value, str(qty), str(D(rng.randint(1, 10**7)) / 10**4))
        else:
            step = _step(on_hand, avg, value, str(-qty), None)
        on_hand, avg, value = step.on_hand_after, step.avg_after, step.value_after
        if on_hand > 0:
            assert q4(value / on_hand) == avg


def test_stock_that_reaches_zero_carries_no_value() -> None:
    """The COGS rounding residue must not survive as value on an empty shelf."""
    step = _step(D("3.000"), D("33.3333"), D("100"), "-3", None)
    assert (step.on_hand_after, step.value_after) == (D("0.000"), D("0.0000000"))


def test_a_reset_restarts_the_value_at_the_new_cost() -> None:
    step = _step(D("-3.000"), D("44.0000"), D("-132"), "12", "50")
    assert (step.on_hand_after, step.avg_after, step.value_after) == (
        D("9.000"),
        D("50.0000"),
        D("450.0000000"),
    )


def test_fuzz_every_immediate_reversal_restores_the_exact_state() -> None:
    """Property over 20,000 random steps: whatever came before, an inbound reversed
    at once restores (on_hand, avg, value) EXACTLY — the defect QA saw was the
    4th-decimal miss of exactly this — and the carried value is always a 7-dp
    number that needed no rounding (3-dp qty × 4-dp cost)."""
    rng = random.Random(20260928)
    on_hand, avg, value = D("0.000"), D("0.0000"), D("0")
    restored = 0
    for _ in range(20_000):
        roll = rng.random()
        qty = D(rng.randint(1, 50_000)) / 1000
        if roll < 0.4:
            cost = str(D(rng.randint(1, 9_999_999)) / 10_000)
            before = (on_hand, avg, value.quantize(SEVEN))
            step = _step(on_hand, avg, value, str(qty), cost)
            if before[0] > 0 and rng.random() < 0.5:
                step = _step(
                    step.on_hand_after,
                    step.avg_after,
                    step.value_after,
                    str(-qty),
                    None,
                    reverses=(qty, step.unit_cost),
                )
                assert (step.on_hand_after, step.avg_after, step.value_after) == before
                restored += 1
        elif roll < 0.8:
            if on_hand <= 0:
                continue
            step = _step(on_hand, avg, value, str(-min(qty, on_hand)), None)
        else:
            step = _step(on_hand, avg, value, str(qty), None)
        on_hand, avg, value = step.on_hand_after, step.avg_after, step.value_after
        assert value == value.quantize(SEVEN)
    assert restored > 1000
