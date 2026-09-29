"""Recurrence rules (FRD 00 PLT-X09, contracts §1.8, ADR-055, task A9a).

One implementation of "every month on the 31st" for three engines and four
verticals. The defects these tests exist to prevent are the ones every
hand-rolled schedule has had: rent due on the 31st drifting to the 28th for
ever after February; a yearly 29 Feb membership vanishing in three years out of
four; a fortnightly class counted from the wrong Monday; a count that includes
dates before the anchor; and an "occurrences" call that silently truncates at
its limit, so a schedule shows eleven months of a twelve-month plan.

The property tests are seeded `random.Random` loops (no hypothesis, ADR-021),
and every property compares against a DIRECT computation from the anchor, not
against the previous occurrence — a drifting implementation agrees with itself.
"""

from __future__ import annotations

import ast
import calendar
import dataclasses
import pathlib
import random
from datetime import date, timedelta

import pytest

from apps.common.recurrence import (
    Recurrence,
    mask_weekdays,
    next_occurrence,
    occurrences,
    period_after,
    validate_recurrence,
    weekday_mask,
)

FAR = date(2200, 1, 1)


def _monthly(anchor: date, **kw: object) -> Recurrence:
    return Recurrence(freq="monthly", anchor=anchor, **kw)  # type: ignore[arg-type]


# ── T-PLT-X09-1: the worked examples ──────────────────────────────────────────


def test_monthly_on_the_31st_clamps_and_returns_without_drift() -> None:
    """Worked example 1 (BR-1): 31 Jan, 28 Feb, 31 Mar, 30 Apr, 31 May — the
    rule returns to the 31st after February instead of staying on the 28th."""
    rule = _monthly(date(2026, 1, 31))
    assert occurrences(rule, start=date(2026, 1, 1), end=date(2026, 6, 1)) == [
        date(2026, 1, 31),
        date(2026, 2, 28),
        date(2026, 3, 31),
        date(2026, 4, 30),
        date(2026, 5, 31),
    ]
    assert occurrences(rule, start=date(2028, 2, 1), end=date(2028, 3, 1)) == [date(2028, 2, 29)]


def test_yearly_on_29_february_falls_on_the_28th_outside_leap_years() -> None:
    """Worked example 2 (BR-2)."""
    rule = Recurrence(freq="yearly", anchor=date(2028, 2, 29))
    assert occurrences(rule, start=date(2029, 1, 1), end=date(2033, 1, 1)) == [
        date(2029, 2, 28),
        date(2030, 2, 28),
        date(2031, 2, 28),
        date(2032, 2, 29),
    ]


def test_monday_wednesday_friday_is_mask_21() -> None:
    """Worked example 3: Mon=1, Wed=4, Fri=16."""
    assert weekday_mask([0, 2, 4]) == 21
    assert mask_weekdays(21) == [0, 2, 4]
    rule = Recurrence(freq="weekly", anchor=date(2026, 10, 5), by_weekday=21)  # a Monday
    assert occurrences(rule, start=date(2026, 10, 5), end=date(2026, 10, 12)) == [
        date(2026, 10, 5),
        date(2026, 10, 7),
        date(2026, 10, 9),
    ]


def test_weekday_mask_refuses_a_day_that_is_not_one() -> None:
    with pytest.raises(ValueError):
        weekday_mask([7])
    with pytest.raises(ValueError):
        mask_weekdays(128)


# ── BR-1 / BR-3: clamping, by_month_day, weekly counting ──────────────────────


def test_by_month_day_last_is_always_the_last_day() -> None:
    """BR-1: `by_month_day = -1` is the month's last day, leap Februaries included."""
    rule = _monthly(date(2027, 12, 31), by_month_day=-1)
    assert occurrences(rule, start=date(2027, 12, 1), end=date(2028, 5, 1)) == [
        date(2027, 12, 31),
        date(2028, 1, 31),
        date(2028, 2, 29),
        date(2028, 3, 31),
        date(2028, 4, 30),
    ]


def test_by_month_day_before_the_anchor_day_starts_next_month() -> None:
    """Rent "on the 5th", agreed on 12 Oct: the first due is 5 Nov, not a date
    before the agreement. Occurrences are never earlier than the anchor."""
    rule = _monthly(date(2026, 10, 12), by_month_day=5, count=2)
    assert occurrences(rule, start=date(2026, 1, 1), end=FAR) == [
        date(2026, 11, 5),
        date(2026, 12, 5),
    ]


def test_quarterly_is_monthly_every_three() -> None:
    rule = _monthly(date(2026, 11, 30), interval=3, count=4)
    assert occurrences(rule, start=date(2026, 1, 1), end=FAR) == [
        date(2026, 11, 30),
        date(2027, 2, 28),
        date(2027, 5, 30),
        date(2027, 8, 30),
    ]


def test_fortnightly_counts_weeks_from_the_monday_of_the_anchor_week() -> None:
    """BR-3 / EC-4: anchor on a Sunday, every 2 weeks on Mon and Sun. The week
    of the anchor is week 0 from ITS Monday (which is before the anchor, so that
    Monday is not an occurrence); the next weeks are 2 and 4."""
    anchor = date(2026, 10, 11)  # Sunday; Monday of its week is 5 Oct
    rule = Recurrence(freq="weekly", interval=2, by_weekday=weekday_mask([0, 6]), anchor=anchor)
    assert occurrences(rule, start=date(2026, 10, 1), end=date(2026, 11, 3)) == [
        date(2026, 10, 11),
        date(2026, 10, 19),
        date(2026, 10, 25),
        date(2026, 11, 2),
    ]


def test_weekly_with_no_weekdays_means_the_anchor_weekday() -> None:
    """BR-3: `by_weekday = 0` is the anchor's own weekday."""
    rule = Recurrence(freq="weekly", anchor=date(2026, 10, 8), count=3)  # Thursday
    assert occurrences(rule, start=date(2026, 1, 1), end=FAR) == [
        date(2026, 10, 8),
        date(2026, 10, 15),
        date(2026, 10, 22),
    ]


def test_daily_every_n_days() -> None:
    rule = Recurrence(freq="daily", interval=10, anchor=date(2026, 2, 25), count=3)
    assert occurrences(rule, start=date(2026, 1, 1), end=FAR) == [
        date(2026, 2, 25),
        date(2026, 3, 7),
        date(2026, 3, 17),
    ]


def test_once_is_the_anchor() -> None:
    rule = Recurrence(freq="once", anchor=date(2026, 10, 12))
    assert occurrences(rule, start=date(2026, 1, 1), end=FAR) == [date(2026, 10, 12)]
    assert occurrences(rule, start=date(2026, 10, 13), end=FAR) == []


# ── T-PLT-X09-4: BR-4, BR-5, BR-6 ─────────────────────────────────────────────


def test_explicit_dates_replace_the_rule_sorted_unique_and_windowed() -> None:
    """BR-4: custom instalment dates, as a merchant typed them — out of order,
    one twice — come back sorted, unique, and inside [start, end)."""
    rule = Recurrence(
        freq="once",
        anchor=date(2026, 10, 1),
        explicit_dates=(
            date(2026, 12, 15),
            date(2026, 10, 1),
            date(2026, 12, 15),
            date(2027, 1, 9),
        ),
    )
    assert occurrences(rule, start=date(2026, 10, 1), end=date(2027, 1, 9)) == [
        date(2026, 10, 1),
        date(2026, 12, 15),
    ]


def test_explicit_dates_need_freq_once() -> None:
    rule = Recurrence(freq="monthly", anchor=date(2026, 10, 1), explicit_dates=(date(2026, 11, 1),))
    assert "recurrence.freq" in validate_recurrence(rule)
    with pytest.raises(ValueError):
        occurrences(rule, start=date(2026, 1, 1), end=FAR)


def test_count_and_until_first_reached_ends_the_series() -> None:
    """BR-5, both directions."""
    by_count = _monthly(date(2026, 1, 10), count=3, until=date(2026, 12, 31))
    assert occurrences(by_count, start=date(2026, 1, 1), end=FAR)[-1] == date(2026, 3, 10)
    by_until = _monthly(date(2026, 1, 10), count=12, until=date(2026, 3, 10))
    # `until` is inclusive: 10 Mar is the last due, as a merchant reads "until 10 March".
    assert occurrences(by_until, start=date(2026, 1, 1), end=FAR) == [
        date(2026, 1, 10),
        date(2026, 2, 10),
        date(2026, 3, 10),
    ]


def test_count_is_counted_from_the_anchor_not_from_the_window() -> None:
    """A 12-month plan viewed from month 10 shows months 10, 11 and 12 — not
    twelve more. A windowed read that restarted the count would double a plan."""
    rule = _monthly(date(2026, 1, 15), count=12)
    assert occurrences(rule, start=date(2026, 10, 1), end=FAR) == [
        date(2026, 10, 15),
        date(2026, 11, 15),
        date(2026, 12, 15),
    ]


def test_a_window_that_would_exceed_the_limit_raises_rather_than_truncates() -> None:
    """BR-6: a silently truncated list is a schedule missing its last dues."""
    rule = Recurrence(freq="daily", anchor=date(2026, 1, 1))
    assert len(occurrences(rule, start=date(2026, 1, 1), end=date(2026, 1, 11), limit=10)) == 10
    with pytest.raises(ValueError):
        occurrences(rule, start=date(2026, 1, 1), end=date(2026, 1, 12), limit=10)


# ── T-PLT-X09-13 edge cases ───────────────────────────────────────────────────


def test_edge_cases() -> None:
    """EC-1 start > end, EC-2 until before start, EC-5 count 1 (clamped)."""
    rule = _monthly(date(2026, 1, 31))
    assert occurrences(rule, start=date(2026, 5, 1), end=date(2026, 4, 1)) == []
    assert occurrences(rule, start=date(2026, 5, 1), end=date(2026, 5, 1)) == []
    until = _monthly(date(2026, 1, 31), until=date(2026, 2, 28))
    assert occurrences(until, start=date(2026, 3, 1), end=FAR) == []
    once = _monthly(date(2026, 1, 31), by_month_day=31, count=1)
    assert occurrences(once, start=date(2026, 1, 1), end=FAR) == [date(2026, 1, 31)]
    feb = _monthly(date(2026, 2, 1), by_month_day=31, count=1)
    assert occurrences(feb, start=date(2026, 1, 1), end=FAR) == [date(2026, 2, 28)]


# ── next_occurrence, period_after ─────────────────────────────────────────────


def test_next_occurrence_is_strictly_after() -> None:
    rule = _monthly(date(2026, 1, 31), count=3)
    assert next_occurrence(rule, after=date(2026, 1, 30)) == date(2026, 1, 31)
    assert next_occurrence(rule, after=date(2026, 1, 31)) == date(2026, 2, 28)
    assert next_occurrence(rule, after=date(2026, 3, 31)) is None


def test_period_after_runs_to_the_next_occurrence_even_past_the_count() -> None:
    """The last month of a 3-month plan is still a month: [31 Mar, 30 Apr)."""
    rule = _monthly(date(2026, 1, 31), count=3)
    assert period_after(rule, date(2026, 2, 28)).start == date(2026, 2, 28)
    assert period_after(rule, date(2026, 2, 28)).end == date(2026, 3, 31)
    assert period_after(rule, date(2026, 3, 31)).end == date(2026, 4, 30)
    with pytest.raises(ValueError):
        period_after(Recurrence(freq="once", anchor=date(2026, 1, 1)), date(2026, 1, 1))


# ── validation ────────────────────────────────────────────────────────────────


def test_validate_recurrence_keys_errors_as_the_api_reports_them() -> None:
    bad = Recurrence(
        freq="fortnightly",
        interval=0,
        by_weekday=200,
        by_month_day=0,
        anchor=date(2026, 5, 1),
        count=0,
        until=date(2026, 4, 1),
    )
    errors = validate_recurrence(bad)
    assert set(errors) == {
        "recurrence.freq",
        "recurrence.interval",
        "recurrence.by_weekday",
        "recurrence.by_month_day",
        "recurrence.count",
        "recurrence.until",
    }
    assert all(isinstance(m, str) and m for messages in errors.values() for m in messages)
    assert validate_recurrence(_monthly(date(2026, 1, 31))) == {}


def test_weekday_and_month_day_belong_to_their_frequencies() -> None:
    """A weekday mask on a monthly rule is a rule that means something other
    than what the merchant chose; refuse it rather than ignore it."""
    assert "recurrence.by_weekday" in validate_recurrence(_monthly(date(2026, 1, 1), by_weekday=1))
    daily = Recurrence(freq="daily", anchor=date(2026, 1, 1), by_month_day=5)
    assert "recurrence.by_month_day" in validate_recurrence(daily)


def test_the_rule_is_frozen_and_keyword_only() -> None:
    """R13: `kw_only=True` — a positional Recurrence("monthly", 1, ...) is how
    `interval` and `by_weekday` get swapped."""
    with pytest.raises(TypeError):
        Recurrence("monthly", date(2026, 1, 1))  # type: ignore[misc]
    rule = _monthly(date(2026, 1, 1))
    with pytest.raises(dataclasses.FrozenInstanceError):
        rule.interval = 2  # type: ignore[misc]
    assert hash(Recurrence(freq="once", anchor=date(2026, 1, 1), explicit_dates=[date(2026, 1, 2)]))  # type: ignore[arg-type]


# ── T-PLT-X09-2: the property tests ───────────────────────────────────────────


def _direct_monthly(anchor: date, interval: int, k: int, day: int) -> date:
    """The k-th candidate computed from the anchor alone — the no-drift oracle."""
    months = anchor.year * 12 + (anchor.month - 1) + k * interval
    year, month0 = divmod(months, 12)
    last = calendar.monthrange(year, month0 + 1)[1]
    return date(year, month0 + 1, last if day == -1 else min(day, last))


def _direct_yearly(anchor: date, interval: int, k: int, day: int) -> date:
    year = anchor.year + k * interval
    last = calendar.monthrange(year, anchor.month)[1]
    return date(year, anchor.month, last if day == -1 else min(day, last))


def test_monthly_and_yearly_rules_never_drift_fuzzed() -> None:
    """10,000 random monthly/yearly rules over 2000–2100: ascending, unique,
    each date's day = min(rule day, month length), and the k-th occurrence
    equals the direct computation from the anchor."""
    rng = random.Random(20260930)
    for _ in range(10_000):
        freq = rng.choice(("monthly", "yearly"))
        anchor = date(2000, 1, 1) + timedelta(days=rng.randrange(0, 36_500))
        interval = rng.randint(1, 12) if freq == "monthly" else rng.randint(1, 5)
        by_month_day = rng.choice((None, None, -1, rng.randint(1, 31)))
        count = rng.choice((None, rng.randint(1, 60)))
        rule = Recurrence(
            freq=freq, interval=interval, by_month_day=by_month_day, anchor=anchor, count=count
        )
        start = anchor - timedelta(days=rng.randrange(0, 400))
        end = min(date(2101, 1, 1), anchor + timedelta(days=rng.randrange(1, 12_000)))
        got = occurrences(rule, start=start, end=end, limit=1300)

        assert got == sorted(set(got)), rule
        day = by_month_day if by_month_day is not None else anchor.day
        direct = _direct_monthly if freq == "monthly" else _direct_yearly
        series: list[date] = []
        k = 0
        while count is None or len(series) < count:
            d = direct(anchor, interval, k, day)
            k += 1
            if d >= end:
                break
            if d >= anchor:
                series.append(d)
        expected = [d for d in series if start <= d]
        assert got == expected, rule
        for d in got:
            last = calendar.monthrange(d.year, d.month)[1]
            assert d.day == (last if day == -1 else min(day, last)), (rule, d)


def test_weekly_and_daily_rules_fuzzed() -> None:
    """Every weekly occurrence falls on a chosen weekday in a week that is a
    multiple of `interval` from the anchor's Monday; daily ones are a whole
    number of intervals from the anchor; windows compose (reading [a, b) and
    [b, c) gives [a, c))."""
    rng = random.Random(4242)
    for _ in range(3_000):
        anchor = date(2000, 1, 1) + timedelta(days=rng.randrange(0, 36_500))
        interval = rng.randint(1, 8)
        if rng.random() < 0.5:
            mask = rng.randrange(0, 128)
            rule = Recurrence(freq="weekly", interval=interval, by_weekday=mask, anchor=anchor)
            days = set(mask_weekdays(mask)) or {anchor.weekday()}
        else:
            rule = Recurrence(freq="daily", interval=interval, anchor=anchor)
            days = None
        a = anchor - timedelta(days=rng.randrange(0, 30))
        b = a + timedelta(days=rng.randrange(0, 200))
        c = b + timedelta(days=rng.randrange(0, 200))
        left = occurrences(rule, start=a, end=b)
        right = occurrences(rule, start=b, end=c)
        assert left + right == occurrences(rule, start=a, end=c), rule
        monday0 = anchor - timedelta(days=anchor.weekday())
        for d in left + right:
            assert d >= anchor
            if days is None:
                assert (d - anchor).days % interval == 0
            else:
                assert d.weekday() in days
                assert ((d - monday0).days // 7) % interval == 0


def test_count_windows_compose_fuzzed() -> None:
    """With a count, the union of every window is exactly `count` dates, and
    `next_occurrence` walks the same series one step at a time."""
    rng = random.Random(7)
    for _ in range(1_000):
        freq = rng.choice(("daily", "weekly", "monthly", "yearly"))
        anchor = date(2000, 1, 1) + timedelta(days=rng.randrange(0, 36_500))
        rule = Recurrence(
            freq=freq,
            interval=rng.randint(1, 4),
            by_weekday=rng.randrange(0, 128) if freq == "weekly" else 0,
            anchor=anchor,
            count=rng.randint(1, 30),
        )
        full = occurrences(rule, start=date(1999, 1, 1), end=date(2300, 1, 1))
        assert len(full) == rule.count, rule
        walked = []
        cursor = anchor - timedelta(days=1)
        while (step := next_occurrence(rule, after=cursor)) is not None:
            walked.append(step)
            cursor = step
        assert walked == full, rule


# ── T-PLT-X09-6: purity ───────────────────────────────────────────────────────


@pytest.mark.parametrize("module", ["recurrence.py", "periods.py"])
def test_the_primitives_import_nothing_from_apps_and_read_no_clock(module: str) -> None:
    """T-PLT-X09-6 and BR-9: pure code, callable from every engine without
    dragging an app along; and no `date.today()` — a primitive that reads a
    clock computes the server's today, not the tenant's."""
    path = pathlib.Path(__file__).resolve().parents[1] / module
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            assert not (node.module or "").startswith(("apps", "django")), node.module
        if isinstance(node, ast.Import):
            assert not any(a.name.startswith(("apps", "django")) for a in node.names)
        if isinstance(node, ast.Attribute):
            assert node.attr not in {"today", "now", "utcnow"}, f"{module} reads a clock"


def _is_member(rule: Recurrence, d: date) -> bool:
    """A day-by-day membership predicate, sharing no arithmetic with the
    implementation: the adversarial oracle for every frequency."""
    anchor = rule.anchor
    if d < anchor:
        return False
    if rule.freq == "daily":
        return (d - anchor).days % rule.interval == 0
    if rule.freq == "weekly":
        days = set(mask_weekdays(rule.by_weekday)) or {anchor.weekday()}
        monday0 = anchor - timedelta(days=anchor.weekday())
        return d.weekday() in days and ((d - monday0).days // 7) % rule.interval == 0
    day = rule.by_month_day if rule.by_month_day is not None else anchor.day
    last = calendar.monthrange(d.year, d.month)[1]
    if d.day != (last if day == -1 else min(day, last)):
        return False
    if rule.freq == "monthly":
        months = (d.year - anchor.year) * 12 + (d.month - anchor.month)
        return months % rule.interval == 0
    return d.month == anchor.month and (d.year - anchor.year) % rule.interval == 0


def test_occurrences_match_a_day_by_day_membership_oracle_fuzzed() -> None:
    """Adversarial pass (A9a): for random rules of every frequency, with a
    count or an until, and a window starting before, at or long after the
    anchor, the result is exactly the member days in the window — found by
    walking every calendar day, not by the index arithmetic under test."""
    rng = random.Random(31)
    for _ in range(1_500):
        freq = rng.choice(("daily", "weekly", "monthly", "yearly"))
        anchor = date(2000, 1, 1) + timedelta(days=rng.randrange(0, 36_000))
        rule = Recurrence(
            freq=freq,
            interval=rng.randint(1, 5 if freq == "yearly" else 13),
            by_weekday=rng.randrange(0, 128) if freq == "weekly" else 0,
            by_month_day=(
                rng.choice((None, -1, rng.randint(1, 31)))
                if freq in ("monthly", "yearly")
                else None
            ),
            anchor=anchor,
            count=rng.choice((None, rng.randint(1, 40))),
            until=rng.choice((None, anchor + timedelta(days=rng.randrange(0, 3_000)))),
        )
        start = anchor + timedelta(days=rng.randrange(-60, 1_500))
        end = start + timedelta(days=rng.randrange(0, 800))
        members = []
        index = 0
        d = anchor
        while d < end:
            if _is_member(rule, d):
                if rule.count is not None and index >= rule.count:
                    break
                if rule.until is not None and d > rule.until:
                    break
                if d >= start:
                    members.append(d)
                index += 1
            d += timedelta(days=1)
        assert occurrences(rule, start=start, end=end) == members, rule
