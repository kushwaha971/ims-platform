"""Entitlements — session packs (FRD 00 ATT-04, contracts §2.3, R18).

`used` is a CACHE of Σ `attendance_entitlement_use.delta` (BR-1), moved one
use at a time under a row lock on the entitlement and replayed by
`manage.py recalc_entitlements`. The lock order every caller follows is
party → entitlement → mark (`check_in`, `roll_call`, `edit_mark`, `void_mark`
all lock the party first).

Per mark, Σ delta is 0 or 1 and the signs alternate: a mark consumes at most
once at a time, and may consume again after giving back (present → absent →
present, C3). `seq` numbers the transitions of one mark.

`grant_entitlement` takes `module` (C1): the table requires it (R18) and the
contract's signature does not carry it — a contracts v1.1 amendment.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from django.core.exceptions import ImproperlyConfigured
from django.db import transaction

from apps.attendance.constants import MODULE_MAX, SUBJECT_TYPE_MAX
from apps.attendance.models import Entitlement, EntitlementUse, Mark
from apps.attendance.services.groups import _date, check_reason
from apps.common.audit import AuditAction, write_audit
from apps.common.exceptions import BusinessRuleViolation, NotFound, ValidationFailed


def entitlement_json(ent: Entitlement | None) -> dict | None:
    if ent is None:
        return None
    return {"id": ent.id, "total": ent.total, "used": ent.used, "left": ent.left}


def _exhausted(ent: Entitlement, *, expired: bool = False) -> BusinessRuleViolation:
    details: dict[str, Any] = {"total": ent.total, "used": ent.used}
    if expired:
        details["expired"] = True
        message = f"This pack was valid till {ent.valid_to:%d %b %Y}."
    else:
        message = "This pack is used up."
    return BusinessRuleViolation("entitlement_exhausted", message, details=details)


def _lock(tenant: Any, entitlement_id: Any) -> Entitlement:
    ent = (
        Entitlement.objects.for_tenant(tenant).select_for_update().filter(pk=entitlement_id).first()
    )
    if ent is None:
        raise NotFound()
    return ent


# ── consumption (called inside check_in / roll_call / edit_mark / void_mark) ──


@dataclass
class UseHistory:
    """What a mark has drawn so far: Σ delta, which entitlement, the next seq."""

    balance: int = 0
    entitlement_id: UUID | None = None
    next_seq: int = 0


def history_of(mark: Mark) -> UseHistory:
    """One query over the mark's use rows."""
    history = UseHistory()
    for entitlement_id, delta, seq in (
        EntitlementUse.objects.filter(mark=mark)
        .order_by("seq")
        .values_list("entitlement_id", "delta", "seq")
    ):
        history.balance += delta
        history.entitlement_id = entitlement_id
        history.next_seq = seq + 1
    return history


def lock_for_use(
    *, tenant: Any, entitlement_id: Any, party_id: Any, module: str, on: dt.date
) -> Entitlement:
    """Lock the entitlement a policy named and prove one use is available on `on`.

    BR-3: outside `[valid_from, valid_to]` → 409 `entitlement_exhausted`
    `{total, used, expired: true}`; at `used = total` → `{total, used}`. An
    entitlement of another party or module is a POLICY bug, not a refusal."""
    ent = _lock(tenant, entitlement_id)
    if ent.party_id != party_id or ent.module != module:
        raise ImproperlyConfigured(
            f"the policy named entitlement {entitlement_id} of another party or module"
        )
    if not ent.valid_from <= on <= ent.valid_to:
        raise _exhausted(ent, expired=True)
    if ent.used >= ent.total:
        raise _exhausted(ent)
    return ent


def apply_use(*, ent: Entitlement, mark: Mark, delta: int, seq: int) -> EntitlementUse:
    """Move the cache by `delta` and write the use row (the entitlement is locked)."""
    ent.used += delta
    ent.save(update_fields=["used", "updated_at"])
    return EntitlementUse.objects.create(
        tenant_id=mark.tenant_id, entitlement=ent, mark=mark, delta=delta, seq=seq
    )


def give_back(*, tenant: Any, mark: Mark) -> Entitlement | None:
    """ATT-03 BR-5, ATT-04 BR-4: one −1 when the mark currently holds a use."""
    history = history_of(mark)
    if history.balance != 1 or history.entitlement_id is None:
        return None
    ent = _lock(tenant, history.entitlement_id)
    apply_use(ent=ent, mark=mark, delta=-1, seq=history.next_seq)
    return ent


def take_again(*, tenant: Any, mark: Mark) -> Entitlement | None:
    """ATT-04 BR-4: absent → present draws again from the SAME entitlement, when
    the mark has a use history (C4: roll-call has no policy to name a pack)."""
    history = history_of(mark)
    if history.balance != 0 or history.entitlement_id is None:
        return None
    ent = lock_for_use(
        tenant=tenant,
        entitlement_id=history.entitlement_id,
        party_id=mark.party_id,
        module=mark.module,
        on=mark.on_date,
    )
    apply_use(ent=ent, mark=mark, delta=1, seq=history.next_seq)
    return ent


# ── public services ──────────────────────────────────────────────────────────


def grant_entitlement(
    *,
    ctx: Any,
    party_id: UUID,
    subject_type: str,
    subject_id: UUID,
    total: int,
    valid_from: dt.date,
    valid_to: dt.date,
    module: str,
) -> Entitlement:
    """Contracts §2.3 plus the required `module` (C1)."""
    from apps.parties.models import Party

    valid_from, valid_to = _date(valid_from), _date(valid_to)
    errors: dict[str, list[str]] = {}
    if not module or len(module) > MODULE_MAX:
        errors.setdefault("module", []).append("Not a module.")
    if not subject_type or len(subject_type) > SUBJECT_TYPE_MAX:
        errors.setdefault("subject_type", []).append("Not a subject type.")
    if subject_id is None:
        errors.setdefault("subject_id", []).append("Name what the pack is for.")
    if not isinstance(total, int) or isinstance(total, bool) or total < 1:
        errors.setdefault("total", []).append("Enter a whole number of 1 or more.")
    if valid_from is None:
        errors.setdefault("valid_from", []).append("Choose the first valid day.")
    if valid_to is None or (valid_from and valid_to < valid_from):
        errors.setdefault("valid_to", []).append("The last valid day is before the first.")
    if errors:
        raise ValidationFailed(errors)
    with transaction.atomic():
        if not Party.objects.for_tenant(ctx.tenant).filter(pk=party_id).exists():
            raise NotFound()
        ent = Entitlement.objects.create(
            tenant=ctx.tenant,
            created_by=getattr(ctx, "actor", None),
            party_id=party_id,
            module=module,
            subject_type=subject_type,
            subject_id=subject_id,
            total=total,
            valid_from=valid_from,
            valid_to=valid_to,
        )
        write_audit(
            ctx=ctx,
            action=AuditAction.ATTENDANCE_ENTITLEMENT_GRANTED,
            entity_type="attendance_entitlement",
            entity_id=ent.id,
            after={
                "module": module,
                "party_id": party_id,
                "total": total,
                "valid_from": valid_from,
                "valid_to": valid_to,
            },
        )
        return ent


def extend_entitlement(
    *, ctx: Any, entitlement_id: UUID, valid_to: dt.date, reason: str
) -> Entitlement:
    """R18 (freezes, extensions). Allowed after expiry (EC-2); never shortens
    (that is `end_entitlement`); never touches `used`."""
    reason = check_reason(reason)
    valid_to = _date(valid_to)
    with transaction.atomic():
        ent = _lock(ctx.tenant, entitlement_id)
        if valid_to is None or valid_to < ent.valid_to:
            raise ValidationFailed(
                {"valid_to": ["An extension cannot end before the pack's current last day."]}
            )
        before = ent.valid_to
        ent.valid_to = valid_to
        ent.save(update_fields=["valid_to", "updated_at"])
        write_audit(
            ctx=ctx,
            action=AuditAction.ATTENDANCE_ENTITLEMENT_EXTENDED,
            entity_type="attendance_entitlement",
            entity_id=ent.id,
            before={"valid_to": before},
            after={"valid_to": valid_to},
            metadata={"reason": reason},
        )
        return ent


def end_entitlement(*, ctx: Any, entitlement_id: UUID, on: dt.date, reason: str) -> Entitlement:
    """R18 (changes, transfers). `on` is the inclusive last valid day (C6); it may
    not precede `valid_from` nor follow the current `valid_to` (that is an extend)."""
    reason = check_reason(reason)
    on = _date(on)
    with transaction.atomic():
        ent = _lock(ctx.tenant, entitlement_id)
        if on is None or on < ent.valid_from:
            raise ValidationFailed({"on": ["The pack cannot end before it starts."]})
        if on > ent.valid_to:
            raise ValidationFailed({"on": ["The pack already ends earlier. Extend it instead."]})
        before = ent.valid_to
        ent.valid_to = on
        ent.save(update_fields=["valid_to", "updated_at"])
        write_audit(
            ctx=ctx,
            action=AuditAction.ATTENDANCE_ENTITLEMENT_ENDED,
            entity_type="attendance_entitlement",
            entity_id=ent.id,
            before={"valid_to": before},
            after={"valid_to": on},
            metadata={"reason": reason},
        )
        return ent


def entitlement_for(tenant: Any, subject_type: str, subject_id: UUID) -> Entitlement | None:
    """FRD ATT-04 §6 (C7): the subject's pack, the one valid longest first."""
    return (
        Entitlement.objects.for_tenant(tenant)
        .filter(subject_type=subject_type, subject_id=subject_id)
        .order_by("-valid_to", "-id")
        .first()
    )
