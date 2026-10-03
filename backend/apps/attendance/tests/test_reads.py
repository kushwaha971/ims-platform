"""ATT-05 — reads and reports (T-ATT-05-1, -2, -4; T-ATT-01-4; BR-1…BR-3; R56; C13, C14)."""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.attendance.constants import SessionStatus
from apps.attendance.models import Group, Mark, Session
from apps.attendance.selectors import (
    attendance_percent,
    not_visited_since,
    percent_of,
    register_grid,
    visits_by_hour,
)
from apps.attendance.services.groups import create_group, set_members
from apps.attendance.tests.conftest import NOW, TODAY, batch_data, ist, visit
from apps.attendance.tests.subject import OTHER_CONTEXT, OTHER_MODULE, TEST_MODULE, entitle
from apps.platform_app.models import ClosedDay

pytestmark = pytest.mark.django_db


def _ad_hoc(ctx: Any, name: str = "Evening batch", module: str = TEST_MODULE) -> Group:
    return create_group(ctx=ctx, module=module, data={"name": name, "mark_kind": "presence"})


def _session(group: Group, day: dt.date, status: str = SessionStatus.HELD, **kw: Any) -> Session:
    starts = ist(day.year, day.month, day.day, 18, 0)
    return Session.objects.create(
        tenant_id=group.tenant_id,
        group=group,
        starts_at=starts,
        ends_at=starts + dt.timedelta(hours=1),
        status=status,
        cancel_reason="Trainer away" if status == SessionStatus.CANCELLED else "",
        **kw,
    )


def _mark(session: Session, party: Any, status: str) -> Mark:
    return Mark.objects.create(
        tenant_id=session.tenant_id,
        module=session.group.module,
        group=session.group,
        session=session,
        party=party,
        on_date=session.starts_at.astimezone(ist(2026, 1, 1).tzinfo).date(),
        status=status,
        method="roll_call",
    )


# ── percentages (T-ATT-05-1) ─────────────────────────────────────────────────


def test_percent_worked_example_and_zero_denominator(ctx: Any, make_party: Any) -> None:
    """T-ATT-05-1, BR-1 — 13 held while enrolled, 1 excused, 10 present, 1 late
    → 11 / 12 = 91.7 (half up). A cancelled session and dates before a mid-month
    join are excluded, a voided mark never counts, and 0/0 is None ("—"),
    never a division error."""
    group = _ad_hoc(ctx)
    asha, ravi, nobody = make_party(name="Asha"), make_party(name="Ravi"), make_party(name="Zed")
    set_members(ctx=ctx, group_id=group.id, party_id=asha.id, from_on=dt.date(2026, 10, 1))
    set_members(ctx=ctx, group_id=group.id, party_id=ravi.id, from_on=dt.date(2026, 10, 20))
    set_members(ctx=ctx, group_id=group.id, party_id=nobody.id, from_on=dt.date(2026, 11, 1))
    days = [dt.date(2026, 10, d) for d in range(1, 27, 2)]  # 13 days
    sessions = [_session(group, day) for day in days]
    _session(group, dt.date(2026, 10, 28), SessionStatus.CANCELLED)
    statuses = ["present"] * 10 + ["late", "excused", "absent"]
    for session, status in zip(sessions, statuses):
        _mark(session, asha, status)
    voided = _mark(sessions[-1], ravi, "present")
    Mark.objects.filter(pk=voided.pk).update(voided_at=NOW, void_reason="Wrong member")

    rows = {
        r["party"].name: r
        for r in attendance_percent(ctx.tenant, group.id, period=(days[0], dt.date(2026, 10, 31)))
    }
    assert (rows["Asha"]["held"], rows["Asha"]["attended"], rows["Asha"]["excused"]) == (13, 11, 1)
    assert rows["Asha"]["percent"] == Decimal("91.7")
    assert (rows["Ravi"]["held"], rows["Ravi"]["attended"]) == (3, 0)  # 21, 23 and 25 Oct only
    assert rows["Ravi"]["percent"] == Decimal("0.0")
    assert "Zed" not in rows  # not enrolled in the period at all
    assert percent_of(0, 0, 0) is None and percent_of(0, 1, 1) is None


# ── the register (C13) ───────────────────────────────────────────────────────


def test_register_cells_closed_columns_and_not_enrolled(
    ctx: Any, clock: Any, tenant: Any, make_party: Any
) -> None:
    """C13 — a closed day has no session, so it is its own column keyed
    `closed:<date>`; a held session with no mark is "A" for an enrolled member
    and "-" for one not yet enrolled (EC-1: never "absent" before joining);
    a session not yet taken is empty."""
    ClosedDay.objects.create(tenant=tenant, date=dt.date(2026, 10, 7), reason="Holiday")
    group = create_group(ctx=ctx, module=TEST_MODULE, data=batch_data())
    early, late = make_party(name="Asha"), make_party(name="Ravi")
    set_members(ctx=ctx, group_id=group.id, party_id=early.id, from_on=TODAY)
    set_members(ctx=ctx, group_id=group.id, party_id=late.id, from_on=dt.date(2026, 10, 9))
    sessions = list(Session.objects.filter(group=group).order_by("starts_at"))
    monday, friday = sessions[0], sessions[1]  # Wed 7 Oct was closed
    Session.objects.filter(pk=monday.pk).update(status=SessionStatus.HELD)
    _mark(friday, late, "late")

    grid = register_grid(ctx.tenant, group.id, "2026-10")
    keys = [c["key"] for c in grid["columns"]]
    assert keys[:3] == [str(monday.id), "closed:2026-10-07", str(friday.id)]
    rows = {r["party"].name: r["cells"] for r in grid["rows"]}
    assert rows["Asha"][str(monday.id)] == "A"
    assert rows["Ravi"][str(monday.id)] == "-"
    assert rows["Ravi"][str(friday.id)] == "L"
    assert rows["Asha"]["closed:2026-10-07"] == "closed"
    assert rows["Asha"][str(sessions[5].id)] is None


def test_register_of_an_empty_month(ctx: Any, clock: Any) -> None:
    """EC-1 (ATT-05) — no sessions: an empty grid with the group, not an error."""
    group = _ad_hoc(ctx)
    grid = register_grid(ctx.tenant, group.id, "2026-12")
    assert grid["columns"] == [] and grid["rows"] == [] and grid["group"] == group


def test_register_plan_for_sixty_members(
    ctx: Any, clock: Any, make_party: Any, django_assert_max_num_queries: Any
) -> None:
    """T-ATT-05-2 — a 60-member batch over a month is a fixed handful of
    queries (no per-member or per-session query), and the marks read can use
    an index on the session rather than scanning every mark of the tenant."""
    from django.db import connection

    from apps.attendance.selectors import live_marks

    group = create_group(ctx=ctx, module=TEST_MODULE, data=batch_data())
    parties = [make_party() for _ in range(60)]
    for party in parties:
        set_members(ctx=ctx, group_id=group.id, party_id=party.id, from_on=TODAY)
    sessions = list(Session.objects.filter(group=group, starts_at__lt=ist(2026, 11, 1)))
    Mark.objects.bulk_create(
        [
            Mark(
                tenant=ctx.tenant,
                module=TEST_MODULE,
                group=group,
                session=s,
                party=p,
                on_date=TODAY,
                status="present",
                method="roll_call",
            )
            for s in sessions
            for p in parties
        ]
    )
    with django_assert_max_num_queries(6):
        grid = register_grid(ctx.tenant, group.id, "2026-10")
    assert len(grid["rows"]) == 60 and len(grid["columns"]) == len(sessions)

    sql, params = (
        live_marks(ctx.tenant)
        .filter(session_id__in=[s.id for s in sessions])
        .values_list("session_id", "party_id", "status")
        .query.sql_with_params()
    )
    with connection.cursor() as cursor:
        cursor.execute("SET LOCAL enable_seqscan = off")
        cursor.execute("EXPLAIN " + sql, params)
        plan = "\n".join(row[0] for row in cursor.fetchall())
    assert "Seq Scan on attendance_mark" not in plan, plan


# ── churn and staffing ───────────────────────────────────────────────────────


def test_not_visited_since_and_visits_by_hour(ctx: Any, clock: Any, make_party: Any) -> None:
    """BR-2, C14 — the last live visit older than N days, narrowed to the
    parties the vertical passes; BR-3 a voided visit does not count as a visit.
    Peak hours are tenant-local (06:42 IST is hour 6, not 1)."""
    regular, lapsed, ghost = make_party(name="Regular"), make_party(name="Lapsed"), make_party()
    clock.set(ist(2026, 9, 1, 7, 0))
    visit(ctx, lapsed, at=ist(2026, 9, 1, 6, 42))
    clock.set(NOW)
    visit(ctx, regular, at=ist(2026, 10, 5, 6, 42))
    ghost_mark = visit(ctx, ghost, at=ist(2026, 10, 5, 7, 0))["mark"]
    Mark.objects.filter(pk=ghost_mark.pk).update(
        on_date=dt.date(2026, 8, 1), voided_at=NOW, void_reason="Wrong member"
    )
    rows = not_visited_since(ctx.tenant, module=TEST_MODULE, days=14)
    assert [r["party"]["name"] for r in rows] == ["Lapsed"]
    assert rows[0]["last_visit_on"] == dt.date(2026, 9, 1)
    assert not_visited_since(ctx.tenant, module=TEST_MODULE, days=14, party_ids=[regular.id]) == []

    peaks = visits_by_hour(
        ctx.tenant, module=TEST_MODULE, date_from=dt.date(2026, 9, 1), date_to=TODAY
    )
    assert {"hour": 6, "weekday": 1, "visits": 1} in peaks  # Monday 5 Oct
    assert {"hour": 6, "weekday": 2, "visits": 1} in peaks  # Tuesday 1 Sep
    assert sum(p["visits"] for p in peaks) == 2


# ── the module-off guard (R56, T-ATT-05-4) ───────────────────────────────────


def test_off_guard_counts_only_earlier_days_and_registers_once(
    ctx: Any, clock: Any, make_party: Any, tenant: Any
) -> None:
    """R56 — switching the module off is refused for visits of EARLIER days
    left open, never for today's (the desk is working); voided visits never
    count; and a second `ready()` must not double the count, which is why the
    counter is a frozen dataclass compared by value."""
    from apps.attendance.services.guards import OpenVisitsOfEarlierDays, register_off_guards
    from apps.platform_app.services import guards

    guards._reset_for_tests()
    try:
        register_off_guards()
        register_off_guards()
        assert OpenVisitsOfEarlierDays(module=TEST_MODULE) == OpenVisitsOfEarlierDays(
            module=TEST_MODULE
        )
        clock.set(ist(2026, 10, 3, 19, 0))
        visit(ctx, make_party(), at=ist(2026, 10, 3, 18, 0))
        voided = visit(ctx, make_party(), at=ist(2026, 10, 3, 18, 5))["mark"]
        clock.set(NOW)
        visit(ctx, make_party())
        Mark.objects.filter(pk=voided.pk).update(voided_at=NOW, void_reason="Wrong member")
        assert guards.module_off_blockers(tenant, TEST_MODULE) == [
            {"label_id": "attendance.off.openVisits", "count": 1}
        ]
        assert guards.module_off_blockers(tenant, OTHER_MODULE) == []
    finally:
        guards._reset_for_tests()


# ── the endpoints (T-ATT-01-4, W-P4) ─────────────────────────────────────────


@pytest.fixture
def world(ctx: Any, clock: Any, make_party: Any) -> dict:
    """A batch and visits in `test`, and a group and a visit in `test_b`."""
    from apps.attendance.services.marks import check_in

    ours = create_group(ctx=ctx, module=TEST_MODULE, data=batch_data())
    theirs = _ad_hoc(ctx, "Their batch", module=OTHER_MODULE)
    party = make_party(name="Asha")
    set_members(ctx=ctx, group_id=ours.id, party_id=party.id, from_on=TODAY)
    walk_in = visit(ctx, party)["mark"]
    check_in(
        ctx=ctx, module=OTHER_MODULE, party_id=party.id, context_type=OTHER_CONTEXT, context_id=None
    )
    return {"ours": ours, "theirs": theirs, "party": party, "visit": walk_in}


def _url(name: str) -> str:
    return reverse(f"v1:attendance-{name}")


def test_engine_reads_404_cross_tenant_and_hide_unreadable_modules(
    api_as: Any, tenant: Any, other_tenant: Any, world: dict
) -> None:
    """T-ATT-01-4 — an owner sees both modules; an admin (who lacks `test_b`'s
    codename) sees only `test`'s rows and `test_b`'s group is 404 to them;
    another tenant's member gets 404 and nothing listed; with no consumer on,
    403 `module_disabled` naming `attendance`. Each client asserts WHO it is
    first (the CLAUDE.md harness lesson)."""
    owner, owner_member = api_as(tenant, role="owner")
    assert owner_member.role.code == "owner" and owner_member.tenant_id == tenant.id
    groups = owner.get(_url("group-list")).json()["data"]
    assert {g["module"] for g in groups} == {TEST_MODULE, OTHER_MODULE}
    visits = owner.get(_url("open-visits")).json()["data"]
    assert {v["module"] for v in visits} == {TEST_MODULE, OTHER_MODULE}

    admin, admin_member = api_as(tenant, role="admin")
    assert admin_member.role.code == "admin"
    assert {g["module"] for g in admin.get(_url("group-list")).json()["data"]} == {TEST_MODULE}
    assert admin.get(_url("open-visits"), {"module": OTHER_MODULE}).json()["data"] == []
    theirs = admin.get(_url("session-list"), {"group_id": str(world["theirs"].id)})
    assert theirs.status_code == 404
    ours = admin.get(_url("session-list"), {"group_id": str(world["ours"].id)})
    assert ours.status_code == 200 and ours.json()["data"][0]["expected_count"] == 1

    stranger, stranger_member = api_as(other_tenant, role="owner")
    assert stranger_member.tenant_id == other_tenant.id
    entitle(other_tenant, TEST_MODULE)
    assert (
        stranger.get(
            _url("register"), {"group_id": str(world["ours"].id), "month": "2026-10"}
        ).status_code
        == 404
    )
    assert stranger.get(_url("mark-list")).json()["data"] == []

    entitle(tenant, TEST_MODULE, OTHER_MODULE, enabled=False)
    refused = owner.get(_url("group-list"))
    assert refused.status_code == 403
    assert refused.json()["error"]["code"] == "module_disabled"
    assert refused.json()["error"]["details"] == {"module": "attendance"}


def test_engine_reads_have_no_write_verbs(api_as: Any, tenant: Any, world: dict) -> None:
    """ADR-041 — every write goes through a vertical endpoint."""
    owner, _ = api_as(tenant)
    assert owner.post(_url("mark-list"), {}, format="json").status_code in (403, 405)


def test_every_endpoint_answers_its_shape(api_as: Any, tenant: Any, world: dict) -> None:
    """The eight reads answer 200 with the FRD shape; `context_label` is NOT sent
    (C12: the engine has no source, and an always-empty key is a false claim)."""
    owner, _ = api_as(tenant)
    group_id = str(world["ours"].id)
    sessions = owner.get(
        _url("session-list"), {"group_id": group_id, "from": "2026-10-05", "to": "2026-10-11"}
    )
    assert [s["on_date"] for s in sessions.json()["data"]] == [
        "2026-10-05",
        "2026-10-07",
        "2026-10-09",
    ]
    in_now = owner.get(_url("open-visits"), {"module": TEST_MODULE}).json()["data"]
    assert in_now[0]["mark_id"] == str(world["visit"].id) and "context_label" not in in_now[0]
    marks = owner.get(
        _url("mark-list"), {"party_id": str(world["party"].id), "module": TEST_MODULE}
    )
    assert marks.json()["data"][0]["status"] == "visit" and "has_more" in marks.json()["meta"]
    register = owner.get(_url("register"), {"group_id": group_id, "month": "2026-10"}).json()[
        "data"
    ]
    assert register["rows"][0]["party"]["name"] == "Asha" and register["columns"]
    percent = owner.get(_url("percent"), {"group_id": group_id, "period": "2026-10"}).json()["data"]
    assert percent[0]["percent"] is None  # nothing held yet: "—", not 0
    below = owner.get(_url("percent"), {"group_id": group_id, "period": "2026-10", "below": "75"})
    assert below.json()["data"] == []
    assert owner.get(_url("not-visited"), {"module": TEST_MODULE, "days": "7"}).json()["data"] == []
    peaks = owner.get(
        _url("visits-by-hour"), {"module": TEST_MODULE, "from": "2026-10-01", "to": "2026-10-31"}
    )
    assert peaks.json()["data"] == [{"hour": 9, "weekday": 1, "visits": 1}]


@pytest.mark.parametrize(
    "name,params",
    [
        ("session-list", {}),
        ("session-list", {"group_id": "nope"}),
        ("register", {"group_id": str(uuid.uuid4()), "month": "October"}),
        ("percent", {"group_id": str(uuid.uuid4()), "below": "150"}),
        ("not-visited", {"module": TEST_MODULE, "days": "0"}),
        ("visits-by-hour", {"module": TEST_MODULE}),
        ("mark-list", {"from": "2026-12-01", "to": "2026-11-01"}),
    ],
)
def test_bad_filters_are_400(
    api_as: Any, tenant: Any, world: dict, name: str, params: dict
) -> None:
    """A bad filter answered with the unfiltered list is a wrong answer that looks right."""
    owner, _ = api_as(tenant)
    response = owner.get(_url(name), params)
    assert response.status_code == 400, response.content
    assert response.json()["error"]["code"] == "validation_error"
