"""Groups, members and sessions (FRD 00 ATT-01, contracts §2.3).

`create_group`, `set_members` and `generate_sessions` are the contract's;
`update_group`, `end_membership` and `cancel_session` are additive public
functions the FRD and the gym FRD need (C7, a contracts v1.1 amendment).

── Generation (BR-1, BR-2, BR-5) ─────────────────────────────────────────────
Sessions are generated from the group's rule at `session_start` for
`session_minutes`, tenant-local, converted to `timestamptz`; closed days of the
group's module produce none. The calendar is read ONCE for the window
(`closed_days_between`), not once per date as the FRD's `is_open` wording
would — that is 56 queries per group per weekly run.

Regenerating is idempotent by `(group, starts_at)`. A session (not cancelled) from
today on that the rule no longer produces (timetable changed, or the day has
since been closed) is deleted when no mark row references it at all, cancelled
with the reason when only voided marks do (the FK is RESTRICT), and never
touched when it carries a live mark — history is never rewritten.
"""

from __future__ import annotations

import datetime as dt
from typing import Any
from uuid import UUID

from django.db import transaction

from apps.attendance.constants import (
    GENERATE_AHEAD_DAYS,
    MAX_UNTIL_DAYS,
    MODULE_MAX,
    NAME_MAX,
    REASON_CLOSED,
    REASON_MAX,
    REASON_MIN,
    REASON_TIMETABLE_CHANGED,
    SUBJECT_TYPE_MAX,
    DefaultMark,
    MarkKind,
    SessionStatus,
)
from apps.attendance.models import Group, GroupMember, Mark, Session
from apps.common.audit import AuditAction, diff_fields, write_audit
from apps.common.dates import tenant_timezone, tenant_today
from apps.common.exceptions import NotFound, ValidationFailed
from apps.common.recurrence import Recurrence, occurrences, validate_recurrence, weekday_mask

#: Fields `update_group` may change; anything else in `data` is a 400.
_GROUP_FIELDS = (
    "name",
    "default_mark",
    "one_per_day",
    "dedupe_minutes",
    "edit_window_hours",
    "is_active",
    "session_start",
    "session_minutes",
    "recurrence",
)
_AUDITED = (
    "name",
    "default_mark",
    "one_per_day",
    "dedupe_minutes",
    "edit_window_hours",
    "is_active",
    "session_start",
    "session_minutes",
    "freq",
    "interval",
    "by_weekday",
    "by_month_day",
    "anchor",
    "count",
    "until",
)


# ── helpers ──────────────────────────────────────────────────────────────────


def check_reason(reason: Any, field: str = "reason") -> str:
    """3–160 characters after trimming, or a 400 naming the field."""
    text = (reason or "").strip() if isinstance(reason, str) or reason is None else ""
    if len(text) < REASON_MIN:
        raise ValidationFailed({field: [f"Write at least {REASON_MIN} characters."]})
    if len(text) > REASON_MAX:
        raise ValidationFailed({field: [f"Keep it to {REASON_MAX} characters."]})
    return text


def _date(value: Any) -> dt.date | None:
    if value is None or isinstance(value, dt.date) and not isinstance(value, dt.datetime):
        return value
    return dt.date.fromisoformat(str(value))


def _time(value: Any) -> dt.time | None:
    if value is None or isinstance(value, dt.time):
        return value
    return dt.time.fromisoformat(str(value))


def _rule_from(raw: Any, errors: dict[str, list[str]]) -> Recurrence | None:
    if raw is None:
        return None
    if isinstance(raw, Recurrence):
        rule = raw
    else:
        try:
            weekdays = raw.get("by_weekday", 0)
            if isinstance(weekdays, (list, tuple)):
                weekdays = weekday_mask(weekdays)
            rule = Recurrence(
                freq=raw.get("freq", ""),
                interval=raw.get("interval", 1),
                by_weekday=weekdays,
                by_month_day=raw.get("by_month_day"),
                anchor=_date(raw["anchor"]),
                count=raw.get("count"),
                until=_date(raw.get("until")),
                explicit_dates=tuple(_date(d) for d in raw.get("explicit_dates") or ()),
            )
        except (KeyError, TypeError, ValueError, AttributeError):
            errors.setdefault("recurrence", []).append("Choose the days and the first date.")
            return None
    for key, messages in validate_recurrence(rule).items():
        errors.setdefault(key, []).extend(messages)
    return rule


def _validate_settings(group: Group, errors: dict[str, list[str]]) -> None:
    if not (group.name or "").strip():
        errors.setdefault("name", []).append("Give the group a name.")
    elif len(group.name) > NAME_MAX:
        errors.setdefault("name", []).append(f"Keep it to {NAME_MAX} characters.")
    if group.default_mark not in DefaultMark.values:
        errors.setdefault("default_mark", []).append("Choose present or absent.")
    if not isinstance(group.dedupe_minutes, int) or not 0 <= group.dedupe_minutes <= 720:
        errors.setdefault("dedupe_minutes", []).append("Enter minutes from 0 to 720.")
    if not isinstance(group.edit_window_hours, int) or not 0 <= group.edit_window_hours <= 720:
        errors.setdefault("edit_window_hours", []).append("Enter hours from 0 to 720.")
    if group.session_minutes is not None and (
        not isinstance(group.session_minutes, int) or not 1 <= group.session_minutes <= 1440
    ):
        errors.setdefault("session_minutes", []).append("Enter minutes from 1 to 1440.")
    if (group.session_start is None) != (group.session_minutes is None):
        errors.setdefault("session_minutes", []).append(
            "A start time needs a length, and a length needs a start time."
        )
    if group.freq is not None:
        if group.mark_kind != MarkKind.PRESENCE:
            errors.setdefault("recurrence", []).append("Only a class or batch has a timetable.")
        if group.session_start is None:
            errors.setdefault("session_start", []).append("Choose the start time.")
    elif group.session_start is not None:
        errors.setdefault("recurrence", []).append("Choose the days the sessions are on.")


def _apply_rule(group: Group, rule: Recurrence | None) -> None:
    if rule is None:
        for name in ("freq", "anchor", "count", "until", "by_month_day"):
            setattr(group, name, None)
        group.interval, group.by_weekday, group.explicit_dates = 1, 0, []
    else:
        group.set_recurrence(rule)


def _snapshot(group: Group) -> dict[str, Any]:
    return {name: getattr(group, name) for name in _AUDITED}


def _lock_group(tenant: Any, group_id: Any) -> Group:
    group = Group.objects.for_tenant(tenant).select_for_update().filter(pk=group_id).first()
    if group is None:
        raise NotFound()
    return group


# ── groups ───────────────────────────────────────────────────────────────────


def create_group(*, ctx: Any, module: str, data: dict) -> Group:
    """Contracts §2.3. A group with a rule gets its next 8 weeks of sessions now
    (ATT-01 user flow 1); the weekly job keeps the horizon."""
    errors: dict[str, list[str]] = {}
    if not module or len(module) > MODULE_MAX:
        errors.setdefault("module", []).append("Not a module.")
    mark_kind = data.get("mark_kind")
    if mark_kind not in MarkKind.values:
        errors.setdefault("mark_kind", []).append("Choose visit or presence.")
    subject_type = data.get("subject_type") or ""
    if len(subject_type) > SUBJECT_TYPE_MAX:
        errors.setdefault("subject_type", []).append("Not a subject type.")
    try:
        session_start = _time(data.get("session_start"))
    except ValueError:
        errors.setdefault("session_start", []).append("Use a time like 06:00.")
        session_start = None
    rule = _rule_from(data.get("recurrence"), errors)
    group = Group(
        tenant=ctx.tenant,
        created_by=getattr(ctx, "actor", None),
        module=module,
        name=(data.get("name") or "").strip(),
        subject_type=subject_type,
        subject_id=data.get("subject_id"),
        mark_kind=mark_kind or "",
        session_start=session_start,
        session_minutes=data.get("session_minutes"),
        default_mark=data.get("default_mark", DefaultMark.PRESENT),
        one_per_day=bool(data.get("one_per_day", False)),
        dedupe_minutes=data.get("dedupe_minutes", 5),
        edit_window_hours=data.get("edit_window_hours", 24),
        is_active=bool(data.get("is_active", True)),
    )
    _apply_rule(group, rule)
    _validate_settings(group, errors)
    if errors:
        raise ValidationFailed(errors)
    with transaction.atomic():
        group.save()
        write_audit(
            ctx=ctx,
            action=AuditAction.ATTENDANCE_GROUP_CREATED,
            entity_type="attendance_group",
            entity_id=group.id,
            after={"module": module, "name": group.name, **_snapshot(group)},
        )
        if group.freq is not None and group.is_active:
            generate_sessions(
                tenant=ctx.tenant,
                group_id=group.id,
                until=tenant_today(ctx.tenant) + dt.timedelta(days=GENERATE_AHEAD_DAYS - 1),
            )
    return group


def update_group(*, ctx: Any, group_id: UUID, data: dict) -> Group:
    """Additive (C7): gym's dedupe setting moves its desk groups, and a timetable
    change regenerates from the next unmarked date (BR-5)."""
    unknown = set(data) - set(_GROUP_FIELDS)
    if unknown:
        raise ValidationFailed({name: ["This cannot be changed."] for name in sorted(unknown)})
    with transaction.atomic():
        group = _lock_group(ctx.tenant, group_id)
        before = _snapshot(group)
        errors: dict[str, list[str]] = {}
        for name in ("name", "default_mark", "dedupe_minutes", "edit_window_hours"):
            if name in data:
                value = data[name]
                setattr(group, name, value.strip() if isinstance(value, str) else value)
        for name in ("one_per_day", "is_active"):
            if name in data:
                setattr(group, name, bool(data[name]))
        if "session_minutes" in data:
            group.session_minutes = data["session_minutes"]
        if "session_start" in data:
            try:
                group.session_start = _time(data["session_start"])
            except ValueError:
                errors.setdefault("session_start", []).append("Use a time like 06:00.")
        if "recurrence" in data:
            _apply_rule(group, _rule_from(data["recurrence"], errors))
        _validate_settings(group, errors)
        if errors:
            raise ValidationFailed(errors)
        group.save()
        old, new = diff_fields(before, _snapshot(group))
        if old or new:
            write_audit(
                ctx=ctx,
                action=AuditAction.ATTENDANCE_GROUP_UPDATED,
                entity_type="attendance_group",
                entity_id=group.id,
                before=old,
                after=new,
            )
        timetable = {"session_start", "session_minutes", "recurrence", "is_active"} & set(data)
        if timetable and group.freq is not None and group.is_active:
            generate_sessions(
                tenant=ctx.tenant,
                group_id=group.id,
                until=tenant_today(ctx.tenant) + dt.timedelta(days=GENERATE_AHEAD_DAYS - 1),
            )
    return group


# ── members ──────────────────────────────────────────────────────────────────


def _overlaps(a_from: dt.date, a_to: dt.date | None, b_from: dt.date, b_to: dt.date | None) -> bool:
    return a_from <= (b_to or dt.date.max) and b_from <= (a_to or dt.date.max)


def set_members(
    *, ctx: Any, group_id: UUID, party_id: UUID, from_on: dt.date, to_on: dt.date | None = None
) -> GroupMember:
    """Contracts §2.3: one party joins a group over `[from_on, to_on]`.

    The group row is locked, which serialises two overlap checks for the same
    group; an overlapping range for the same party is a 400."""
    from apps.parties.models import Party

    from_on, to_on = _date(from_on), _date(to_on)
    if from_on is None:
        raise ValidationFailed({"from_on": ["Choose the first day."]})
    if to_on is not None and to_on < from_on:
        raise ValidationFailed({"to_on": ["The last day is before the first."]})
    with transaction.atomic():
        group = _lock_group(ctx.tenant, group_id)
        if not Party.objects.for_tenant(ctx.tenant).filter(pk=party_id).exists():
            raise NotFound()
        for row in GroupMember.objects.filter(group=group, party_id=party_id):
            if _overlaps(from_on, to_on, row.from_on, row.to_on):
                raise ValidationFailed(
                    {"from_on": ["This member is already in the group over these dates."]}
                )
        return GroupMember.objects.create(
            tenant=ctx.tenant,
            created_by=getattr(ctx, "actor", None),
            group=group,
            party_id=party_id,
            from_on=from_on,
            to_on=to_on,
        )


def end_membership(*, ctx: Any, group_member_id: UUID, on: dt.date) -> GroupMember:
    """FRD ATT-01 §6 (C7): `on` is the inclusive last day, like `to_on`."""
    on = _date(on)
    with transaction.atomic():
        member = (
            GroupMember.objects.for_tenant(ctx.tenant)
            .select_for_update()
            .filter(pk=group_member_id)
            .first()
        )
        if member is None:
            raise NotFound()
        if on is None or on < member.from_on:
            raise ValidationFailed({"on": ["The last day is before the member joined."]})
        if member.to_on is not None and on > member.to_on:
            raise ValidationFailed({"on": ["This membership already ended earlier."]})
        member.to_on = on
        member.save(update_fields=["to_on", "updated_at"])
        return member


# ── sessions ─────────────────────────────────────────────────────────────────


def local_start(tenant: Any, day: dt.date, at: dt.time) -> dt.datetime:
    """`day` at wall-clock `at` in the tenant's timezone (EC-3: 06:00 IST = 00:30 UTC)."""
    return dt.datetime.combine(day, at, tzinfo=tenant_timezone(tenant))


def generate_sessions(*, tenant: Any, group_id: UUID, until: dt.date) -> int:
    """Contracts §2.3: rows created. Idempotent; see the module docstring."""
    until = _date(until)
    today = tenant_today(tenant)
    if until > today + dt.timedelta(days=MAX_UNTIL_DAYS):
        raise ValidationFailed({"until": ["Sessions can be planned up to 26 weeks ahead."]})
    from apps.platform_app.services.calendar import closed_days_between

    with transaction.atomic():
        group = _lock_group(tenant, group_id)
        rule = group.recurrence
        if not group.is_active or rule is None or group.session_start is None:
            return 0
        start = max(today, group.anchor)
        if until < start:
            return 0
        closed = closed_days_between(tenant, start, until, module=group.module)
        length = dt.timedelta(minutes=group.session_minutes)
        wanted: dict[dt.datetime, dt.date] = {}
        for day in occurrences(rule, start=start, end=until + dt.timedelta(days=1)):
            if day not in closed:
                wanted[local_start(tenant, day, group.session_start)] = day
        floor = local_start(tenant, start, dt.time.min)
        ceiling = local_start(tenant, until + dt.timedelta(days=1), dt.time.min)
        existing = list(
            Session.objects.filter(group=group, starts_at__gte=floor, starts_at__lt=ceiling).only(
                "id", "starts_at", "status"
            )
        )
        have = {row.starts_at for row in existing}
        stale = [
            row
            for row in existing
            if row.status != SessionStatus.CANCELLED and row.starts_at not in wanted
        ]
        if stale:
            marks = dict.fromkeys([row.id for row in stale], None)
            for session_id, voided in Mark.objects.filter(session_id__in=list(marks)).values_list(
                "session_id", "voided_at"
            ):
                live = voided is None
                marks[session_id] = (marks[session_id] or False) or live
            tz = tenant_timezone(tenant)
            drop, cancel_closed, cancel_changed = [], [], []
            for row in stale:
                state = marks[row.id]
                if state is None:
                    drop.append(row.id)
                elif state is False:  # only voided marks: keep the row, cancelled
                    local_day = row.starts_at.astimezone(tz).date()
                    (cancel_closed if local_day in closed else cancel_changed).append(row.id)
            if drop:
                Session.objects.filter(pk__in=drop).delete()
            if cancel_closed:
                Session.objects.filter(pk__in=cancel_closed).update(
                    status=SessionStatus.CANCELLED, cancel_reason=REASON_CLOSED
                )
            if cancel_changed:
                Session.objects.filter(pk__in=cancel_changed).update(
                    status=SessionStatus.CANCELLED, cancel_reason=REASON_TIMETABLE_CHANGED
                )
        new = [
            Session(
                tenant=tenant,
                group=group,
                starts_at=starts_at,
                ends_at=starts_at + length,
                status=SessionStatus.SCHEDULED,
            )
            for starts_at in sorted(wanted)
            if starts_at not in have
        ]
        if new:
            Session.objects.bulk_create(new, ignore_conflicts=True)
        return len(new)


def cancel_session(*, ctx: Any, session_id: UUID, reason: str) -> Session:
    """FRD ATT-01 §6 (C7). A session with live marks is refused: cancelling it
    would take counted attendance (and pack uses) out of every figure silently.
    Void the marks first."""
    reason = check_reason(reason)
    with transaction.atomic():
        session = (
            Session.objects.for_tenant(ctx.tenant).select_for_update().filter(pk=session_id).first()
        )
        if session is None:
            raise NotFound()
        if session.status == SessionStatus.CANCELLED:
            raise ValidationFailed({"session_id": ["This session was cancelled."]})
        if Mark.objects.filter(session=session, voided_at__isnull=True).exists():
            raise ValidationFailed(
                {"session_id": ["This session has marks. Void them before cancelling it."]}
            )
        before = session.status
        session.status = SessionStatus.CANCELLED
        session.cancel_reason = reason
        session.save(update_fields=["status", "cancel_reason", "updated_at"])
        write_audit(
            ctx=ctx,
            action=AuditAction.ATTENDANCE_SESSION_CANCELLED,
            entity_type="attendance_session",
            entity_id=session.id,
            before={"status": before},
            after={"status": session.status},
            metadata={"reason": reason},
        )
        return session
