"""DUE-01 schedules: snapshot, backdated confirmation, posting, uniqueness (T-DUE-01-3, -4, -6)."""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal
from typing import Any

import pytest
from django.core.exceptions import ImproperlyConfigured
from django.db import IntegrityError

from apps.common.constants import Direction, LedgerBucket
from apps.common.exceptions import BusinessRuleViolation, ValidationFailed
from apps.dues.constants import DueStatus
from apps.dues.models import DuesDue, DuesSchedule
from apps.dues.services.plans import update_plan
from apps.dues.services.schedules import create_schedule
from apps.dues.tests.subject import OTHER_SUBJECT, SUBJECT, TEST_MODULE
from apps.ledger.models import LedgerEntry
from apps.ledger.services import postings
from apps.platform_app.models import AuditLog
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db

D = Decimal


def _start(ctx: Any, plan: Any, party: Any, start_on: dt.date, **kwargs: Any) -> Any:
    return create_schedule(
        ctx=ctx,
        module=TEST_MODULE,
        plan_id=plan.id,
        party_id=party.id,
        subject_type=kwargs.pop("subject_type", SUBJECT),
        subject_id=kwargs.pop("subject_id", uuid.uuid4()),
        start_on=start_on,
        **kwargs,
    )


def test_backdated_without_confirmation_is_409_with_preview_and_total_and_writes_nothing(
    ctx: Any, make_plan: Any, party: Any, today: Any
) -> None:
    """T-DUE-01-3 — a past-dated debt must never land in a khata without the
    merchant seeing it: 409 with the four past dues and their ₹4,800, and not one
    row written (schedule, due, ledger line or audit)."""
    plan = make_plan()
    audits = AuditLog.objects.count()
    with pytest.raises(BusinessRuleViolation) as caught:
        _start(ctx, plan, party, dt.date(2026, 7, 1))
    error = caught.value
    assert error.code == "schedule_backdated_unconfirmed"
    assert error.http_status == 409
    assert error.details["total"] == "4800.00"
    assert [d["due_on"] for d in error.details["dues"]] == [
        "2026-07-01",
        "2026-08-01",
        "2026-09-01",
        "2026-10-01",
    ]
    assert error.details["dues"][0]["period_label"] == "Jul 2026"
    assert DuesSchedule.objects.count() == DuesDue.objects.count() == 0
    assert LedgerEntry.objects.filter(party=party).count() == 0
    assert AuditLog.objects.count() == audits


def test_confirmed_backdated_posts_each_due_with_its_own_date(
    ctx: Any, make_plan: Any, party: Any, today: Any
) -> None:
    """BR-7 — catch-up lines all dated today would wreck aging and the statement:
    each posts on its own due date, the balance rises by ₹4,800 exactly."""
    plan = make_plan()
    result = _start(ctx, plan, party, dt.date(2026, 7, 1), confirm_backdated=True)
    entries = list(
        LedgerEntry.objects.filter(party=party)
        .order_by("entry_date")
        .values_list(
            "entry_date", "amount", "entry_type", "direction", "bucket", "source_type", "note"
        )
    )
    assert [e[0] for e in entries] == [
        dt.date(2026, 7, 1),
        dt.date(2026, 8, 1),
        dt.date(2026, 9, 1),
        dt.date(2026, 10, 1),
    ]
    assert {e[1:6] for e in entries} == {
        (D("1200.00"), "charge", Direction.DEBIT, LedgerBucket.MAIN, "dues_due")
    }
    assert entries[0][6].endswith("· Jul 2026") and entries[0][6].startswith("Subject ")
    party.refresh_from_db()
    assert party.balance == D("4800.00")
    assert len(result.posted) == 4
    statuses = dict(DuesDue.objects.values_list("due_on", "status"))
    assert statuses[dt.date(2026, 7, 1)] == DueStatus.OVERDUE  # grace 0, long past
    assert statuses[dt.date(2026, 10, 1)] == DueStatus.OVERDUE  # 1 Oct + 0 < 5 Oct
    assert statuses[dt.date(2026, 11, 1)] == DueStatus.SCHEDULED
    assert all(d.posted_entry_id for d in DuesDue.objects.filter(status=DueStatus.OVERDUE))
    assert AuditLog.objects.filter(action="dues.due.posted").count() == 4
    assert AuditLog.objects.filter(action="dues.schedule.created").count() == 1


def test_a_due_today_posts_at_creation_without_confirmation(
    ctx: Any, make_plan: Any, party: Any, today: Any
) -> None:
    """C-11 — a due dated today needs no confirmation and posts now, or a
    schedule created after the 00:30 run would sit unposted until tomorrow."""
    plan = make_plan(recurrence={"freq": "monthly", "by_month_day": 5})
    result = _start(ctx, plan, party, today)
    assert len(result.posted) == 1
    due = DuesDue.objects.get(due_on=today)
    assert due.status == DueStatus.DUE
    party.refresh_from_db()
    assert party.balance == D("1200.00")


def test_editing_the_plan_changes_no_running_schedule(
    ctx: Any, make_plan: Any, party: Any, today: Any
) -> None:
    """T-DUE-01-4 — a price change must not rewrite agreed terms: the schedule
    holds its own typed snapshot and its dues keep their amounts."""
    plan = make_plan(grace_days=3)
    result = _start(ctx, plan, party, dt.date(2026, 11, 1))
    update_plan(
        ctx=ctx,
        plan_id=plan.id,
        data={
            "amount": "1500.00",
            "grace_days": 7,
            "recurrence": {"freq": "monthly", "by_month_day": 10},
        },
    )
    schedule = DuesSchedule.objects.get(pk=result.schedule.pk)
    assert (schedule.amount, schedule.grace_days, schedule.by_month_day) == (D("1200.00"), 3, 1)
    assert set(DuesDue.objects.values_list("amount", flat=True)) == {D("1200.00")}
    assert schedule.terms["amount_rule"] == "fixed"
    assert schedule.mode == "charge" and schedule.posting == "ledger"


def test_one_live_schedule_per_subject(ctx: Any, make_plan: Any, party: Any, today: Any) -> None:
    """T-DUE-01-6 — two memberships billing one subject twice. The engine lets
    the IntegrityError through for the vertical to map (C-16)."""
    plan = make_plan()
    subject_id = uuid.uuid4()
    _start(ctx, plan, party, dt.date(2026, 11, 1), subject_id=subject_id)
    with pytest.raises(IntegrityError):
        _start(ctx, plan, party, dt.date(2026, 12, 1), subject_id=subject_id)


def test_archived_party_cannot_start_a_schedule(
    ctx: Any, make_plan: Any, tenant: Any, today: Any
) -> None:
    """EC-4 — money owed by a party nobody can see in the list."""
    archived = PartyFactory(tenant=tenant, status="archived")
    with pytest.raises(BusinessRuleViolation) as caught:
        _start(ctx, make_plan(), archived, dt.date(2026, 11, 1))
    assert caught.value.code == "party_archived"


def test_unregistered_subject_type_refuses(
    ctx: Any, make_plan: Any, party: Any, today: Any
) -> None:
    """ADR-042 — engine rows pointing at nothing; a subject of ANOTHER module
    under this module is the same programming error."""
    plan = make_plan()
    for subject_type in ("nobody", OTHER_SUBJECT):
        with pytest.raises(ImproperlyConfigured):
            _start(ctx, plan, party, dt.date(2026, 11, 1), subject_type=subject_type)
    assert DuesSchedule.objects.count() == 0


def test_a_deactivated_plan_starts_nothing_but_its_schedules_continue(
    ctx: Any, make_plan: Any, party: Any, today: Any
) -> None:
    """EC-2 — a deactivated plan cannot be picked again; running ones are untouched."""
    plan = make_plan()
    running = _start(ctx, plan, party, dt.date(2026, 11, 1))
    update_plan(ctx=ctx, plan_id=plan.id, data={"is_active": False})
    with pytest.raises(ValidationFailed):
        _start(ctx, plan, party, dt.date(2026, 11, 1))
    assert DuesSchedule.objects.get(pk=running.schedule.pk).status == "active"


def test_zero_amount_due_posts_nothing_and_is_paid_on_its_date(
    ctx: Any, make_plan: Any, party: Any, today: Any
) -> None:
    """BR-10 — `post_source_entry` refuses 0, so a free month must not reach it
    and fail the whole schedule; it is simply paid on its date."""
    plan = make_plan(amount="0.00")
    _start(ctx, plan, party, dt.date(2026, 9, 1), confirm_backdated=True)
    posted = DuesDue.objects.filter(due_on__lte=today)
    assert {(d.status, d.paid_on == d.due_on, d.posted_entry_id) for d in posted} == {
        ("paid", True, None)
    }
    assert LedgerEntry.objects.filter(party=party).count() == 0


def test_window_is_recorded_as_the_horizon(
    ctx: Any, make_plan: Any, party: Any, today: Any
) -> None:
    """C-9 / BR-4 — `materialised_until` is the horizon (today + 24 months), so
    the run's window query does not match every schedule every night."""
    result = _start(ctx, make_plan(), party, dt.date(2026, 11, 1))
    assert result.schedule.materialised_until == dt.date(2028, 10, 5)
    assert DuesDue.objects.filter(schedule=result.schedule).count() == 24


def test_posting_sources_are_registered_with_the_contract_shape(dues_subject: Any) -> None:
    """Contracts §1.2 — a dues line in the wrong bucket or direction would move
    the wrong balance; the shape is the registry's, checked at start-up."""
    sources = postings.registered_posting_sources()
    due, component, adjustment = (
        sources["dues_due"],
        sources["dues_component"],
        sources["dues_adjustment"],
    )
    assert (due.module, dict(due.entry_types), due.buckets) == (
        "dues",
        {"charge": "debit"},
        frozenset({"main"}),
    )
    assert (dict(component.entry_types), component.buckets) == (
        {"interest": "debit", "charge": "debit"},
        frozenset({"loan"}),
    )
    assert (dict(adjustment.entry_types), adjustment.buckets) == (
        {"charge": "debit", "adjustment_credit": "credit"},
        frozenset({"main", "loan"}),
    )


def test_a_document_plan_cannot_post_before_due_02(
    ctx: Any, make_plan: Any, party: Any, today: Any
) -> None:
    """C-10 — the document branch of `post_due` is DUE-02's; until then a
    document schedule that would post now is refused rather than half-written.
    A future-dated one is fine: nothing posts at creation."""
    plan = make_plan(posting="document")
    with pytest.raises(ValidationFailed):
        _start(ctx, plan, party, dt.date(2026, 9, 1), confirm_backdated=True)
    assert _start(ctx, plan, party, dt.date(2026, 11, 1)).posted == []


def test_on_due_changed_hears_each_posting_with_before_and_after(
    ctx: Any, make_plan: Any, party: Any, today: Any, dues_subject: Any
) -> None:
    """QA-DUE-01-6 / contracts §5 — the subject is told every status change with
    the right before/after, including a zero due's move to paid, and nothing for
    dues that stay scheduled."""
    _start(ctx, make_plan(amount="0.00"), party, dt.date(2026, 10, 1), confirm_backdated=True)
    _start(
        ctx,
        make_plan(name="Today", recurrence={"freq": "monthly", "by_month_day": 5}),
        party,
        today,
    )
    assert [(b, a) for _id, b, a in dues_subject.changes] == [
        ("scheduled", "paid"),
        ("scheduled", "due"),
    ]


def test_a_start_after_the_plans_until_is_refused_on_start_on(
    ctx: Any, make_plan: Any, party: Any, today: Any
) -> None:
    """QA-DUE-01-2 — `until` is the plan's inclusive last date: a schedule that
    would start after it is a 400 on `start_on`, and a start ON it still bills
    that one due."""
    plan = make_plan(recurrence={"freq": "monthly", "by_month_day": 1, "until": "2026-12-01"})
    with pytest.raises(ValidationFailed) as caught:
        _start(ctx, plan, party, dt.date(2027, 1, 1))
    assert "start_on" in caught.value.details
    result = _start(ctx, plan, party, dt.date(2026, 12, 1))
    assert [d.due_on for d in result.dues] == [dt.date(2026, 12, 1)]
