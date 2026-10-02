"""Reads of the attendance engine (contracts §2.3 selectors, FRD 00 ATT-05).

Every selector filters `tenant` first. The read endpoints narrow further to
the modules the member may read (`readable_engine_modules`); the selectors
take that set as `modules` where a module is not otherwise fixed.

Voided marks never count, anywhere (ATT-02 BR-6, ATT-05 BR-3).
"""

from __future__ import annotations

import calendar
import datetime as dt
from collections import defaultdict
from collections.abc import Iterable
from decimal import Decimal
from typing import Any
from uuid import UUID

from django.db.models import Count, Max, Q, QuerySet

from apps.attendance.constants import (
    CELL_ABSENT,
    CELL_CLOSED,
    CELL_NOT_ENROLLED,
    CELL_OF_STATUS,
    MarkStatus,
    SessionStatus,
)
from apps.attendance.models import Group, GroupMember, Mark, Session
from apps.common.dates import tenant_timezone, tenant_today
from apps.common.money import half_up
from apps.common.recurrence import occurrences

ONE_DECIMAL = Decimal("0.1")


def live_marks(tenant: Any) -> QuerySet[Mark]:
    return Mark.objects.for_tenant(tenant).filter(voided_at__isnull=True)


def local_day(tenant: Any, moment: dt.datetime) -> dt.date:
    return moment.astimezone(tenant_timezone(tenant)).date()


def day_bounds(tenant: Any, first: dt.date, last: dt.date) -> tuple[dt.datetime, dt.datetime]:
    """`[first 00:00, last+1 00:00)` tenant-local, as aware datetimes."""
    tz = tenant_timezone(tenant)
    return (
        dt.datetime.combine(first, dt.time.min, tzinfo=tz),
        dt.datetime.combine(last + dt.timedelta(days=1), dt.time.min, tzinfo=tz),
    )


def _enrolled(member: Any, day: dt.date) -> bool:
    return member.from_on <= day and (member.to_on is None or member.to_on >= day)


# ── groups, sessions, members ────────────────────────────────────────────────


def groups_queryset(tenant: Any, *, modules: Iterable[str]) -> QuerySet[Group]:
    return Group.objects.for_tenant(tenant).filter(module__in=list(modules))


def expected_members(tenant: Any, session: Session) -> QuerySet[GroupMember]:
    """ATT-01 BR-3: members whose `[from_on, to_on]` contains the session's
    tenant-local date and whose party is active."""
    day = local_day(tenant, session.starts_at)
    return (
        GroupMember.objects.for_tenant(tenant)
        .filter(group_id=session.group_id, from_on__lte=day, party__status="active")
        .filter(Q(to_on__isnull=True) | Q(to_on__gte=day))
    )


def sessions_with_counts(
    tenant: Any, *, group: Group, date_from: dt.date | None, date_to: dt.date | None
) -> list[dict]:
    """ATT-01 §6: sessions with `marked_count` (live marks) and `expected_count`.

    Two queries plus one for the members, however many sessions."""
    queryset = Session.objects.for_tenant(tenant).filter(group=group)
    if date_from:
        queryset = queryset.filter(starts_at__gte=day_bounds(tenant, date_from, date_from)[0])
    if date_to:
        queryset = queryset.filter(starts_at__lt=day_bounds(tenant, date_to, date_to)[1])
    sessions = list(
        queryset.annotate(
            marked_count=Count("marks", filter=Q(marks__voided_at__isnull=True))
        ).order_by("starts_at")
    )
    members = list(
        GroupMember.objects.for_tenant(tenant)
        .filter(group=group, party__status="active")
        .only("from_on", "to_on")
    )
    rows = []
    for session in sessions:
        day = local_day(tenant, session.starts_at)
        rows.append(
            {
                "session": session,
                "on_date": day,
                "marked_count": session.marked_count,
                "expected_count": sum(1 for m in members if _enrolled(m, day)),
            }
        )
    return rows


# ── marks ────────────────────────────────────────────────────────────────────


def marks_for(
    tenant: Any,
    *,
    party_id: UUID | None = None,
    group_id: UUID | None = None,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    modules: Iterable[str] | None = None,
) -> QuerySet[Mark]:
    """Contracts §2.3. Live marks, newest first."""
    queryset = live_marks(tenant)
    if modules is not None:
        queryset = queryset.filter(module__in=list(modules))
    if party_id:
        queryset = queryset.filter(party_id=party_id)
    if group_id:
        queryset = queryset.filter(group_id=group_id)
    if date_from:
        queryset = queryset.filter(on_date__gte=date_from)
    if date_to:
        queryset = queryset.filter(on_date__lte=date_to)
    return queryset.order_by("-on_date", "-check_in_at", "-id")


def open_visits(tenant: Any, *, modules: Iterable[str]) -> QuerySet[Mark]:
    """ "In now": live visits not checked out (ix_attendance_open_visits)."""
    return live_marks(tenant).filter(
        module__in=list(modules), status=MarkStatus.VISIT, check_out_at__isnull=True
    )


def open_visits_before(tenant: Any, *, module: str, day: dt.date) -> QuerySet[Mark]:
    """R56: open visits of days EARLIER than `day` — the module-off counter."""
    return live_marks(tenant).filter(
        module=module, status=MarkStatus.VISIT, check_out_at__isnull=True, on_date__lt=day
    )


# ── the register (ATT-05 §6, C13) ────────────────────────────────────────────


def month_bounds(month: str) -> tuple[dt.date, dt.date]:
    """`"2026-10"` → (1 Oct, 31 Oct). `ValueError` for anything else."""
    year, mon = (int(part) for part in month.split("-"))
    if not 1 <= mon <= 12 or not 2000 <= year <= 2100 or len(month) != 7:
        raise ValueError(month)
    return dt.date(year, mon, 1), dt.date(year, mon, calendar.monthrange(year, mon)[1])


def register_grid(tenant: Any, group_id: UUID, month: str) -> dict:
    """The monthly register: one column per non-cancelled session, plus a
    "closed" column for each day the group's rule would have produced a
    session but the calendar closed (C13 — a closed day has no session, so it
    cannot be keyed by one); one row per member enrolled at any point in the
    month. Cells: P A L E, "-" not enrolled, "closed", or null for a session
    not taken yet. A fixed number of queries whatever the size of the batch."""
    from apps.platform_app.services.calendar import closed_days_between

    first, last = month_bounds(month)
    group = Group.objects.for_tenant(tenant).get(pk=group_id)
    start, end = day_bounds(tenant, first, last)
    sessions = list(
        Session.objects.for_tenant(tenant)
        .filter(group=group, starts_at__gte=start, starts_at__lt=end)
        .exclude(status=SessionStatus.CANCELLED)
        .order_by("starts_at")
    )
    columns: list[dict] = []
    for session in sessions:
        columns.append(
            {
                "key": str(session.id),
                "date": local_day(tenant, session.starts_at),
                "session_id": session.id,
                "kind": "session",
                "starts_at": session.starts_at,
                "status": session.status,
            }
        )
    rule = group.recurrence
    if rule is not None:
        lower = max(first, rule.anchor)
        session_days = {column["date"] for column in columns}
        closed = (
            closed_days_between(tenant, lower, last, module=group.module)
            if lower <= last
            else set()
        )
        for day in occurrences(rule, start=lower, end=last + dt.timedelta(days=1)):
            if day in closed and day not in session_days:
                columns.append(
                    {
                        "key": f"closed:{day.isoformat()}",
                        "date": day,
                        "session_id": None,
                        "kind": "closed",
                        "starts_at": None,
                        "status": None,
                    }
                )
    columns.sort(key=lambda c: (c["date"], c["starts_at"] or start))
    members = list(
        GroupMember.objects.for_tenant(tenant)
        .filter(group=group, from_on__lte=last)
        .filter(Q(to_on__isnull=True) | Q(to_on__gte=first))
        .select_related("party")
        .order_by("party__name", "party_id", "from_on")
    )
    marks: dict[tuple[UUID, UUID], str] = {}
    if sessions:
        for session_id, party_id, status in (
            live_marks(tenant)
            .filter(session_id__in=[s.id for s in sessions])
            .values_list("session_id", "party_id", "status")
        ):
            marks[(session_id, party_id)] = status
    by_party: dict[UUID, list[Any]] = defaultdict(list)
    order: list[UUID] = []
    for member in members:
        if member.party_id not in by_party:
            order.append(member.party_id)
        by_party[member.party_id].append(member)
    rows = []
    for party_id in order:
        ranges = by_party[party_id]
        party = ranges[0].party
        cells: dict[str, str | None] = {}
        for column in columns:
            if column["kind"] == "closed":
                cells[column["key"]] = CELL_CLOSED
                continue
            status = marks.get((column["session_id"], party_id))
            if status is not None:
                cells[column["key"]] = CELL_OF_STATUS.get(status, status)
            elif not any(_enrolled(m, column["date"]) for m in ranges):
                cells[column["key"]] = CELL_NOT_ENROLLED
            elif column["status"] == SessionStatus.HELD and party.status == "active":
                cells[column["key"]] = CELL_ABSENT
            elif column["status"] == SessionStatus.HELD:
                cells[column["key"]] = CELL_NOT_ENROLLED
            else:
                cells[column["key"]] = None
        rows.append({"party": party, "cells": cells})
    return {"group": group, "month": month, "columns": columns, "rows": rows}


# ── percentages (ATT-05 BR-1) ────────────────────────────────────────────────


def percent_of(attended: int, held: int, excused: int) -> Decimal | None:
    """`attended / (held − excused) × 100`, one decimal, half up; None for 0/0."""
    denominator = held - excused
    if denominator <= 0:
        return None
    return half_up(Decimal(attended * 100) / Decimal(denominator), ONE_DECIMAL)


def attendance_percent(
    tenant: Any,
    group_id: UUID,
    party_id: UUID | None = None,
    period: tuple[dt.date, dt.date] | None = None,
) -> list[dict]:
    """Contracts §2.3: per member, held sessions while enrolled, attended
    (present + late), excused and the percentage. Cancelled sessions and
    not-enrolled dates are excluded (BR-1). Three queries."""
    group = Group.objects.for_tenant(tenant).get(pk=group_id)
    sessions = Session.objects.for_tenant(tenant).filter(group=group, status=SessionStatus.HELD)
    members = GroupMember.objects.for_tenant(tenant).filter(group=group).select_related("party")
    if period is not None:
        start, end = day_bounds(tenant, period[0], period[1])
        sessions = sessions.filter(starts_at__gte=start, starts_at__lt=end)
        members = members.filter(from_on__lte=period[1]).filter(
            Q(to_on__isnull=True) | Q(to_on__gte=period[0])
        )
    if party_id:
        members = members.filter(party_id=party_id)
    held = [(s.id, local_day(tenant, s.starts_at)) for s in sessions.only("id", "starts_at")]
    member_rows = list(members.order_by("party__name", "party_id", "from_on"))
    statuses: dict[tuple[UUID, UUID], str] = {}
    if held and member_rows:
        for session_id, pid, status in (
            live_marks(tenant)
            .filter(
                session_id__in=[s for s, _ in held], party_id__in={m.party_id for m in member_rows}
            )
            .values_list("session_id", "party_id", "status")
        ):
            statuses[(session_id, pid)] = status
    by_party: dict[UUID, list[Any]] = defaultdict(list)
    for member in member_rows:
        by_party[member.party_id].append(member)
    rows = []
    for pid, ranges in by_party.items():
        held_count = attended = excused = 0
        for session_id, day in held:
            if not any(_enrolled(m, day) for m in ranges):
                continue
            held_count += 1
            status = statuses.get((session_id, pid))
            if status in (MarkStatus.PRESENT, MarkStatus.LATE):
                attended += 1
            elif status == MarkStatus.EXCUSED:
                excused += 1
        rows.append(
            {
                "party": ranges[0].party,
                "held": held_count,
                "attended": attended,
                "excused": excused,
                "percent": percent_of(attended, held_count, excused),
            }
        )
    return rows


# ── churn and staffing ───────────────────────────────────────────────────────


def not_visited_since(
    tenant: Any,
    *,
    module: str,
    days: int,
    party_ids: Iterable[UUID] | None = None,
    modules: Iterable[str] | None = None,
) -> list[dict]:
    """ATT-05 BR-2: parties whose last live `visit` or `present` mark is older
    than `days` days. The vertical passes the parties with a live context as
    `party_ids` (C14); the engine endpoint passes none and lists every party
    that has ever attended in the module."""
    cutoff = tenant_today(tenant) - dt.timedelta(days=days)
    queryset = live_marks(tenant).filter(
        module=module, status__in=[MarkStatus.VISIT, MarkStatus.PRESENT]
    )
    if party_ids is not None:
        queryset = queryset.filter(party_id__in=list(party_ids))
    rows = (
        queryset.values("party_id", "party__name")
        .annotate(last_visit_on=Max("on_date"))
        .filter(last_visit_on__lt=cutoff)
        .order_by("last_visit_on", "party__name")
    )
    return [
        {
            "party": {"id": row["party_id"], "name": row["party__name"]},
            "last_visit_on": row["last_visit_on"],
        }
        for row in rows
    ]


def visits_by_hour(tenant: Any, *, module: str, date_from: dt.date, date_to: dt.date) -> list[dict]:
    """Peak hours: live visits by tenant-local hour and ISO weekday (1 = Monday)."""
    from django.db.models.functions import ExtractHour, ExtractIsoWeekDay

    tz = tenant_timezone(tenant)
    rows = (
        live_marks(tenant)
        .filter(
            module=module,
            status=MarkStatus.VISIT,
            on_date__gte=date_from,
            on_date__lte=date_to,
        )
        .annotate(
            hour=ExtractHour("check_in_at", tzinfo=tz),
            weekday=ExtractIsoWeekDay("check_in_at", tzinfo=tz),
        )
        .values("hour", "weekday")
        .annotate(visits=Count("id"))
        .order_by("weekday", "hour")
    )
    return [{"hour": r["hour"], "weekday": r["weekday"], "visits": r["visits"]} for r in rows]
