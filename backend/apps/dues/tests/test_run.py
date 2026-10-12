"""DUE-02 — the daily run: extend, post, overdue, calendar, failures, the job (T-DUE-02-1, -2, -4,
-5, -8; BR-1…BR-5; EC-3, EC-4; R44).

Schedules are created on the FRD's today (5 Oct 2026, the `today` fixture) and then the run is
called for later dates, which is how time passes in these tests: `run_for_tenant` takes its date
as an argument, exactly as the job hands it over.
"""

from __future__ import annotations

import datetime as dt
import json
import types
import uuid
from decimal import Decimal
from io import StringIO
from typing import Any

import pytest
from django.core.management import call_command

from apps.common.exceptions import ValidationFailed
from apps.dues.constants import SOURCE_COMPONENT, SOURCE_DUE, DueStatus
from apps.dues.models import DuesDue, DuesSchedule
from apps.dues.services import run as run_module
from apps.dues.services.materialise import BUSINESS_DAYS_CHANGED
from apps.dues.services.run import run_for_tenant
from apps.dues.services.schedules import create_schedule
from apps.dues.tests.subject import SUBJECT, TEST_MODULE
from apps.ledger.models import LedgerEntry
from apps.notifications.models import Notification
from apps.platform_app.models import AuditLog, ClosedDay
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db

D = Decimal
NOV1 = dt.date(2026, 11, 1)


def _start(ctx: Any, plan: Any, party: Any, start_on: dt.date = NOV1, **kwargs: Any) -> Any:
    return create_schedule(
        ctx=ctx,
        module=TEST_MODULE,
        plan_id=plan.id,
        party_id=party.id,
        subject_type=kwargs.pop("subject_type", SUBJECT),
        subject_id=kwargs.pop("subject_id", uuid.uuid4()),
        start_on=start_on,
        **kwargs,
    ).schedule


def _dues(schedule: Any) -> list[tuple]:
    return list(
        DuesDue.objects.filter(schedule=schedule)
        .order_by("seq")
        .values_list("seq", "due_on", "status", "amount")
    )


def _close(tenant: Any, *days: dt.date) -> None:
    for day in days:
        ClosedDay.objects.create(tenant=tenant, date=day, reason="Holiday")


def _reopen(tenant: Any, *days: dt.date) -> None:
    ClosedDay.objects.filter(tenant=tenant, date__in=days).delete()


# ── T-DUE-02-1: each step ───────────────────────────────────────────────────


def test_each_step_on_a_fixture_schedule(
    ctx: Any, make_plan: Any, party: Any, today: Any, dues_subject: Any
) -> None:
    """T-DUE-02-1 — a step silently skipped (a due never posted, never overdue, a window never
    extended) leaves a khata wrong with no error anywhere. Each step's effect and count is
    asserted on one schedule."""
    plan = make_plan(grace_days=2)
    schedule = _start(ctx, plan, party)
    assert schedule.materialised_until == dt.date(2028, 10, 5)  # 5 Oct 2026 + 24 months

    report = run_for_tenant(tenant=ctx.tenant, today=NOV1)
    first = DuesDue.objects.get(schedule=schedule, seq=1)
    assert first.status == DueStatus.DUE
    entry = LedgerEntry.objects.get(source_type=SOURCE_DUE, source_id=first.id)
    assert (entry.entry_date, entry.amount, entry.bucket) == (NOV1, D("1200.00"), "shop")
    assert entry.note.endswith("· Nov 2026")
    assert report["posted"] == 1
    # Extend: the window now reaches 1 Nov 2028, one more monthly due.
    assert report["materialised"] == 1
    schedule.refresh_from_db()
    assert schedule.materialised_until == dt.date(2028, 11, 1)
    assert DuesDue.objects.filter(schedule=schedule).order_by("-seq").first().due_on == (
        dt.date(2028, 11, 1)
    )

    # Overdue: 1 Nov + 2 days of grace is 3 Nov; on 4 Nov it is late.
    assert run_for_tenant(tenant=ctx.tenant, today=dt.date(2026, 11, 3))["overdue"] == 0
    report = run_for_tenant(tenant=ctx.tenant, today=dt.date(2026, 11, 4))
    assert report["overdue"] == 1
    first.refresh_from_db()
    assert first.status == DueStatus.OVERDUE
    assert (first.id, "scheduled", "due") in dues_subject.changes
    assert (first.id, "due", "overdue") in dues_subject.changes
    assert report["penalties"] == report["advances_applied"] == 0
    assert report["errors"] == []


def test_catch_up_worked_example_without_penalty(
    ctx: Any, make_plan: Any, party: Any, today: Any
) -> None:
    """FRD DUE-02 worked example (the posting half; the penalty is DUE-04's, C-14), a month on:
    the scheduler is down 28 Oct – 7 Nov. The run on 8 Nov must post the 1 Nov due DATED 1 Nov —
    a missed day posting with today's date would wreck aging and the statement — and straight
    to overdue, because 1 Nov + 5 days of grace is behind it. A second run writes nothing."""
    plan = make_plan(grace_days=5)
    schedule = _start(ctx, plan, party)
    run_for_tenant(tenant=ctx.tenant, today=dt.date(2026, 10, 27))
    report = run_for_tenant(tenant=ctx.tenant, today=dt.date(2026, 11, 8))
    due = DuesDue.objects.get(schedule=schedule, seq=1)
    entry = LedgerEntry.objects.get(source_type=SOURCE_DUE, source_id=due.id)
    assert entry.entry_date == NOV1
    assert entry.amount == D("1200.00")
    assert due.status == DueStatus.OVERDUE
    assert report["posted"] == 1

    entries = LedgerEntry.objects.count()
    again = run_for_tenant(tenant=ctx.tenant, today=dt.date(2026, 11, 8))
    assert (again["posted"], again["overdue"], again["materialised"]) == (0, 0, 0)
    assert LedgerEntry.objects.count() == entries


def test_running_twice_for_one_date_is_a_no_op(
    ctx: Any, make_plan: Any, party: Any, today: Any
) -> None:
    """T-DUE-02-2 / BR-1 — a retried job (the runner died after commit, the operator re-ran the
    day) must not double-charge: the second run changes no row count, no cache, no audit row."""
    plan = make_plan(grace_days=1, closed_day_rule="move")
    _start(ctx, plan, party, dt.date(2026, 7, 1), confirm_backdated=True)
    _start(ctx, make_plan(name="Locker", amount="200.00"), party)
    _close(ctx.tenant, dt.date(2026, 12, 1))
    day = dt.date(2026, 11, 10)
    run_for_tenant(tenant=ctx.tenant, today=day)

    def snapshot() -> tuple:
        party.refresh_from_db()
        return (
            DuesDue.objects.count(),
            sorted(
                DuesDue.objects.values_list("id", "status", "due_on", "amount", "settled_amount")
            ),
            LedgerEntry.objects.count(),
            AuditLog.objects.count(),
            party.shop_balance,
            sorted(DuesSchedule.objects.values_list("id", "materialised_until")),
        )

    before = snapshot()
    report = run_for_tenant(tenant=ctx.tenant, today=day)
    assert snapshot() == before
    assert {k: v for k, v in report.items() if k != "errors"} == dict.fromkeys(
        ("materialised", "posted", "overdue", "penalties", "advances_applied", "skipped"), 0
    )


def test_nothing_posts_before_its_date(ctx: Any, make_plan: Any, party: Any, today: Any) -> None:
    """BR-3 — there is no "post all now": a due dated tomorrow stays `scheduled`."""
    schedule = _start(ctx, make_plan(), party)
    report = run_for_tenant(tenant=ctx.tenant, today=dt.date(2026, 10, 31))
    assert report["posted"] == 0
    assert set(DuesDue.objects.filter(schedule=schedule).values_list("status", flat=True)) == {
        DueStatus.SCHEDULED
    }
    assert LedgerEntry.objects.filter(party=party).count() == 0


def test_a_zero_due_is_paid_on_its_date_and_never_overdue(
    ctx: Any, make_plan: Any, party: Any, today: Any, dues_subject: Any
) -> None:
    """EC-4 / BR-10 — a free month posts nothing and is `paid` on its date; with a grace of 0 it
    must not turn `overdue` the next day (outstanding is 0)."""
    dues_subject.amount_hook = lambda _t, row: D("0") if row["seq"] == 1 else row["amount"]
    schedule = _start(ctx, make_plan(), party)
    run_for_tenant(tenant=ctx.tenant, today=dt.date(2026, 11, 20))
    due = DuesDue.objects.get(schedule=schedule, seq=1)
    assert (due.status, due.paid_on) == (DueStatus.PAID, NOV1)
    assert LedgerEntry.objects.filter(party=party).count() == 0


def test_an_ended_schedules_open_due_still_goes_overdue(
    ctx: Any, make_plan: Any, party: Any, today: Any
) -> None:
    """Step 3 reads every schedule, not only active ones: a membership ended after its last
    month was billed still owes that month, and it is late like any other."""
    schedule = _start(ctx, make_plan(), party)
    run_for_tenant(tenant=ctx.tenant, today=NOV1)
    DuesSchedule.objects.filter(pk=schedule.pk).update(status="ended")
    DuesDue.objects.filter(schedule=schedule, status=DueStatus.SCHEDULED).update(
        status=DueStatus.CANCELLED
    )
    report = run_for_tenant(tenant=ctx.tenant, today=dt.date(2026, 11, 2))
    assert report["overdue"] == 1
    assert report["materialised"] == 0


# ── expectation mode ───────────────────────────────────────────────────────


def test_expectation_posts_only_non_principal_components_in_loan(
    ctx: Any, make_plan: Any, party: Any, today: Any
) -> None:
    """Contracts §1.2 rule 2 — the principal is already in the khata from the disbursement;
    posting it on each instalment counts it twice. Interest posts as INTEREST and a fee as
    CHARGE, each its own `dues_component` source in the loan bucket, dated the due's date."""
    plan = make_plan(
        name="Loan",
        mode="expectation",
        posting="none",
        amount_rule="supplied",
        amount=None,
        recurrence={"freq": "once"},
    )
    supplied = [
        {
            "due_on": dt.date(2026, 11, 5),
            "amount": "5250.00",
            "components": [
                {"component": "principal", "amount": "5000.00"},
                {"component": "interest", "amount": "200.00"},
                {"component": "fee", "amount": "50.00"},
            ],
        },
        {"due_on": dt.date(2026, 12, 5), "amount": "5100.00"},
    ]
    schedule = _start(ctx, plan, party, supplied=supplied)
    report = run_for_tenant(tenant=ctx.tenant, today=dt.date(2026, 11, 5))
    assert report["posted"] == 1
    due = DuesDue.objects.get(schedule=schedule, seq=1)
    assert due.status == DueStatus.DUE
    entries = list(
        LedgerEntry.objects.filter(party=party)
        .order_by("entry_type")
        .values_list("entry_type", "amount", "bucket", "source_type", "entry_date")
    )
    assert entries == [
        ("charge", D("50.00"), "loan", SOURCE_COMPONENT, dt.date(2026, 11, 5)),
        ("interest", D("200.00"), "loan", SOURCE_COMPONENT, dt.date(2026, 11, 5)),
    ]
    posted = dict(due.components.values_list("component", "posted_entry_id"))
    assert posted["principal"] is None
    assert posted["interest"] is not None and posted["fee"] is not None
    # A second run (or the December instalment, principal only) posts nothing more.
    run_for_tenant(tenant=ctx.tenant, today=dt.date(2026, 12, 5))
    assert LedgerEntry.objects.filter(party=party).count() == 2


def test_a_backdated_expectation_schedule_posts_at_creation(
    ctx: Any, make_plan: Any, party: Any, today: Any
) -> None:
    """C-10 lifted — DUE-01 refused a past-dated schedule in any mode but ledger because the
    other branches did not exist. With them built, a confirmed backdated loan posts its past
    interest dated on its own dates instead of being refused."""
    plan = make_plan(
        name="Loan",
        mode="expectation",
        posting="none",
        amount_rule="supplied",
        amount=None,
        recurrence={"freq": "once"},
    )
    supplied = [
        {
            "due_on": dt.date(2026, 9, 5),
            "amount": "5200.00",
            "components": [
                {"component": "principal", "amount": "5000.00"},
                {"component": "interest", "amount": "200.00"},
            ],
        }
    ]
    _start(ctx, plan, party, dt.date(2026, 9, 1), supplied=supplied, confirm_backdated=True)
    entry = LedgerEntry.objects.get(party=party)
    assert (entry.entry_type, entry.entry_date, entry.amount) == (
        "interest",
        dt.date(2026, 9, 5),
        D("200.00"),
    )


# ── T-DUE-02-4: the calendar ─────────────────────────────────────────────────


def test_extended_dues_follow_the_closed_day_rule(ctx: Any, make_plan: Any, today: Any) -> None:
    """T-DUE-02-4 — a due materialised by the run lands on a closed day exactly as one
    materialised at creation would: `move` to the next open day, `skip` as `skipped`."""
    _close(ctx.tenant, dt.date(2028, 11, 1))
    moved = _start(
        ctx, make_plan(name="Move", closed_day_rule="move"), PartyFactory(tenant=ctx.tenant)
    )
    skipped = _start(
        ctx, make_plan(name="Skip", closed_day_rule="skip"), PartyFactory(tenant=ctx.tenant)
    )
    report = run_for_tenant(tenant=ctx.tenant, today=NOV1)
    assert _dues(moved)[-1][1:3] == (dt.date(2028, 11, 2), DueStatus.SCHEDULED)
    assert _dues(skipped)[-1][1:4] == (dt.date(2028, 11, 1), DueStatus.SKIPPED, D("0.00"))
    assert report["skipped"] == 1


def test_closure_added_after_materialisation_is_reapplied_to_future_dues(
    ctx: Any, make_plan: Any, party: Any, today: Any
) -> None:
    """EC-3 — a fee must not fall due on a holiday the gym declared after the dues were
    written: the next run moves it. Re-opening the day moves it back. A due already posted is
    never touched, whatever the calendar says now."""
    schedule = _start(ctx, make_plan(closed_day_rule="move", grace_days=5), party)
    run_for_tenant(tenant=ctx.tenant, today=NOV1)
    _close(ctx.tenant, NOV1, dt.date(2026, 12, 1))
    run_for_tenant(tenant=ctx.tenant, today=dt.date(2026, 11, 2))
    rows = {seq: (due_on, status) for seq, due_on, status, _a in _dues(schedule)}
    assert rows[1] == (NOV1, DueStatus.DUE)  # posted: untouched
    assert rows[2] == (dt.date(2026, 12, 2), DueStatus.SCHEDULED)
    _reopen(ctx.tenant, dt.date(2026, 12, 1))
    run_for_tenant(tenant=ctx.tenant, today=dt.date(2026, 11, 3))
    assert DuesDue.objects.get(schedule=schedule, seq=2).due_on == dt.date(2026, 12, 1)


def test_skip_keeps_count_when_a_closure_is_added_and_removed(
    ctx: Any, make_plan: Any, party: Any, today: Any
) -> None:
    """R44 — `skip` on a six-month plan must not quietly make it a five-month plan: the skipped
    January is replaced by a due after the last one, so six are still billed. When the closure
    is lifted, January is billed again and the replacement is cancelled ("Business days
    changed"), so it is not seven. A third run changes nothing."""
    plan = make_plan(
        closed_day_rule="skip",
        grace_days=30,
        recurrence={"freq": "monthly", "by_month_day": 1, "count": 6},
    )
    schedule = _start(ctx, plan, party)
    jan = dt.date(2027, 1, 1)
    _close(ctx.tenant, jan)
    report = run_for_tenant(tenant=ctx.tenant, today=dt.date(2026, 11, 10))
    rows = _dues(schedule)
    live = [r for r in rows if r[2] == DueStatus.SCHEDULED or r[2] == DueStatus.DUE]
    assert len(live) == 6
    assert rows[2][1:4] == (jan, DueStatus.SKIPPED, D("0.00"))
    assert rows[-1][:4] == (7, dt.date(2027, 5, 1), DueStatus.SCHEDULED, D("1200.00"))
    assert report["skipped"] == 1
    schedule.refresh_from_db()
    assert schedule.materialised_until == dt.date(2027, 5, 1)

    _reopen(ctx.tenant, jan)
    run_for_tenant(tenant=ctx.tenant, today=dt.date(2026, 11, 11))
    rows = _dues(schedule)
    assert rows[2][1:4] == (jan, DueStatus.SCHEDULED, D("1200.00"))
    seventh = DuesDue.objects.get(schedule=schedule, seq=7)
    assert (seventh.status, seventh.cancel_reason) == (DueStatus.CANCELLED, BUSINESS_DAYS_CHANGED)
    assert len([r for r in rows if r[2] in (DueStatus.SCHEDULED, DueStatus.DUE)]) == 6

    before = _dues(schedule)
    run_for_tenant(tenant=ctx.tenant, today=dt.date(2026, 11, 12))
    assert _dues(schedule) == before


def test_a_skipped_split_part_moves_to_its_replacement_and_the_total_holds(
    ctx: Any, make_plan: Any, party: Any, today: Any
) -> None:
    """R44 with BR-5 — a course fee of ₹1,000 in three parts must still add up to ₹1,000 when one
    part's date closes: the parts follow the live dues in order, never a fourth ₹333."""
    plan = make_plan(
        name="Course",
        amount_rule="total_split",
        amount=None,
        total="1000.00",
        closed_day_rule="skip",
        grace_days=30,
        recurrence={"freq": "monthly", "by_month_day": 1, "count": 3},
    )
    schedule = _start(ctx, plan, party)
    _close(ctx.tenant, dt.date(2026, 12, 1))
    run_for_tenant(tenant=ctx.tenant, today=dt.date(2026, 11, 10))
    rows = _dues(schedule)
    assert [(r[1], r[2], r[3]) for r in rows] == [
        (NOV1, DueStatus.DUE, D("333.00")),
        (dt.date(2026, 12, 1), DueStatus.SKIPPED, D("0.00")),
        (dt.date(2027, 1, 1), DueStatus.SCHEDULED, D("333.00")),
        (dt.date(2027, 2, 1), DueStatus.SCHEDULED, D("334.00")),
    ]
    assert sum(r[3] for r in rows) == D("1000.00")


def test_a_listed_schedule_cannot_grow_so_skip_moves_instead(
    ctx: Any, make_plan: Any, party: Any, today: Any
) -> None:
    """R44's limit — explicit dates are the agreement; there is no "next" date to replace a
    skipped one with, and dropping an instalment would bill less than agreed. The due moves to
    the next open day instead."""
    plan = make_plan(
        name="Three dates",
        closed_day_rule="skip",
        recurrence={
            "freq": "once",
            "explicit_dates": ["2026-11-01", "2026-12-01", "2027-01-01"],
        },
    )
    schedule = _start(ctx, plan, party)
    _close(ctx.tenant, dt.date(2026, 12, 1))
    run_for_tenant(tenant=ctx.tenant, today=dt.date(2026, 11, 10))
    rows = _dues(schedule)
    assert len(rows) == 3
    assert rows[1][1:4] == (dt.date(2026, 12, 2), DueStatus.SCHEDULED, D("1200.00"))


# ── T-DUE-02-5: one failure ──────────────────────────────────────────────────


def test_one_failing_schedule_leaves_the_others_posted_and_notifies_once(
    ctx: Any, make_plan: Any, today: Any, monkeypatch: Any
) -> None:
    """T-DUE-02-5 / BR-2 — one bad schedule (a tax code with no rate, a refused invoice) must not
    stop a tenant's billing: the others post, the failure rolls back its own schedule only and is
    named in `errors`, and owners get ONE notification for the day however often it fails. The
    failed due is still there for tomorrow's run, which posts it with its own date."""
    plan = make_plan()
    good_party, bad_party = PartyFactory(tenant=ctx.tenant), PartyFactory(tenant=ctx.tenant)
    good = _start(ctx, plan, good_party)
    bad = _start(ctx, plan, bad_party)
    real = run_module.post_due

    def flaky(*, due: Any, **kwargs: Any) -> Any:
        if due.schedule_id == bad.id:
            real(due=due, **kwargs)  # writes, then fails: the savepoint must undo it
            raise ValidationFailed({"lines.0.tax_code": ["No rate for this date."]})
        return real(due=due, **kwargs)

    monkeypatch.setattr(run_module, "post_due", flaky)
    report = run_for_tenant(tenant=ctx.tenant, today=NOV1)
    assert report["errors"] == [{"schedule_id": str(bad.id), "code": "validation_error"}]
    assert report["posted"] == 1
    assert DuesDue.objects.get(schedule=good, seq=1).status == DueStatus.DUE
    assert DuesDue.objects.get(schedule=bad, seq=1).status == DueStatus.SCHEDULED
    assert LedgerEntry.objects.filter(party=bad_party).count() == 0
    bad_party.refresh_from_db()
    assert bad_party.shop_balance == 0

    run_for_tenant(tenant=ctx.tenant, today=NOV1)  # the same day fails again
    [row] = Notification.objects.filter(tenant=ctx.tenant, type="dues.run_failed")
    assert row.user_id is None  # a broadcast, read by those holding the permission
    assert row.data["route"] == "/notifications"
    assert "2026-11-01" in row.title

    monkeypatch.setattr(run_module, "post_due", real)
    run_for_tenant(tenant=ctx.tenant, today=dt.date(2026, 11, 2))
    entry = LedgerEntry.objects.get(party=bad_party)
    assert entry.entry_date == NOV1


def test_the_run_failed_type_is_owners_only() -> None:
    """C-19 — staff must not see "charges could not be added" for a business they do not run;
    the type is gated on `platform.tenant.manage`, which only owners and admins hold."""
    from apps.notifications.services.notify import REGISTRY

    spec = REGISTRY["dues.run_failed"]
    assert spec.required_permission == "platform.tenant.manage"
    assert spec.group_window == 24 * 60


# ── scheduling: the job, the fan-out, the tenant's clock ─────────────────────


def test_registered_schedule_has_a_handler() -> None:
    """A schedule with no handler never runs; `materialise_due_schedules` raises for one, and
    the run is registered at 00:30 IST daily exactly as contracts §2.1 says."""
    from apps.common.jobs import REGISTRY, SCHEDULES, materialise_due_schedules

    daily = next(s for s in SCHEDULES if s.job_type == "dues.run")
    assert (daily.period, daily.at_hour_ist, daily.minute) == ("daily", 0, 30)
    assert {"dues.run", "dues.run_for_tenant"} <= set(REGISTRY)
    materialise_due_schedules()  # raises ImproperlyConfigured for an unwired schedule


def test_ist_tenant_at_1831_utc_posts_the_next_days_dues(
    ctx: Any, make_plan: Any, party: Any, dues_subject: Any, monkeypatch: Any
) -> None:
    """T-DUE-02-8 / BR-5 — at 18:31 UTC on 30 Sep it is already 1 Oct in India. A run dated by
    the server's UTC day would bill the 1st a day late; the fan-out dates each tenant's job by
    the tenant's own clock, and that job posts the 1 Oct due."""
    from django.utils import timezone

    from apps.dues import tasks
    from apps.platform_app.models import Job

    dues_subject.set_today(monkeypatch, dt.date(2026, 9, 30))
    schedule = _start(ctx, make_plan(), party, dt.date(2026, 10, 1))
    instant = dt.datetime(2026, 9, 30, 18, 31, tzinfo=dt.timezone.utc)
    monkeypatch.setattr(timezone, "now", lambda: instant)

    assert tasks.run(types.SimpleNamespace(payload={}), None) == {"tenants": 1}
    job = Job.objects.get(job_type="dues.run_for_tenant", tenant=ctx.tenant)
    assert job.payload["date"] == "2026-10-01"
    assert job.idempotency_token == f"dues:{ctx.tenant.id}:2026-10-01"
    # The same parent again the same day enqueues nothing new (`uq_job_idem`).
    tasks.run(types.SimpleNamespace(payload={}), None)
    assert Job.objects.filter(job_type="dues.run_for_tenant").count() == 1

    result = tasks.run_for_tenant(job, None)
    assert result["posted"] == 1
    assert DuesDue.objects.get(schedule=schedule, seq=1).status == DueStatus.DUE


def test_the_fan_out_skips_tenants_with_no_live_schedule(tenant: Any, dues_subject: Any) -> None:
    """A tenant that has never used a dues module costs the nightly run nothing."""
    from apps.dues import tasks
    from apps.platform_app.models import Job

    assert tasks.run(types.SimpleNamespace(payload={}), None) == {"tenants": 0}
    assert not Job.objects.filter(job_type="dues.run_for_tenant").exists()


def test_dues_run_command_runs_the_day_inline_and_is_idempotent(
    ctx: Any, make_plan: Any, party: Any, today: Any
) -> None:
    """C-15 — a succeeded day can never be enqueued again, so the operator's recovery command
    runs the day in its own process; running it twice bills once."""
    schedule = _start(ctx, make_plan(), party)
    out = StringIO()
    call_command("dues_run", tenant=str(ctx.tenant.id), date="2026-11-01", stdout=out)
    assert json.loads(out.getvalue())["posted"] == 1
    out = StringIO()
    call_command("dues_run", tenant=str(ctx.tenant.id), date="2026-11-01", stdout=out)
    assert json.loads(out.getvalue())["posted"] == 0
    assert DuesDue.objects.get(schedule=schedule, seq=1).status == DueStatus.DUE


def test_a_closure_added_during_an_outage_is_honoured_by_the_catch_up(
    ctx: Any, make_plan: Any, today: Any
) -> None:
    """ADR-048 (lead ruling on DUE-02 QA) — catch-up equals the on-time runs. The owner closes
    1 Nov while the scheduler is down; the nightly run of 1 Nov would have moved that due to
    2 Nov (`move`) or skipped and replaced it (`skip`, R44). The run after the outage must do the
    same, not post the due on the closed day because its date is already behind."""
    moved = _start(
        ctx,
        make_plan(name="Move", closed_day_rule="move", grace_days=30),
        PartyFactory(tenant=ctx.tenant),
    )
    skipped = _start(
        ctx,
        make_plan(
            name="Skip",
            closed_day_rule="skip",
            grace_days=30,
            recurrence={"freq": "monthly", "by_month_day": 1, "count": 3},
        ),
        PartyFactory(tenant=ctx.tenant),
    )
    run_for_tenant(tenant=ctx.tenant, today=dt.date(2026, 10, 27))
    _close(ctx.tenant, NOV1)  # added inside the outage, 28 Oct – 7 Nov
    run_for_tenant(tenant=ctx.tenant, today=dt.date(2026, 11, 8))

    first = DuesDue.objects.get(schedule=moved, seq=1)
    assert (first.due_on, first.status) == (dt.date(2026, 11, 2), DueStatus.DUE)
    assert LedgerEntry.objects.get(source_id=first.id).entry_date == dt.date(2026, 11, 2)
    rows = _dues(skipped)
    assert rows[0][1:4] == (NOV1, DueStatus.SKIPPED, D("0.00"))
    assert [r[1] for r in rows if r[2] != DueStatus.SKIPPED] == [
        dt.date(2026, 12, 1),
        dt.date(2027, 1, 1),
        dt.date(2027, 2, 1),
    ]


def test_a_skip_decided_by_an_earlier_run_is_not_reopened(
    ctx: Any, make_plan: Any, party: Any, today: Any
) -> None:
    """The other side of that ruling: a month skipped on its own night and followed by billed
    months is settled history. Lifting the closure months later must not bill it backdated."""
    plan = make_plan(
        closed_day_rule="skip",
        grace_days=30,
        recurrence={"freq": "monthly", "by_month_day": 1, "count": 4},
    )
    schedule = _start(ctx, plan, party)
    _close(ctx.tenant, NOV1)
    run_for_tenant(tenant=ctx.tenant, today=NOV1)
    run_for_tenant(tenant=ctx.tenant, today=dt.date(2026, 12, 1))
    _reopen(ctx.tenant, NOV1)
    run_for_tenant(tenant=ctx.tenant, today=dt.date(2026, 12, 2))
    rows = _dues(schedule)
    assert rows[0][1:3] == (NOV1, DueStatus.SKIPPED)
    assert LedgerEntry.objects.filter(party=party).count() == 1
