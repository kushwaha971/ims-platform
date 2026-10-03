"""`run_for_tenant` — the dues engine's daily run (FRD 00 DUE-02, contracts §2.1, ADR-048).

── One transaction per schedule, not one per tenant ──────────────────────────
FRD §3 says "per-schedule savepoints". A tenant-wide transaction with
savepoints would hold every party lock of the tenant until the last schedule
was done — a minute on a large book (T-DUE-02-9), with the counter blocked on
every party the run had touched. So each schedule is its own outermost
`transaction.atomic()` (a savepoint when a caller already holds one, as the
test suite does), and one schedule's failure rolls back that schedule only
(BR-2), lands in `errors`, and raises ONE `dues.run_failed` notification for
the tenant's day.

── Lock order (contracts §2.1) ────────────────────────────────────────────────
party → `dues_schedule` → `dues_due` rows in `(due_on, seq)` order → the port's
documents → payments → sequence. The party is locked first even when the
schedule only needs extending, because every other writer of a party's money
(a payment, a void, DUE-05's pause) starts at the party: a run that took the
schedule first would deadlock with them (T-DUE-02-6).

── The steps, per schedule (FRD §9) ───────────────────────────────────────────
1. Extend an open-ended schedule to `today + 24 months`; re-apply the calendar
   to dues that hold no money yet (EC-3, R44). Active schedules only.
2. Post every `scheduled` due with `due_on <= today`, in `(due_on, seq)` order,
   each with its own date (`post_due`). Active schedules only (BR-4: a paused
   schedule posts nothing).
3. Overdue: `due → overdue` once `due_on + grace_days < today` and something is
   still outstanding — any schedule, because an ended membership's last unpaid
   month is still late.
4–7. Penalties (DUE-04), advance auto-apply (DUE-03) and pauses (DUE-05) are
   later tasks; their counters stay 0 until then.

Every step is idempotent: a second run for the same date writes nothing
(T-DUE-02-2), and a run after missed days writes exactly what the missed runs
would have, with the same dates (T-DUE-02-3).
"""

from __future__ import annotations

import datetime as dt
import logging
from typing import Any, TypedDict

from django.db import transaction

from apps.dues.constants import ClosedDayRule, DueStatus, ScheduleStatus
from apps.dues.models import DuesDue, DuesSchedule
from apps.dues.registry import subject_for, subject_labels
from apps.dues.services.materialise import ClosedDays, extend, needs_extension, reapply_closed_days
from apps.dues.services.posting import post_due
from apps.dues.services.preview import window_end

logger = logging.getLogger(__name__)

#: Contracts §5 — the one notification the run raises, to owners.
RUN_FAILED = "dues.run_failed"


class RunError(TypedDict):
    schedule_id: str
    code: str


class RunReport(TypedDict):
    materialised: int
    posted: int
    overdue: int
    penalties: int
    advances_applied: int
    skipped: int
    errors: list[RunError]


def _empty_report() -> RunReport:
    return {
        "materialised": 0,
        "posted": 0,
        "overdue": 0,
        "penalties": 0,
        "advances_applied": 0,
        "skipped": 0,
        "errors": [],
    }


# ── which schedules have work today ─────────────────────────────────────────


def postable_dues(tenant: Any, today: dt.date) -> Any:
    """Step 2's query: `(tenant, status, due_on)` — `ix_dues_due_status` (T-DUE-02-7)."""
    return DuesDue.objects.filter(tenant=tenant, status=DueStatus.SCHEDULED, due_on__lte=today)


def _schedules_with_work(tenant: Any, today: dt.date) -> list[tuple[Any, Any]]:
    """`[(schedule_id, party_id)]`, ordered by party then schedule, so one run
    visits a party's schedules together and two runs visit them alike."""
    wanted: set[Any] = set()
    active = DuesSchedule.objects.filter(tenant=tenant, status=ScheduleStatus.ACTIVE)
    # 1 — the window (`ix_dues_schedule_window`); bounded schedules are whole.
    for schedule in active.filter(materialised_until__lt=window_end(today)).only(
        "id", "count", "explicit_dates", "freq", "terms", "until", "end_on", "materialised_until"
    ):
        if needs_extension(schedule, today):
            wanted.add(schedule.id)
    # EC-3 — a calendar that may have changed since materialisation.
    wanted.update(
        active.exclude(closed_day_rule=ClosedDayRule.IGNORE)
        .filter(
            dues__status__in=(DueStatus.SCHEDULED, DueStatus.SKIPPED),
            dues__period_start__gte=today,
        )
        .values_list("id", flat=True)
        .distinct()
    )
    # 2 — anything dated today or before that is not posted yet.
    wanted.update(postable_dues(tenant, today).values_list("schedule_id", flat=True).distinct())
    # 3 — open dues past their date; grace is the schedule's snapshot.
    for schedule_id, due_on, grace in DuesDue.objects.filter(
        tenant=tenant, status=DueStatus.DUE, due_on__lt=today
    ).values_list("schedule_id", "due_on", "schedule__grace_days"):
        if due_on + dt.timedelta(days=grace) < today:
            wanted.add(schedule_id)
    rows = DuesSchedule.objects.filter(pk__in=wanted).values_list("id", "party_id")
    return sorted(rows, key=lambda row: (str(row[1]), str(row[0])))


# ── one schedule ────────────────────────────────────────────────────────────


def mark_overdue(*, ctx: Any, schedule: DuesSchedule, today: dt.date) -> int:
    """Step 3 — conditional, so a payment that settled the due first wins."""
    cutoff = today - dt.timedelta(days=schedule.grace_days + 1)  # due_on + grace < today
    subject = subject_for(schedule.subject_type)
    changed = 0
    for due in (
        DuesDue.objects.filter(schedule=schedule, status=DueStatus.DUE, due_on__lte=cutoff)
        .select_for_update()
        .order_by("due_on", "seq")
    ):
        outstanding = due.amount + due.penalty_amount - due.waived_amount - due.settled_amount
        if outstanding <= 0:  # EC-4: a zero due (or a settled one) is never late
            continue
        if DuesDue.objects.filter(pk=due.pk, status=DueStatus.DUE).update(status=DueStatus.OVERDUE):
            changed += 1
            due.status = DueStatus.OVERDUE.value
            due.schedule = schedule
            if subject is not None and subject.on_due_changed is not None:
                subject.on_due_changed(ctx, due, DueStatus.DUE.value, due.status)
    return changed


def run_schedule(
    *, ctx: Any, schedule_id: Any, party_id: Any, today: dt.date, closed_days: ClosedDays
) -> dict[str, int]:
    """Every step for one schedule, under its locks. The caller owns the transaction."""
    from apps.parties.services.balance import lock_party

    tenant = ctx.tenant
    party = lock_party(tenant=tenant, party_id=party_id)
    schedule = DuesSchedule.objects.select_for_update().get(tenant=tenant, pk=schedule_id)
    counts = {"materialised": 0, "posted": 0, "overdue": 0, "skipped": 0}
    if schedule.status == ScheduleStatus.ACTIVE:
        subject = subject_for(schedule.subject_type)
        hook = subject.amount_hook if subject is not None else None
        added = extend(
            tenant=tenant,
            schedule=schedule,
            today=today,
            closed_days=closed_days,
            amount_hook=hook,
        )
        counts["materialised"] = len(added)
        counts["skipped"] = sum(1 for d in added if d.status == DueStatus.SKIPPED)
        counts["skipped"] += reapply_closed_days(
            ctx=ctx, schedule=schedule, today=today, closed_days=closed_days, amount_hook=hook
        )["skipped"]
        # 2 — post, each with its own date (BR-3: nothing after today).
        dues = list(
            DuesDue.objects.filter(schedule=schedule, status=DueStatus.SCHEDULED, due_on__lte=today)
            .select_for_update()
            .order_by("due_on", "seq")
        )
        if dues:
            label = subject_labels(schedule.subject_type, {schedule.subject_id}).get(
                schedule.subject_id
            )
            for due in dues:
                due.schedule = schedule
                post_due(ctx=ctx, due=due, party=party, today=today, subject_label=label)
            counts["posted"] = len(dues)
        # 4 penalties (DUE-04), 6 advances (DUE-03), 7 pauses (DUE-05) hook in here.
    counts["overdue"] = mark_overdue(ctx=ctx, schedule=schedule, today=today)
    return counts


def _code(exc: BaseException) -> str:
    return str(getattr(exc, "code", "") or type(exc).__name__)


def run_for_tenant(*, tenant: Any, today: dt.date) -> RunReport:
    """Contracts §2.1 — the job handler's work; idempotent for a date."""
    from apps.common.context import Ctx

    ctx = Ctx.system(tenant)
    report = _empty_report()
    closed_days = ClosedDays(tenant)
    for schedule_id, party_id in _schedules_with_work(tenant, today):
        try:
            with transaction.atomic():
                counts = run_schedule(
                    ctx=ctx,
                    schedule_id=schedule_id,
                    party_id=party_id,
                    today=today,
                    closed_days=closed_days,
                )
        except Exception as exc:  # noqa: BLE001 — BR-2: one schedule never stops the tenant
            logger.warning(
                "dues.run.schedule_failed",
                extra={
                    "tenant_id": str(tenant.id),
                    "schedule_id": str(schedule_id),
                    "code": _code(exc),
                },
                exc_info=True,
            )
            report["errors"].append({"schedule_id": str(schedule_id), "code": _code(exc)})
            continue
        for key, value in counts.items():
            report[key] += value  # type: ignore[literal-required]
    if report["errors"]:
        _notify_failed(tenant=tenant, today=today, failed=len(report["errors"]))
    return report


def _notify_failed(*, tenant: Any, today: dt.date, failed: int) -> None:
    """BR-2 — once per tenant per day: a second failing run that day coalesces
    into the unread row instead of adding another (`group_key` carries the date)."""
    from apps.notifications.services.notify import notify

    with transaction.atomic():
        notify(
            tenant,
            RUN_FAILED,
            params={"failed": failed, "date": today.isoformat()},
            group_key=f"{RUN_FAILED}:{today.isoformat()}",
        )
