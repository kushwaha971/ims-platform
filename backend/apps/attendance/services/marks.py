"""Check-in, check-out, roll-call, edit and void (FRD 00 ATT-02, ATT-03; contracts §2.3).

── Order inside `check_in` (the hottest desk path) ───────────────────────────
1. `at` (default now) more than 5 minutes ahead → 400. A visit older than its
   group's edit window (24 h without a group) → 400 (C10); a SESSION mark after
   `session.ends_at + edit_window_hours` needs `<module>.attendance.edit_closed`
   (QA-ATT-1), whatever `at` says.
2. Lock the party (`lock_party`). Unknown → 404; archived → 409 `party_archived`.
3. Group / session (the session row locked second): same module, active, not
   cancelled (BR-4); a presence group needs a session, a session takes only
   expected members (ATT-03 BR-1).

── The one lock order (QA-ATT-6) ─────────────────────────────────────────────
Every attendance write locks, in this order: the parties (several in id
order) → the session → the entitlement → the marks. `check_in` takes one party
then its session; `roll_call` takes its parties then the session; `edit_mark`
and `void_mark` take the mark's party first. Two writers on one session
therefore queue on the first party they share instead of deadlocking.
4. The policy registered for `context_type` (EC-2: unregistered is refused).
   `block` without `override_reason` → 409 `attendance_blocked`; with it, the
   reason (3–160) AND the policy's `override_permission` held by the actor,
   else 403. A block naming no codename can be overridden by nobody.
5. Dedupe, visits in a group only (BR-3, R59): the same party and context
   within `dedupe_minutes` (strict: the edge minute is a new visit), or any
   live visit that day with `one_per_day` → 409 `attendance_duplicate`.
   A group-less visit is never deduplicated.
6. The entitlement the policy named, locked and checked (ATT-04).
7. The mark; the session `scheduled → held`; the use row; listeners
   `on_marked(created=True)`; audit `attendance.mark.created` (and
   `.overridden`).

R57: `check_in(session_id=…)` is an upsert on `(session, party)`. A live mark
that already consumes is returned as it is (no second use, no audit); an
absent or excused one becomes present through the policy and the pack. A
second roll-call save is an update, not a 409 (gym BR-4).

── Edit window (ATT-03 BR-3) ─────────────────────────────────────────────────
`edit_window_hours` after the session's `ends_at`, or the visit's
`check_in_at`. After it, `<module>.attendance.edit_closed` is required (C5).
`void_mark` follows the same rule (open question 4's default: one engine rule
for every module).
"""

from __future__ import annotations

import datetime as dt
from typing import Any, TypedDict
from uuid import UUID

from django.core.exceptions import ImproperlyConfigured
from django.db import connection, transaction
from django.db.models import Q
from django.utils import timezone

from apps.attendance import registry
from apps.attendance.constants import (
    BLOCK_OVERRIDDEN,
    CONSUMING,
    DEFAULT_EDIT_WINDOW_HOURS,
    FUTURE_SKEW,
    SESSION_STATUSES,
    Decision,
    MarkKind,
    MarkStatus,
    Method,
    SessionStatus,
)
from apps.attendance.models import Group, Mark, Session
from apps.attendance.selectors import expected_members, local_day
from apps.attendance.services.access import actor_holds
from apps.attendance.services.entitlements import (
    apply_use,
    entitlement_json,
    give_back,
    history_of,
    lock_for_use,
    take_again,
)
from apps.attendance.services.groups import check_reason
from apps.common.audit import AuditAction, write_audit
from apps.common.dates import tenant_timezone
from apps.common.exceptions import (
    BusinessRuleViolation,
    NotFound,
    PermissionDenied,
    ValidationFailed,
)


class CheckInResult(TypedDict):
    mark: Mark
    decision: str  # "allow" | "warn" | "block_overridden"
    reason: str
    entitlement: dict | None


def edit_closed_codename(module: str) -> str:
    return f"{module}.attendance.edit_closed"


def _notify(ctx: Any, mark: Mark, *, created: bool) -> None:
    """`on_marked` listeners for the mark's context, in registration order.

    Synchronous and inside the transaction: a listener that raises rolls the
    mark back (10-architecture §11)."""
    for entry in registry.listeners_for(mark.context_type):
        entry.on_marked(ctx, mark, created=created)


def _audit_mark(ctx: Any, action: str, mark: Mark, **kwargs: Any) -> None:
    write_audit(
        ctx=ctx,
        action=action,
        entity_type="attendance_mark",
        entity_id=mark.id,
        **kwargs,
    )


def _lock_party(ctx: Any, party_id: Any) -> Any:
    from apps.parties.services.balance import lock_party

    party = lock_party(tenant=ctx.tenant, party_id=party_id)
    if party is None:
        raise NotFound()
    return party


def _refuse_archived(party: Any) -> None:
    if party.status == "archived":
        raise BusinessRuleViolation(
            "party_archived",
            "This party is archived. Restore them before marking attendance.",
            details={"party_id": str(party.id)},
        )


def _duplicate(mark: Mark, tenant: Any) -> BusinessRuleViolation:
    at = mark.check_in_at.astimezone(tenant_timezone(tenant)) if mark.check_in_at else None
    when = at.strftime("%-I:%M %p").lower() if at else ""
    return BusinessRuleViolation(
        "attendance_duplicate",
        f"Already checked in at {when}." if when else "Already checked in.",
        details={"mark_id": str(mark.id)},
    )


# ── check-in ─────────────────────────────────────────────────────────────────


def _evaluate(
    *,
    ctx: Any,
    module: str,
    party_id: Any,
    context_type: str,
    context_id: Any,
    on: dt.date,
    override_reason: str | None,
) -> tuple[registry.PolicyResult, str, str | None]:
    """The policy's answer, the decision word, and the override reason to store."""
    entry = registry.policy_for(context_type)
    if entry.module != module:
        raise ImproperlyConfigured(
            f"context type {context_type!r} belongs to {entry.module!r}, not {module!r}"
        )
    result = registry.normalise(entry.policy(ctx.tenant, party_id, context_id, on))
    if result["decision"] != Decision.BLOCK:
        return result, result["decision"], None
    if not override_reason:
        raise BusinessRuleViolation(
            "attendance_blocked",
            result["reason"] or "Not allowed in.",
            details={
                "reason": result["reason"],
                "override_permission": result.get("override_permission"),
            },
        )
    reason = check_reason(override_reason, "override_reason")
    if not actor_holds(ctx, result.get("override_permission")):
        raise PermissionDenied()
    return result, BLOCK_OVERRIDDEN, reason


def _load_place(
    *, ctx: Any, module: str, group_id: Any, session_id: Any
) -> tuple[Group | None, Session | None]:
    group: Group | None = None
    session: Session | None = None
    if session_id is not None:
        # Lock order (QA-ATT-6): the party is already locked; the session
        # comes second, as in roll_call.
        session = (
            Session.objects.for_tenant(ctx.tenant)
            .select_related("group")
            .select_for_update(of=("self",), no_key=True)
            .filter(pk=session_id)
            .first()
        )
        if session is None:
            raise NotFound()
        group = session.group
        if group_id is not None and str(group_id) != str(group.id):
            raise ValidationFailed({"session_id": ["This session is not in that group."]})
    elif group_id is not None:
        group = Group.objects.for_tenant(ctx.tenant).filter(pk=group_id).first()
        if group is None:
            raise NotFound()
    if group is not None:
        if group.module != module:
            raise ValidationFailed({"group_id": ["This group belongs to another module."]})
        if not group.is_active:
            raise ValidationFailed({"group_id": ["This group is no longer active."]})
        if group.mark_kind == MarkKind.PRESENCE and session is None:
            raise ValidationFailed({"session_id": ["Choose the session."]})
        if group.mark_kind == MarkKind.VISIT and session is not None:
            raise ValidationFailed({"session_id": ["A visit is not taken in a session."]})
    if session is not None and session.status == SessionStatus.CANCELLED:
        raise ValidationFailed({"session_id": ["This session was cancelled."]})
    return group, session


def check_in(
    *,
    ctx: Any,
    module: str,
    party_id: UUID,
    context_type: str,
    context_id: UUID | None,
    group_id: UUID | None = None,
    session_id: UUID | None = None,
    at: dt.datetime | None = None,
    method: str = Method.DESK,
    override_reason: str | None = None,
) -> CheckInResult:
    """Contracts §2.3; the order is the module docstring's."""
    now = timezone.now()
    at = at or now
    if at > now + FUTURE_SKEW:
        raise ValidationFailed({"at": ["This time is in the future."]})
    if method not in Method.values:
        raise ValidationFailed({"method": ["Not a check-in method."]})
    with transaction.atomic():
        party = _lock_party(ctx, party_id)
        _refuse_archived(party)
        group, session = _load_place(
            ctx=ctx, module=module, group_id=group_id, session_id=session_id
        )
        if session is not None:
            # QA-ATT-1: a session's register closes `edit_window_hours` after
            # the SESSION ends, whatever `at` says — for a new mark and for the
            # R57 upsert of an absent one alike.
            _require_session_open(ctx, session, now)
        else:
            window = group.edit_window_hours if group else DEFAULT_EDIT_WINDOW_HOURS
            if at < now - dt.timedelta(hours=window):
                raise ValidationFailed({"at": ["This is earlier than marks may still be changed."]})
        on = local_day(ctx.tenant, session.starts_at if session else at)
        if (
            session is not None
            and not expected_members(ctx.tenant, session).filter(party_id=party.id).exists()
        ):
            raise ValidationFailed({"party_id": ["This member is not expected in this session."]})

        result, decision, stored_reason = _evaluate(
            ctx=ctx,
            module=module,
            party_id=party.id,
            context_type=context_type,
            context_id=context_id,
            on=on,
            override_reason=override_reason,
        )

        existing: Mark | None = None
        if session is not None:
            existing = (
                Mark.objects.select_for_update()
                .filter(session=session, party_id=party.id, voided_at__isnull=True)
                .first()
            )
            if existing is not None and existing.status in CONSUMING:
                history = history_of(existing)
                ent = None
                if history.balance == 1 and history.entitlement_id is not None:
                    from apps.attendance.models import Entitlement

                    ent = Entitlement.objects.filter(pk=history.entitlement_id).first()
                return CheckInResult(
                    mark=existing,
                    decision=decision,
                    reason=result["reason"],
                    entitlement=entitlement_json(ent),
                )
        elif group is not None:
            clauses = Q()
            if group.dedupe_minutes > 0:
                span = dt.timedelta(minutes=group.dedupe_minutes)
                clauses |= Q(
                    context_type=context_type,
                    context_id=context_id,
                    check_in_at__gt=at - span,
                    check_in_at__lt=at + span,
                )
            if group.one_per_day:
                clauses |= Q(on_date=on)
            if clauses:
                twin = (
                    Mark.objects.filter(
                        tenant=ctx.tenant,
                        group=group,
                        party_id=party.id,
                        status=MarkStatus.VISIT,
                        voided_at__isnull=True,
                    )
                    .filter(clauses)
                    .order_by("check_in_at")
                    .first()
                )
                if twin is not None:
                    raise _duplicate(twin, ctx.tenant)

        ent = None
        if result.get("entitlement_id"):
            ent = lock_for_use(
                tenant=ctx.tenant,
                entitlement_id=result["entitlement_id"],
                party_id=party.id,
                module=module,
                on=on,
            )

        actor = getattr(ctx, "actor", None)
        if existing is not None:  # R57: an absent / excused session mark becomes present
            before = existing.status
            existing.status = MarkStatus.PRESENT
            existing.check_in_at = existing.check_in_at or at
            existing.method = method
            existing.override_reason = stored_reason
            existing.marked_by = actor
            existing.context_type = context_type
            existing.context_id = context_id
            existing.save(
                update_fields=[
                    "status",
                    "check_in_at",
                    "method",
                    "override_reason",
                    "marked_by",
                    "context_type",
                    "context_id",
                    "updated_at",
                ]
            )
            mark, created = existing, False
            if ent is not None:
                apply_use(ent=ent, mark=mark, delta=1, seq=history_of(mark).next_seq)
            _notify(ctx, mark, created=False)
            _audit_mark(
                ctx,
                AuditAction.ATTENDANCE_MARK_EDITED,
                mark,
                before={"status": before},
                after={"status": mark.status},
                metadata={"via": "check_in"},
            )
        else:
            mark = Mark.objects.create(
                tenant=ctx.tenant,
                created_by=actor,
                module=module,
                group=group,
                session=session,
                party_id=party.id,
                on_date=on,
                status=MarkStatus.PRESENT if session is not None else MarkStatus.VISIT,
                check_in_at=at,
                method=method,
                context_type=context_type or "",
                context_id=context_id,
                override_reason=stored_reason,
                marked_by=actor,
            )
            created = True
            if ent is not None:
                apply_use(ent=ent, mark=mark, delta=1, seq=0)
            _notify(ctx, mark, created=True)
            _audit_mark(
                ctx,
                AuditAction.ATTENDANCE_MARK_CREATED,
                mark,
                after={
                    "module": module,
                    "party_id": party.id,
                    "status": mark.status,
                    "on_date": on,
                    "check_in_at": at,
                    "decision": decision,
                },
            )
        if session is not None and session.status == SessionStatus.SCHEDULED:
            Session.objects.filter(pk=session.pk, status=SessionStatus.SCHEDULED).update(
                status=SessionStatus.HELD
            )
            session.status = SessionStatus.HELD
        if stored_reason is not None:
            _audit_mark(
                ctx,
                AuditAction.ATTENDANCE_MARK_OVERRIDDEN,
                mark,
                metadata={
                    "reason": stored_reason,
                    "policy_reason": result["reason"],
                    "override_permission": result.get("override_permission"),
                    "created": created,
                },
            )
        return CheckInResult(
            mark=mark, decision=decision, reason=result["reason"], entitlement=entitlement_json(ent)
        )


def check_out(*, ctx: Any, mark_id: UUID, at: dt.datetime | None = None) -> Mark:
    """Contracts §2.3: close an open visit."""
    now = timezone.now()
    at = at or now
    if at > now + FUTURE_SKEW:
        raise ValidationFailed({"at": ["This time is in the future."]})
    with transaction.atomic():
        mark = Mark.objects.for_tenant(ctx.tenant).select_for_update().filter(pk=mark_id).first()
        if mark is None:
            raise NotFound()
        if mark.voided_at is not None:
            raise ValidationFailed({"mark_id": ["This visit was voided."]})
        if mark.status != MarkStatus.VISIT:
            raise ValidationFailed({"mark_id": ["Only a visit is checked out."]})
        if mark.check_out_at is not None:
            raise ValidationFailed({"mark_id": ["This visit is already closed."]})
        if at < mark.check_in_at:
            raise ValidationFailed({"at": ["The check-out is before the check-in."]})
        mark.check_out_at = at
        mark.save(update_fields=["check_out_at", "updated_at"])
        _notify(ctx, mark, created=False)
        _audit_mark(
            ctx,
            AuditAction.ATTENDANCE_MARK_EDITED,
            mark,
            before={"check_out_at": None},
            after={"check_out_at": at},
        )
        return mark


_CLOSE_SQL = """
UPDATE attendance_mark
   SET check_out_at = GREATEST(
           check_in_at,
           ((on_date + time '23:59:59') AT TIME ZONE %(tz)s)
       ),
       auto_closed = true,
       updated_at = now()
 WHERE tenant_id = %(tenant)s
   AND status = 'visit'
   AND check_out_at IS NULL
   AND voided_at IS NULL
   AND on_date <= %(on)s
RETURNING module
"""


def close_open_visits(*, tenant: Any, on: dt.date) -> int:
    """ATT-02 BR-5: every live open visit dated `on` or EARLIER gets
    `check_out_at` = 23:59:59 tenant-local of its own `on_date` and
    `auto_closed`. `<=` rather than `=`, so a night the job missed heals on
    the next run. One UPDATE; idempotent (a closed visit no longer matches).

    One system audit row per run with the count, not one per visit; no
    `on_marked` (nothing a listener counts has changed)."""
    from apps.common.context import Ctx

    with transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute(
                _CLOSE_SQL,
                {"tz": str(tenant_timezone(tenant)), "tenant": tenant.pk, "on": on},
            )
            modules = [row[0] for row in cursor.fetchall()]
        if modules:
            write_audit(
                ctx=Ctx.system(tenant),
                action=AuditAction.ATTENDANCE_VISITS_AUTO_CLOSED,
                entity_type="attendance_mark",
                metadata={
                    "on": on.isoformat(),
                    "count": len(modules),
                    "modules": sorted(set(modules)),
                },
            )
        return len(modules)


# ── edits ────────────────────────────────────────────────────────────────────


def _require_open(
    ctx: Any, *, module: str, anchor: dt.datetime, hours: int, now: dt.datetime
) -> None:
    """ATT-03 BR-3: after `anchor + hours` only `<module>.attendance.edit_closed`."""
    if now > anchor + dt.timedelta(hours=hours) and not actor_holds(
        ctx, edit_closed_codename(module)
    ):
        raise PermissionDenied(
            "Marks can no longer be changed here. Ask someone allowed to change closed marks."
        )


def _require_session_open(ctx: Any, session: Session, now: dt.datetime) -> None:
    """The closed-register rule for ANY write into a session — an insert by
    check-in or roll-call as much as an edit (QA-ATT-1, QA-ATT-2): a held
    session's missing mark already reads "A" in the register, so adding one
    after the window changes the register exactly as an edit would."""
    _require_open(
        ctx,
        module=session.group.module,
        anchor=session.ends_at,
        hours=session.group.edit_window_hours,
        now=now,
    )


def _check_window(ctx: Any, mark: Mark, now: dt.datetime) -> None:
    """ATT-03 BR-3 for an existing mark: from the session's end, or the visit's check-in."""
    if mark.session_id:
        _require_session_open(ctx, mark.session, now)
        return
    hours = mark.group.edit_window_hours if mark.group_id else DEFAULT_EDIT_WINDOW_HOURS
    _require_open(
        ctx,
        module=mark.module,
        anchor=mark.check_in_at or mark.created_at,
        hours=hours,
        now=now,
    )


def _locked_mark(ctx: Any, mark_id: Any) -> Mark:
    """Party first, then the mark (the lock order of every attendance write)."""
    head = Mark.objects.for_tenant(ctx.tenant).filter(pk=mark_id).values("party_id").first()
    if head is None:
        raise NotFound()
    _lock_party(ctx, head["party_id"])
    return (
        Mark.objects.select_for_update(of=("self",))
        .select_related("group", "session")
        .get(pk=mark_id)
    )


def _change_status(ctx: Any, mark: Mark, status: str, reason: str, *, now: dt.datetime) -> bool:
    """The edit path shared by `edit_mark` and `roll_call`. False when unchanged."""
    if status == mark.status:
        return False
    if (status == MarkStatus.VISIT) != (mark.status == MarkStatus.VISIT):
        raise ValidationFailed({"status": ["A visit and a session mark cannot be swapped."]})
    _check_window(ctx, mark, now)
    before = mark.status
    was, will = before in CONSUMING, status in CONSUMING
    mark.status = status
    mark.marked_by = getattr(ctx, "actor", None)
    mark.save(update_fields=["status", "marked_by", "updated_at"])
    if was and not will:
        give_back(tenant=ctx.tenant, mark=mark)
    elif will and not was:
        take_again(tenant=ctx.tenant, mark=mark)
    _notify(ctx, mark, created=False)
    _audit_mark(
        ctx,
        AuditAction.ATTENDANCE_MARK_EDITED,
        mark,
        before={"status": before},
        after={"status": status},
        metadata={"reason": reason},
    )
    return True


def edit_mark(*, ctx: Any, mark_id: UUID, status: str, reason: str) -> Mark:
    """Contracts §2.3 (ATT-03 BR-3, ATT-04 BR-4)."""
    reason = check_reason(reason)
    if status not in MarkStatus.values:
        raise ValidationFailed({"status": ["Not a mark status."]})
    with transaction.atomic():
        mark = _locked_mark(ctx, mark_id)
        if mark.voided_at is not None:
            raise ValidationFailed({"mark_id": ["This mark was voided."]})
        _change_status(ctx, mark, status, reason, now=timezone.now())
        return mark


def void_mark(*, ctx: Any, mark_id: UUID, reason: str) -> Mark:
    """Contracts §2.3, ATT-03 BR-5: out of every count, any use given back, the
    `(session, party)` slot freed for a corrected mark."""
    reason = check_reason(reason)
    with transaction.atomic():
        mark = _locked_mark(ctx, mark_id)
        if mark.voided_at is not None:
            raise ValidationFailed({"mark_id": ["This mark was already voided."]})
        _check_window(ctx, mark, timezone.now())
        mark.voided_at = timezone.now()
        mark.void_reason = reason
        mark.save(update_fields=["voided_at", "void_reason", "updated_at"])
        give_back(tenant=ctx.tenant, mark=mark)
        _notify(ctx, mark, created=False)
        _audit_mark(
            ctx,
            AuditAction.ATTENDANCE_MARK_VOIDED,
            mark,
            before={"voided_at": None},
            after={"voided_at": mark.voided_at},
            metadata={"reason": reason},
        )
        return mark


def roll_call(*, ctx: Any, session_id: UUID, marks: dict[UUID, str]) -> list[Mark]:
    """Contracts §2.3, ATT-03 BR-1/BR-2/BR-4, R57: an upsert of live marks with
    no policy and no new consumption. A changed status is an edit (window,
    audit, ± use only for a mark that already has a use history — C4); an
    unchanged one writes nothing. Returns the session's marks for `marks`."""
    from apps.parties.models import Party

    errors: dict[str, list[str]] = {}
    wanted: dict[str, str] = {}
    for raw_party, status in (marks or {}).items():
        key = str(raw_party)
        if status not in SESSION_STATUSES:
            errors.setdefault(f"marks.{key}", []).append("Choose present, absent, late or excused.")
        wanted[key] = status
    if errors:
        raise ValidationFailed(errors)
    with transaction.atomic():
        head = Session.objects.for_tenant(ctx.tenant).filter(pk=session_id).first()
        if head is None:
            raise NotFound()
        # Lock order (QA-ATT-6), the one every attendance write follows:
        # the parties (in id order), then the session, then marks and
        # entitlements. check_in locks its one party and then the session; a
        # roll-call that took the session first and the parties second was
        # the opposite-order pair Postgres answers with `deadlock detected`.
        list(
            Party.objects.select_for_update()
            .filter(tenant=ctx.tenant, pk__in=list(wanted))
            .order_by("pk")
            .values_list("pk", flat=True)
        )
        session = (
            Session.objects.select_related("group")
            .select_for_update(of=("self",), no_key=True)
            .get(pk=head.pk)
        )
        if session.status == SessionStatus.CANCELLED:
            raise ValidationFailed({"session_id": ["This session was cancelled."]})
        if not session.group.is_active:
            raise ValidationFailed({"group_id": ["This group is no longer active."]})
        if not wanted:
            return []
        expected = {
            str(pid)
            for pid in expected_members(ctx.tenant, session).values_list("party_id", flat=True)
        }
        for key in wanted:
            if key not in expected:
                errors.setdefault(f"marks.{key}", []).append(
                    "This member is not expected in this session."
                )
        if errors:
            raise ValidationFailed(errors)
        current = {
            str(m.party_id): m
            for m in Mark.objects.select_for_update(of=("self",))
            .select_related("group", "session")
            .filter(session=session, voided_at__isnull=True, party_id__in=list(wanted))
        }
        now = timezone.now()
        actor = getattr(ctx, "actor", None)
        day = local_day(ctx.tenant, session.starts_at)
        if set(wanted) - set(current):
            _require_session_open(ctx, session, now)  # QA-ATT-2: inserts too
        # QA-ATT-3: a roll-call mark carries its module's registered context, so
        # the vertical's listeners hear its create, edits and void.
        context_type = registry.context_for_module(session.group.module)
        written: list[Mark] = []
        any_new = False
        for key in sorted(wanted):
            status = wanted[key]
            mark = current.get(key)
            if mark is None:
                mark = Mark.objects.create(
                    tenant=ctx.tenant,
                    created_by=actor,
                    module=session.group.module,
                    group=session.group,
                    session=session,
                    party_id=key,
                    on_date=day,
                    status=status,
                    method=Method.ROLL_CALL,
                    context_type=context_type,
                    marked_by=actor,
                )
                any_new = True
                _notify(ctx, mark, created=True)
                _audit_mark(
                    ctx,
                    AuditAction.ATTENDANCE_MARK_CREATED,
                    mark,
                    after={
                        "module": mark.module,
                        "party_id": key,
                        "status": status,
                        "on_date": day,
                        "method": Method.ROLL_CALL,
                    },
                )
            else:
                _change_status(ctx, mark, status, "Roll-call", now=now)
            written.append(mark)
        if any_new and session.status == SessionStatus.SCHEDULED:
            session.status = SessionStatus.HELD
            session.save(update_fields=["status", "updated_at"])
        return written
