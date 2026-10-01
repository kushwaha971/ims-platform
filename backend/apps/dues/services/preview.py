"""The one computation behind the preview, the backdated 409 and the write (BR-7).

`compute_dues` is pure apart from ONE calendar read (`closed_days_between`, only
when the closed-day rule is not `ignore`). `preview_schedule` returns it,
`create_schedule` raises its rows in the 409 and then inserts exactly those
rows — so what the merchant confirmed is what is written.

── How the series is read (BR-4, BR-5, BR-6, R44, C-3, C-5, C-7) ─────────────
* The schedule's rule is the plan's with `anchor = start` (the join date when
  one is given, C-3). For `align_to_join` the rule's day is the join day, so the
  first period starts on it and there is never a stub.
* A start that is not an occurrence of the rule (joining on 12 Oct a plan due
  on the 1st) opens with a STUB due dated the start, for `[start, first
  occurrence)`, priced by the join policy (BR-6); `next_period` has no stub.
  The stub counts toward a fixed `count` (C-5, Q-D4): a 12-part plan is 12 dues
  whatever the join day.
* `count` is applied to dues that are NOT skipped (R44): the series is read
  with `count=None` and stops at `count` live dues, so `skip` on a closed day
  extends the schedule instead of shortening it.
* The period of an occurrence is `period_after` (to the next occurrence); a
  `once` rule or the last explicit date has none, so its period is `[due,
  end_on)` or one day (C-7).
* The window: a bounded plan (a `count`, explicit dates, `supplied`, or a
  `total_split`, which must know its parts) is materialised whole; an
  open-ended one to `today + 24 months`, never past `until` or `end_on` (BR-4).
  `horizon` is what `materialised_until` records (C-9).
"""

from __future__ import annotations

import calendar
import dataclasses
import datetime as dt
from collections.abc import Iterator
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Any, TypedDict

from apps.common.money import ZERO, D, q2, round_amount, split_total
from apps.common.periods import Period, period_label
from apps.common.recurrence import LAST_DAY, Recurrence, next_occurrence, period_after
from apps.dues.constants import (
    WINDOW_MONTHS,
    AmountRule,
    ClosedDayRule,
    Component,
    DueStatus,
    JoinPolicy,
    Mode,
)

#: How far past the last candidate the one calendar read reaches, so `move`
#: finds the next open day inside the set it already holds.
MOVE_SLACK_DAYS = 31
#: Hard ceiling on dues one computation produces (the recurrence module's BR-6).
MAX_DUES = 1000


class ComponentAmount(TypedDict):
    component: str
    amount: Decimal


class SuppliedDue(TypedDict, total=False):
    """`amount_rule="supplied"`: the vertical's own instalment (lending)."""

    due_on: dt.date  # when given on every row, the list defines the dates (EC-5)
    amount: Decimal
    components: list[ComponentAmount]


class DuePreview(TypedDict, total=False):
    seq: int
    period_start: dt.date
    period_end: dt.date
    period_label: str
    due_on: dt.date
    amount: Decimal
    status: str  # "scheduled" | "skipped"
    components: list[ComponentAmount]  # expectation only


@dataclass(frozen=True)
class Terms:
    """What the computation reads, taken from a plan or from a schedule's snapshot."""

    module: str
    mode: str
    rule: Recurrence
    amount_rule: str
    amount: Decimal | None
    total: Decimal | None
    split_weights: tuple[Decimal, ...] = ()
    join_policy: str = JoinPolicy.FULL
    rounding_rule: str = "rupee"
    closed_day_rule: str = ClosedDayRule.IGNORE


@dataclass
class Computed:
    rows: list[DuePreview]
    horizon: dt.date
    rule: Recurrence  # the schedule's rule, anchored
    warnings: list[dict] = field(default_factory=list)


class ScheduleInputError(ValueError):
    """Field errors for the caller's 400, keyed as the API reports them."""

    def __init__(self, errors: dict[str, list[str]]) -> None:
        self.errors = errors
        super().__init__(str(errors))


def terms_of_plan(plan: Any) -> Terms:
    return Terms(
        module=plan.module,
        mode=plan.mode,
        rule=plan.recurrence,
        amount_rule=plan.amount_rule,
        amount=plan.amount,
        total=plan.total,
        split_weights=tuple(D(w) for w in (plan.split_weights or ())),
        join_policy=plan.join_policy,
        rounding_rule=plan.rounding_rule,
        closed_day_rule=plan.closed_day_rule,
    )


# ── dates ──────────────────────────────────────────────────────────────────


def add_months(on: dt.date, months: int) -> dt.date:
    total = on.year * 12 + (on.month - 1) + months
    year, month0 = divmod(total, 12)
    last = calendar.monthrange(year, month0 + 1)[1]
    return dt.date(year, month0 + 1, min(on.day, last))


def window_end(today: dt.date) -> dt.date:
    """BR-4 — the open-ended horizon: today + 24 months."""
    return add_months(today, WINDOW_MONTHS)


def _anchored(rule: Recurrence, start: dt.date, join_policy: str) -> Recurrence:
    changes: dict[str, Any] = {"anchor": start}
    if join_policy == JoinPolicy.ALIGN_TO_JOIN and not rule.explicit_dates:
        # The join day becomes the rule's day: the first period starts on it.
        if rule.freq in ("monthly", "yearly"):
            changes["by_month_day"] = None
        elif rule.freq == "weekly":
            changes["by_weekday"] = 0
    return dataclasses.replace(rule, **changes)


def _series(rule: Recurrence, start: dt.date) -> Iterator[dt.date]:
    """Every occurrence on or after `start`, honouring `until` but NOT `count` (R44)."""
    unbounded = dataclasses.replace(rule, count=None)
    after = start - dt.timedelta(days=1)
    while True:
        day = next_occurrence(unbounded, after=after)
        if day is None:
            return
        yield day
        after = day


def _previous_occurrence(rule: Recurrence, first: dt.date) -> dt.date:
    """The grid date one step before `first` — the start of the period a stub is part of."""
    if rule.freq == "monthly":
        day = rule.by_month_day if rule.by_month_day is not None else first.day
        back = add_months(dt.date(first.year, first.month, 1), -rule.interval)
        last = calendar.monthrange(back.year, back.month)[1]
        return dt.date(back.year, back.month, last if day == LAST_DAY else min(day, last))
    if rule.freq == "yearly":
        day = rule.by_month_day if rule.by_month_day is not None else first.day
        year = first.year - rule.interval
        last = calendar.monthrange(year, first.month)[1]
        return dt.date(year, first.month, last if day == LAST_DAY else min(day, last))
    if rule.freq == "weekly":
        return first - dt.timedelta(days=7 * rule.interval)
    return first - dt.timedelta(days=rule.interval)  # daily


def _label_style(rule: Recurrence) -> str:
    """C-8 — derived, not stored: a calendar month or an Indian FY when the rule
    lines up with one, otherwise the honest date range."""
    day = rule.by_month_day if rule.by_month_day is not None else rule.anchor.day
    if rule.explicit_dates or rule.freq == "once":
        return "day"
    if rule.freq == "monthly" and rule.interval == 1 and day == 1:
        return "month"
    if rule.freq == "yearly" and rule.interval == 1 and day == 1 and rule.anchor.month == 4:
        return "fy"
    return "range"


# ── amounts ────────────────────────────────────────────────────────────────


def _join_amount(
    amount: Decimal,
    policy: str,
    *,
    start: dt.date,
    prev: dt.date,
    first: dt.date,
    rule_freq: str,
    rounding_rule: str,
) -> Decimal:
    """BR-6 — the stub's price. `by_days` counts the join day: 12 Oct of a
    31-day month is 20 of 31 days (₹1,200 → ₹774.19 → ₹774 by `rupee`)."""
    if policy == JoinPolicy.BY_DAYS:
        remaining = (first - start).days
        period_days = (first - prev).days
        return round_amount(amount * remaining / period_days, rounding_rule)
    if policy == JoinPolicy.HALF_RULE:
        if rule_freq == "monthly":
            first_half = start.day <= 15
        else:
            first_half = (start - prev).days * 2 < (first - prev).days
        return amount if first_half else round_amount(amount / 2, rounding_rule)
    return amount


#: `numeric(14,2)` holds at most this; a larger value is a 400, not a DataError (QA-DUE-01-5).
MAX_MONEY = Decimal("999999999999.99")


def _amount_or_none(value: Any) -> Decimal | None:
    """A 2-dp amount the column can hold, or None for anything else (QA-DUE-01-4)."""
    if value is None or isinstance(value, (bool, float)):
        return None
    try:
        amount = D(value)
        if not amount.is_finite() or amount != q2(amount) or abs(amount) > MAX_MONEY:
            return None
        return q2(amount)
    except (InvalidOperation, ValueError, TypeError):
        return None


def _validate_supplied(supplied: list[Any], mode: str) -> list[SuppliedDue]:
    errors: dict[str, list[str]] = {}
    rows: list[SuppliedDue] = []
    if not supplied:
        raise ScheduleInputError({"supplied": ["Supply at least one instalment."]})
    with_dates = [bool(row.get("due_on")) for row in supplied]
    if any(with_dates) and not all(with_dates):
        errors.setdefault("supplied", []).append("Give a date on every instalment, or on none.")
    for index, row in enumerate(supplied):
        amount = _amount_or_none(row.get("amount"))
        if amount is None:
            errors.setdefault(f"supplied.{index}.amount", []).append("Enter an amount.")
            continue
        if amount < 0:
            errors.setdefault(f"supplied.{index}.amount", []).append("Cannot be negative.")
        components: list[ComponentAmount] = []
        seen: set[str] = set()
        for comp in row.get("components") or []:
            name = comp.get("component")
            if name not in Component.values or name in seen:
                errors.setdefault(f"supplied.{index}.components", []).append(
                    "Each part is principal, interest, fee or charge, once."
                )
                break
            seen.add(name)
            value = _amount_or_none(comp.get("amount"))
            if value is None:
                errors.setdefault(f"supplied.{index}.components", []).append("Enter an amount.")
                break
            if value < 0:
                errors.setdefault(f"supplied.{index}.components", []).append("Cannot be negative.")
            components.append({"component": name, "amount": value})
        if components and q2(sum((c["amount"] for c in components), ZERO)) != amount:
            errors.setdefault(f"supplied.{index}.components", []).append(
                "The parts must add up to the instalment."
            )
        out: SuppliedDue = {"amount": amount}
        if row.get("due_on"):
            out["due_on"] = row["due_on"]
        if components:
            out["components"] = components
        elif mode == Mode.EXPECTATION:
            out["components"] = [{"component": Component.PRINCIPAL.value, "amount": amount}]
        rows.append(out)
    if errors:
        raise ScheduleInputError(errors)
    if any(with_dates):
        dates = [row["due_on"] for row in rows]
        if len(set(dates)) != len(dates):
            raise ScheduleInputError({"supplied": ["Two instalments share a date."]})
        rows.sort(key=lambda r: r["due_on"])
    return rows


# ── the computation ──────────────────────────────────────────────────────────


def compute_dues(
    *,
    tenant: Any,
    terms: Terms,
    start_on: dt.date,
    end_on: dt.date | None = None,
    today: dt.date,
    supplied: list[Any] | None = None,
    join_on: dt.date | None = None,
    amount_hook: Any = None,
    closed_days: Any = None,
) -> Computed:
    """Every due the schedule would hold through its horizon, with seq 1…n.

    `closed_days(tenant, start, end, module=)` is the calendar reader
    (`closed_days_between` by default); it is called at most once.
    """
    if end_on is not None and end_on <= start_on:
        raise ScheduleInputError({"end_on": ["The end date must be after the start date."]})
    start = max(join_on or start_on, start_on)
    if terms.rule.until is not None and start > terms.rule.until:
        # QA-DUE-01-2: `until` is the plan's inclusive last date (contracts §1.8). A
        # start after it is refused rather than billed or silently left empty.
        raise ScheduleInputError(
            {"start_on": [f"This plan ended on {terms.rule.until.isoformat()}."]}
        )
    rule = _anchored(terms.rule, start, terms.join_policy)
    supplied_rows = (
        _validate_supplied(supplied, terms.mode)
        if terms.amount_rule == AmountRule.SUPPLIED
        else None
    )
    if terms.amount_rule == AmountRule.SUPPLIED and supplied_rows is None:
        raise ScheduleInputError({"supplied": ["This plan needs the instalments supplied."]})

    # ── how many live dues, and how far ──
    target: int | None = rule.count
    if supplied_rows is not None:
        if rule.count is not None and rule.count != len(supplied_rows):
            raise ScheduleInputError(
                {
                    "supplied": [
                        f"The plan has {rule.count} instalments; {len(supplied_rows)} given."
                    ]
                }
            )
        target = len(supplied_rows)
    if terms.amount_rule == AmountRule.TOTAL_SPLIT and target is None:
        if terms.split_weights:
            target = len(terms.split_weights)
        elif rule.explicit_dates:
            target = len(rule.explicit_dates)
        else:
            raise ScheduleInputError(
                {"recurrence.count": ["A split total needs a number of parts."]}
            )
    bounded = target is not None or bool(rule.explicit_dates) or rule.freq == "once"
    limit_date = None if bounded else window_end(today)

    # ── nominal dates and periods ──
    nominal: list[tuple[dt.date, Period, bool]] = []  # (date, period, is_stub)
    #: QA-DUE-01-3: the series still had dates when the cap stopped it.
    truncated = False
    style = _label_style(rule)
    if supplied_rows is not None and "due_on" in supplied_rows[0]:
        dates = [row["due_on"] for row in supplied_rows if row["due_on"] >= start]
        if len(dates) != len(supplied_rows):
            raise ScheduleInputError({"supplied": ["An instalment is dated before the start."]})
        for index, day in enumerate(dates):
            following = dates[index + 1] if index + 1 < len(dates) else None
            nominal.append((day, _period(day, following, end_on), False))
        style = "day"
    else:
        series = _series(rule, start)
        first = next(series, None)
        if first is not None:
            stub = (
                first > start
                and terms.join_policy not in (JoinPolicy.NEXT_PERIOD, JoinPolicy.ALIGN_TO_JOIN)
                and not rule.explicit_dates
                and rule.freq != "once"
                and supplied_rows is None
            )
            if stub:
                nominal.append((start, Period(start, first), True))
            budget = (target * 2 + MOVE_SLACK_DAYS) if target is not None else MAX_DUES
            day: dt.date | None = first
            while day is not None:
                if limit_date is not None and day > limit_date:
                    break
                if end_on is not None and day >= end_on:
                    break
                if len(nominal) >= min(budget, MAX_DUES):
                    truncated = True
                    break
                nominal.append((day, _period_of(rule, day, end_on), False))
                day = next(series, None)

    # ── the closed-day rule, against ONE calendar read ──
    closed: set[dt.date] = set()
    if terms.closed_day_rule != ClosedDayRule.IGNORE and nominal:
        if closed_days is None:
            from apps.platform_app.services.calendar import closed_days_between as closed_days
        closed = closed_days(
            tenant,
            nominal[0][0],
            nominal[-1][0] + dt.timedelta(days=MOVE_SLACK_DAYS),
            module=terms.module,
        )

    rows: list[DuePreview] = []
    live = 0
    for day, period, is_stub in nominal:
        if target is not None and live >= target:
            break
        status = DueStatus.SCHEDULED.value
        due_on = day
        if day in closed:
            if terms.closed_day_rule == ClosedDayRule.SKIP and not is_stub:
                status = DueStatus.SKIPPED.value
            else:
                due_on = _next_open(day, closed)
        row: DuePreview = {
            "seq": len(rows) + 1,
            "period_start": period.start,
            "period_end": period.end,
            "period_label": period_label(
                period,
                style="range" if is_stub else style,
                locale=getattr(tenant, "locale", "en") or "en",
            ),
            "due_on": due_on,
            "amount": ZERO,
            "status": status,
        }
        rows.append(row)
        if status != DueStatus.SKIPPED:
            live += 1
    if target is not None and live < target:
        if truncated:
            raise ScheduleInputError(
                {"recurrence": [f"More than {MAX_DUES} dues; shorten the plan."]}
            )
        if terms.amount_rule != AmountRule.FIXED or supplied_rows is not None:
            raise ScheduleInputError(
                {"recurrence": ["The rule ends before every instalment has a date."]}
            )

    _price(rows, terms, supplied_rows, start=start, nominal=nominal, rule=rule)
    if amount_hook is not None:
        for row in rows:
            if row["status"] != DueStatus.SKIPPED:
                row["amount"] = q2(D(amount_hook(tenant, dict(row))))
                if row["amount"] < 0:
                    raise ScheduleInputError({"amount": ["A due cannot be negative."]})
    if terms.mode == Mode.EXPECTATION:
        for row in rows:
            row.setdefault(
                "components", [{"component": Component.PRINCIPAL.value, "amount": row["amount"]}]
            )

    if bounded:
        horizon = max((r["due_on"] for r in rows), default=start)
    else:
        horizon = limit_date or start
        if rule.until is not None:
            horizon = min(horizon, rule.until)
        if end_on is not None:
            horizon = min(horizon, end_on - dt.timedelta(days=1))
        horizon = max(horizon, start)
        if truncated:
            # QA-DUE-01-3: the cap stopped the series before the window's end. Record
            # what WAS computed, so the run extends from there and skips nothing.
            horizon = nominal[-1][0]
    return Computed(rows=rows, horizon=horizon, rule=rule)


def _period(day: dt.date, following: dt.date | None, end_on: dt.date | None) -> Period:
    if following is not None:
        return Period(day, following)
    if end_on is not None and end_on > day:
        return Period(day, end_on)
    return Period(day, day + dt.timedelta(days=1))  # C-7


def _period_of(rule: Recurrence, day: dt.date, end_on: dt.date | None) -> Period:
    try:
        return period_after(rule, day)
    except ValueError:
        return _period(day, None, end_on)


def _next_open(day: dt.date, closed: set[dt.date]) -> dt.date:
    probe = day
    for _ in range(MOVE_SLACK_DAYS + 1):
        if probe not in closed:
            return probe
        probe += dt.timedelta(days=1)
    return day  # a month of closures: keep the agreed date rather than invent one


def _price(
    rows: list[DuePreview],
    terms: Terms,
    supplied_rows: list[SuppliedDue] | None,
    *,
    start: dt.date,
    nominal: list[tuple[dt.date, Period, bool]],
    rule: Recurrence,
) -> None:
    live = [row for row in rows if row["status"] != DueStatus.SKIPPED]
    if supplied_rows is not None:
        for row, source in zip(live, supplied_rows, strict=False):
            row["amount"] = source["amount"]
            if "components" in source:
                row["components"] = [dict(c) for c in source["components"]]  # type: ignore[misc]
        return
    if terms.amount_rule == AmountRule.TOTAL_SPLIT:
        parts: Any = list(terms.split_weights) if terms.split_weights else len(live)
        shares = split_total(terms.total, parts, rule=terms.rounding_rule)
        for row, share in zip(live, shares, strict=False):
            row["amount"] = share
    else:
        for row in live:
            row["amount"] = q2(D(terms.amount))
    # BR-6 — the join policy prices the stub only. A split TOTAL is an agreed
    # figure (BR-5: the parts add up to it exactly), so there the stub is simply
    # the first part and is not prorated again (QA-DUE-01-1).
    if (
        terms.amount_rule != AmountRule.TOTAL_SPLIT
        and nominal
        and nominal[0][2]
        and rows
        and rows[0]["status"] != DueStatus.SKIPPED
    ):
        first = nominal[1][0] if len(nominal) > 1 else nominal[0][1].end
        rows[0]["amount"] = _join_amount(
            rows[0]["amount"],
            terms.join_policy,
            start=start,
            prev=_previous_occurrence(rule, first),
            first=first,
            rule_freq=rule.freq,
            rounding_rule=terms.rounding_rule,
        )


def preview_json(row: DuePreview) -> dict:
    """The wire shape (FRD DUE-01 §6): dates ISO, money as 2-dp strings."""
    out = {
        "seq": row["seq"],
        "period_start": row["period_start"].isoformat(),
        "period_end": row["period_end"].isoformat(),
        "period_label": row["period_label"],
        "due_on": row["due_on"].isoformat(),
        "amount": str(q2(row["amount"])),
        "status": row["status"],
    }
    if "components" in row:
        out["components"] = [
            {"component": c["component"], "amount": str(q2(c["amount"]))} for c in row["components"]
        ]
    return out
