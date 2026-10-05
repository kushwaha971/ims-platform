"""Shifts, seats and who sits where (W02; owner, 4 Oct 2026).

The one rule: a seat holds one student per stretch of the day. Two students may
share a desk when their shifts do not overlap (Morning and Evening), never when
they do (Morning and Full day). A membership with a seat and no shift holds the
seat all day. A seat is held until it is freed or the membership closes —
expired or suspended members keep their desk, because "three days late with the
fee" is not "left".
"""

from __future__ import annotations

import datetime as dt
from collections import defaultdict
from decimal import Decimal
from typing import Any

from django.db import IntegrityError, transaction

from apps.common.audit import AuditAction, write_audit
from apps.common.exceptions import BusinessRuleViolation, NotFound, StaleVersion, ValidationFailed
from apps.library.constants import (
    RENEWAL_SOON_DAYS,
    SEAT_BULK_MAX,
    SEAT_LABEL_MAX,
    SEAT_ZONE_MAX,
    SHIFT_NAME_MAX,
    MembershipStatus,
)
from apps.library.models import LibraryMembership, LibrarySeat, LibraryShift
from apps.library.services import codes
from apps.library.services.fields import Errors, boolean, integer, text, uuid_or_none

DAY = 24 * 60

# ── Time ranges ─────────────────────────────────────────────────────────────


def _minutes(value: dt.time) -> int:
    return value.hour * 60 + value.minute


def span(shift: LibraryShift | None) -> tuple[int, int]:
    """The shift as `[start, end)` minutes; overnight ends past midnight; none = all day."""
    if shift is None:
        return (0, DAY)
    start, end = _minutes(shift.starts_at), _minutes(shift.ends_at)
    return (start, end + DAY if end <= start else end)


def overlaps(a: LibraryShift | None, b: LibraryShift | None) -> bool:
    """Do two shifts share a minute? Checked again a day later for overnight ones."""
    (s1, e1), (s2, e2) = span(a), span(b)
    return any(s1 < e2 + k and s2 + k < e1 for k in (-DAY, 0, DAY))


def in_day_order(shifts: Any) -> list[LibraryShift]:
    """Short shifts by start time, the long ones after: Morning, Evening, Night,
    then Full day — the order a librarian reads a day in. Seen live: ordering by
    start alone put "Full day" (06:00) before "Morning" (06:00) and made it the
    seat map's default shift."""
    return sorted(
        shifts,
        key=lambda s: (s.sort_order, span(s)[1] - span(s)[0], span(s)[0], s.name.lower()),
    )


# ── JSON ────────────────────────────────────────────────────────────────────


def shift_json(row: LibraryShift) -> dict:
    return {
        "id": str(row.id),
        "name": row.name,
        "starts_at": row.starts_at.strftime("%H:%M"),
        "ends_at": row.ends_at.strftime("%H:%M"),
        "is_active": row.is_active,
        "sort_order": row.sort_order,
        "version": row.version,
    }


def seat_json(row: LibrarySeat) -> dict:
    return {
        "id": str(row.id),
        "label": row.label,
        "zone": row.zone,
        "is_active": row.is_active,
        "version": row.version,
    }


def fee_state(m: LibraryMembership, today: dt.date, dues: Decimal) -> str:
    """What the students list says about the fee: one word, worst first.

    `overdue` — the plan ran out and was not renewed; `unpaid` — a fee is
    charged and not (fully) paid; `due_soon` — the plan ends within
    RENEWAL_SOON_DAYS; `paid` otherwise. A closed membership is `left`.
    """
    from apps.library.services.members import effective_status

    status = effective_status(m, today)
    if status == "closed":
        return "left"
    if status == "expired":
        return "overdue"
    if dues > 0:
        return "unpaid"
    if m.valid_until is not None and m.valid_until <= today + dt.timedelta(days=RENEWAL_SOON_DAYS):
        return "due_soon"
    return "paid"


# ── Shifts ──────────────────────────────────────────────────────────────────


def _time(errors: Errors, data: dict, field: str, required: bool) -> dt.time | None:
    raw = data.get(field)
    if raw in (None, ""):
        if required:
            errors.add(field, "This field is required.")
        return None
    try:
        return dt.time.fromisoformat(str(raw))
    except ValueError:
        errors.add(field, "Enter a time like 06:00.")
        return None


def _shift_fields(data: Any, *, partial: bool) -> dict:
    if not isinstance(data, dict):
        raise ValidationFailed({"non_field_errors": ["Expected an object."]})
    errors = Errors()
    out: dict[str, Any] = {}
    if not partial or "name" in data:
        out["name"] = text(errors, data, "name", SHIFT_NAME_MAX, required=True)
    for field in ("starts_at", "ends_at"):
        if not partial or field in data:
            out[field] = _time(errors, data, field, required=True)
    if not partial or "is_active" in data:
        out["is_active"] = boolean(errors, data, "is_active", True)
    if not partial or "sort_order" in data:
        out["sort_order"] = integer(errors, data, "sort_order", 0, 999, default=0)
    starts, ends = out.get("starts_at"), out.get("ends_at")
    if starts is not None and starts == ends:
        errors.add("ends_at", "A shift cannot start and end at the same time.")
    errors.raise_if_any()
    return out


def _shift_taken() -> ValidationFailed:
    return ValidationFailed({"name": ["A shift with this name already exists."]})


def _audit(ctx: Any, action: str, entity: str, row: Any, after: dict) -> None:
    write_audit(ctx=ctx, action=action, entity_type=entity, entity_id=row.id, after=after)


def create_shift(*, ctx: Any, data: Any) -> LibraryShift:
    fields = _shift_fields(data, partial=False)
    try:
        with transaction.atomic():
            row = LibraryShift.objects.create(
                tenant=ctx.tenant, created_by=getattr(ctx, "actor", None), **fields
            )
    except IntegrityError:
        raise _shift_taken() from None
    _audit(ctx, AuditAction.LIBRARY_SHIFT_SAVED, "library_shift", row, shift_json(row))
    return row


def _locked(model: Any, ctx: Any, raw_id: Any) -> Any:
    pk = uuid_or_none(raw_id)
    row = model.objects.select_for_update().filter(tenant=ctx.tenant, pk=pk).first() if pk else None
    if row is None:
        raise NotFound()
    return row


def _versioned(row: Any, data: Any) -> None:
    version = data.get("version") if isinstance(data, dict) else None
    if isinstance(version, bool) or not isinstance(version, int):
        raise ValidationFailed({"version": ["This field is required."]})
    if row.version != version:
        raise StaleVersion(row.version)


@transaction.atomic
def update_shift(*, ctx: Any, shift_id: Any, data: Any) -> LibraryShift:
    row = _locked(LibraryShift, ctx, shift_id)
    _versioned(row, data)
    fields = _shift_fields(data, partial=True)
    starts = fields.get("starts_at", row.starts_at)
    if starts == fields.get("ends_at", row.ends_at):
        raise ValidationFailed({"ends_at": ["A shift cannot start and end at the same time."]})
    if "starts_at" in fields or "ends_at" in fields:
        _refuse_retimed_clash(ctx, row, fields)
    for field, value in fields.items():
        setattr(row, field, value)
    row.version += 1
    try:
        with transaction.atomic():
            row.save()
    except IntegrityError:
        raise _shift_taken() from None
    _audit(ctx, AuditAction.LIBRARY_SHIFT_SAVED, "library_shift", row, shift_json(row))
    return row


def _refuse_retimed_clash(ctx: Any, row: LibraryShift, fields: dict) -> None:
    """Moving a shift's times must not make two students share a desk at once."""
    moved = LibraryShift(
        starts_at=fields.get("starts_at", row.starts_at),
        ends_at=fields.get("ends_at", row.ends_at),
    )
    holders = _holders(ctx.tenant).filter(shift=row)
    for m in holders:
        others = _holders(ctx.tenant).filter(seat_id=m.seat_id).exclude(pk=m.pk)
        for other in others:
            if other.shift_id != row.id and overlaps(moved, other.shift):
                raise _seat_taken(m.seat, other)


# ── Seats ───────────────────────────────────────────────────────────────────


def _seat_fields(data: Any, *, partial: bool) -> dict:
    if not isinstance(data, dict):
        raise ValidationFailed({"non_field_errors": ["Expected an object."]})
    errors = Errors()
    out: dict[str, Any] = {}
    if not partial or "label" in data:
        out["label"] = text(errors, data, "label", SEAT_LABEL_MAX, required=True)
    if not partial or "zone" in data:
        out["zone"] = text(errors, data, "zone", SEAT_ZONE_MAX) or ""
    if not partial or "is_active" in data:
        out["is_active"] = boolean(errors, data, "is_active", True)
    errors.raise_if_any()
    if "label" in out:
        out["label_sort"] = codes.natural_sort_key(out["label"])
    return out


def _seat_label_taken(label: str) -> ValidationFailed:
    return ValidationFailed({"label": [f"Seat {label} already exists."]})


def create_seat(*, ctx: Any, data: Any) -> LibrarySeat:
    fields = _seat_fields(data, partial=False)
    try:
        with transaction.atomic():
            row = LibrarySeat.objects.create(
                tenant=ctx.tenant, created_by=getattr(ctx, "actor", None), **fields
            )
    except IntegrityError:
        raise _seat_label_taken(fields["label"]) from None
    _audit(ctx, AuditAction.LIBRARY_SEAT_SAVED, "library_seat", row, seat_json(row))
    return row


@transaction.atomic
def create_seat_row(*, ctx: Any, data: Any) -> list[LibrarySeat]:
    """ "A1 to A24" in one go — how a library with sixty desks is set up in a minute.

    Labels already taken are skipped rather than refused: adding "A1–A30" to a
    room that has A1–A24 should add six, not fail on the first.
    """
    if not isinstance(data, dict):
        raise ValidationFailed({"non_field_errors": ["Expected an object."]})
    errors = Errors()
    prefix = text(errors, data, "prefix", SEAT_LABEL_MAX - 4) or ""
    zone = text(errors, data, "zone", SEAT_ZONE_MAX) or ""
    first = integer(errors, data, "from", 1, 9999, default=None)
    last = integer(errors, data, "to", 1, 9999, default=None)
    if first is None and "from" not in errors:
        errors.add("from", "This field is required.")
    if last is None and "to" not in errors:
        errors.add("to", "This field is required.")
    if first is not None and last is not None:
        if last < first:
            errors.add("to", "The last number is before the first.")
        elif last - first + 1 > SEAT_BULK_MAX:
            errors.add("to", f"Add at most {SEAT_BULK_MAX} seats at a time.")
    errors.raise_if_any()
    taken = {
        label.upper()
        for label in LibrarySeat.objects.filter(tenant=ctx.tenant).values_list("label", flat=True)
    }
    created = []
    for n in range(first, last + 1):
        label = f"{prefix}{n}"
        if label.upper() in taken:
            continue
        created.append(
            LibrarySeat(
                tenant=ctx.tenant,
                created_by=getattr(ctx, "actor", None),
                label=label,
                label_sort=codes.natural_sort_key(label),
                zone=zone,
            )
        )
    LibrarySeat.objects.bulk_create(created)
    write_audit(
        ctx=ctx,
        action=AuditAction.LIBRARY_SEAT_SAVED,
        entity_type="library_seat",
        entity_id=None,
        after={"created": [s.label for s in created], "zone": zone},
    )
    return created


@transaction.atomic
def update_seat(*, ctx: Any, seat_id: Any, data: Any) -> LibrarySeat:
    row = _locked(LibrarySeat, ctx, seat_id)
    _versioned(row, data)
    fields = _seat_fields(data, partial=True)
    if fields.get("is_active") is False and _holders(ctx.tenant).filter(seat=row).exists():
        holder = _holders(ctx.tenant).filter(seat=row).first()
        raise _seat_taken(row, holder)
    for field, value in fields.items():
        setattr(row, field, value)
    row.version += 1
    try:
        with transaction.atomic():
            row.save()
    except IntegrityError:
        raise _seat_label_taken(row.label) from None
    _audit(ctx, AuditAction.LIBRARY_SEAT_SAVED, "library_seat", row, seat_json(row))
    return row


# ── Who sits where ──────────────────────────────────────────────────────────


def _holders(tenant: Any) -> Any:
    return (
        LibraryMembership.objects.filter(tenant=tenant, seat__isnull=False)
        .exclude(status=MembershipStatus.CLOSED)
        .select_related("party", "shift", "seat")
    )


def _seat_taken(seat: LibrarySeat, holder: LibraryMembership) -> BusinessRuleViolation:
    when = holder.shift.name if holder.shift_id else "all day"
    return BusinessRuleViolation(
        "library_seat_taken",
        f"Seat {seat.label} is taken by {holder.party.name} ({when}).",
        details={
            "seat": seat.label,
            "holder": {
                "membership_id": str(holder.id),
                "name": holder.party.name,
                "member_number": holder.member_number,
                "shift": holder.shift.name if holder.shift_id else None,
            },
        },
    )


def assign(
    *, ctx: Any, membership: LibraryMembership, seat: LibrarySeat | None, shift: Any
) -> None:
    """Refuse a seat already held in an overlapping shift (BR: one per stretch).

    The seat row is locked first, so two counters giving A-12 Morning to two
    students at the same moment cannot both succeed.
    """
    if seat is None:
        return
    LibrarySeat.objects.select_for_update().filter(pk=seat.pk).first()
    if not seat.is_active:
        raise ValidationFailed({"seat_id": ["This seat is not in use."]})
    for other in _holders(ctx.tenant).filter(seat=seat).exclude(pk=membership.pk):
        if overlaps(shift, other.shift):
            raise _seat_taken(seat, other)


def seat_map(tenant: Any, shift: LibraryShift | None, today: dt.date) -> dict:
    """Every seat, and who holds it during `shift` (None = at any time of day)."""
    from django.db.models import Sum

    from apps.library.models import LibraryCharge

    seats = list(
        LibrarySeat.objects.filter(tenant=tenant, is_active=True).order_by("label_sort", "id")
    )
    holders = list(_holders(tenant))
    dues = {
        row["membership"]: row["t"]
        for row in LibraryCharge.objects.filter(membership__in=[m.pk for m in holders])
        .open()
        .values("membership")
        .annotate(t=Sum("amount_due"))
    }
    by_seat: dict[Any, list] = defaultdict(list)
    for m in holders:
        if shift is None or overlaps(shift, m.shift):
            by_seat[m.seat_id].append(m)
    rows, counts = [], defaultdict(int)
    for seat in seats:
        occupants = [
            {
                "membership_id": str(m.id),
                "name": m.party.name,
                "member_number": m.member_number,
                "shift": {"id": str(m.shift_id), "name": m.shift.name} if m.shift_id else None,
                "valid_until": m.valid_until.isoformat() if m.valid_until else None,
                "fee_state": fee_state(m, today, Decimal(dues.get(m.pk) or 0)),
                "dues_amount": f"{Decimal(dues.get(m.pk) or 0):.2f}",
            }
            for m in sorted(by_seat.get(seat.id, []), key=lambda m: span(m.shift))
        ]
        counts["occupied" if occupants else "free"] += 1
        for o in occupants:
            counts[o["fee_state"]] += 1
        rows.append({**seat_json(seat), "occupants": occupants})
    return {"seats": rows, "counts": dict(counts)}
