"""ATT-01 — groups, members and sessions (T-ATT-01-1…3, BR-1…BR-5, EC-1…EC-3)."""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.db import IntegrityError, transaction

from apps.attendance.constants import SessionStatus
from apps.attendance.models import Group, Mark, Session
from apps.attendance.services.groups import (
    cancel_session,
    create_group,
    end_membership,
    generate_sessions,
    set_members,
    update_group,
)
from apps.attendance.services.marks import roll_call, void_mark
from apps.attendance.tests.conftest import TODAY, batch_data
from apps.attendance.tests.subject import TEST_MODULE
from apps.common.exceptions import NotFound, ValidationFailed
from apps.platform_app.models import ClosedDay

pytestmark = pytest.mark.django_db


def close(tenant: Any, day: dt.date, module: str | None = None) -> None:
    ClosedDay.objects.create(tenant=tenant, date=day, reason="Diwali", module=module)


def _sessions(group: Any) -> list[Session]:
    return list(Session.objects.filter(group=group).order_by("starts_at"))


def test_generation_skips_the_closed_monday(ctx: Any, clock: Any, tenant: Any) -> None:
    """T-ATT-01-1 — Mon/Wed/Fri for 8 weeks with one closed Monday is 23
    sessions, not 24: a class must never be generated on a holiday, or the
    register counts everybody absent on the day the shop was shut."""
    close(tenant, dt.date(2026, 10, 19), module=TEST_MODULE)
    close(tenant, dt.date(2026, 10, 21), module="test_b")  # another module's closure
    group = create_group(ctx=ctx, module=TEST_MODULE, data=batch_data())
    rows = _sessions(group)
    assert len(rows) == 23
    days = {s.starts_at.date() for s in rows}  # 06:00 IST is still the same UTC date
    assert dt.date(2026, 10, 19) not in days and dt.date(2026, 10, 21) in days
    assert rows[0].starts_at.date() == TODAY and rows[-1].starts_at.date() == dt.date(2026, 11, 27)


def test_generation_reads_the_calendar_once(
    ctx: Any, clock: Any, django_assert_max_num_queries: Any
) -> None:
    """The FRD wrote `is_open` per date: 56 calendar queries per group per weekly
    run. Generation reads the closed days for the whole window in one query, so
    the count is fixed however long the window."""
    group = create_group(ctx=ctx, module=TEST_MODULE, data=batch_data())
    Session.objects.filter(group=group).delete()
    with django_assert_max_num_queries(6):
        created = generate_sessions(
            tenant=ctx.tenant, group_id=group.id, until=TODAY + dt.timedelta(days=150)
        )
    assert created == 65


def test_regeneration_is_idempotent_and_keeps_marked_sessions(
    ctx: Any, clock: Any, make_party: Any
) -> None:
    """T-ATT-01-2, BR-5 — a second run creates nothing; a timetable change moves
    only unmarked sessions; a marked one survives, and one with only voided
    marks is cancelled with a reason rather than deleted (its FK is RESTRICT)."""
    group = create_group(ctx=ctx, module=TEST_MODULE, data=batch_data())
    until = TODAY + dt.timedelta(days=55)
    assert generate_sessions(tenant=ctx.tenant, group_id=group.id, until=until) == 0
    party = make_party()
    set_members(ctx=ctx, group_id=group.id, party_id=party.id, from_on=TODAY)
    wed, fri = _sessions(group)[1], _sessions(group)[2]
    roll_call(ctx=ctx, session_id=wed.id, marks={party.id: "present"})
    roll_call(ctx=ctx, session_id=fri.id, marks={party.id: "present"})
    void_mark(ctx=ctx, mark_id=Mark.objects.get(session=fri).id, reason="Marked by mistake")

    update_group(
        ctx=ctx,
        group_id=group.id,
        data={"recurrence": {"freq": "weekly", "by_weekday": [1, 3], "anchor": TODAY.isoformat()}},
    )
    rows = _sessions(group)
    by_id = {s.id: s for s in rows}
    assert by_id[wed.id].status == SessionStatus.HELD  # the marked Wednesday stays
    assert by_id[fri.id].status == SessionStatus.CANCELLED
    assert by_id[fri.id].cancel_reason == "Timetable changed"
    live = [s for s in rows if s.status != SessionStatus.CANCELLED and s.id != wed.id]
    assert live and {s.starts_at.date().weekday() for s in live} == {1, 3}
    assert generate_sessions(tenant=ctx.tenant, group_id=group.id, until=until) == 0


def test_a_day_closed_after_generation_loses_its_unmarked_session(
    ctx: Any, clock: Any, tenant: Any
) -> None:
    """Calendar BR-4 — closing a day later removes the session the merchant can
    no longer hold, on the next generation."""
    group = create_group(ctx=ctx, module=TEST_MODULE, data=batch_data())
    close(tenant, dt.date(2026, 10, 12))
    generate_sessions(tenant=ctx.tenant, group_id=group.id, until=TODAY + dt.timedelta(days=55))
    assert dt.date(2026, 10, 12) not in {s.starts_at.date() for s in _sessions(group)}


def test_six_am_ist_is_stored_as_half_past_midnight_utc(ctx: Any, clock: Any) -> None:
    """EC-3 — a session time is the tenant's wall clock, stored as timestamptz."""
    group = create_group(ctx=ctx, module=TEST_MODULE, data=batch_data())
    first = _sessions(group)[0]
    utc = first.starts_at.astimezone(dt.timezone.utc)
    assert (utc.hour, utc.minute) == (0, 30)
    assert first.ends_at - first.starts_at == dt.timedelta(minutes=60)


def test_generation_refuses_more_than_26_weeks_and_ignores_inactive(ctx: Any, clock: Any) -> None:
    """ATT-01 §6 errors; EC-2 — a deactivated group gets no new sessions."""
    group = create_group(ctx=ctx, module=TEST_MODULE, data=batch_data())
    with pytest.raises(ValidationFailed) as refused:
        generate_sessions(
            tenant=ctx.tenant, group_id=group.id, until=TODAY + dt.timedelta(days=183)
        )
    assert "until" in refused.value.details
    update_group(ctx=ctx, group_id=group.id, data={"is_active": False})
    Session.objects.filter(group=group).delete()
    assert (
        generate_sessions(tenant=ctx.tenant, group_id=group.id, until=TODAY + dt.timedelta(days=30))
        == 0
    )


def test_bad_groups_are_refused_with_field_errors(ctx: Any, clock: Any) -> None:
    """A recurrence the engine cannot run, or a timetable without a time, is a 400
    naming the field — never a group that silently generates nothing."""
    with pytest.raises(ValidationFailed) as bad_rule:
        create_group(
            ctx=ctx,
            module=TEST_MODULE,
            data=batch_data(recurrence={"freq": "fortnightly", "anchor": TODAY.isoformat()}),
        )
    assert "recurrence.freq" in bad_rule.value.details
    with pytest.raises(ValidationFailed) as no_time:
        create_group(ctx=ctx, module=TEST_MODULE, data=batch_data(session_start=None))
    assert "session_start" in no_time.value.details or "session_minutes" in no_time.value.details
    with pytest.raises(ValidationFailed):
        create_group(ctx=ctx, module=TEST_MODULE, data={"name": "x", "mark_kind": "quantity"})


def test_the_group_rule_columns_are_all_or_none_in_the_database(tenant: Any) -> None:
    """C17 — the mixin's NOT NULL columns are nullable here, so the database
    itself must refuse half a rule (a `freq` with no anchor)."""
    with pytest.raises(IntegrityError), transaction.atomic():
        Group.objects.create(
            tenant=tenant, module=TEST_MODULE, name="Half", mark_kind="presence", freq="weekly"
        )


def test_expected_members_respect_join_leave_and_archive(
    ctx: Any, clock: Any, make_party: Any
) -> None:
    """T-ATT-01-3, BR-3, EC-1 — a member is expected only on dates inside their
    range and only while their party is active; otherwise a register says
    "absent" for days before somebody joined."""
    from apps.attendance.selectors import expected_members

    group = create_group(ctx=ctx, module=TEST_MODULE, data=batch_data())
    early, late, gone, archived = (make_party() for _ in range(4))
    set_members(ctx=ctx, group_id=group.id, party_id=early.id, from_on=TODAY)
    set_members(ctx=ctx, group_id=group.id, party_id=late.id, from_on=TODAY + dt.timedelta(days=7))
    member = set_members(ctx=ctx, group_id=group.id, party_id=gone.id, from_on=TODAY)
    end_membership(ctx=ctx, group_member_id=member.id, on=TODAY + dt.timedelta(days=2))
    set_members(ctx=ctx, group_id=group.id, party_id=archived.id, from_on=TODAY)
    archived.status = "archived"
    archived.save(update_fields=["status"])

    rows = _sessions(group)
    first, fri, next_mon = rows[0], rows[2], rows[3]

    def expected(session: Any) -> set:
        return set(expected_members(ctx.tenant, session).values_list("party_id", flat=True))

    assert expected(first) == {early.id, gone.id}
    assert expected(fri) == {early.id}  # `gone` left on Wednesday (inclusive)
    assert expected(next_mon) == {early.id, late.id}


def test_overlapping_member_ranges_are_refused(ctx: Any, clock: Any, make_party: Any) -> None:
    """Two overlapping ranges for one party would double-count them on every
    session they share. A later range that starts after the first ends is fine."""
    group = create_group(ctx=ctx, module=TEST_MODULE, data=batch_data())
    party = make_party()
    first = set_members(ctx=ctx, group_id=group.id, party_id=party.id, from_on=TODAY)
    with pytest.raises(ValidationFailed) as refused:
        set_members(
            ctx=ctx, group_id=group.id, party_id=party.id, from_on=TODAY + dt.timedelta(days=9)
        )
    assert "from_on" in refused.value.details
    end_membership(ctx=ctx, group_member_id=first.id, on=TODAY + dt.timedelta(days=5))
    set_members(ctx=ctx, group_id=group.id, party_id=party.id, from_on=TODAY + dt.timedelta(days=9))
    with pytest.raises(ValidationFailed):
        end_membership(ctx=ctx, group_member_id=first.id, on=TODAY - dt.timedelta(days=1))


def test_a_party_of_another_tenant_is_not_found(ctx: Any, clock: Any, other_tenant: Any) -> None:
    """Canon §0.11 rule 2 — another tenant's party is 404, never enrolled."""
    from tests.factories.parties import PartyFactory

    group = create_group(ctx=ctx, module=TEST_MODULE, data=batch_data())
    stranger = PartyFactory(tenant=other_tenant)
    with pytest.raises(NotFound):
        set_members(ctx=ctx, group_id=group.id, party_id=stranger.id, from_on=TODAY)


def test_cancel_session_refuses_live_marks_and_audits(
    ctx: Any, clock: Any, make_party: Any
) -> None:
    """User flow 3 — a cancelled session takes no marks (BR-4); cancelling one
    that holds live marks is refused, because it would silently remove counted
    attendance from every percentage."""
    from apps.platform_app.models import AuditLog

    group = create_group(ctx=ctx, module=TEST_MODULE, data=batch_data())
    party = make_party()
    set_members(ctx=ctx, group_id=group.id, party_id=party.id, from_on=TODAY)
    marked, spare = _sessions(group)[0], _sessions(group)[1]
    roll_call(ctx=ctx, session_id=marked.id, marks={party.id: "present"})
    with pytest.raises(ValidationFailed):
        cancel_session(ctx=ctx, session_id=marked.id, reason="Trainer away")
    with pytest.raises(ValidationFailed):
        cancel_session(ctx=ctx, session_id=spare.id, reason="no")
    cancelled = cancel_session(ctx=ctx, session_id=spare.id, reason="Trainer away")
    assert cancelled.status == SessionStatus.CANCELLED
    assert AuditLog.objects.filter(
        action="attendance.session.cancelled", entity_id=spare.id
    ).exists()
    with pytest.raises(ValidationFailed) as refused:
        roll_call(ctx=ctx, session_id=spare.id, marks={party.id: "present"})
    assert refused.value.details == {"session_id": ["This session was cancelled."]}
