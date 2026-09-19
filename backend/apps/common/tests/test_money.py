"""Rounding is ROUND_HALF_UP everywhere (Part 20 §20.7.3, task S0-31)."""

from __future__ import annotations

from decimal import Decimal

import pytest

from apps.common.money import D, allocate_proportional, q2, q3, q4, sum_money, to_rupee


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        # The .005 boundary, in both directions. ROUND_HALF_EVEN would give
        # "21.38" for both of these, which is the reason banker's rounding is
        # rejected (Part 20 §20.7.3).
        ("21.375", "21.38"),
        ("21.385", "21.39"),
        ("0.005", "0.01"),
        ("0.015", "0.02"),
        ("0.025", "0.03"),
        ("0.035", "0.04"),
        ("-0.005", "-0.01"),
        ("-21.375", "-21.38"),
        ("1234.565", "1234.57"),
        ("1234.5649", "1234.56"),
        ("1234.5650", "1234.57"),
        ("0.004999", "0.00"),
        ("2.675", "2.68"),
        ("1.005", "1.01"),
        ("999999999.994", "999999999.99"),
        ("999999999.995", "1000000000.00"),
        ("0", "0.00"),
        ("0.00", "0.00"),
        ("5", "5.00"),
        ("5.1", "5.10"),
    ],
)
def test_q2_is_half_up(value: str, expected: str) -> None:
    assert q2(value) == Decimal(expected)
    assert str(q2(value)) == expected


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("1.2345", "1.235"),
        ("1.2344", "1.234"),
        ("1.0005", "1.001"),
        ("-1.0005", "-1.001"),
        ("12.9999", "13.000"),
    ],
)
def test_q3_is_half_up(value: str, expected: str) -> None:
    assert str(q3(value)) == expected


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("1.23455", "1.2346"),
        ("1.23454", "1.2345"),
        ("0.00005", "0.0001"),
        ("0.000049", "0.0000"),
        ("123.45675", "123.4568"),
    ],
)
def test_q4_is_half_up(value: str, expected: str) -> None:
    assert str(q4(value)) == expected


@pytest.mark.parametrize(
    ("value", "expected"),
    [("100.50", "101"), ("100.49", "100"), ("-100.50", "-101"), ("0.5", "1")],
)
def test_to_rupee_is_half_up(value: str, expected: str) -> None:
    assert str(to_rupee(value)) == expected


def test_float_is_rejected() -> None:
    """A float in a money path is a defect, not a value to round (Part 20 §20.7.1)."""
    with pytest.raises(TypeError):
        D(1234.56)
    with pytest.raises(TypeError):
        q2(0.1 + 0.2)


def test_decimal_and_int_and_str_all_round_trip() -> None:
    assert D("1234.50") == Decimal("1234.50")
    assert D(1234) == Decimal("1234")
    assert D(Decimal("1.1")) == Decimal("1.1")


def test_allocate_proportional_sums_back_exactly() -> None:
    """The residual goes to the largest weight, so the parts equal the whole."""
    shares = allocate_proportional("100.00", ["1", "1", "1"])
    assert sum(shares) == Decimal("100.00")
    assert shares == [Decimal("33.33"), Decimal("33.33"), Decimal("33.34")]


def test_allocate_proportional_weights_unevenly() -> None:
    shares = allocate_proportional("10.00", ["700.00", "300.00"])
    assert shares == [Decimal("7.00"), Decimal("3.00")]
    assert sum(shares) == Decimal("10.00")


def test_allocate_proportional_with_zero_weights_gives_all_to_the_first() -> None:
    assert allocate_proportional("10.00", ["0", "0"]) == [Decimal("10.00"), Decimal("0.00")]


def test_allocate_proportional_empty() -> None:
    assert allocate_proportional("10.00", []) == []


def test_sum_money_is_exact_addition() -> None:
    """Aging bucket sums add 2-dp values exactly; no rounding (Part 20 §20.7.3)."""
    assert sum_money(["0.01"] * 300) == Decimal("3.00")
