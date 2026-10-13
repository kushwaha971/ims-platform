"""QA F8 — holidays move a loan's unpaid instalments, and its end date with them.

The calendar never rewrites history (its BR-4), so lending listens for a change
(`calendar.register_calendar_listener`) and re-dates only what holds no money yet:
the instalments after the last one that is past or carries money. Nothing settled,
waived or already due yesterday is ever moved.

How they move is the loan's own rule, the one `calculator.due_dates` uses when a
loan is given:

* **Daily** — the movable instalments are laid out again, one per open collection
  day, from the day after the last fixed one (never before today). A new holiday
  pushes every later instalment one collection day on; lifting it pulls them back;
  the count never changes, so the end date is what moves.
* **Weekly, fortnightly, monthly** — each movable instalment goes to the first open
  day on or after its agreed date, after the instalment before it. The weekday or
  day of the month is the agreement, so only the instalment on the holiday moves.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from apps.common.audit import write_audit
from apps.common.dates import tenant_today
from apps.common.periods import Period, period_label
from apps.lending.constants import MODULE, LoanStatus
from apps.lending.models import LendingLoan
from apps.lending.services.calculator import LoanTerms, due_dates

#: Far enough ahead for any loan's remaining instalments to find their days.
HORIZON_DAYS = 3 * 366


def terms_of(loan: LendingLoan) -> LoanTerms:
    """The agreement as saved — enough for the dates (amounts are not re-derived)."""
    return LoanTerms(
        plan_type=loan.plan_type,
        principal=loan.principal,
        disbursed_on=loan.disbursed_on,
        first_due_on=loan.first_due_on,
        frequency=loan.frequency,
        instalment_count=loan.instalment_count,
        rate=loan.rate,
        rate_unit=loan.rate_unit,
        per_instalment_amount=loan.per_instalment_amount,
        collection_weekdays=loan.collection_weekdays,
        rounding_rule=loan.rounding_rule,
    )


def _holds_money(due: Any) -> bool:
    return bool(due.settled_amount) or bool(due.waived_amount) or bool(due.penalty_amount)


def _targets(
    loan: LendingLoan, movable: list, after: dt.date | None, today: dt.date, closed: set[dt.date]
) -> list[dt.date]:
    if loan.frequency == "daily":
        weekdays = {d for d in range(7) if loan.collection_weekdays & (1 << d)}
        day = max(today, after + dt.timedelta(days=1) if after else loan.first_due_on)
        out: list[dt.date] = []
        while len(out) < len(movable):
            if day.weekday() in weekdays and day not in closed:
                out.append(day)
            day += dt.timedelta(days=1)
        return out
    agreed = due_dates(terms_of(loan))
    out = []
    floor = after
    for due in movable:
        day = max(agreed[due.seq - 1], today)
        if floor is not None and day <= floor:
            day = floor + dt.timedelta(days=1)
        while day in closed:
            day += dt.timedelta(days=1)
        out.append(day)
        floor = day
    return out


def redate_loan(ctx: Any, loan: LendingLoan, today: dt.date, closed: set[dt.date]) -> int:
    """Re-date one loan's movable instalments; the number moved."""
    from apps.dues.constants import DueStatus
    from apps.dues.models import DuesDue, DuesSchedule

    dues = list(
        DuesDue.objects.select_for_update()
        .filter(schedule_id=loan.schedule_id)
        .exclude(status__in=[DueStatus.CANCELLED, DueStatus.SKIPPED])
        .order_by("seq")
    )
    fixed = [
        i
        for i, d in enumerate(dues)
        if d.due_on < today
        or _holds_money(d)
        or d.status not in (DueStatus.SCHEDULED, DueStatus.DUE)
    ]
    start = fixed[-1] + 1 if fixed else 0
    movable = dues[start:]
    if not movable:
        return 0
    after = dues[start - 1].due_on if start else None
    targets = _targets(loan, movable, after, today, closed)
    locale = getattr(loan.tenant, "locale", "en") or "en"
    moved = 0
    for due, day in zip(movable, targets, strict=True):
        if day == due.due_on:
            continue
        old = due.due_on
        fields: dict[str, Any] = {"due_on": day}
        if due.period_start == old:
            # A loan's instalment is a one-day period [due, due + 1): the whole period
            # moves with it, and its label ("16 Oct 2026") is written again.
            shift = day - old
            moved_period = Period(due.period_start + shift, due.period_end + shift)
            fields["period_start"] = moved_period.start
            fields["period_end"] = moved_period.end
            fields["period_label"] = period_label(moved_period, style="day", locale=locale)
        if due.status == DueStatus.DUE and day > today:
            fields["status"] = DueStatus.SCHEDULED
        DuesDue.objects.filter(pk=due.pk).update(**fields)
        moved += 1
    if moved:
        end = targets[-1]
        if end != loan.maturity_on:
            DuesSchedule.objects.filter(pk=loan.schedule_id, end_on=loan.maturity_on).update(
                end_on=end
            )
            before = loan.maturity_on
            loan.maturity_on = end
            loan.save(update_fields=["maturity_on", "updated_at"])
        else:
            before = end
        write_audit(
            ctx=ctx,
            action="lending.loan.redated",
            entity_type="lending_loan",
            entity_id=loan.id,
            before={"maturity_on": before.isoformat()},
            after={"maturity_on": end.isoformat(), "moved": moved},
            metadata={"reason": "Business days changed"},
        )
    return moved


def on_calendar_changed(*, ctx: Any, module: str | None) -> None:
    """The calendar listener: every active loan of the tenant, when the change reaches
    lending (a tenant-wide closure, or one for lending)."""
    if module not in (None, MODULE):
        return
    from apps.platform_app.services.calendar import closed_days_between

    today = tenant_today(ctx.tenant)
    closed = closed_days_between(
        ctx.tenant, today, today + dt.timedelta(days=HORIZON_DAYS), module=MODULE
    )
    loans = LendingLoan.objects.select_for_update().filter(
        tenant=ctx.tenant, status=LoanStatus.ACTIVE, schedule_id__isnull=False
    )
    for loan in loans.exclude(plan_type="flexible"):
        redate_loan(ctx, loan, today, closed)
