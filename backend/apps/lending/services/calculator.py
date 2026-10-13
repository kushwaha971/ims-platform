"""The loan calculator (FRD lending LEN-03): plans, schedule, effective yearly rate.

Pure: `Decimal` only, no `float` (T-LEN-03-7), no database access except the
closed days a daily plan skips, which the caller passes in. Every figure is
`half_up` to the paisa where it becomes a row (R§6.6 rule 1), and a schedule is
checked against its invariants before it is returned (BR-8) — a failure is a
defect, raised as `AssertionError`, never a message to the lender.

Plans (FR-1), plus the owner's `flexible` (4 Oct 2026):

* `flat` — interest on the original principal for the whole term;
* `reducing` — equal instalments, interest on the principal still owed (EMI);
* `interest_only` — interest each time, the principal with the last;
* `fixed_daily` — a fixed amount per collection day for a set count;
* `flexible` — no instalments: the borrower pays any amount, any time, until
  the maturity date; the whole (principal + flat interest for the term) falls
  due on that date, and every collection before it is a payment in advance.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from decimal import Decimal, localcontext

from apps.common.money import half_up, q2, round_amount, split_total
from apps.common.recurrence import Recurrence, occurrences, weekday_mask

ZERO = Decimal("0.00")
ONE = Decimal("1")
PAISA = Decimal("0.01")

PLAN_TYPES = ("flat", "reducing", "interest_only", "fixed_daily", "flexible")
FREQUENCIES = {
    "flat": ("weekly", "fortnightly", "monthly"),
    "reducing": ("weekly", "fortnightly", "monthly"),
    "interest_only": ("weekly", "fortnightly", "monthly"),
    "fixed_daily": ("daily", "weekly"),
    "flexible": ("monthly",),
}
#: BR-1 — periods per year.
PERIODS = {"monthly": 12, "fortnightly": 26, "weekly": 52, "daily": 365}
COUNT_MAX = {"daily": 1000, "weekly": 520, "fortnightly": 260, "monthly": 360}
RATE_MAX = {"per_month": Decimal("100"), "per_year": Decimal("1200")}
PRINCIPAL_MAX = Decimal("999999999.99")
LOAN_ROUNDING = ("paise", "rupee_up", "ten_up")
MON_TO_SAT = weekday_mask([0, 1, 2, 3, 4, 5])
EAR_CAP = Decimal("9999.99")


@dataclass(frozen=True)
class Deduction:
    kind: str
    label: str
    amount: Decimal


@dataclass(frozen=True)
class LoanTerms:
    plan_type: str
    principal: Decimal
    disbursed_on: dt.date
    first_due_on: dt.date
    frequency: str
    instalment_count: int
    rate: Decimal = ZERO
    rate_unit: str = "per_month"
    per_instalment_amount: Decimal | None = None
    collection_weekdays: int = MON_TO_SAT
    rounding_rule: str = "paise"
    deductions: tuple[Deduction, ...] = ()


@dataclass
class Row:
    seq: int
    due_on: dt.date
    amount: Decimal
    principal: Decimal
    interest: Decimal


@dataclass
class Schedule:
    rows: list[Row]
    total_payable: Decimal
    total_interest: Decimal
    deductions_total: Decimal
    cash_handed_over: Decimal
    instalment_amount: Decimal
    maturity_on: dt.date
    effective_annual_rate: Decimal
    warnings: list[dict] = field(default_factory=list)


class TermsError(ValueError):
    """Field errors for a 400, keyed as the API reports them."""

    def __init__(self, errors: dict[str, list[str]]) -> None:
        self.errors = errors
        super().__init__(str(errors))


# ── validation (§9) ─────────────────────────────────────────────────────────


def validate(terms: LoanTerms, today: dt.date) -> None:
    errors: dict[str, list[str]] = {}

    def add(field_name: str, message: str) -> None:
        errors.setdefault(field_name, []).append(message)

    if terms.plan_type not in PLAN_TYPES:
        add("plan_type", "Choose a plan.")
        raise TermsError(errors)
    if not (ZERO < terms.principal <= PRINCIPAL_MAX) or terms.principal != q2(terms.principal):
        add("principal", "Enter an amount above zero, to the paisa.")
    total_deductions = sum((d.amount for d in terms.deductions), ZERO)
    for i, d in enumerate(terms.deductions):
        if d.amount <= ZERO:
            add(f"deductions.{i}.amount", "Enter an amount above zero.")
        if not (1 <= len(d.label.strip()) <= 60):
            add(f"deductions.{i}.label", "Name the deduction.")
    if total_deductions >= terms.principal:
        add("deductions", "The deductions must be less than the amount lent.")
    if terms.frequency not in FREQUENCIES[terms.plan_type]:
        add("frequency", "This plan does not collect at that frequency.")
    if terms.plan_type == "fixed_daily":
        amount = terms.per_instalment_amount
        if amount is None or amount <= ZERO:
            add("per_instalment_amount", "Enter the amount collected each time.")
        elif amount * terms.instalment_count < terms.principal:
            add(
                "per_instalment_amount",
                "These collections would not repay the amount lent.",
            )
    else:
        cap = RATE_MAX.get(terms.rate_unit)
        if cap is None:
            add("rate_unit", "Choose a month or a year.")
        elif not (ZERO <= terms.rate <= cap) or terms.rate != terms.rate.quantize(
            Decimal("0.0001")
        ):
            add("rate", f"Enter a rate from 0 to {cap}.")
    if terms.frequency in COUNT_MAX and not (
        1 <= terms.instalment_count <= COUNT_MAX[terms.frequency]
    ):
        add("instalment_count", f"Between 1 and {COUNT_MAX[terms.frequency]}.")
    if terms.disbursed_on > today:
        add("disbursed_on", "The loan cannot be given in the future.")
    if terms.disbursed_on < today.replace(year=today.year - 10):
        add("disbursed_on", "At most ten years ago.")
    if not (terms.disbursed_on < terms.first_due_on):
        add("first_due_on", "The first due date comes after the day the money is given.")
    elif terms.plan_type != "flexible" and terms.first_due_on > terms.disbursed_on + dt.timedelta(
        days=366
    ):
        add("first_due_on", "Within a year of the day the money is given.")
    if terms.frequency == "daily" and not terms.collection_weekdays:
        add("collection_weekdays", "Choose at least one collection day.")
    if terms.rounding_rule not in LOAN_ROUNDING:
        add("rounding_rule", "Choose paise, rupee or ten rupees.")
    if errors:
        raise TermsError(errors)


# ── dates (BR-7) ────────────────────────────────────────────────────────────


def _off_closed(dates: list[dt.date], closed: set[dt.date] | frozenset) -> list[dt.date]:
    """QA F8 — an instalment on a closed day moves to the next open day, never onto or
    past the one after it being moved too: each lands after the one before."""
    if not closed:
        return dates
    out: list[dt.date] = []
    for day in dates:
        if out and day <= out[-1]:
            day = out[-1] + dt.timedelta(days=1)
        while day in closed:
            day += dt.timedelta(days=1)
        out.append(day)
    return out


def due_dates(terms: LoanTerms, closed: set[dt.date] | frozenset = frozenset()) -> list[dt.date]:
    """The instalment dates. Monthly keeps the first due's day (month-end
    clamped); weekly and fortnightly keep their weekday; daily runs on the
    collection weekdays and skips closed days, keeping the count. A weekly or
    monthly date on a closed day moves to the next open day (QA F8)."""
    first, n = terms.first_due_on, terms.instalment_count
    if terms.plan_type == "flexible":
        return [first]
    far = first + dt.timedelta(days=366 * 31)
    if terms.frequency == "monthly":
        rule = Recurrence(freq="monthly", anchor=first, by_month_day=first.day, count=n)
        return _off_closed(occurrences(rule, start=first, end=far, limit=n), closed)
    if terms.frequency in ("weekly", "fortnightly"):
        rule = Recurrence(
            freq="weekly",
            anchor=first,
            interval=2 if terms.frequency == "fortnightly" else 1,
            by_weekday=weekday_mask([first.weekday()]),
            count=n,
        )
        return _off_closed(occurrences(rule, start=first, end=far, limit=n), closed)
    dates: list[dt.date] = []
    day = first
    weekdays = {d for d in range(7) if terms.collection_weekdays & (1 << d)}
    while len(dates) < n:
        if day.weekday() in weekdays and day not in closed:
            dates.append(day)
        day += dt.timedelta(days=1)
    return dates


# ── the plans (BR-2 … BR-5) ─────────────────────────────────────────────────


def periodic_rate(terms: LoanTerms) -> Decimal:
    """BR-1 — `r = yearly / m / 100`; a monthly rate is × 12 first."""
    yearly = terms.rate * 12 if terms.rate_unit == "per_month" else terms.rate
    return yearly / PERIODS[terms.frequency] / 100


def _ceil(value: Decimal, rule: str) -> Decimal:
    return round_amount(value, rule)


def _flat(terms: LoanTerms, dates: list[dt.date]) -> list[Row]:
    n, p = len(dates), terms.principal
    total_interest = q2(p * periodic_rate(terms) * n)
    interests = split_total(total_interest, n, rule="paise")
    total = p + total_interest
    instalment = _ceil(total / n, terms.rounding_rule)
    amounts = [instalment] * (n - 1) + [q2(total - instalment * (n - 1))]
    if amounts[-1] <= ZERO:
        raise TermsError({"instalment_count": ["Too many instalments for this amount."]})
    return _rows(dates, amounts, interests)


def _rows(dates: list[dt.date], amounts: list[Decimal], interests: list[Decimal]) -> list[Row]:
    """Principal per row = amount − interest; a row whose interest is larger
    than its amount carries the extra interest into the next row (only the
    smallest last instalments can need it)."""
    rows: list[Row] = []
    carry = ZERO
    for i, (day, amount) in enumerate(zip(dates, amounts, strict=True)):
        interest = interests[i] + carry
        carry = ZERO
        if interest > amount:
            carry, interest = interest - amount, amount
        rows.append(Row(i + 1, day, q2(amount), q2(amount - interest), q2(interest)))
    if carry:
        raise TermsError({"instalment_count": ["Too many instalments for this amount."]})
    return rows


def _reducing(terms: LoanTerms, dates: list[dt.date]) -> tuple[list[Row], list[dict]]:
    n, p, r = len(dates), terms.principal, periodic_rate(terms)
    with localcontext() as ctx:
        ctx.prec = 34
        if r == 0:
            emi = _ceil(p / n, terms.rounding_rule)
        else:
            growth = (ONE + r) ** n
            emi = _ceil(p * r * growth / (growth - 1), terms.rounding_rule)
    rows: list[Row] = []
    balance = p
    warnings: list[dict] = []
    for k, day in enumerate(dates, start=1):
        interest = half_up(balance * r, PAISA)
        if k == n or emi - interest >= balance:
            amount = balance + interest
            rows.append(Row(k, day, q2(amount), q2(balance), interest))
            if k < n:
                warnings.append({"code": "ends_early", "instalments": k})
            break
        principal = emi - interest
        balance -= principal
        rows.append(Row(k, day, emi, q2(principal), interest))
    return rows, warnings


def _interest_only(terms: LoanTerms, dates: list[dt.date]) -> list[Row]:
    interest = half_up(terms.principal * periodic_rate(terms), PAISA)
    rows = [Row(k, d, interest, ZERO, interest) for k, d in enumerate(dates, start=1)]
    last = rows[-1]
    rows[-1] = Row(last.seq, last.due_on, q2(interest + terms.principal), terms.principal, interest)
    return rows


def _fixed_daily(terms: LoanTerms, dates: list[dt.date]) -> list[Row]:
    n = len(dates)
    amount = q2(terms.per_instalment_amount or ZERO)
    total = q2(amount * n)
    interests = split_total(total - terms.principal, n, rule="paise")
    return _rows(dates, [amount] * n, interests)


def _flexible(terms: LoanTerms, dates: list[dt.date]) -> list[Row]:
    """One due at maturity: principal plus flat interest for the term, counted
    in whole months from the day the money is given (at least one)."""
    end = dates[0]
    months = max(
        1,
        (end.year - terms.disbursed_on.year) * 12
        + (end.month - terms.disbursed_on.month)
        + (1 if end.day > terms.disbursed_on.day else 0),
    )
    yearly = terms.rate * 12 if terms.rate_unit == "per_month" else terms.rate
    interest = q2(terms.principal * yearly / 12 / 100 * months)
    return [Row(1, end, q2(terms.principal + interest), terms.principal, interest)]


# ── effective yearly rate (BR-9, BR-10) ─────────────────────────────────────


def effective_annual_rate(
    cash: Decimal, disbursed_on: dt.date, flows: list[tuple[dt.date, Decimal]], periods: int
) -> Decimal:
    """The IRR of `−cash` on disbursal and `+A_k` on each due, as a nominal
    yearly percentage, by `Decimal` bisection (no `float`)."""
    if cash <= 0 or not flows:
        return ZERO
    total = sum((a for _d, a in flows), ZERO)
    if total <= cash:
        return ZERO
    with localcontext() as ctx:
        ctx.prec = 34
        m = Decimal(periods)
        exps = [(m * Decimal((d - disbursed_on).days) / Decimal(365), a) for d, a in flows]

        def pv(rho: Decimal) -> Decimal:
            base = ONE + rho
            return sum((a / base**e for e, a in exps), Decimal(0))

        lo, hi = Decimal(0), ONE
        steps = 0
        while pv(hi) > cash and steps < 200:
            lo, hi = hi, hi * 2
            steps += 1
        for _ in range(200):
            if hi - lo < Decimal("1e-12"):
                break
            mid = (lo + hi) / 2
            if pv(mid) > cash:
                lo = mid
            else:
                hi = mid
        rate = (lo + hi) / 2 * m * 100
    return min(half_up(rate, PAISA), EAR_CAP)


# ── the whole thing ─────────────────────────────────────────────────────────


def compute(
    terms: LoanTerms, *, today: dt.date, closed: set[dt.date] | frozenset = frozenset()
) -> Schedule:
    validate(terms, today)
    dates = due_dates(terms, closed)
    warnings: list[dict] = []
    if terms.plan_type == "flat":
        rows = _flat(terms, dates)
    elif terms.plan_type == "reducing":
        rows, warnings = _reducing(terms, dates)
    elif terms.plan_type == "interest_only":
        rows = _interest_only(terms, dates)
    elif terms.plan_type == "fixed_daily":
        rows = _fixed_daily(terms, dates)
    else:
        rows = _flexible(terms, dates)
    if any(row.amount < ONE for row in rows):
        raise TermsError({"instalment_count": ["Each instalment must be at least ₹1."]})
    total_payable = q2(sum((r.amount for r in rows), ZERO))
    total_interest = q2(sum((r.interest for r in rows), ZERO))
    deductions_total = q2(sum((d.amount for d in terms.deductions), ZERO))
    cash = q2(terms.principal - deductions_total)
    _check(rows, terms, total_payable, total_interest)
    periods = PERIODS["monthly" if terms.plan_type == "flexible" else terms.frequency]
    ear = effective_annual_rate(
        cash, terms.disbursed_on, [(r.due_on, r.amount) for r in rows], periods
    )
    if total_interest + deductions_total > terms.principal:
        warnings.append({"code": "interest_above_principal"})
    return Schedule(
        rows=rows,
        total_payable=total_payable,
        total_interest=total_interest,
        deductions_total=deductions_total,
        cash_handed_over=cash,
        instalment_amount=rows[0].amount,
        maturity_on=rows[-1].due_on,
        effective_annual_rate=ear,
        warnings=warnings,
    )


def _check(rows: list[Row], terms: LoanTerms, total: Decimal, interest: Decimal) -> None:
    """BR-8 — invariants checked before any save; a failure is a defect."""
    assert sum((r.principal for r in rows), ZERO) == terms.principal, "principal does not add up"
    assert sum((r.amount for r in rows), ZERO) == total, "instalments do not add up"
    assert sum((r.interest for r in rows), ZERO) == interest, "interest does not add up"
    assert all(r.principal >= 0 and r.interest >= 0 for r in rows), "a negative component"
    assert all(a.due_on < b.due_on for a, b in zip(rows, rows[1:])), "dates not increasing"


def schedule_json(schedule: Schedule) -> dict:
    return {
        "cash_handed_over": f"{schedule.cash_handed_over:.2f}",
        "deductions_total": f"{schedule.deductions_total:.2f}",
        "instalment_amount": f"{schedule.instalment_amount:.2f}",
        "total_interest": f"{schedule.total_interest:.2f}",
        "total_payable": f"{schedule.total_payable:.2f}",
        "maturity_on": schedule.maturity_on.isoformat(),
        "effective_annual_rate": f"{schedule.effective_annual_rate:.2f}",
        "effective_annual_rate_display": f"{half_up(schedule.effective_annual_rate, Decimal('0.1'))}",
        "schedule": [
            {
                "seq": r.seq,
                "due_on": r.due_on.isoformat(),
                "amount": f"{r.amount:.2f}",
                "principal": f"{r.principal:.2f}",
                "interest": f"{r.interest:.2f}",
            }
            for r in schedule.rows
        ],
    }
