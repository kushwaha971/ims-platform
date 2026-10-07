"""Penalties and waivers on one due — `dues_adjustment` (ADR-041; FRD lending LEN-09 FR-4, FR-5).

Two moves, each a row, a ledger line and the due's caches in one transaction the
caller holds, with the PARTY already locked (lock order: party → due):

* `add_penalty` — a late fee: `kind='penalty'`, amount > 0. A `charge` (debit) in
  the due's bucket, dated today; the due's `penalty_amount` grows, so the ordinary
  allocation order collects it (it is the "charge" room beyond the components).
* `waive` — all or part of one component: `kind='waiver'`, amount < 0, with the
  component it forgives — `interest` or `principal` (the component row's `waived`
  grows with the due's), or `charge` for a late fee. An `adjustment_credit`
  (credit) dated today. A due waived to nothing is paid, and the subject hears of
  it like any other status change, so a loan whose last rupee is waived closes.

Only an OPEN due (`due` / `overdue`) takes either: a future instalment is not owed
yet, and changing what it will be is a reschedule, not a waiver.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from apps.common.dates import tenant_today
from apps.common.exceptions import BusinessRuleViolation, ValidationFailed
from apps.common.money import q2
from apps.dues.constants import (
    OPEN_DUE_STATUSES,
    SOURCE_ADJUSTMENT,
    AdjustmentKind,
    Component,
)
from apps.dues.models import DuesAdjustment, DuesDue, DuesDueComponent
from apps.dues.services.settlement import _save, room

ZERO = Decimal("0.00")
REASON_MIN = 3
REASON_MAX = 255
WAIVABLE = (Component.INTEREST.value, Component.PRINCIPAL.value, Component.CHARGE.value)


def _reason(raw: Any) -> str:
    text = " ".join(str(raw or "").split())
    if len(text) < REASON_MIN:
        raise ValidationFailed({"reason": ["Say why, in a few words."]})
    return text[:REASON_MAX]


def _amount(raw: Any) -> Decimal:
    try:
        value = q2(Decimal(str(raw)))
    except Exception as error:  # noqa: BLE001 — anything that is not a number
        raise ValidationFailed({"amount": ["Enter an amount."]}) from error
    if value <= ZERO:
        raise ValidationFailed({"amount": ["Enter an amount."]})
    return value


def _require_open(due: DuesDue) -> None:
    if due.status not in OPEN_DUE_STATUSES:
        raise BusinessRuleViolation(
            "due_not_open",
            "This instalment is not open any more.",
            details={"status": due.status},
        )


def lock_due(*, tenant: Any, due_id: Any, schedule_id: Any) -> DuesDue:
    due = (
        DuesDue.objects.select_for_update()
        .select_related("schedule")
        .filter(tenant=tenant, pk=due_id, schedule_id=schedule_id)
        .first()
    )
    if due is None:
        raise ValidationFailed({"due_id": ["Choose an instalment of this loan."]})
    return due


def penalties(due: DuesDue) -> tuple[Decimal, Decimal]:
    """`(charged, waived)` late fees on this due — standing rows only."""
    rows = DuesAdjustment.objects.filter(due=due, reversed_by__isnull=True)
    charged = sum((Decimal(r.amount) for r in rows if r.kind == AdjustmentKind.PENALTY), ZERO)
    waived = sum(
        (
            -Decimal(r.amount)
            for r in rows
            if r.kind == AdjustmentKind.WAIVER and r.component == Component.CHARGE
        ),
        ZERO,
    )
    return q2(charged), q2(waived)


def _post(*, ctx: Any, due: DuesDue, party: Any, adjustment: DuesAdjustment, note: str) -> Any:
    from apps.ledger.constants import EntryType
    from apps.ledger.services.postings import post_source_entry

    entry_type = (
        EntryType.CHARGE
        if adjustment.kind == AdjustmentKind.PENALTY
        else EntryType.ADJUSTMENT_CREDIT
    )
    entry, _balance = post_source_entry(
        ctx=ctx,
        party=party,
        amount=abs(Decimal(adjustment.amount)),
        entry_date=tenant_today(ctx.tenant),
        entry_type=entry_type,
        source_type=SOURCE_ADJUSTMENT,
        source_id=adjustment.id,
        note=note[:255],
        bucket=_bucket(due),
    )
    DuesAdjustment.objects.filter(pk=adjustment.pk).update(posted_entry_id=entry.id)
    return entry


def _bucket(due: DuesDue) -> str:
    """The bucket the due's own money lives in: a loan's components are in `loan`."""
    from apps.dues.constants import Mode

    return "loan" if due.schedule.mode == Mode.EXPECTATION else "main"


def add_penalty(
    *, ctx: Any, due: DuesDue, party: Any, amount: Any, reason: Any, note: str
) -> DuesAdjustment:
    """A late fee on a LOCKED open due. Returns the adjustment (posted)."""
    _require_open(due)
    value = _amount(amount)
    text = _reason(reason)
    adjustment = DuesAdjustment.objects.create(
        tenant=ctx.tenant, due=due, kind=AdjustmentKind.PENALTY, amount=value, reason=text
    )
    _post(ctx=ctx, due=due, party=party, adjustment=adjustment, note=note)
    before = due.status
    due.penalty_amount = q2(Decimal(due.penalty_amount) + value)
    DuesDue.objects.filter(pk=due.pk).update(penalty_amount=due.penalty_amount)
    _save(due, ctx=ctx, before=before, schedule=due.schedule, today=tenant_today(ctx.tenant))
    return adjustment


def waivable(due: DuesDue) -> dict[str, Decimal]:
    """What each waivable component of the due still owes."""
    left = room(due)
    return {name: q2(left.get(name, ZERO)) for name in WAIVABLE}


def waive(
    *, ctx: Any, due: DuesDue, party: Any, component: str, amount: Any, reason: Any, note: str
) -> DuesAdjustment:
    """Forgive `amount` of one component of a LOCKED open due. Returns the adjustment."""
    _require_open(due)
    if component not in WAIVABLE:
        raise ValidationFailed({"component": ["Choose interest, late fee or principal."]})
    value = _amount(amount)
    text = _reason(reason)
    left = waivable(due)[component]
    if value > left:
        raise ValidationFailed({"amount": [f"Only {left} is left to waive."]})
    adjustment = DuesAdjustment.objects.create(
        tenant=ctx.tenant,
        due=due,
        kind=AdjustmentKind.WAIVER,
        component=component,
        amount=-value,
        reason=text,
    )
    _post(ctx=ctx, due=due, party=party, adjustment=adjustment, note=note)
    if component != Component.CHARGE:
        row = DuesDueComponent.objects.select_for_update().get(due=due, component=component)
        DuesDueComponent.objects.filter(pk=row.pk).update(waived=q2(Decimal(row.waived) + value))
    before = due.status
    due.waived_amount = q2(Decimal(due.waived_amount) + value)
    DuesDue.objects.filter(pk=due.pk).update(waived_amount=due.waived_amount)
    _save(due, ctx=ctx, before=before, schedule=due.schedule, today=tenant_today(ctx.tenant))
    return adjustment
