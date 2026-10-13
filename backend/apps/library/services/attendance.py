"""A reading room's attendance (W05; owner, 4 Oct 2026), on the attendance engine.

A student comes in and goes out; that is a VISIT mark on the engine
(`apps.attendance`), one per day, in one per-tenant group the library owns
("Reading room"). The library tells the engine whether a student may come in
through its check-in policy, keyed `library_membership`:

* left (closed) or on hold (suspended) — BLOCK, overridable by whoever may
  close a membership: a desk should not quietly let in somebody who left;
* the plan ran out, or a fee is charged and unpaid — WARN with the figure:
  a reading room lets a student three days late with the fee sit down and
  asks for the money, it does not turn them away at the door;
* otherwise ALLOW.

The engine never reads a membership (ADR-050); the policy does, in ONE query
(the engine's contract test holds every policy to that).
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from django.db import IntegrityError, transaction
from django.db.models import DecimalField, OuterRef, Subquery, Sum, Value
from django.db.models.functions import Coalesce

from apps.common.exceptions import NotFound
from apps.library.constants import MembershipStatus

MODULE = "library"
CONTEXT = "library_membership"
GROUP_NAME = "Reading room"
OVERRIDE = "library.member.close"


def _with_dues(qs: Any) -> Any:
    from apps.library.models import LibraryCharge

    dues = Subquery(
        LibraryCharge.objects.filter(membership=OuterRef("pk"))
        .open()
        .values("membership")
        .annotate(total=Sum("amount_due"))
        .values("total"),
        output_field=DecimalField(max_digits=14, decimal_places=2),
    )
    paid = Subquery(
        LibraryCharge.objects.filter(membership=OuterRef("pk"))
        .open()
        .values("membership")
        .annotate(total=Sum("amount_paid"))
        .values("total"),
        output_field=DecimalField(max_digits=14, decimal_places=2),
    )
    return qs.annotate(
        dues=Coalesce(dues, Value(0), output_field=DecimalField()),
        dues_paid=Coalesce(paid, Value(0), output_field=DecimalField()),
    )


def policy(tenant: Any, party_id: Any, context_id: Any, on: dt.date) -> dict:
    """The engine's check-in policy for `library_membership` (one query)."""
    from apps.library.models import LibraryMembership

    qs = LibraryMembership.objects.filter(tenant=tenant)
    qs = qs.filter(pk=context_id) if context_id else qs.filter(party_id=party_id)
    m = _with_dues(qs).first()
    if m is None:
        return {"decision": "block", "reason": "Not a student here.", "override_permission": None}
    suspended = m.status == MembershipStatus.SUSPENDED and (
        m.suspended_until is None or m.suspended_until >= on
    )
    if m.status == MembershipStatus.CLOSED:
        return {"decision": "block", "reason": "Has left.", "override_permission": OVERRIDE}
    if suspended:
        return {"decision": "block", "reason": "On hold.", "override_permission": OVERRIDE}
    if m.valid_until is not None and m.valid_until < on:
        days = (on - m.valid_until).days
        return {"decision": "warn", "reason": f"Fee overdue by {days} day{'s' * (days != 1)}."}
    if Decimal(m.dues) > 0:
        return {"decision": "warn", "reason": f"Fee unpaid: ₹{Decimal(m.dues):,.2f}."}
    return {"decision": "allow", "reason": ""}


def reading_room(tenant: Any) -> Any:
    """The library's one visit group, made on first use."""
    from apps.attendance.constants import MarkKind
    from apps.attendance.models import Group

    group = Group.objects.filter(tenant=tenant, module=MODULE, name=GROUP_NAME).first()
    if group is not None:
        return group
    try:
        with transaction.atomic():
            return Group.objects.create(
                tenant=tenant,
                module=MODULE,
                name=GROUP_NAME,
                mark_kind=MarkKind.VISIT,
                one_per_day=True,
                dedupe_minutes=0,
            )
    except IntegrityError:  # pragma: no cover - two desks at once
        return Group.objects.get(tenant=tenant, module=MODULE, name=GROUP_NAME)


def check_in(*, ctx: Any, membership_id: Any, override_reason: str | None = None) -> dict:
    """`POST /library/attendance` — the student is here."""
    from apps.attendance.services import marks
    from apps.library.models import LibraryMembership

    m = LibraryMembership.objects.filter(tenant=ctx.tenant, pk=membership_id).first()
    if m is None:
        raise NotFound()
    result = marks.check_in(
        ctx=ctx,
        module=MODULE,
        party_id=m.party_id,
        context_type=CONTEXT,
        context_id=m.id,
        group_id=reading_room(ctx.tenant).id,
        override_reason=override_reason,
    )
    return {
        "mark_id": str(result["mark"].id),
        "decision": result["decision"],
        "reason": result["reason"],
    }


def check_out(*, ctx: Any, mark_id: Any) -> None:
    from apps.attendance.models import Mark
    from apps.attendance.services import marks

    if not Mark.objects.filter(tenant=ctx.tenant, pk=mark_id, module=MODULE).exists():
        raise NotFound()
    marks.check_out(ctx=ctx, mark_id=mark_id)


def day_register(tenant: Any, on: dt.date, shift_id: Any = None) -> dict:
    """Every current student and their visit on `on`: who is in, who left, who
    has not come. Expired students are listed too — they still hold a desk."""
    from apps.attendance.models import Mark
    from apps.library.models import LibraryMembership
    from apps.library.services.seats import fee_state

    students = (
        _with_dues(LibraryMembership.objects.filter(tenant=tenant))
        .exclude(status=MembershipStatus.CLOSED)
        .filter(starts_on__lte=on)
        .select_related("party", "shift", "seat", "membership_type")
        .order_by("seat__label_sort", "member_number_sort")
    )
    if shift_id:
        students = students.filter(shift_id=shift_id)
    visits = {
        mk.party_id: mk
        for mk in Mark.objects.filter(
            tenant=tenant, module=MODULE, on_date=on, voided_at__isnull=True
        ).order_by("check_in_at")
    }
    rows = []
    for m in students:
        mark = visits.get(m.party_id)
        rows.append(
            {
                "membership_id": str(m.id),
                "name": m.party.name,
                "member_number": m.member_number,
                "seat": m.seat.label if m.seat_id else None,
                "shift": m.shift.name if m.shift_id else None,
                "fee_state": fee_state(m, on, Decimal(m.dues), Decimal(m.dues_paid)),
                "mark_id": str(mark.id) if mark else None,
                "check_in_at": mark.check_in_at.isoformat() if mark and mark.check_in_at else None,
                "check_out_at": (
                    mark.check_out_at.isoformat() if mark and mark.check_out_at else None
                ),
            }
        )
    present = sum(1 for r in rows if r["mark_id"])
    return {
        "on": on.isoformat(),
        "rows": rows,
        "counts": {
            "students": len(rows),
            "present": present,
            "in_now": sum(1 for r in rows if r["mark_id"] and not r["check_out_at"]),
        },
    }


def month_days(tenant: Any, membership_id: Any, month: dt.date) -> list[str]:
    """The days in `month` a student came in (the student page's calendar)."""
    from apps.attendance.models import Mark
    from apps.library.models import LibraryMembership

    m = LibraryMembership.objects.filter(tenant=tenant, pk=membership_id).first()
    if m is None:
        raise NotFound()
    start = month.replace(day=1)
    end = (start + dt.timedelta(days=32)).replace(day=1)
    days = (
        Mark.objects.filter(
            tenant=tenant,
            module=MODULE,
            party_id=m.party_id,
            on_date__gte=start,
            on_date__lt=end,
            voided_at__isnull=True,
        )
        .values_list("on_date", flat=True)
        .distinct()
    )
    return sorted(d.isoformat() for d in days)
