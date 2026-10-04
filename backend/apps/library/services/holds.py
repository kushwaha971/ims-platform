"""Holds: place, set aside, allot on return, collect, cancel, extend, move, expire (LIB-08; B11).

── The queue (FR-2, BR-2) ─────────────────────────────────────────────────────
First placed, first served. When a copy comes back, the candidates are the
waiting holds for THAT copy first, then the title's waiting holds, by
`placed_at`; the first whose member is effectively active wins, and a member who
is expired, suspended or closed is skipped and keeps their place (FR-3, EC-1:
only an inactive membership skips; a member blocked by dues is still kept aside
for). The copy goes to `on_hold_shelf` and the hold is `ready` until `collect_by`,
the `hold_pickup_days`-th open day after today (BR-3).

── Locks ──────────────────────────────────────────────────────────────────────
Allotment runs inside the caller's transaction after the copy lock; holds are
locked in id order. The hold member's party is NOT locked: no money moves for
them. `uq_library_hold_ready_copy` is the database's answer to two desks allotting
one member twice (EC-5).

A ready hold whose `collect_by` has passed is treated as expired by every read
before the job runs (BR-3) — `is_live_ready` — and the daily job makes it so.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.common.dates import tenant_today
from apps.common.exceptions import BusinessRuleViolation, NotFound, ValidationFailed
from apps.library.constants import (
    HOLD_EXTEND_MAX_DAYS,
    LIVE_HOLD_STATUSES,
    REASON_MAX,
    CopyEventReason,
    CopyStatus,
    HoldStatus,
    LoanStatus,
)
from apps.library.models import (
    LibraryCopy,
    LibraryHold,
    LibraryLoan,
    LibraryLoanRule,
    LibraryMembership,
    LibraryTitle,
)
from apps.library.services import copy_status
from apps.library.services.fields import Errors, date, text, uuid_or_none
from apps.library.services.members import effective_status
from apps.library.services.rules import resolve_rule

# ── Reading ─────────────────────────────────────────────────────────────────


def position(hold: LibraryHold) -> int | None:
    """FR-2: 1-based place in the title's waiting queue (None once it is not waiting)."""
    if hold.status != HoldStatus.WAITING:
        return None
    ahead = LibraryHold.objects.filter(
        title_id=hold.title_id, status=HoldStatus.WAITING, placed_at__lt=hold.placed_at
    ).count()
    return ahead + 1


def hold_json(hold: LibraryHold) -> dict:
    return {
        "id": str(hold.id),
        "title": {"id": str(hold.title_id), "title": hold.title.title},
        "copy": (
            {"id": str(hold.copy_id), "accession_number": hold.copy.accession_number}
            if hold.copy_id
            else None
        ),
        "membership": {
            "id": str(hold.membership_id),
            "member_number": hold.membership.member_number,
            "name": hold.membership.party.name,
        },
        "status": hold.status,
        "position": position(hold),
        "placed_on": hold.placed_on.isoformat(),
        "ready_copy": (
            {"id": str(hold.ready_copy_id), "accession_number": hold.ready_copy.accession_number}
            if hold.ready_copy_id
            else None
        ),
        "ready_on": hold.ready_on.isoformat() if hold.ready_on else None,
        "collect_by": hold.collect_by.isoformat() if hold.collect_by else None,
        "close_reason": hold.close_reason,
        "version": hold.version,
    }


def loaded(hold_id: Any) -> LibraryHold:
    return LibraryHold.objects.select_related(
        "title", "copy", "ready_copy", "membership__party"
    ).get(pk=hold_id)


def collect_by_for(tenant: Any, ready_on: dt.date, days: int) -> dt.date:
    """BR-3: the `days`-th open day after `ready_on` (one calendar read)."""
    from apps.platform_app.services.calendar import SEARCH_HORIZON_DAYS, closed_days_between

    start = ready_on + dt.timedelta(days=1)
    closed = closed_days_between(
        tenant, start, start + dt.timedelta(days=SEARCH_HORIZON_DAYS), module="library"
    )
    counted, day = 0, ready_on
    while counted < days:
        day += dt.timedelta(days=1)
        if day > start + dt.timedelta(days=SEARCH_HORIZON_DAYS):
            raise BusinessRuleViolation(
                "library_calendar_all_closed", "Every day is marked closed.", details={}
            )
        if day not in closed:
            counted += 1
    return day


def waiting_on_title(title_id: Any) -> Any:
    return LibraryHold.objects.filter(title_id=title_id, status=HoldStatus.WAITING)


# ── Allotment (BR-2) ────────────────────────────────────────────────────────


def _close(hold: LibraryHold, status: str, reason: str = "") -> None:
    hold.status = status
    hold.closed_at = timezone.now()
    hold.close_reason = reason[:REASON_MAX]
    hold.version += 1
    hold.save(update_fields=["status", "closed_at", "close_reason", "version", "updated_at"])


def allot(ctx: Any, copy: LibraryCopy, today: dt.date) -> LibraryHold | None:
    """Give `copy` (LOCKED, on the shelf) to the first waiting member in line, or nobody."""
    from apps.library.services.settings import settings_for

    candidates = list(
        LibraryHold.objects.select_for_update(of=("self",))
        .filter(tenant=ctx.tenant, status=HoldStatus.WAITING)
        .filter(title_id=copy.title_id)
        .select_related("membership", "membership__membership_type")
        .order_by("id")
    )
    specific = [h for h in candidates if h.copy_id == copy.id]
    general = [h for h in candidates if h.copy_id is None]
    for hold in sorted(specific, key=lambda h: h.placed_at) + sorted(
        general, key=lambda h: h.placed_at
    ):
        if effective_status(hold.membership, today) != "active":
            continue  # FR-3: skipped, keeps their place
        hold.status = HoldStatus.READY
        hold.ready_copy = copy
        hold.ready_on = today
        hold.collect_by = collect_by_for(
            ctx.tenant, today, settings_for(ctx.tenant).hold_pickup_days
        )
        hold.version += 1
        hold.save(
            update_fields=[
                "status",
                "ready_copy",
                "ready_on",
                "collect_by",
                "version",
                "updated_at",
            ]
        )
        copy_status.move_copy(
            ctx=ctx,
            copy=copy,
            to_status=CopyStatus.ON_HOLD_SHELF,
            reason_code=CopyEventReason.SET_ASIDE,
            on_date=today,
            source_type="library_hold",
            source_id=hold.id,
        )
        from apps.library.services.reminders import notify_hold_ready

        notify_hold_ready(ctx.tenant, hold, today)  # LIB-09 FR-8
        return hold
    return None


def release(ctx: Any, copy_id: Any, today: dt.date) -> LibraryHold | None:
    """A kept-aside copy whose hold ended: to the next in line, else back on the shelf."""
    copy = LibraryCopy.objects.select_for_update(of=("self",)).get(pk=copy_id)
    if copy.status != CopyStatus.ON_HOLD_SHELF:
        return None
    copy_status.move_copy(
        ctx=ctx,
        copy=copy,
        to_status=CopyStatus.AVAILABLE,
        reason_code=CopyEventReason.BACK_TO_SHELF,
        on_date=today,
    )
    copy.refresh_from_db()
    return allot(ctx, copy, today)


# ── Place (FR-1, BR-1) ──────────────────────────────────────────────────────


def _refused(reason: str, message: str) -> BusinessRuleViolation:
    return BusinessRuleViolation("library_hold_refused", message, details={"reason": reason})


@transaction.atomic
def place(*, ctx: Any, data: Any) -> dict:
    data = data if isinstance(data, dict) else {}
    m = (
        LibraryMembership.objects.filter(
            tenant=ctx.tenant, pk=uuid_or_none(data.get("membership_id"))
        )
        .select_related("membership_type", "party")
        .first()
    )
    title = LibraryTitle.objects.filter(
        tenant=ctx.tenant, pk=uuid_or_none(data.get("title_id"))
    ).first()
    if m is None or title is None:
        raise NotFound()
    copy = None
    if data.get("copy_id"):
        copy = LibraryCopy.objects.filter(
            tenant=ctx.tenant, pk=uuid_or_none(data.get("copy_id")), title=title
        ).first()
        if copy is None:
            raise ValidationFailed({"copy_id": ["Choose a copy of this book."]})
    LibraryMembership.objects.select_for_update(of=("self",)).get(pk=m.pk)
    today = tenant_today(ctx.tenant)
    if effective_status(m, today) != "active":
        raise _refused("membership_inactive", "This membership is not active.")
    live = LibraryHold.objects.filter(membership=m, status__in=LIVE_HOLD_STATUSES)
    if live.filter(title=title).exists():
        raise _refused("already_holding", "This member already has this book on hold.")
    if live.count() >= m.membership_type.max_holds:
        raise _refused("max_holds", "This member has as many holds as allowed.")
    if LibraryLoan.objects.filter(membership=m, status=LoanStatus.OPEN, copy__title=title).exists():
        raise _refused("already_on_loan", "This member already has a copy of this book.")
    rules = list(LibraryLoanRule.objects.filter(tenant=ctx.tenant))
    in_stock = LibraryCopy.objects.filter(title=title).exclude(
        status__in=[CopyStatus.WITHDRAWN, CopyStatus.LOST, CopyStatus.MISSING]
    )
    if not any(
        resolve_rule(
            m.membership_type, rules, title.material_type, is_reference=c.is_reference
        ).loanable
        for c in in_stock
    ):
        raise _refused("no_loanable_copy", "No copy of this book can be lent to this member.")
    try:
        with transaction.atomic():
            hold = LibraryHold.objects.create(
                tenant=ctx.tenant,
                created_by=getattr(ctx, "actor", None),
                title=title,
                copy=copy,
                membership=m,
                party_id=m.party_id,
                placed_on=today,
                placed_at=timezone.now(),
            )
    except IntegrityError:
        raise _refused("already_holding", "This member already has this book on hold.") from None
    available = list(in_stock.filter(status=CopyStatus.AVAILABLE).order_by("accession_sort"))
    return {"hold": loaded(hold.id), "available_copies": available}


# ── Acts on a hold (FR-4, FR-7; BR-5) ───────────────────────────────────────


def _lock_hold(ctx: Any, hold_id: Any) -> LibraryHold:
    pk = uuid_or_none(hold_id)
    hold = (
        LibraryHold.objects.select_for_update(of=("self",)).filter(tenant=ctx.tenant, pk=pk).first()
        if pk
        else None
    )
    if hold is None:
        raise NotFound()
    return hold


def _not_open(hold: LibraryHold) -> BusinessRuleViolation:
    return BusinessRuleViolation(
        "library_hold_not_open", "This hold is no longer open.", details={"status": hold.status}
    )


@transaction.atomic
def set_aside(*, ctx: Any, hold_id: Any, data: Any) -> dict:
    """FR-4: a copy on the shelf when the hold was placed, kept aside now."""
    from apps.library.services.settings import settings_for

    data = data if isinstance(data, dict) else {}
    hold = _lock_hold(ctx, hold_id)
    if hold.status != HoldStatus.WAITING:
        raise _not_open(hold)
    copy = (
        LibraryCopy.objects.select_for_update(of=("self",))
        .filter(tenant=ctx.tenant, pk=uuid_or_none(data.get("copy_id")), title_id=hold.title_id)
        .first()
    )
    if copy is None or copy.status != CopyStatus.AVAILABLE:
        raise BusinessRuleViolation(
            "library_copy_unavailable",
            "This copy is not on the shelf.",
            details={"status": copy.status if copy else "none"},
        )
    today = tenant_today(ctx.tenant)
    hold.status = HoldStatus.READY
    hold.ready_copy = copy
    hold.ready_on = today
    hold.collect_by = collect_by_for(ctx.tenant, today, settings_for(ctx.tenant).hold_pickup_days)
    hold.version += 1
    hold.save(
        update_fields=["status", "ready_copy", "ready_on", "collect_by", "version", "updated_at"]
    )
    copy_status.move_copy(
        ctx=ctx,
        copy=copy,
        to_status=CopyStatus.ON_HOLD_SHELF,
        reason_code=CopyEventReason.SET_ASIDE,
        on_date=today,
        source_type="library_hold",
        source_id=hold.id,
    )
    return {"hold": loaded(hold.id)}


@transaction.atomic
def cancel(*, ctx: Any, hold_id: Any, data: Any) -> dict:
    data = data if isinstance(data, dict) else {}
    errors = Errors()
    reason = text(errors, data, "reason", REASON_MAX, required=True)
    errors.raise_if_any()
    hold = _lock_hold(ctx, hold_id)
    if hold.status not in LIVE_HOLD_STATUSES:
        raise _not_open(hold)
    was_ready, copy_id = hold.status == HoldStatus.READY, hold.ready_copy_id
    _close(hold, HoldStatus.CANCELLED, reason or "")
    nxt = release(ctx, copy_id, tenant_today(ctx.tenant)) if was_ready and copy_id else None
    return {"hold": loaded(hold.id), "next_ready": loaded(nxt.id) if nxt else None}


@transaction.atomic
def extend(*, ctx: Any, hold_id: Any, data: Any) -> dict:
    data = data if isinstance(data, dict) else {}
    errors = Errors()
    collect_by = date(errors, data, "collect_by")
    if collect_by is None and "collect_by" not in errors:
        errors.add("collect_by", "This field is required.")
    errors.raise_if_any()
    hold = _lock_hold(ctx, hold_id)
    if hold.status != HoldStatus.READY:
        raise _not_open(hold)
    today = tenant_today(ctx.tenant)
    assert collect_by is not None
    if collect_by < today or collect_by > today + dt.timedelta(days=HOLD_EXTEND_MAX_DAYS):
        raise ValidationFailed(
            {"collect_by": [f"Choose a date within {HOLD_EXTEND_MAX_DAYS} days of today."]}
        )
    hold.collect_by = collect_by
    hold.version += 1
    hold.save(update_fields=["collect_by", "version", "updated_at"])
    return {"hold": loaded(hold.id)}


@transaction.atomic
def move(*, ctx: Any, hold_id: Any, data: Any) -> dict:
    """EC-2: the kept-aside copy is damaged — keep the member's turn on another copy."""
    data = data if isinstance(data, dict) else {}
    hold = _lock_hold(ctx, hold_id)
    if hold.status != HoldStatus.READY:
        raise _not_open(hold)
    new = (
        LibraryCopy.objects.select_for_update(of=("self",))
        .filter(tenant=ctx.tenant, pk=uuid_or_none(data.get("copy_id")), title_id=hold.title_id)
        .first()
    )
    if new is None or new.status != CopyStatus.AVAILABLE:
        raise BusinessRuleViolation(
            "library_copy_unavailable",
            "This copy is not on the shelf.",
            details={"status": new.status if new else "none"},
        )
    today = tenant_today(ctx.tenant)
    old_id = hold.ready_copy_id
    old = LibraryCopy.objects.select_for_update(of=("self",)).get(pk=old_id)
    copy_status.move_copy(
        ctx=ctx,
        copy=old,
        to_status=CopyStatus.AVAILABLE,
        reason_code=CopyEventReason.BACK_TO_SHELF,
        on_date=today,
    )
    hold.ready_copy = new
    hold.version += 1
    hold.save(update_fields=["ready_copy", "version", "updated_at"])
    copy_status.move_copy(
        ctx=ctx,
        copy=new,
        to_status=CopyStatus.ON_HOLD_SHELF,
        reason_code=CopyEventReason.SET_ASIDE,
        on_date=today,
        source_type="library_hold",
        source_id=hold.id,
    )
    return {"hold": loaded(hold.id)}


# ── Hooks for loans, the catalogue and memberships ──────────────────────────


def collect_at_issue(ctx: Any, copy: LibraryCopy, m: LibraryMembership) -> LibraryHold | None:
    """LIB-06 BR-1: a kept-aside copy is lent only to the member it was kept for, and doing so
    collects the hold. Anyone else is refused with who it is kept for (T-LIB-06-2)."""
    hold = (
        LibraryHold.objects.select_for_update(of=("self",))
        .filter(ready_copy=copy, status=HoldStatus.READY)
        .select_related("membership__party")
        .first()
    )
    if hold is None:
        return None
    if hold.membership_id != m.id:
        raise BusinessRuleViolation(
            "library_copy_unavailable",
            "This copy is kept aside for someone else.",
            details={
                "status": copy.status,
                "held_for": {
                    "name": hold.membership.party.name,
                    "member_number": hold.membership.member_number,
                },
            },
        )
    return hold


def collected(hold: LibraryHold, loan: LibraryLoan, reason: str = "") -> None:
    hold.loan = loan
    hold.save(update_fields=["loan", "updated_at"])
    _close(hold, HoldStatus.COLLECTED, reason)


def by_proxy(m: LibraryMembership, title_id: Any, loan: LibraryLoan) -> None:
    """EC-3: a member who borrows another copy of a title they hold has collected the hold."""
    for hold in LibraryHold.objects.select_for_update(of=("self",)).filter(
        membership=m, title_id=title_id, status=HoldStatus.WAITING
    ):
        collected(hold, loan, "Borrowed another copy")


def restore_after_cancelled_issue(ctx: Any, loan: LibraryLoan, today: dt.date) -> bool:
    """LIB-06 BR-4: an undone issue that had collected a hold puts the hold and its copy back."""
    hold = LibraryHold.objects.select_for_update(of=("self",)).filter(loan=loan).first()
    if hold is None:
        return False
    if hold.close_reason:  # collected by proxy: the member still waits
        hold.status = HoldStatus.WAITING
        hold.closed_at = None
        hold.close_reason = ""
        hold.loan = None
        hold.version += 1
        hold.save(
            update_fields=["status", "closed_at", "close_reason", "loan", "version", "updated_at"]
        )
        return False
    hold.status = HoldStatus.READY
    hold.closed_at = None
    hold.loan = None
    hold.version += 1
    hold.save(update_fields=["status", "closed_at", "loan", "version", "updated_at"])
    return True


def cancel_for_title(ctx: Any, title_id: Any, reason: str) -> list[LibraryHold]:
    """BR-7 (FR-9): the last copy withdrawn — every waiting hold is cancelled."""
    out = []
    for hold in LibraryHold.objects.select_for_update(of=("self",)).filter(
        title_id=title_id, status=HoldStatus.WAITING
    ):
        _close(hold, HoldStatus.CANCELLED, reason)
        out.append(hold)
    return out


def cancel_for_member(ctx: Any, m: LibraryMembership, reason: str) -> int:
    """LIB-04 BR-6, EC-6: closing a membership cancels its holds; a kept-aside copy moves on."""
    today = tenant_today(ctx.tenant)
    count = 0
    for hold in LibraryHold.objects.select_for_update(of=("self",)).filter(
        membership=m, status__in=LIVE_HOLD_STATUSES
    ):
        was_ready, copy_id = hold.status == HoldStatus.READY, hold.ready_copy_id
        _close(hold, HoldStatus.CANCELLED, reason)
        if was_ready and copy_id:
            release(ctx, copy_id, today)
        count += 1
    return count


def renewal_blocked_by_hold(loan: LibraryLoan) -> bool:
    """BR-6: a waiting hold on the title refuses a renewal unless a copy on the shelf could
    serve it; a hold on this very copy always refuses."""
    if LibraryHold.objects.filter(copy_id=loan.copy_id, status=HoldStatus.WAITING).exists():
        return True
    if not waiting_on_title(loan.copy.title_id).filter(copy__isnull=True).exists():
        return False
    return not LibraryCopy.objects.filter(
        title_id=loan.copy.title_id, status=CopyStatus.AVAILABLE, is_reference=False
    ).exists()


# ── Expiry (FR-6, BR-4) ─────────────────────────────────────────────────────


@transaction.atomic
def expire_holds(*, tenant: Any, today: dt.date) -> dict:
    """Ready holds past `collect_by`, in `collect_by` order: expired, their copy moved on.
    Idempotent: a second run for the date finds nothing past due that is still ready."""
    from apps.common.context import Ctx

    ctx = Ctx.system(tenant)
    expired = reallotted = 0
    for hold in (
        LibraryHold.objects.select_for_update(of=("self",))
        .filter(tenant=tenant, status=HoldStatus.READY, collect_by__lt=today)
        .order_by("collect_by", "id")
    ):
        copy_id = hold.ready_copy_id
        _close(hold, HoldStatus.EXPIRED, "Not collected")
        expired += 1
        if release(ctx, copy_id, today) is not None:
            reallotted += 1
    return {"expired": expired, "reallotted": reallotted}
