"""Recurrence rules: one tested "every month on the 31st" (ADR-055, contracts §1.8).

Pure code. It imports nothing from `apps.*` or Django, reads no clock (every
date is a tenant-local `date` the caller supplies, FRD 00 PLT-X09 BR-9), and has
no dependency — `dateutil.rrule` is excluded by ADR-021.

The rules, and why each is the rule:

* **Occurrences are computed from the anchor, never from the previous one.**
  The k-th monthly date is "anchor month + k × interval, on the rule's day,
  clamped to the month's length". A day-31 rule is on 28 Feb and back on
  31 Mar; an implementation that steps from the previous date lands on 28 Mar
  and stays there for ever (BR-1). The same for yearly 29 Feb (BR-2).
* **Nothing before the anchor.** A rule "on the 5th" agreed on the 12th starts
  next month. `count` counts from the anchor, not from the window a caller
  reads, so a windowed read of a 12-month plan never shows twelve more.
* **Weekly weeks are counted from the Monday of the anchor's week** (BR-3), so
  "every other week, Mon and Sun" anchored on a Sunday means the same weeks
  whichever of the two days the merchant started on.
* **`count` and `until` may both be set; the first reached ends the series**
  (BR-5). `until` is inclusive — "until 10 March" includes 10 March.
* **`explicit_dates` replaces the rule** (BR-4): `freq` must be `once`, and the
  dates come back sorted and unique. `count` and `until` still bound them.
* **A window that would exceed `limit` raises** (BR-6). Callers materialise in
  windows; a silently truncated list is a schedule missing its last dues.
"""

from __future__ import annotations

import calendar
import dataclasses
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from datetime import date, timedelta

from .periods import Period  # the sibling pure module; imports nothing back

FREQS = ("once", "daily", "weekly", "monthly", "yearly")
LAST_DAY = -1
MAX_INTERVAL = 366
MAX_COUNT = 1000
ALL_WEEKDAYS_MASK = 127


@dataclass(frozen=True, kw_only=True)
class Recurrence:
    """A rule as the engines store it (typed columns, `RecurrenceFields`).

    `by_weekday` is a bitmask, Mon=1 … Sun=64 (`weekday_mask`). `by_month_day`
    is 1–31 or -1 for the month's last day; `None` means the anchor's day.
    """

    freq: str
    interval: int = 1
    by_weekday: int = 0
    by_month_day: int | None = None
    anchor: date
    count: int | None = None
    until: date | None = None
    explicit_dates: tuple[date, ...] = ()

    def __post_init__(self) -> None:
        # A list is accepted and frozen, so the rule stays hashable and equal
        # to the same rule read back from a `date[]` column.
        if not isinstance(self.explicit_dates, tuple):
            object.__setattr__(self, "explicit_dates", tuple(self.explicit_dates))


def weekday_mask(weekdays: Iterable[int]) -> int:
    """`[0, 2, 4]` (0 = Monday) -> 21."""
    mask = 0
    for day in weekdays:
        if not isinstance(day, int) or not 0 <= day <= 6:
            raise ValueError(f"weekday must be 0 (Monday) to 6 (Sunday), got {day!r}")
        mask |= 1 << day
    return mask


def mask_weekdays(mask: int) -> list[int]:
    """21 -> `[0, 2, 4]`."""
    if not 0 <= mask <= ALL_WEEKDAYS_MASK:
        raise ValueError(f"weekday mask must be 0 to {ALL_WEEKDAYS_MASK}, got {mask!r}")
    return [day for day in range(7) if mask & (1 << day)]


def validate_recurrence(rule: Recurrence) -> dict[str, list[str]]:
    """Field errors keyed as the API reports them (`recurrence.by_month_day`),
    for an engine to merge into its 400. Empty when the rule is valid."""
    errors: dict[str, list[str]] = {}

    def add(field: str, message: str) -> None:
        errors.setdefault(f"recurrence.{field}", []).append(message)

    if rule.freq not in FREQS:
        add("freq", "Choose once, daily, weekly, monthly or yearly.")
    if not isinstance(rule.interval, int) or not 1 <= rule.interval <= MAX_INTERVAL:
        add("interval", f"Enter a whole number from 1 to {MAX_INTERVAL}.")
    if not isinstance(rule.by_weekday, int) or not 0 <= rule.by_weekday <= ALL_WEEKDAYS_MASK:
        add("by_weekday", "Choose days of the week.")
    elif rule.by_weekday and rule.freq != "weekly":
        add("by_weekday", "Days of the week apply to a weekly rule only.")
    if rule.by_month_day is not None:
        if rule.by_month_day != LAST_DAY and not 1 <= rule.by_month_day <= 31:
            add("by_month_day", "Enter a day from 1 to 31, or choose the last day.")
        elif rule.freq not in ("monthly", "yearly"):
            add("by_month_day", "A day of the month applies to a monthly or yearly rule only.")
    if rule.count is not None and not 1 <= rule.count <= MAX_COUNT:
        add("count", f"Enter a number of times from 1 to {MAX_COUNT}.")
    if rule.until is not None and rule.until < rule.anchor:
        add("until", "The end date cannot be before the first date.")
    if rule.explicit_dates and rule.freq != "once":
        add("freq", "A list of dates replaces the rule; the frequency must be once.")
    return errors


def _assert_valid(rule: Recurrence) -> None:
    errors = validate_recurrence(rule)
    if errors:
        raise ValueError(f"invalid recurrence: {errors}")


def _clamped(year: int, month: int, day: int) -> date:
    last = calendar.monthrange(year, month)[1]
    return date(year, month, last if day == LAST_DAY else min(day, last))


def _rule_day(rule: Recurrence) -> int:
    return rule.by_month_day if rule.by_month_day is not None else rule.anchor.day


def _monthly_candidate(rule: Recurrence, k: int) -> date:
    months = rule.anchor.year * 12 + (rule.anchor.month - 1) + k * rule.interval
    year, month0 = divmod(months, 12)
    return _clamped(year, month0 + 1, _rule_day(rule))


def _yearly_candidate(rule: Recurrence, k: int) -> date:
    return _clamped(rule.anchor.year + k * rule.interval, rule.anchor.month, _rule_day(rule))


def _indexed(rule: Recurrence, start: date) -> Iterator[tuple[int, date]]:
    """(index, date) for every occurrence on or after `max(start, anchor)`,
    ascending, unbounded by `count`/`until` — `index` is the 0-based position
    in the series counted from the anchor, which is what `count` limits."""
    anchor = rule.anchor
    start = max(start, anchor)

    if rule.explicit_dates:
        for index, day in enumerate(sorted(set(rule.explicit_dates))):
            if day >= start:
                yield index, day
        return

    if rule.freq == "once":
        if anchor >= start:
            yield 0, anchor
        return

    if rule.freq == "daily":
        k = -(-(start - anchor).days // rule.interval)  # ceiling division
        while True:
            yield k, anchor + timedelta(days=k * rule.interval)
            k += 1

    if rule.freq == "weekly":
        weekdays = mask_weekdays(rule.by_weekday) or [anchor.weekday()]
        monday0 = anchor - timedelta(days=anchor.weekday())
        first_week = [d for d in weekdays if d >= anchor.weekday()]
        j = ((start - monday0).days // 7) // rule.interval
        while True:
            week = monday0 + timedelta(weeks=j * rule.interval)
            if j == 0:
                days = [(pos, d) for pos, d in enumerate(first_week)]
            else:
                days = [
                    (len(first_week) + (j - 1) * len(weekdays) + pos, d)
                    for pos, d in enumerate(weekdays)
                ]
            for index, weekday in days:
                day = week + timedelta(days=weekday)
                if day >= start:
                    yield index, day
            j += 1

    candidate = _monthly_candidate if rule.freq == "monthly" else _yearly_candidate
    # Candidate 0 is in the anchor's month (or year); it is before the anchor
    # when the rule's day is earlier than the anchor's, and then it is not an
    # occurrence and does not count.
    skipped = 1 if candidate(rule, 0) < anchor else 0
    if rule.freq == "monthly":
        elapsed = (start.year - anchor.year) * 12 + (start.month - anchor.month)
    else:
        elapsed = start.year - anchor.year
    k = max(0, elapsed // rule.interval - 1)
    while True:
        day = candidate(rule, k)
        if day >= start:
            yield k - skipped, day
        k += 1


def _bounded(rule: Recurrence, start: date) -> Iterator[date]:
    for index, day in _indexed(rule, start):
        if rule.count is not None and index >= rule.count:
            return
        if rule.until is not None and day > rule.until:
            return
        yield day


def occurrences(rule: Recurrence, *, start: date, end: date, limit: int = 1000) -> list[date]:
    """Every date `d` of the series with `start <= d < end`, ascending.

    Raises `ValueError` for an invalid rule, or when the window holds more
    than `limit` dates (BR-6) — read it in smaller windows instead."""
    _assert_valid(rule)
    if start >= end:
        return []
    found: list[date] = []
    for day in _bounded(rule, start):
        if day >= end:
            break
        if len(found) == limit:
            raise ValueError(
                f"more than {limit} occurrences in [{start}, {end}); read a smaller window"
            )
        found.append(day)
    return found


def next_occurrence(rule: Recurrence, *, after: date) -> date | None:
    """The first occurrence strictly after `after`, or `None` if the series
    has ended (by `count`, `until`, or a `once` rule already past)."""
    _assert_valid(rule)
    return next(_bounded(rule, after + timedelta(days=1)), None)


def period_after(rule: Recurrence, occurrence: date) -> Period:
    """The period an occurrence is FOR: `[occurrence, the next occurrence)`.

    The next occurrence is taken from the rule without its `count` and `until`,
    because the last month of a three-month plan is still a month. A `once`
    rule, or the last of a list of explicit dates, has no following occurrence
    and no period; that is a `ValueError`, not a guess."""
    unbounded = dataclasses.replace(rule, count=None, until=None)
    following = next_occurrence(unbounded, after=occurrence)
    if following is None:
        raise ValueError(f"{rule.freq} rule has no occurrence after {occurrence}")
    return Period(start=occurrence, end=following)
