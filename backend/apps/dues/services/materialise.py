"""Step 1 of the daily run: extend the window, re-read the calendar (FRD DUE-02 §9, EC-3, R44).

── Extend ────────────────────────────────────────────────────────────────────
Only an OPEN-ENDED schedule grows: a fixed amount on a rule with no `count`, no
explicit dates and not `once` (`is_open_ended`). Everything else was
materialised whole by `create_schedule` (BR-4). The new dues are the rule's
occurrences after `materialised_until` — the nominal horizon (C-9) — through
`today + 24 months`, never past `until` or `end_on`. Seq continues from the
schedule's last due, so a catch-up after a week's outage writes exactly the rows
seven nightly runs would have written, in the same order (T-DUE-02-3).

── Re-read the calendar (EC-3) ────────────────────────────────────────────────
A closure added (or removed) after materialisation is applied to dues that hold
no money yet: `scheduled` or `skipped` dues whose NOMINAL date (`period_start`,
which is where every occurrence's period begins) is today or later. A posted due
is never touched.

`skip` keeps count (R44). On a count-based schedule (a `count`, a split total or
supplied instalments) a due that becomes skipped is replaced by a new due after
the schedule's last occurrence; a closure that goes away un-skips its due and
the surplus trailing due is `cancelled` ("Business days changed"). The
un-posted AMOUNTS are an ordered list that follows the live dues — the parts of
a split total stay the parts, in order, and add up to the same total.

Two cases cannot extend and fall back to `move` instead of dropping money: a
schedule whose dates are a LIST (explicit dates, `once`, supplied instalments)
and one whose rule has run out (`until`, `end_on`) before a replacement date.
"""

from __future__ import annotations

import dataclasses
import datetime as dt
from collections.abc import Callable
from decimal import Decimal
from typing import Any

from apps.common.audit import AuditAction, write_audit
from apps.common.money import ZERO, D, q2
from apps.common.periods import period_label
from apps.common.recurrence import Recurrence, next_occurrence
from apps.dues.constants import AmountRule, ClosedDayRule, Component, DueStatus, Mode
from apps.dues.models import DuesDue, DuesDueComponent, DuesSchedule
from apps.dues.services.preview import (
    MAX_DUES,
    MOVE_SLACK_DAYS,
    _label_style,
    _next_open,
    _period_of,
    _series,
    window_end,
)

#: EC-3 — the reason a surplus trailing due is cancelled when a closure goes away.
BUSINESS_DAYS_CHANGED = "Business days changed"


class ClosedDays:
    """One calendar read per module per run, widened only when a schedule asks
    for a date outside what is already held (`closed_days_between`, R32)."""

    def __init__(self, tenant: Any, reader: Callable[..., set[dt.date]] | None = None) -> None:
        self.tenant = tenant
        self._reader = reader
        self._held: dict[str, tuple[dt.date, dt.date, set[dt.date]]] = {}

    def __call__(self, module: str, start: dt.date, end: dt.date) -> set[dt.date]:
        held = self._held.get(module)
        if held is not None and held[0] <= start and end <= held[1]:
            return held[2]
        low = min(start, held[0]) if held else start
        high = max(end, held[1]) if held else end
        reader = self._reader
        if reader is None:
            from apps.platform_app.services.calendar import closed_days_between as reader
        days = set(reader(self.tenant, low, high, module=module))
        self._held[module] = (low, high, days)
        return days


def is_open_ended(schedule: DuesSchedule) -> bool:
    """BR-4 — the schedules the window applies to; every other one is whole."""
    return (
        schedule.count is None
        and not schedule.explicit_dates
        and schedule.freq != "once"
        and (schedule.terms or {}).get("amount_rule", AmountRule.FIXED) == AmountRule.FIXED
    )


def _is_listed(schedule: DuesSchedule) -> bool:
    """Dates that come from a list cannot grow a replacement (skip falls back to move)."""
    return (
        bool(schedule.explicit_dates)
        or schedule.freq == "once"
        or (schedule.terms or {}).get("amount_rule") == AmountRule.SUPPLIED
    )


def extension_limit(schedule: DuesSchedule, today: dt.date) -> dt.date:
    """The horizon an open-ended schedule is materialised to on `today`."""
    limit = window_end(today)
    if schedule.until is not None:
        limit = min(limit, schedule.until)
    if schedule.end_on is not None:
        limit = min(limit, schedule.end_on - dt.timedelta(days=1))
    return limit


def needs_extension(schedule: DuesSchedule, today: dt.date) -> bool:
    return is_open_ended(schedule) and schedule.materialised_until < extension_limit(
        schedule, today
    )


def _hooked(tenant: Any, amount_hook: Any, row: dict) -> Decimal:
    if amount_hook is None:
        return q2(row["amount"])
    value = q2(D(amount_hook(tenant, dict(row))))
    if value < 0:
        raise ValueError("amount_hook returned a negative amount")
    return value


def _locale(tenant: Any) -> str:
    return getattr(tenant, "locale", "en") or "en"


def _principal(schedule: DuesSchedule, amount: Decimal) -> list[dict]:
    if schedule.mode != Mode.EXPECTATION:
        return []
    return [{"component": Component.PRINCIPAL.value, "amount": amount}]


def _row(
    *,
    tenant: Any,
    schedule: DuesSchedule,
    rule: Recurrence,
    day: dt.date,
    seq: int,
    closed: set[dt.date],
    style: str,
) -> dict:
    period = _period_of(rule, day, schedule.end_on)
    status, due_on = DueStatus.SCHEDULED.value, day
    if day in closed:
        if schedule.closed_day_rule == ClosedDayRule.SKIP:
            status = DueStatus.SKIPPED.value
        else:
            due_on = _next_open(day, closed)
    return {
        "seq": seq,
        "period_start": period.start,
        "period_end": period.end,
        "period_label": period_label(period, style=style, locale=_locale(tenant)),
        "due_on": due_on,
        "amount": ZERO,
        "status": status,
    }


def extend(
    *,
    tenant: Any,
    schedule: DuesSchedule,
    today: dt.date,
    closed_days: ClosedDays,
    amount_hook: Any = None,
) -> list[DuesDue]:
    """Materialise an open-ended schedule's next dues. The caller holds the
    party and the schedule locks. Returns the dues written (possibly none)."""
    from apps.dues.services.schedules import _insert_dues

    if not needs_extension(schedule, today):
        return []
    limit = extension_limit(schedule, today)
    rule = schedule.recurrence
    start = schedule.materialised_until + dt.timedelta(days=1)
    days: list[dt.date] = []
    capped = False
    for day in _series(rule, start):
        if day > limit or (schedule.end_on is not None and day >= schedule.end_on):
            break
        if len(days) >= MAX_DUES:
            capped = True
            break
        days.append(day)
    rows: list[dict] = []
    if days:
        closed: set[dt.date] = set()
        if schedule.closed_day_rule != ClosedDayRule.IGNORE:
            closed = closed_days(
                schedule.module, days[0], days[-1] + dt.timedelta(days=MOVE_SLACK_DAYS)
            )
        last_seq = (
            DuesDue.objects.filter(schedule=schedule).order_by("-seq").values_list("seq", flat=True)
        ).first() or 0
        style = _label_style(rule)
        for offset, day in enumerate(days, start=1):
            row = _row(
                tenant=tenant,
                schedule=schedule,
                rule=rule,
                day=day,
                seq=last_seq + offset,
                closed=closed,
                style=style,
            )
            if row["status"] != DueStatus.SKIPPED:
                row["amount"] = _hooked(tenant, amount_hook, {**row, "amount": schedule.amount})
                row["components"] = _principal(schedule, row["amount"])
            rows.append(row)
    # QA-DUE-01-3's rule: a capped series records what WAS computed, so the next
    # run continues from there and nothing is skipped.
    horizon = days[-1] if capped else limit
    dues = _insert_dues(tenant=tenant, schedule=schedule, rows=rows) if rows else []
    if horizon != schedule.materialised_until:
        DuesSchedule.objects.filter(pk=schedule.pk).update(materialised_until=horizon)
        schedule.materialised_until = horizon
    return dues


# ── EC-3 / R44 ──────────────────────────────────────────────────────────────


@dataclasses.dataclass
class _Part:
    amount: Decimal
    components: list[dict]


def _components_of(due: DuesDue) -> list[dict]:
    return [
        {"component": c.component, "amount": c.amount}
        for c in sorted(due.components.all(), key=lambda c: c.component)
    ]


def _is_stub(rule: Recurrence, due: DuesDue, listed: bool) -> bool:
    """A join stub is seq 1 dated off the rule's grid; it moves, never skips."""
    if due.seq != 1 or listed:
        return False
    unbounded = dataclasses.replace(rule, count=None)
    return next_occurrence(unbounded, after=due.period_start - dt.timedelta(days=1)) != (
        due.period_start
    )


def _set_part(tenant: Any, due: DuesDue, part: _Part | None) -> bool:
    """Write the amount and components a due should carry; True when it changed."""
    amount = part.amount if part is not None else ZERO
    components = part.components if part is not None else []
    current = _components_of(due)
    if due.amount == amount and current == sorted(components, key=lambda c: c["component"]):
        return False
    DuesDueComponent.objects.filter(due=due).delete()  # un-posted rows only (scheduled/skipped)
    if components:
        DuesDueComponent.objects.bulk_create(
            [
                DuesDueComponent(
                    tenant=tenant, due=due, component=c["component"], amount=q2(c["amount"])
                )
                for c in components
            ]
        )
    DuesDue.objects.filter(pk=due.pk).update(amount=amount)
    due.amount = amount
    return True


def reapply_closed_days(
    *,
    ctx: Any,
    schedule: DuesSchedule,
    today: dt.date,
    closed_days: ClosedDays,
    amount_hook: Any = None,
) -> dict[str, int]:
    """EC-3 — re-apply the closed-day rule to the dues that hold no money yet.
    Returns `{"changed": n, "skipped": k}`: dues moved, skipped, un-skipped,
    added or cancelled, and how many of them the rule newly skipped."""
    from apps.dues.services.schedules import _insert_dues

    tenant = ctx.tenant
    none = {"changed": 0, "skipped": 0}
    if schedule.closed_day_rule == ClosedDayRule.IGNORE:
        return none
    dues = list(
        DuesDue.objects.filter(schedule=schedule).prefetch_related("components").order_by("seq")
    )
    future = [
        d
        for d in dues
        if d.status in (DueStatus.SCHEDULED, DueStatus.SKIPPED) and d.period_start >= today
    ]
    if not future:
        return none
    rule = schedule.recurrence
    listed = _is_listed(schedule)
    counted = not is_open_ended(schedule)
    closed = closed_days(
        schedule.module,
        future[0].period_start,
        future[-1].period_start + dt.timedelta(days=MOVE_SLACK_DAYS),
    )

    def desired(due: DuesDue, *, allow_skip: bool) -> tuple[str, dt.date]:
        nominal = due.period_start
        if nominal not in closed:
            return DueStatus.SCHEDULED.value, nominal
        if (
            allow_skip
            and schedule.closed_day_rule == ClosedDayRule.SKIP
            and not _is_stub(rule, due, listed)
        ):
            return DueStatus.SKIPPED.value, nominal
        return DueStatus.SCHEDULED.value, _next_open(nominal, closed)

    allow_skip = not listed
    plan = {d.id: desired(d, allow_skip=allow_skip) for d in future}
    appended: list[dict] = []
    parts: list[_Part] = []
    surplus: list[DuesDue] = []
    if counted:
        parts = [
            _Part(d.amount, _components_of(d)) for d in future if d.status == DueStatus.SCHEDULED
        ]
        live = [d for d in future if plan[d.id][0] == DueStatus.SCHEDULED]
        deficit = len(parts) - len(live)
        if deficit > 0:
            found = _replacements(
                tenant=tenant,
                schedule=schedule,
                rule=rule,
                # After the last due still standing: a replacement cancelled when
                # a closure was lifted leaves its month free, so re-adding the
                # closure must reuse that month, not march one further out
                # (DUE-02 QA-DUE-02-1).
                after=max(
                    (d.period_start for d in dues if d.status != DueStatus.CANCELLED),
                    default=max(d.period_start for d in dues),
                ),
                last_seq=dues[-1].seq,
                wanted=deficit,
                closed_days=closed_days,
            )
            if found is None:  # the rule ran out: keep every agreed due, moved
                plan = {d.id: desired(d, allow_skip=False) for d in future}
                live = [d for d in future if plan[d.id][0] == DueStatus.SCHEDULED]
                deficit = len(parts) - len(live)
            else:
                appended = found
        if deficit < 0:
            surplus = live[deficit:]

    changed = skipped = 0
    for due in future:
        status, due_on = plan[due.id]
        if due in surplus:
            before = due.status
            DuesDue.objects.filter(pk=due.pk).update(
                status=DueStatus.CANCELLED, cancel_reason=BUSINESS_DAYS_CHANGED
            )
            due.status = DueStatus.CANCELLED.value
            write_audit(
                ctx=ctx,
                action=AuditAction.DUES_DUE_CANCELLED,
                entity_type="dues_due",
                entity_id=due.id,
                before={"status": before},
                after={"status": due.status},
                metadata={"reason": BUSINESS_DAYS_CHANGED},
            )
            changed += 1
            continue
        if (status, due_on) != (due.status, due.due_on):
            skipped += status == DueStatus.SKIPPED
            DuesDue.objects.filter(pk=due.pk).update(status=status, due_on=due_on)
            due.status, due.due_on = status, due_on
            changed += 1
        if not counted:
            # Open-ended: a skipped due carries nothing; an un-skipped one the plan's amount.
            if status == DueStatus.SKIPPED:
                _set_part(tenant, due, None)
            elif due.amount == 0 and schedule.amount:
                amount = _hooked(
                    tenant,
                    amount_hook,
                    {
                        "seq": due.seq,
                        "period_start": due.period_start,
                        "period_end": due.period_end,
                        "period_label": due.period_label,
                        "due_on": due.due_on,
                        "amount": schedule.amount,
                        "status": status,
                    },
                )
                _set_part(tenant, due, _Part(amount, _principal(schedule, amount)))
    if counted:
        new_dues = _insert_dues(tenant=tenant, schedule=schedule, rows=appended) if appended else []
        changed += len(new_dues)
        skipped += sum(1 for d in new_dues if d.status == DueStatus.SKIPPED)
        live_dues = [d for d in future if d.status == DueStatus.SCHEDULED and d not in surplus] + [
            d for d in new_dues if d.status == DueStatus.SCHEDULED
        ]
        for due in [d for d in future if d.status == DueStatus.SKIPPED] + [
            d for d in new_dues if d.status == DueStatus.SKIPPED
        ]:
            _set_part(tenant, due, None)
        for due, part in zip(live_dues, parts, strict=False):
            _set_part(tenant, due, part)
        if new_dues:
            last = max(d.due_on for d in new_dues)
            if last > schedule.materialised_until:
                DuesSchedule.objects.filter(pk=schedule.pk).update(materialised_until=last)
                schedule.materialised_until = last
    return {"changed": changed, "skipped": skipped}


def _replacements(
    *,
    tenant: Any,
    schedule: DuesSchedule,
    rule: Recurrence,
    after: dt.date,
    last_seq: int,
    wanted: int,
    closed_days: ClosedDays,
) -> list[dict] | None:
    """R44 — the next `wanted` live occurrences after the schedule's last one (with
    any skipped ones in between, as rows), or None when the rule runs out first."""
    rows: list[dict] = []
    live = 0
    style = _label_style(rule)
    for day in _series(rule, after + dt.timedelta(days=1)):
        if schedule.end_on is not None and day >= schedule.end_on:
            break
        if len(rows) >= MAX_DUES:
            break
        closed = closed_days(schedule.module, day, day + dt.timedelta(days=MOVE_SLACK_DAYS))
        row = _row(
            tenant=tenant,
            schedule=schedule,
            rule=rule,
            day=day,
            seq=last_seq + len(rows) + 1,
            closed=closed,
            style=style,
        )
        rows.append(row)
        if row["status"] != DueStatus.SKIPPED:
            live += 1
            if live == wanted:
                return rows
    return None
