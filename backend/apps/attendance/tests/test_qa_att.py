"""QA round 1 — ATT-01…05: failing tests for the findings (wave-b-track-t.md, "QA round 1").

Each test names the defect it pins. They are written against the FRD 00 Part C
rules and contracts §2.3/§5 and fail on the code as committed in fc8decfe.
"""

from __future__ import annotations

import datetime as dt
import threading
import time
from typing import Any

import pytest
from django.db import connection

from apps.attendance import registry
from apps.attendance.constants import MarkStatus, SessionStatus
from apps.attendance.models import Mark, Session
from apps.attendance.services.groups import set_members, update_group
from apps.attendance.services.marks import roll_call, void_mark
from apps.attendance.tests.conftest import NOW, TODAY, visit
from apps.attendance.tests.subject import CONTEXT, EDIT_CLOSED, TEST_MODULE, grant
from apps.common.exceptions import PermissionDenied, ValidationFailed

pytestmark = pytest.mark.django_db

#: Thursday 8 Oct 09:30 IST: Monday's 06:00–07:00 session closed for edits at
#: Tuesday 07:00 (the default 24-hour window after `ends_at`, ATT-03 BR-3).
THREE_DAYS_LATER = NOW + dt.timedelta(days=3)


@pytest.fixture
def monday(batch: Any) -> Session:
    """Monday 5 Oct, 06:00–07:00 IST (the clock reads 09:30 that day)."""
    return Session.objects.filter(group=batch).order_by("starts_at").first()


@pytest.fixture
def pair(ctx: Any, batch: Any, make_party: Any) -> list:
    parties = [make_party(name=f"QA member {i}") for i in range(2)]
    for party in parties:
        set_members(ctx=ctx, group_id=batch.id, party_id=party.id, from_on=TODAY)
    return parties


# ── QA-ATT-1: check_in(session_id=…) walks round the closed-register rule ────


def test_qa_att_1_a_session_check_in_after_the_window_needs_edit_closed(
    user_ctx: Any, member: Any, clock: Any, monday: Any, pair: list
) -> None:
    """QA-ATT-1 (ATT-03 BR-3, C10). `check_in` measures its staleness rule from
    `at` (default: now), never from the SESSION. So three days after Monday's
    class closed, a member without `test.attendance.edit_closed` can still add
    a present mark to Monday's register just by leaving `at` empty — the exact
    bypass C10 was written to stop, through the session door instead of the
    visit door. Expected: refused (403, or 400 like a stale `at`)."""
    party = pair[0]
    clock.set(THREE_DAYS_LATER)
    with pytest.raises((PermissionDenied, ValidationFailed)):
        visit(user_ctx, party, session_id=monday.id)
    assert not Mark.objects.filter(session=monday, party_id=party.id).exists()


def test_qa_att_1_a_session_check_in_after_the_window_cannot_flip_absent_to_present(
    user_ctx: Any, member: Any, clock: Any, monday: Any, pair: list
) -> None:
    """QA-ATT-1 (ATT-03 BR-3). The R57 upsert changes an EXISTING absent mark to
    present with no window check at all — `_change_status` checks the window,
    the upsert branch of `check_in` does not. A closed register's "A" becomes
    "P" for anyone who can check members in. Expected: refused without
    `<module>.attendance.edit_closed`; the mark stays absent."""
    party = pair[0]
    roll_call(ctx=user_ctx, session_id=monday.id, marks={party.id: "absent"})
    clock.set(THREE_DAYS_LATER)
    with pytest.raises((PermissionDenied, ValidationFailed)):
        visit(user_ctx, party, session_id=monday.id)
    assert Mark.objects.get(session=monday, party_id=party.id).status == MarkStatus.ABSENT


# ── QA-ATT-2: roll_call inserts into a closed register without the codename ──


def test_qa_att_2_roll_call_after_the_window_cannot_add_marks_without_edit_closed(
    user_ctx: Any, member: Any, clock: Any, monday: Any, pair: list
) -> None:
    """QA-ATT-2 (ATT-03 BR-3). A held session whose member has no mark shows
    "A" in the register (ATT-05) and counts as absent in the percentage. Three
    days after the window closed, `roll_call` still INSERTS a present mark for
    that member with no codename — only a changed existing mark goes through
    `_check_window`. The register's "A" turns into "P" and the percentage moves,
    which is precisely the change BR-3 reserves for `edit_closed`.
    Expected: 403 `permission_denied` without the codename; allowed with it."""
    a, b = pair
    roll_call(ctx=user_ctx, session_id=monday.id, marks={a.id: "present"})
    clock.set(THREE_DAYS_LATER)
    with pytest.raises(PermissionDenied):
        roll_call(ctx=user_ctx, session_id=monday.id, marks={b.id: "present"})
    assert not Mark.objects.filter(session=monday, party_id=b.id).exists()
    grant(member, EDIT_CLOSED)
    roll_call(ctx=user_ctx, session_id=monday.id, marks={b.id: "present"})


# ── QA-ATT-3: roll-call marks never reach the vertical's listeners ───────────


def test_qa_att_3_a_roll_call_mark_is_heard_by_the_modules_listener_on_create_and_void(
    ctx: Any, clock: Any, monday: Any, pair: list, attendance_subject: Any
) -> None:
    """QA-ATT-3 (contracts §5 `on_marked`: "a mark is created, edited or voided";
    ATT-03 BR-5: `void_mark` "calls on_marked(created=False)"). Listeners are
    looked up by `mark.context_type`, and `roll_call` writes `context_type=""`
    — so a mark created by roll-call, and every later edit and void of it, is
    heard by NO listener. The module's registered listener (here the test
    subject's, module `test`) must hear the create and the void."""
    party = pair[0]
    (mark,) = roll_call(ctx=ctx, session_id=monday.id, marks={party.id: "present"})
    void_mark(ctx=ctx, mark_id=mark.id, reason="Wrong member")
    assert (mark.id, True) in attendance_subject.marked
    assert (mark.id, False) in attendance_subject.marked


# ── QA-ATT-4: a timetable change gives a marked day a second session ─────────


def test_qa_att_4_a_time_change_does_not_add_a_second_session_to_a_marked_day(
    ctx: Any, clock: Any, batch: Any, monday: Any, pair: list
) -> None:
    """QA-ATT-4 (ATT-01 BR-5: "changing the timetable affects sessions from the
    next UNMARKED date"; calendar BR-4 never rewrites history). Today's 06:00
    class is marked; the trainer then moves the batch to 07:00. Regeneration
    keeps the marked 06:00 session (right) and ALSO creates a 07:00 session on
    the same, already-marked day — the register grows a second empty column for
    Monday 5 Oct and roll-call offers a class that never happened."""
    roll_call(ctx=ctx, session_id=monday.id, marks={pair[0].id: "present"})
    update_group(ctx=ctx, group_id=batch.id, data={"session_start": "07:00"})
    start = dt.datetime.combine(TODAY, dt.time.min, tzinfo=NOW.tzinfo)
    on_monday = Session.objects.filter(
        group=batch, starts_at__gte=start, starts_at__lt=start + dt.timedelta(days=1)
    ).exclude(status=SessionStatus.CANCELLED)
    assert [s.id for s in on_monday] == [monday.id]


# ── QA-ATT-5: a deactivated group keeps taking marks and keeps its timetable ─


def test_qa_att_5_roll_call_refuses_an_inactive_group_like_check_in_does(
    ctx: Any, clock: Any, batch: Any, monday: Any, pair: list
) -> None:
    """QA-ATT-5 (ATT-01 EC-2, extended to marks by the build log's deviation 3).
    `check_in` refuses a deactivated group with 400 `{group_id: [...]}`;
    `roll_call` on the same group's session writes marks anyway, so the rule
    depends on which door the trainer used."""
    update_group(ctx=ctx, group_id=batch.id, data={"is_active": False})
    with pytest.raises(ValidationFailed):
        visit(ctx, pair[0], session_id=monday.id)
    with pytest.raises(ValidationFailed):
        roll_call(ctx=ctx, session_id=monday.id, marks={pair[1].id: "present"})


def test_qa_att_5_deactivating_a_group_does_not_leave_eight_weeks_of_scheduled_sessions(
    ctx: Any, clock: Any, batch: Any
) -> None:
    """QA-ATT-5 (ATT-01 EC-2 "a group deactivated → no new sessions; history
    kept"). `generate_sessions` returns 0 for an inactive group BEFORE its
    stale-session pass, so the up-to-8-weeks of future, unmarked `scheduled`
    sessions generated while it was active stay behind: they list on
    `/attendance/sessions` and become empty columns of next month's register
    for a batch that no longer runs. Future unmarked sessions are not history."""
    update_group(ctx=ctx, group_id=batch.id, data={"is_active": False})
    tomorrow = dt.datetime.combine(TODAY + dt.timedelta(days=1), dt.time.min, tzinfo=NOW.tzinfo)
    assert not Session.objects.filter(
        group=batch, starts_at__gte=tomorrow, status=SessionStatus.SCHEDULED
    ).exists()


# ── QA-ATT-6: check-in and roll-call on one session deadlock ─────────────────


@pytest.mark.django_db(transaction=True)
def test_qa_att_6_a_desk_check_in_and_a_roll_call_on_one_session_do_not_deadlock(
    ctx: Any, clock: Any, batch: Any, make_party: Any, attendance_subject: Any
) -> None:
    """QA-ATT-6 (ATT-03 EC-2: two writers → "the later write wins per mark";
    the module docstrings' lock order party → entitlement → mark). `check_in`
    locks the PARTY first and then inserts a mark whose FK takes a KEY SHARE
    lock on the session row; `roll_call` locks the SESSION first (`FOR UPDATE`)
    and then the parties. A desk check-in of a member into a class while the
    trainer saves the roll-call that includes that member is the textbook
    opposite-order pair: Postgres kills one with `deadlock detected`, a 500.

    Made deterministic by holding the check-in inside its policy call (after
    the party lock) until the roll-call is waiting on that party. Expected:
    both succeed, one after the other."""
    party = make_party()
    set_members(ctx=ctx, group_id=batch.id, party_id=party.id, from_on=TODAY)
    session = Session.objects.filter(group=batch).order_by("starts_at").first()
    in_policy, release = threading.Event(), threading.Event()

    def slow_policy(tenant: Any, party_id: Any, context_id: Any, on: dt.date) -> dict:
        in_policy.set()
        release.wait(timeout=10)
        return {"decision": "allow", "reason": ""}

    registry._POLICIES[CONTEXT] = registry.RegisteredPolicy(
        context_type=CONTEXT, module=TEST_MODULE, policy=slow_policy
    )
    outcomes: dict[str, str] = {}

    def run(name: str, fn: Any) -> None:
        try:
            fn()
            outcomes[name] = "ok"
        except Exception as exc:  # noqa: BLE001 — the outcome IS the assertion
            outcomes[name] = f"{type(exc).__name__}: {str(exc).splitlines()[0]}"
        finally:
            connection.close()

    desk = threading.Thread(
        target=run, args=("check_in", lambda: visit(ctx, party, session_id=session.id))
    )
    trainer = threading.Thread(
        target=run,
        args=(
            "roll_call",
            lambda: roll_call(ctx=ctx, session_id=session.id, marks={party.id: "late"}),
        ),
    )
    desk.start()
    assert in_policy.wait(timeout=10), "the check-in never reached its policy"
    trainer.start()
    time.sleep(1.0)  # the roll-call now holds the session and waits on the party
    release.set()
    desk.join(timeout=30)
    trainer.join(timeout=30)
    assert not desk.is_alive() and not trainer.is_alive(), "a writer hung"
    assert outcomes == {"check_in": "ok", "roll_call": "ok"}
