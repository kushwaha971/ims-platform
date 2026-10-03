"""ATT-02 — check-in and check-out with the policy hook (T-ATT-02-1…5, -7; BR-1…BR-6; R57, R59)."""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.core.exceptions import ImproperlyConfigured

from apps.attendance.constants import MarkStatus, SessionStatus
from apps.attendance.models import Mark, Session
from apps.attendance.services.groups import create_group, set_members
from apps.attendance.services.marks import check_in, check_out, close_open_visits, roll_call
from apps.attendance.tests.conftest import NOW, TODAY, ist, visit
from apps.attendance.tests.subject import OTHER_CONTEXT, OVERRIDE, TEST_MODULE, grant
from apps.common.exceptions import BusinessRuleViolation, PermissionDenied, ValidationFailed
from apps.platform_app.models import AuditLog

pytestmark = pytest.mark.django_db


# ── the policy (T-ATT-02-1, BR-1, BR-2, EC-2) ────────────────────────────────


def test_policy_allow_warn_block_and_override_with_and_without_the_codename(
    ctx: Any, user_ctx: Any, member: Any, clock: Any, make_party: Any, attendance_subject: Any
) -> None:
    """T-ATT-02-1 — the policy decides; a block is overridable only with a reason
    AND the codename the policy names. A block anyone could override with a
    reason is no block at all."""
    allow, warn, blocked = make_party(), make_party(), make_party()
    result = visit(ctx, allow)
    assert result["decision"] == "allow" and result["mark"].status == MarkStatus.VISIT

    attendance_subject.answer("warn", "Membership ends in 2 days")
    result = visit(ctx, warn)
    assert (result["decision"], result["reason"]) == ("warn", "Membership ends in 2 days")
    assert result["mark"].override_reason is None

    attendance_subject.answer("block", "Membership expired on 30 Sep", override_permission=OVERRIDE)
    with pytest.raises(BusinessRuleViolation) as refused:
        visit(user_ctx, blocked)
    assert refused.value.code == "attendance_blocked" and refused.value.http_status == 409
    assert refused.value.details == {
        "reason": "Membership expired on 30 Sep",
        "override_permission": OVERRIDE,
    }
    with pytest.raises(PermissionDenied):
        visit(user_ctx, blocked, override_reason="Paying today")
    with pytest.raises(ValidationFailed) as short:
        visit(user_ctx, blocked, override_reason="ok")
    assert "override_reason" in short.value.details
    assert not Mark.objects.filter(party_id=blocked.id).exists()

    grant(member, OVERRIDE)
    result = visit(user_ctx, blocked, override_reason="Paying today")
    assert result["decision"] == "block_overridden"
    assert result["mark"].override_reason == "Paying today"


def test_a_block_naming_no_codename_can_be_overridden_by_nobody(
    user_ctx: Any, member: Any, clock: Any, make_party: Any, attendance_subject: Any
) -> None:
    """`override_permission: None` means the vertical allows no override; the
    engine must not read None as "anybody"."""
    attendance_subject.answer("block", "Banned", override_permission=None)
    grant(member, OVERRIDE)
    with pytest.raises(PermissionDenied):
        visit(user_ctx, make_party(), override_reason="I am the owner")


def test_an_unregistered_context_type_is_refused_not_allowed(
    ctx: Any, clock: Any, make_party: Any
) -> None:
    """EC-2 — a missing policy is a wiring defect, never "allow by default"."""
    with pytest.raises(ImproperlyConfigured):
        check_in(
            ctx=ctx,
            module=TEST_MODULE,
            party_id=make_party().id,
            context_type="nobody_registered_this",
            context_id=None,
        )
    assert not Mark.objects.exists()


def test_a_policy_of_another_module_is_a_wiring_error(
    ctx: Any, clock: Any, make_party: Any
) -> None:
    """A vertical may not check members in through another module's policy."""
    with pytest.raises(ImproperlyConfigured):
        check_in(
            ctx=ctx,
            module=TEST_MODULE,
            party_id=make_party().id,
            context_type=OTHER_CONTEXT,
            context_id=None,
        )


def test_override_is_audited_with_reason_and_actor(
    user_ctx: Any, member: Any, clock: Any, make_party: Any, attendance_subject: Any
) -> None:
    """T-ATT-02-7 — "who was let in anyway, by whom, why" is a report; it needs
    the reason, the actor and the codename on its own audit row."""
    attendance_subject.answer("block", "Expired", override_permission=OVERRIDE)
    grant(member, OVERRIDE)
    mark = visit(user_ctx, make_party(), override_reason="Paying today")["mark"]
    row = AuditLog.objects.get(action="attendance.mark.overridden", entity_id=mark.id)
    assert row.actor_id == member.user_id
    assert row.metadata["reason"] == "Paying today"
    assert row.metadata["override_permission"] == OVERRIDE
    assert row.metadata["policy_reason"] == "Expired"
    assert AuditLog.objects.filter(action="attendance.mark.created", entity_id=mark.id).exists()
    assert mark.marked_by_id == member.user_id


# ── dedupe (T-ATT-02-2, BR-3, R59) ──────────────────────────────────────────


@pytest.mark.parametrize(
    "gap,duplicate",
    [
        (dt.timedelta(minutes=5) - dt.timedelta(seconds=1), True),
        (dt.timedelta(minutes=5), False),
        (dt.timedelta(minutes=5, seconds=1), False),
    ],
)
def test_dedupe_window_edges(
    ctx: Any, desk: Any, clock: Any, make_party: Any, gap: Any, duplicate: bool
) -> None:
    """T-ATT-02-2 — the double tap inside the window is a 409 naming the first
    mark; the edge minute is a new visit (strict `<`)."""
    party = make_party()
    first = visit(ctx, party, group_id=desk.id, at=NOW - dt.timedelta(minutes=10))["mark"]
    later = NOW - dt.timedelta(minutes=10) + gap
    if duplicate:
        with pytest.raises(BusinessRuleViolation) as twin:
            visit(ctx, party, group_id=desk.id, at=later)
        assert twin.value.code == "attendance_duplicate"
        assert twin.value.details == {"mark_id": str(first.id)}
        assert str(twin.value) == "Already checked in at 9:20 am."
    else:
        assert visit(ctx, party, group_id=desk.id, at=later)["mark"].id != first.id


def test_one_per_day_and_voided_marks_do_not_count(ctx: Any, clock: Any, make_party: Any) -> None:
    """BR-3 one-per-day; BR-6 — a voided visit never blocks the real one."""
    from apps.attendance.services.marks import void_mark

    group = create_group(
        ctx=ctx,
        module=TEST_MODULE,
        data={"name": "Desk", "mark_kind": "visit", "one_per_day": True},
    )
    party = make_party()
    first = visit(ctx, party, group_id=group.id, at=NOW - dt.timedelta(hours=3))["mark"]
    with pytest.raises(BusinessRuleViolation):
        visit(ctx, party, group_id=group.id)
    void_mark(ctx=ctx, mark_id=first.id, reason="Wrong member")
    assert visit(ctx, party, group_id=group.id)["mark"].status == MarkStatus.VISIT


def test_a_group_less_visit_is_never_deduplicated(ctx: Any, clock: Any, make_party: Any) -> None:
    """R59 — a visit without a group has no window; a vertical that wants one
    passes its desk group."""
    party = make_party()
    visit(ctx, party)
    visit(ctx, party)
    assert Mark.objects.filter(party_id=party.id).count() == 2


def test_dedupe_zero_minutes_means_no_window(ctx: Any, clock: Any, make_party: Any) -> None:
    """gym allows 0 (`gym.md:409`)."""
    group = create_group(
        ctx=ctx, module=TEST_MODULE, data={"name": "D", "mark_kind": "visit", "dedupe_minutes": 0}
    )
    party = make_party()
    visit(ctx, party, group_id=group.id)
    visit(ctx, party, group_id=group.id)
    assert Mark.objects.filter(party_id=party.id).count() == 2


# ── times and days ───────────────────────────────────────────────────────────


def test_future_and_stale_times_are_refused(
    ctx: Any, desk: Any, clock: Any, make_party: Any
) -> None:
    """ATT-02 §6 (5 minutes ahead); C10 — a check-in older than the edit window
    would walk round ATT-03's closed-edit rule."""
    party = make_party()
    with pytest.raises(ValidationFailed) as ahead:
        visit(ctx, party, at=NOW + dt.timedelta(minutes=5, seconds=1))
    assert "at" in ahead.value.details
    visit(ctx, make_party(), at=NOW + dt.timedelta(minutes=5))
    with pytest.raises(ValidationFailed):
        visit(ctx, party, group_id=desk.id, at=NOW - dt.timedelta(hours=24, seconds=1))


def test_check_in_after_midnight_belongs_to_the_new_day(
    ctx: Any, clock: Any, make_party: Any
) -> None:
    """EC-1, BR-4 — `on_date` is the tenant-local date: 00:20 IST on the 6th is
    18:50 UTC on the 5th, and it is the 6th's visit."""
    clock.set(ist(2026, 10, 6, 0, 30))
    mark = visit(ctx, make_party(), at=ist(2026, 10, 6, 0, 20))["mark"]
    assert mark.check_in_at.astimezone(dt.timezone.utc).date() == dt.date(2026, 10, 5)
    assert mark.on_date == dt.date(2026, 10, 6)


def test_an_archived_party_is_refused(ctx: Any, clock: Any, make_party: Any) -> None:
    """The dues engine's rule (EC-4): no new records for an archived party."""
    party = make_party(status="archived")
    with pytest.raises(BusinessRuleViolation) as refused:
        visit(ctx, party)
    assert refused.value.code == "party_archived"


# ── sessions (R57) ───────────────────────────────────────────────────────────


def test_session_check_in_upserts_an_absent_mark(
    ctx: Any, batch: Any, clock: Any, make_party: Any, attendance_subject: Any
) -> None:
    """R57, gym BR-4 — a member marked absent at roll-call who then arrives is
    checked in through the policy and becomes present; a second save of a
    present mark is the same mark, not a 409 and not a second visit."""
    party = make_party()
    set_members(ctx=ctx, group_id=batch.id, party_id=party.id, from_on=TODAY)
    session = Session.objects.filter(group=batch).order_by("starts_at").first()
    roll_call(ctx=ctx, session_id=session.id, marks={party.id: "absent"})
    calls = len(attendance_subject.calls)
    result = visit(ctx, party, session_id=session.id)
    assert len(attendance_subject.calls) == calls + 1  # the policy ran
    mark = result["mark"]
    assert mark.status == MarkStatus.PRESENT and mark.on_date == TODAY
    again = visit(ctx, party, session_id=session.id)
    assert again["mark"].id == mark.id
    assert Mark.objects.filter(session=session, party_id=party.id).count() == 1


def test_session_marks_take_the_sessions_date_and_hold_it(
    ctx: Any, batch: Any, clock: Any, make_party: Any
) -> None:
    """C11 — a mark saved the next morning belongs to the session's day; the
    first mark moves the session to held (ATT-03 BR-4)."""
    party = make_party()
    set_members(ctx=ctx, group_id=batch.id, party_id=party.id, from_on=TODAY)
    session = Session.objects.filter(group=batch).order_by("starts_at").first()
    clock.set(ist(2026, 10, 6, 8, 0))
    mark = visit(ctx, party, session_id=session.id)["mark"]
    assert mark.on_date == TODAY
    session.refresh_from_db()
    assert session.status == SessionStatus.HELD


def test_a_session_takes_only_expected_members_and_never_when_cancelled(
    ctx: Any, batch: Any, clock: Any, make_party: Any
) -> None:
    """ATT-03 BR-1 applies to the check-in path too; BR-4 the cancelled session."""
    from apps.attendance.services.groups import cancel_session

    stranger = make_party()
    sessions = list(Session.objects.filter(group=batch).order_by("starts_at"))
    with pytest.raises(ValidationFailed) as refused:
        visit(ctx, stranger, session_id=sessions[0].id)
    assert "party_id" in refused.value.details
    set_members(ctx=ctx, group_id=batch.id, party_id=stranger.id, from_on=TODAY)
    cancel_session(ctx=ctx, session_id=sessions[1].id, reason="Trainer away")
    with pytest.raises(ValidationFailed) as cancelled:
        visit(ctx, stranger, session_id=sessions[1].id)
    assert cancelled.value.details == {"session_id": ["This session was cancelled."]}
    with pytest.raises(ValidationFailed):
        visit(ctx, stranger, group_id=batch.id)  # a presence group needs its session


# ── check-out and auto-close (T-ATT-02-4, BR-5) ──────────────────────────────


def test_check_out_rules(ctx: Any, clock: Any, make_party: Any) -> None:
    """ATT-02 §6 errors: before the check-in, twice, or a voided visit."""
    from apps.attendance.services.marks import void_mark

    mark = visit(ctx, make_party(), at=NOW - dt.timedelta(hours=1))["mark"]
    with pytest.raises(ValidationFailed):
        check_out(ctx=ctx, mark_id=mark.id, at=NOW - dt.timedelta(hours=2))
    closed = check_out(ctx=ctx, mark_id=mark.id)
    assert closed.check_out_at == NOW and not closed.auto_closed
    with pytest.raises(ValidationFailed):
        check_out(ctx=ctx, mark_id=mark.id)
    other = visit(ctx, make_party())["mark"]
    void_mark(ctx=ctx, mark_id=other.id, reason="Wrong member")
    with pytest.raises(ValidationFailed):
        check_out(ctx=ctx, mark_id=other.id)


def test_auto_close_uses_the_tenant_day_and_is_idempotent(
    ctx: Any, clock: Any, make_party: Any, tenant: Any
) -> None:
    """T-ATT-02-4 — an open visit gets 23:59:59 of ITS OWN tenant-local day and
    `auto_closed`; today's visit is untouched; a second run closes nothing;
    a night the job missed heals on the next run (`<=`, not `=`)."""
    clock.set(ist(2026, 10, 3, 19, 0))
    missed = visit(ctx, make_party(), at=ist(2026, 10, 3, 18, 0))["mark"]
    clock.set(ist(2026, 10, 4, 19, 0))
    yesterday = visit(ctx, make_party(), at=ist(2026, 10, 4, 18, 0))["mark"]
    clock.set(NOW)
    today = visit(ctx, make_party())["mark"]

    assert close_open_visits(tenant=tenant, on=dt.date(2026, 10, 4)) == 2
    assert close_open_visits(tenant=tenant, on=dt.date(2026, 10, 4)) == 0
    missed.refresh_from_db()
    yesterday.refresh_from_db()
    today.refresh_from_db()
    assert missed.check_out_at == ist(2026, 10, 3, 23, 59, 59) and missed.auto_closed
    assert yesterday.check_out_at == ist(2026, 10, 4, 23, 59, 59)
    assert today.check_out_at is None and not today.auto_closed
    assert AuditLog.objects.filter(action="attendance.visits.auto_closed").count() == 1
    with pytest.raises(ValidationFailed):
        check_out(ctx=ctx, mark_id=yesterday.id)


def test_the_close_job_fans_out_per_tenant_with_open_visits(
    ctx: Any, clock: Any, make_party: Any, tenant: Any, other_tenant: Any, settings: Any
) -> None:
    """BR-5's daily fan-out: one child per tenant that HAS open visits, for its
    previous local day; a second parent run enqueues nothing new."""
    from apps.attendance import tasks
    from apps.platform_app.models import Job

    settings.UB_JOBS_EAGER = False
    clock.set(ist(2026, 10, 4, 19, 0))
    visit(ctx, make_party(), at=ist(2026, 10, 4, 18, 0))
    clock.set(ist(2026, 10, 5, 0, 5))
    assert tasks.close_open_visits(None, None) == {"tenants": 1}
    assert tasks.close_open_visits(None, None) == {"tenants": 0}
    child = Job.objects.get(job_type=tasks.CLOSE_FOR_TENANT)
    assert child.tenant_id == tenant.id and child.payload["on"] == "2026-10-04"
    assert tasks.close_open_visits_for_tenant(child, None) == {"closed": 1}


# ── listeners and atomicity ──────────────────────────────────────────────────


def test_listeners_hear_create_and_a_listener_that_raises_rolls_the_mark_back(
    ctx: Any, clock: Any, make_party: Any, attendance_subject: Any
) -> None:
    """10-architecture §11 — `on_marked` runs inside the transaction; a vertical
    that refuses by raising leaves no mark, no use and no audit behind."""
    party = make_party()
    mark = visit(ctx, party)["mark"]
    assert attendance_subject.marked == [(mark.id, True)]
    attendance_subject.listener_raises = True
    with pytest.raises(RuntimeError):
        visit(ctx, party)
    assert Mark.objects.filter(party_id=party.id).count() == 1
    assert AuditLog.objects.filter(action="attendance.mark.created").count() == 1


# ── the query budget (T-ATT-02-5, C8) ────────────────────────────────────────


def _statements(context: Any) -> list[str]:
    """Captured SQL without the SAVEPOINT bookkeeping `transaction.atomic` adds."""
    return [q["sql"] for q in context.captured_queries if "SAVEPOINT" not in q["sql"]]


def test_check_in_query_budget(
    ctx: Any, desk: Any, clock: Any, make_party: Any, attendance_subject: Any
) -> None:
    """T-ATT-02-5 — the hottest desk path is bounded. Group-less: party lock,
    insert, audit (3). Desk group: plus the group read and the dedupe probe (5);
    the fake policy asks none, so a real one has room for its one query inside
    the FRD's six. The FRD's six cannot hold for a pack (C8): locking the
    entitlement, moving `used` and the use row are three more — eight
    statements plus the policy's one is the honest ceiling of nine."""
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    from apps.attendance.services.entitlements import grant_entitlement

    first, second = make_party(), make_party()
    with CaptureQueriesContext(connection) as plain:
        visit(ctx, first)
    assert len(_statements(plain)) <= 3, _statements(plain)
    with CaptureQueriesContext(connection) as at_desk:
        visit(ctx, second, group_id=desk.id)
    assert len(_statements(at_desk)) <= 5, _statements(at_desk)
    packed = make_party()
    ent = grant_entitlement(
        ctx=ctx,
        party_id=packed.id,
        module=TEST_MODULE,
        subject_type="test_pack",
        subject_id=packed.id,
        total=10,
        valid_from=TODAY,
        valid_to=TODAY + dt.timedelta(days=30),
    )
    attendance_subject.answer("allow", entitlement_id=ent.id)
    with CaptureQueriesContext(connection) as with_pack:
        result = visit(ctx, packed, group_id=desk.id)
    assert len(_statements(with_pack)) <= 8, _statements(with_pack)
    assert result["entitlement"] == {"id": ent.id, "total": 10, "used": 1, "left": 9}


def test_the_open_visits_read_can_use_its_partial_index(ctx: Any, tenant: Any) -> None:
    """T-ATT-02-5 — `ix_attendance_open_visits` must match the "In now" query's
    predicate, or it is an index nobody can use (the PTY-02 lesson). With
    sequential scans priced out, the planner must reach for it."""
    from django.db import connection

    from apps.attendance.selectors import open_visits

    sql, params = open_visits(tenant, modules=[TEST_MODULE]).query.sql_with_params()
    with connection.cursor() as cursor:
        cursor.execute("SET LOCAL enable_seqscan = off")
        cursor.execute("EXPLAIN " + sql, params)
        plan = "\n".join(row[0] for row in cursor.fetchall())
    assert "ix_attendance_open_visits" in plan, plan
