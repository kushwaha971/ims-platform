"""ATT-03 — roll-call, edits and voids (T-ATT-03-1…4, BR-1…BR-5, EC-1, EC-2)."""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.db import IntegrityError, transaction

from apps.attendance.constants import MarkStatus, SessionStatus
from apps.attendance.models import Mark, Session
from apps.attendance.services.groups import set_members
from apps.attendance.services.marks import edit_mark, roll_call, void_mark
from apps.attendance.tests.conftest import NOW, TODAY, visit
from apps.attendance.tests.subject import EDIT_CLOSED, grant
from apps.common.exceptions import PermissionDenied, ValidationFailed
from apps.platform_app.models import AuditLog

pytestmark = pytest.mark.django_db


@pytest.fixture
def first_session(batch: Any) -> Session:
    """Monday 5 Oct, 06:00–07:00 IST (the clock reads 09:30 that day)."""
    return Session.objects.filter(group=batch).order_by("starts_at").first()


@pytest.fixture
def class_of_three(ctx: Any, batch: Any, make_party: Any) -> list:
    parties = [make_party(name=f"Member {i}") for i in range(3)]
    for party in parties:
        set_members(ctx=ctx, group_id=batch.id, party_id=party.id, from_on=TODAY)
    return parties


def test_roll_call_unchanged_writes_nothing_changed_writes_audit(
    ctx: Any, first_session: Any, class_of_three: list, attendance_subject: Any
) -> None:
    """T-ATT-03-1, BR-2 — a second save of the same register writes no row and
    no audit (a busy trainer saves twice); a changed status is an audited edit
    with before and after. The first mark holds the session (BR-4)."""
    a, b, c = class_of_three
    marks = roll_call(
        ctx=ctx, session_id=first_session.id, marks={a.id: "present", b.id: "absent", c.id: "late"}
    )
    assert {m.status for m in marks} == {"present", "absent", "late"}
    assert all(m.method == "roll_call" for m in marks)
    first_session.refresh_from_db()
    assert first_session.status == SessionStatus.HELD
    assert attendance_subject.calls == []  # R57: roll-call runs no policy
    audits = AuditLog.objects.filter(action__startswith="attendance.mark.").count()

    roll_call(ctx=ctx, session_id=first_session.id, marks={a.id: "present", b.id: "absent"})
    assert AuditLog.objects.filter(action__startswith="attendance.mark.").count() == audits

    roll_call(ctx=ctx, session_id=first_session.id, marks={b.id: "excused"})
    edit = AuditLog.objects.get(action="attendance.mark.edited")
    assert edit.before == {"status": "absent"} and edit.after == {"status": "excused"}
    assert Mark.objects.filter(session=first_session).count() == 3


def test_roll_call_from_two_devices_later_write_wins(
    ctx: Any, first_session: Any, class_of_three: list
) -> None:
    """EC-2 — the later save wins per mark, and both are audited."""
    a = class_of_three[0]
    roll_call(ctx=ctx, session_id=first_session.id, marks={a.id: "present"})
    roll_call(ctx=ctx, session_id=first_session.id, marks={a.id: "late"})
    assert Mark.objects.get(session=first_session, party_id=a.id).status == "late"
    assert AuditLog.objects.filter(action__startswith="attendance.mark.").count() == 2


def test_unexpected_member_and_cancelled_session_are_refused(
    ctx: Any, batch: Any, first_session: Any, class_of_three: list, make_party: Any
) -> None:
    """BR-1, EC-1 — a member added after the session (or never) is not expected;
    unknown statuses (including `visit`) are a 400 naming the party."""
    late = make_party()
    set_members(ctx=ctx, group_id=batch.id, party_id=late.id, from_on=TODAY + dt.timedelta(days=1))
    with pytest.raises(ValidationFailed) as refused:
        roll_call(ctx=ctx, session_id=first_session.id, marks={late.id: "present"})
    assert f"marks.{late.id}" in refused.value.details
    with pytest.raises(ValidationFailed):
        roll_call(ctx=ctx, session_id=first_session.id, marks={class_of_three[0].id: "visit"})
    assert not Mark.objects.exists()
    assert roll_call(ctx=ctx, session_id=first_session.id, marks={}) == []
    first_session.refresh_from_db()
    assert first_session.status == SessionStatus.SCHEDULED  # an empty save holds nothing


def test_edit_window_edges_with_and_without_edit_closed(
    user_ctx: Any, member: Any, clock: Any, first_session: Any, class_of_three: list
) -> None:
    """T-ATT-03-2, BR-3 — inside `edit_window_hours` after the session's end the
    module's write codename suffices; one minute after, only
    `<module>.attendance.edit_closed`. Without it a closed register is anyone's."""
    a, b, _ = class_of_three
    roll_call(ctx=user_ctx, session_id=first_session.id, marks={a.id: "present", b.id: "present"})
    mark = Mark.objects.get(session=first_session, party_id=a.id)
    closes = first_session.ends_at + dt.timedelta(hours=24)

    clock.set(closes - dt.timedelta(minutes=1))
    edit_mark(ctx=user_ctx, mark_id=mark.id, status="late", reason="Came at 6:20")
    clock.set(closes + dt.timedelta(minutes=1))
    with pytest.raises(PermissionDenied):
        edit_mark(ctx=user_ctx, mark_id=mark.id, status="present", reason="Was on time")
    with pytest.raises(PermissionDenied):
        void_mark(ctx=user_ctx, mark_id=mark.id, reason="Wrong member")
    grant(member, EDIT_CLOSED)
    edit_mark(ctx=user_ctx, mark_id=mark.id, status="present", reason="Was on time")
    mark.refresh_from_db()
    assert mark.status == "present" and mark.marked_by_id == member.user_id


def test_edit_refuses_bad_reasons_and_swapping_kinds(
    ctx: Any, clock: Any, first_session: Any, class_of_three: list, make_party: Any
) -> None:
    """ATT-03 §6 errors: reason < 3 characters, unknown status, visit ↔ presence."""
    a = class_of_three[0]
    roll_call(ctx=ctx, session_id=first_session.id, marks={a.id: "present"})
    mark = Mark.objects.get(session=first_session)
    with pytest.raises(ValidationFailed):
        edit_mark(ctx=ctx, mark_id=mark.id, status="late", reason="ok")
    with pytest.raises(ValidationFailed):
        edit_mark(ctx=ctx, mark_id=mark.id, status="gone", reason="Typo here")
    with pytest.raises(ValidationFailed):
        edit_mark(ctx=ctx, mark_id=mark.id, status="visit", reason="Typo here")
    walk_in = visit(ctx, make_party())["mark"]
    with pytest.raises(ValidationFailed):
        edit_mark(ctx=ctx, mark_id=walk_in.id, status="present", reason="Typo here")


def test_second_live_mark_raises_integrity_error_until_void(
    ctx: Any, clock: Any, first_session: Any, class_of_three: list
) -> None:
    """T-ATT-03-3, BR-5 — the partial unique index allows one live mark per
    session and party, and a void frees the slot for the corrected mark."""
    a = class_of_three[0]
    roll_call(ctx=ctx, session_id=first_session.id, marks={a.id: "present"})
    original = Mark.objects.get(session=first_session)

    def another() -> Mark:
        return Mark.objects.create(
            tenant=ctx.tenant,
            module=original.module,
            group_id=original.group_id,
            session=first_session,
            party_id=a.id,
            on_date=TODAY,
            status="absent",
            method="roll_call",
        )

    with pytest.raises(IntegrityError), transaction.atomic():
        another()
    void_mark(ctx=ctx, mark_id=original.id, reason="Marked the wrong row")
    assert another().status == "absent"
    roll_call(ctx=ctx, session_id=first_session.id, marks={a.id: "present"})  # upserts the new one
    assert Mark.objects.filter(session=first_session, voided_at__isnull=True).get().status == (
        MarkStatus.PRESENT
    )


def test_void_gives_back_the_use_and_calls_listeners(
    ctx: Any, clock: Any, make_party: Any, attendance_subject: Any
) -> None:
    """T-ATT-03-4, BR-5 — a voided visit leaves the counts and returns its pack
    use (the worked example: used 12 → 11); the listener hears `created=False`."""
    from apps.attendance.services.entitlements import grant_entitlement
    from apps.attendance.tests.subject import TEST_MODULE

    party = make_party()
    ent = grant_entitlement(
        ctx=ctx,
        party_id=party.id,
        module=TEST_MODULE,
        subject_type="test_pack",
        subject_id=party.id,
        total=12,
        valid_from=TODAY,
        valid_to=TODAY + dt.timedelta(days=30),
    )
    attendance_subject.answer("allow", entitlement_id=ent.id)
    mark = visit(ctx, party, at=NOW - dt.timedelta(hours=2))["mark"]
    ent.refresh_from_db()
    assert ent.used == 1
    void_mark(ctx=ctx, mark_id=mark.id, reason="Wrong member")
    ent.refresh_from_db()
    assert ent.used == 0
    assert attendance_subject.marked[-1] == (mark.id, False)
    assert AuditLog.objects.filter(action="attendance.mark.voided", entity_id=mark.id).exists()
    with pytest.raises(ValidationFailed):
        void_mark(ctx=ctx, mark_id=mark.id, reason="Again please")
