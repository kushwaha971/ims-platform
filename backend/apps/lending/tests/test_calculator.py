"""LEN-03 — the calculator reproduces the FRD's worked examples exactly (T-LEN-03-1, -3, -4, -5)."""

from __future__ import annotations

import datetime as dt
import random
from decimal import Decimal

import pytest

from apps.lending.services.calculator import (
    Deduction,
    LoanTerms,
    TermsError,
    compute,
)

D = Decimal
TODAY = dt.date(2027, 6, 1)


def _flat(**over: object) -> LoanTerms:
    base = dict(
        plan_type="flat",
        principal=D("20000.00"),
        disbursed_on=dt.date(2026, 1, 5),
        first_due_on=dt.date(2026, 2, 5),
        frequency="monthly",
        instalment_count=10,
        rate=D("2.0000"),
    )
    base.update(over)
    return LoanTerms(**base)  # type: ignore[arg-type]


def test_f1_flat_20000_at_2_percent_for_10_months() -> None:
    s = compute(_flat(), today=TODAY)
    assert s.total_interest == D("4000.00") and s.total_payable == D("24000.00")
    assert {r.amount for r in s.rows} == {D("2400.00")}
    assert {(r.principal, r.interest) for r in s.rows} == {(D("2000.00"), D("400.00"))}
    assert s.maturity_on == dt.date(2026, 11, 5)
    assert s.effective_annual_rate == D("41.76")


@pytest.mark.parametrize(
    "rule, regular, last, principal_last",
    [("paise", "3946.43", "3946.42", "3571.42"), ("rupee_up", "3947.00", "3943.00", "3568.00")],
)
def test_f2_flat_with_a_remainder(rule: str, regular: str, last: str, principal_last: str) -> None:
    s = compute(
        _flat(principal=D("25000.00"), rate=D("1.5000"), instalment_count=7, rounding_rule=rule),
        today=TODAY,
    )
    assert [r.amount for r in s.rows] == [D(regular)] * 6 + [D(last)]
    assert s.rows[-1].principal == D(principal_last)
    assert {r.interest for r in s.rows} == {D("375.00")}


def test_r1_reducing_absorbs_one_paisa_in_the_last_row() -> None:
    s = compute(_flat(plan_type="reducing"), today=TODAY)
    assert [r.amount for r in s.rows] == [D("2226.53")] * 9 + [D("2226.54")]
    assert s.rows[1].interest == D("363.47") and s.rows[-1].interest == D("43.66")
    assert s.total_interest == D("2265.31")
    assert s.effective_annual_rate == D("24.13")


def test_i1_interest_only() -> None:
    s = compute(
        _flat(
            plan_type="interest_only",
            principal=D("50000.00"),
            rate=D("3.0000"),
            instalment_count=12,
        ),
        today=TODAY,
    )
    assert s.rows[0].amount == D("1500.00") and s.rows[-1].amount == D("51500.00")
    assert s.total_payable == D("68000.00")
    assert s.effective_annual_rate == D("36.03")


def _daily(**over: object) -> LoanTerms:
    base = dict(
        plan_type="fixed_daily",
        principal=D("10000.00"),
        disbursed_on=dt.date(2026, 10, 1),
        first_due_on=dt.date(2026, 10, 2),
        frequency="daily",
        instalment_count=100,
        per_instalment_amount=D("100.00"),
        deductions=(Deduction("processing_fee", "Processing fee", D("1000.00")),),
    )
    base.update(over)
    return LoanTerms(**base)  # type: ignore[arg-type]


def test_d1_fixed_daily_with_a_deduction() -> None:
    s = compute(_daily(), today=TODAY)
    assert s.cash_handed_over == D("9000.00") and s.total_payable == D("10000.00")
    assert s.total_interest == D("0.00")
    assert s.maturity_on == dt.date(2027, 1, 26)  # 100 collection days, Sundays skipped
    assert s.effective_annual_rate == D("66.40")


def test_d1_a_closed_day_keeps_the_count_and_ends_a_day_later() -> None:
    s = compute(_daily(), today=TODAY, closed={dt.date(2027, 1, 26)})
    assert len(s.rows) == 100 and s.maturity_on == dt.date(2027, 1, 27)


def test_d2_fixed_daily_with_interest() -> None:
    s = compute(_daily(per_instalment_amount=D("120.00"), deductions=()), today=TODAY)
    assert {(r.principal, r.interest) for r in s.rows} == {(D("100.00"), D("20.00"))}
    assert s.effective_annual_rate == D("116.54")


def test_d3_fixed_daily_with_remainders() -> None:
    s = compute(
        _daily(
            principal=D("15000.00"),
            per_instalment_amount=D("130.00"),
            instalment_count=130,
            deductions=(
                Deduction("processing_fee", "Processing fee", D("500.00")),
                Deduction("upfront_interest", "Upfront interest", D("1000.00")),
            ),
        ),
        today=TODAY,
    )
    assert s.cash_handed_over == D("13500.00") and s.total_interest == D("1900.00")
    assert s.rows[0].interest == D("14.62") and s.rows[-1].interest == D("14.02")
    assert s.rows[-1].principal == D("115.98")
    assert s.maturity_on == dt.date(2027, 3, 2)
    assert s.effective_annual_rate == D("111.60")


def test_month_end_is_clamped_and_keeps_the_anchor_day() -> None:
    s = compute(
        _flat(
            disbursed_on=dt.date(2026, 1, 1), first_due_on=dt.date(2026, 1, 31), instalment_count=3
        ),
        today=TODAY,
    )
    assert [r.due_on for r in s.rows] == [
        dt.date(2026, 1, 31),
        dt.date(2026, 2, 28),
        dt.date(2026, 3, 31),
    ]


def test_a_zero_rate_loan_with_no_deductions_costs_nothing() -> None:
    s = compute(_flat(rate=D("0")), today=TODAY)
    assert s.total_interest == D("0.00") and s.effective_annual_rate == D("0.00")


def test_flexible_is_one_due_at_maturity_with_interest_for_the_term() -> None:
    """The owner's flexible loan (4 Oct 2026): pay any amount any time; the
    whole falls due on the end date. ₹20,000 at 2% a month for 3 months."""
    s = compute(
        LoanTerms(
            plan_type="flexible",
            principal=D("20000.00"),
            disbursed_on=dt.date(2026, 10, 5),
            first_due_on=dt.date(2027, 1, 5),
            frequency="monthly",
            instalment_count=1,
            rate=D("2.0000"),
        ),
        today=TODAY,
    )
    assert len(s.rows) == 1 and s.total_payable == D("21200.00")


def test_terms_are_refused_with_field_errors() -> None:
    with pytest.raises(TermsError) as refused:
        compute(_flat(principal=D("0"), first_due_on=dt.date(2026, 1, 1)), today=TODAY)
    assert {"principal", "first_due_on"} <= set(refused.value.errors)


def test_a_schedule_always_sums_to_the_agreed_total() -> None:
    """T-LEN-03-2, sized for the fast suite: seeded terms over every plan and
    rounding rule; the invariants are asserted inside `compute`."""
    rng = random.Random(20260929)
    plans = {
        "flat": ("weekly", "fortnightly", "monthly"),
        "reducing": ("weekly", "fortnightly", "monthly"),
        "interest_only": ("weekly", "monthly"),
        "fixed_daily": ("daily", "weekly"),
    }
    for _ in range(300):
        plan = rng.choice(list(plans))
        freq = rng.choice(plans[plan])
        n = rng.randint(1, 60)
        principal = D(rng.randint(100, 5_000_000)) / 100 + D(1000)
        terms = LoanTerms(
            plan_type=plan,
            principal=principal,
            disbursed_on=dt.date(2026, 1, 5),
            first_due_on=dt.date(2026, 1, 6) + dt.timedelta(days=rng.randint(0, 30)),
            frequency=freq,
            instalment_count=n,
            rate=D(rng.randint(0, 500)) / 100,
            per_instalment_amount=(
                (principal / n + D(rng.randint(0, 50))).quantize(D("0.01")) + D("0.01")
                if plan == "fixed_daily"
                else None
            ),
            rounding_rule=rng.choice(("paise", "rupee_up", "ten_up")),
        )
        try:
            s = compute(terms, today=TODAY)
        except TermsError:
            continue
        assert sum(r.amount for r in s.rows) == s.total_payable
        if terms.rounding_rule != "paise" and plan in ("flat",) and len(s.rows) > 1:
            assert s.rows[-1].amount <= s.rows[0].amount
