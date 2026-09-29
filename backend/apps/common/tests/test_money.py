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


# ── A9a ── round_amount and split_total (FRD 00 PLT-X09 BR-7, BR-8) ───────────
#
# Every schedule, pro-rata slip and loan plan in the platform is built from
# these two. The defect `split_total` exists to prevent is an instalment plan
# whose parts do not add back to the agreed total: ₹10,000 in three becomes
# 3,333.33 × 3 = 9,999.99, and a merchant chases a customer for a paisa the
# customer never owed, or writes it off by hand on every plan.

import random  # noqa: E402

from apps.common.money import round_amount, split_total  # noqa: E402


@pytest.mark.parametrize(
    ("value", "rule", "expected"),
    [
        ("1234.50", "rupee", "1235.00"),
        ("1234.49", "rupee", "1234.00"),
        ("1234.01", "rupee_up", "1235.00"),
        ("1234.00", "rupee_up", "1234.00"),
        ("1231.00", "ten_up", "1240.00"),
        ("1240.00", "ten_up", "1240.00"),
        ("1240.01", "ten_up", "1250.00"),
        ("1234.565", "paise", "1234.57"),
        ("0", "ten_up", "0.00"),
        # DUE-04's pro-rata input: ₹1,200 × 20/31 = 774.1935… → ₹774.
        (Decimal("1200.00") * 20 / 31, "rupee", "774.00"),
    ],
)
def test_round_amount_worked_examples(value: object, rule: str, expected: str) -> None:
    """BR-7 and the worked examples, to the paisa, always 2 dp."""
    result = round_amount(value, rule)
    assert result == Decimal(expected)
    assert result.as_tuple().exponent == -2


def test_round_amount_refuses_an_unknown_rule_and_floats() -> None:
    with pytest.raises(ValueError):
        round_amount("1.00", "nearest")
    with pytest.raises(TypeError):
        round_amount(1.5, "rupee")


def test_split_total_worked_examples() -> None:
    """₹10,000 in three by the rupee and by the paisa; ₹60,000 in 40/30/30."""
    assert split_total("10000.00", 3, rule="rupee") == [
        Decimal("3333.00"),
        Decimal("3333.00"),
        Decimal("3334.00"),
    ]
    assert split_total("10000.00", 3, rule="paise") == [
        Decimal("3333.33"),
        Decimal("3333.33"),
        Decimal("3333.34"),
    ]
    assert split_total("60000.00", [40, 30, 30], rule="rupee") == [
        Decimal("24000.00"),
        Decimal("18000.00"),
        Decimal("18000.00"),
    ]
    # lending.md's example: ₹1,900 of interest over 130 dues.
    parts = split_total("1900.00", 130, rule="paise")
    assert parts[:-1] == [Decimal("14.62")] * 129 and parts[-1] == Decimal("14.02")


def test_split_total_edges() -> None:
    """EC-3 a zero total is all zeros; one part is the total; a last part
    that would go negative, a negative total, no parts, zero or negative
    weights, and sub-paise totals are refused rather than "fixed"."""
    assert split_total("0.00", 4, rule="ten_up") == [ZERO_] * 4
    assert split_total("99.99", 1, rule="rupee") == [Decimal("99.99")]
    with pytest.raises(ValueError):
        split_total("15.00", 3, rule="ten_up")  # 10 + 10 + (−5)
    for bad in (
        lambda: split_total("-1.00", 2, rule="paise"),
        lambda: split_total("1.00", 0, rule="paise"),
        lambda: split_total("1.00", [], rule="paise"),
        lambda: split_total("1.00", [0, 0], rule="paise"),
        lambda: split_total("1.00", [1, -1], rule="paise"),
        lambda: split_total("1.005", 2, rule="paise"),
        lambda: split_total("1.00", 2, rule="nearest"),
    ):
        with pytest.raises(ValueError):
            bad()


ZERO_ = Decimal("0.00")
_UNIT = {
    "paise": Decimal("0.01"),
    "rupee": Decimal("1"),
    "rupee_up": Decimal("1"),
    "ten_up": Decimal("10"),
}


def test_split_total_always_sums_exactly_fuzzed() -> None:
    """T-PLT-X09-3: random totals up to ₹99,99,999.99, 1–120 parts, equal or
    random weights: Σ parts = total exactly, every part ≥ 0 (or ValueError),
    and for equal parts the last differs from the others by less than one
    rounding unit × parts."""
    rng = random.Random(99)
    for _ in range(5_000):
        total = Decimal(rng.randrange(0, 999_999_999 + 1)) / 100
        n = rng.randint(1, 120)
        rule = rng.choice(tuple(_UNIT))
        weights: int | list[int] = (
            n if rng.random() < 0.5 else [rng.randint(0, 50) for _ in range(n)]
        )
        if isinstance(weights, list) and not any(weights):
            weights[0] = 1
        try:
            parts = split_total(total, weights, rule=rule)
        except ValueError:
            continue  # the last part would be negative — refused, never returned
        assert len(parts) == n
        assert sum(parts, Decimal("0")) == total
        assert all(p >= 0 for p in parts)
        assert all(p.as_tuple().exponent == -2 for p in parts)
        if isinstance(weights, int) and n > 1:
            assert abs(parts[-1] - parts[0]) < _UNIT[rule] * n
