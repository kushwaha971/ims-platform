"""Settling dues — the component split, `plan_allocation` and `payoff` (FRD 00 DUE-03, ADR-047).

A collection against a due is an ordinary payment (ADR-047): the two allocation
targets in `services/payment_target.py` hand each allocated amount to `settle`
here, and a void hands it back to `unsettle`. Nothing else writes
`dues_settlement`, a due's `settled_amount` or a component's `settled`.

── The split (BR-3) ───────────────────────────────────────────────────────────
A due's components are taken in its schedule's `allocation_order`:

* `oldest_first` and `fees_last` — interest, principal, fee, charge;
* `fees_first` — fee, charge, interest, principal.

Within ONE due the two orders that differ across dues (`oldest_first`,
`fees_last`) are the same sequence, so `plan_allocation` (which orders ACROSS
dues) and `settle` (which orders WITHIN one) always agree: whatever share of a
payment a due is given, splitting it inside the due by the restricted order
reproduces the plan's split exactly (T-DUE-03-2).

A due without component rows (charge mode) is one `charge` component of the
whole outstanding. A due whose outstanding exceeds what its rows can take (a
penalty in charge, DUE-04) puts the rest on `charge` too, so a settlement row
always names what it settled.

── Status (BR-4) ──────────────────────────────────────────────────────────────
Derived, never toggled: outstanding 0 → `paid` (dated the day it reached 0);
otherwise `due` or `overdue` by `due_on + grace_days < today`. A `scheduled`
due (a lending prepayment, EC-2) keeps `scheduled` until its date: the run
posts it then, and `post_due` makes it `paid` if nothing is left.

── BR-8 ───────────────────────────────────────────────────────────────────────
A void that reopens a `paid` due adds the days the payment stood past the
grace end to `penalty_exempt_days`, so DUE-04's penalty never charges a member
for the days their (later voided) payment said they had paid.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from apps.common.exceptions import BusinessRuleViolation, NotFound, ValidationFailed
from apps.common.money import ZERO, q2
from apps.dues.constants import (
    OPEN_DUE_STATUSES,
    SOURCE_DUE,
    AllocationOrder,
    Component,
    DueStatus,
    Mode,
    Posting,
)
from apps.dues.models import DuesDue, DuesDueComponent, DuesSchedule, DuesSettlement
from apps.dues.registry import subject_for

#: The allocation target names (contracts §1.4).
TARGET_DUE = SOURCE_DUE
TARGET_INSTALMENT = "dues_instalment"

_SCHEDULED_FIRST = (Component.INTEREST.value, Component.PRINCIPAL.value)
_FEES = (Component.FEE.value, Component.CHARGE.value)

#: Within one due, by the schedule's order (BR-3).
WITHIN_DUE: dict[str, tuple[str, ...]] = {
    AllocationOrder.OLDEST_FIRST.value: _SCHEDULED_FIRST + _FEES,
    AllocationOrder.FEES_LAST.value: _SCHEDULED_FIRST + _FEES,
    AllocationOrder.FEES_FIRST.value: _FEES + _SCHEDULED_FIRST,
}


# ── Figures ─────────────────────────────────────────────────────────────────


def outstanding(due: DuesDue) -> Decimal:
    """`amount + penalty − waived − settled`, never negative (DUE-03 §6)."""
    owed = Decimal(due.amount) + Decimal(due.penalty_amount) - Decimal(due.waived_amount)
    return max(q2(owed - Decimal(due.settled_amount)), ZERO)


def _rows(due: DuesDue) -> dict[str, DuesDueComponent]:
    return {row.component: row for row in due.components.all()}


def room(due: DuesDue, rows: dict[str, DuesDueComponent] | None = None) -> dict[str, Decimal]:
    """What each component of the due can still take; the rest of the outstanding is `charge`."""
    rows = _rows(due) if rows is None else rows
    left = {
        name: max(q2(Decimal(r.amount) - Decimal(r.waived) - Decimal(r.settled)), ZERO)
        for name, r in rows.items()
    }
    extra = outstanding(due) - sum(left.values(), ZERO)
    if extra > ZERO:
        left[Component.CHARGE.value] = left.get(Component.CHARGE.value, ZERO) + extra
    return left


def split_due(
    due: DuesDue, amount: Decimal, order: str, rows: dict[str, DuesDueComponent] | None = None
) -> list[tuple[str, Decimal]]:
    """`amount` of one due, by component, in the due's order (BR-3). Never over a component."""
    left = room(due, rows)
    remaining = q2(amount)
    out: list[tuple[str, Decimal]] = []
    for name in WITHIN_DUE.get(order, WITHIN_DUE[AllocationOrder.OLDEST_FIRST.value]):
        take = min(left.get(name, ZERO), remaining)
        if take > ZERO:
            out.append((name, take))
            remaining -= take
        if remaining <= ZERO:
            break
    return out


def derive_status(due: DuesDue, *, grace_days: int, today: dt.date) -> tuple[str, Any]:
    """BR-4 — `(status, paid_on)` from the due's figures and dates."""
    from apps.dues.services.posting import open_status

    if due.status in (DueStatus.SCHEDULED, DueStatus.SKIPPED, DueStatus.CANCELLED):
        return due.status, due.paid_on
    if outstanding(due) <= ZERO:
        return DueStatus.PAID.value, due.paid_on or today
    return open_status(due=due, grace_days=grace_days, today=today), None


# ── Moving a due (the targets' apply / unapply) ─────────────────────────────


def _save(due: DuesDue, *, ctx: Any, before: str, schedule: DuesSchedule, today: dt.date) -> None:
    due.status, due.paid_on = derive_status(due, grace_days=schedule.grace_days, today=today)
    DuesDue.objects.filter(pk=due.pk).update(
        settled_amount=due.settled_amount,
        status=due.status,
        paid_on=due.paid_on,
        penalty_exempt_days=due.penalty_exempt_days,
    )
    if before != due.status:
        subject = subject_for(schedule.subject_type)
        if subject is not None and subject.on_due_changed is not None:
            due.schedule = schedule
            subject.on_due_changed(ctx, due, before, due.status)


def settle(
    *,
    ctx: Any,
    due: DuesDue,
    amount: Decimal,
    today: dt.date,
    payment_id: Any = None,
) -> tuple[str, str]:
    """Settle `amount` of a LOCKED due: settlement rows, component caches, the due's cache,
    its derived status. Returns `(status_before, status_after)`.

    `payment_id` is what the rows are keyed by; every real caller (record, allocate_existing)
    passes it. Without one the caches move and no row is written — the contract suite's
    floor check is the only such caller.
    """
    amount = q2(amount)
    if amount > outstanding(due):
        raise BusinessRuleViolation(
            "over_allocated",
            "This is more than the due still owes.",
            details={"outstanding": str(outstanding(due))},
        )
    schedule = due.schedule
    rows = _rows(due)
    before = due.status
    for name, part in split_due(due, amount, schedule.allocation_order, rows):
        row = rows.get(name)
        if row is not None:
            row.settled = q2(Decimal(row.settled) + part)
            DuesDueComponent.objects.filter(pk=row.pk).update(settled=row.settled)
        if payment_id is not None:
            existing = DuesSettlement.objects.filter(
                payment_id=payment_id, due=due, component=name
            ).first()
            if existing is None:
                DuesSettlement.objects.create(
                    tenant=due.tenant, payment_id=payment_id, due=due, component=name, amount=part
                )
            else:
                DuesSettlement.objects.filter(pk=existing.pk).update(amount=existing.amount + part)
    due.settled_amount = q2(Decimal(due.settled_amount) + amount)
    _save(due, ctx=ctx, before=before, schedule=schedule, today=today)
    return before, due.status


def _stood_days(*, due: DuesDue, payment_id: Any, grace_days: int, today: dt.date) -> int:
    """BR-8 — the days a voided payment stood past the due's grace end."""
    from apps.payments.models import Payment

    paid_on = (
        Payment.objects.filter(pk=payment_id).values_list("payment_date", flat=True).first()
        if payment_id is not None
        else None
    )
    if paid_on is None:
        return 0
    start = max(paid_on, due.due_on + dt.timedelta(days=grace_days))
    return max((today - start).days, 0)


def unsettle(
    *,
    ctx: Any,
    due: DuesDue,
    amount: Decimal,
    today: dt.date,
    payment_id: Any = None,
) -> tuple[str, str]:
    """Undo exactly this payment's settlement of a LOCKED due (a void). Returns `(before, after)`.

    The rows say what the payment settled, so the components are restored from them, not
    re-split; `amount` is the allocation being released and must equal their sum.
    """
    amount = q2(amount)
    schedule = due.schedule
    rows = _rows(due)
    before = due.status
    if payment_id is not None:
        settled = list(DuesSettlement.objects.filter(payment_id=payment_id, due=due))
        parts = [(s.component, Decimal(s.amount)) for s in settled]
    else:
        # The contract suite's id-less move: undo by the same split, in reverse.
        parts = _reverse_split(due, amount, schedule.allocation_order, rows)
        settled = []
    if q2(sum((p for _, p in parts), ZERO)) != amount:
        raise ValueError(
            f"dues_due {due.id}: releasing {amount}, but payment {payment_id} settled "
            f"{sum((p for _, p in parts), ZERO)}"
        )
    for name, part in parts:
        row = rows.get(name)
        if row is not None:
            row.settled = max(q2(Decimal(row.settled) - part), ZERO)
            DuesDueComponent.objects.filter(pk=row.pk).update(settled=row.settled)
    if settled:
        DuesSettlement.objects.filter(pk__in=[s.pk for s in settled]).delete()
    due.settled_amount = max(q2(Decimal(due.settled_amount) - amount), ZERO)
    if before == DueStatus.PAID:
        due.penalty_exempt_days = int(due.penalty_exempt_days) + _stood_days(
            due=due, payment_id=payment_id, grace_days=schedule.grace_days, today=today
        )
    _save(due, ctx=ctx, before=before, schedule=schedule, today=today)
    return before, due.status


def _reverse_split(
    due: DuesDue, amount: Decimal, order: str, rows: dict[str, DuesDueComponent]
) -> list[tuple[str, Decimal]]:
    settled = {name: Decimal(r.settled) for name, r in rows.items()}
    charge_extra = q2(
        Decimal(due.settled_amount) - sum(settled.values(), ZERO)
    )  # the part settled beyond the rows
    if charge_extra > ZERO:
        settled[Component.CHARGE.value] = settled.get(Component.CHARGE.value, ZERO) + charge_extra
    remaining = amount
    out: list[tuple[str, Decimal]] = []
    for name in reversed(WITHIN_DUE.get(order, WITHIN_DUE[AllocationOrder.OLDEST_FIRST.value])):
        take = min(settled.get(name, ZERO), remaining)
        if take > ZERO:
            out.append((name, take))
            remaining -= take
    return out


# ── plan_allocation and payoff (contracts §2.1) ─────────────────────────────


def target_name(schedule: DuesSchedule) -> str | None:
    """Which allocation target a schedule's dues are: `dues_due` (charge, ledger),
    `dues_instalment` (expectation), or none (document mode settles through its invoice)."""
    if schedule.posting == Posting.LEDGER:
        return TARGET_DUE
    if schedule.mode == Mode.EXPECTATION:
        return TARGET_INSTALMENT
    return None


def _open_dues(schedule: DuesSchedule, *, allow_scheduled: bool) -> list[DuesDue]:
    statuses = list(OPEN_DUE_STATUSES)
    if allow_scheduled and schedule.mode == Mode.EXPECTATION:
        statuses.append(DueStatus.SCHEDULED.value)
    dues = (
        DuesDue.objects.filter(schedule=schedule, status__in=statuses)
        .prefetch_related("components")
        .order_by("due_on", "seq", "id")
    )
    return [d for d in dues if outstanding(d) > ZERO]


def _schedule(tenant: Any, schedule_id: Any) -> DuesSchedule:
    from django.core.exceptions import ValidationError

    try:
        schedule = DuesSchedule.objects.filter(tenant=tenant, pk=schedule_id).first()
    except (ValueError, TypeError, ValidationError):
        schedule = None
    if schedule is None:
        raise NotFound("No such schedule.")
    return schedule


def plan_allocation(
    *,
    tenant: Any,
    schedule_id: Any,
    amount: Any,
    order: str | None = None,
    allow_scheduled: bool = False,
) -> list[dict]:
    """How `amount` would settle this schedule's open dues (contracts §2.1, BR-3).

    `[{document_type, document_id, amount, components: [{component, amount}]}]`, oldest due
    first — the rows `record_payment` takes as `allocations` (it ignores `components`, which
    the vertical's preview shows: "Interest ₹625 · Principal ₹5,000 · Late fee ₹100"). What is
    left after every open due is not in the list: it stays on the payment as an advance (BR-6).
    `allow_scheduled` lets a vertical plan a prepayment of instalments not yet due (EC-2).
    """
    schedule = _schedule(tenant, schedule_id)
    name = target_name(schedule)
    if name is None:
        raise ValidationFailed(
            {"schedule_id": ["A document-mode schedule is settled through its invoices."]}
        )
    order = order or schedule.allocation_order
    if order not in WITHIN_DUE:
        raise ValidationFailed({"order": ["Choose oldest_first, fees_first or fees_last."]})
    remaining = q2(Decimal(str(amount)))
    if remaining <= ZERO:
        raise ValidationFailed({"amount": ["Enter an amount above zero."]})
    dues = _open_dues(schedule, allow_scheduled=allow_scheduled)
    rooms = [(due, room(due)) for due in dues]
    taken: dict[Any, dict[str, Decimal]] = {due.id: {} for due in dues}

    def take(passes: tuple[tuple[str, ...], ...]) -> None:
        nonlocal remaining
        for names in passes:
            for due, left in rooms:
                for component in names:
                    if remaining <= ZERO:
                        return
                    part = min(left.get(component, ZERO), remaining)
                    if part > ZERO:
                        taken[due.id][component] = taken[due.id].get(component, ZERO) + part
                        left[component] -= part
                        remaining -= part

    if order == AllocationOrder.OLDEST_FIRST:
        within = WITHIN_DUE[order]
        for due, left in rooms:
            for component in within:
                part = min(left.get(component, ZERO), remaining)
                if part > ZERO:
                    taken[due.id][component] = part
                    left[component] -= part
                    remaining -= part
    elif order == AllocationOrder.FEES_LAST:
        take((_SCHEDULED_FIRST, _FEES))
    else:
        take((_FEES, _SCHEDULED_FIRST))

    plan: list[dict] = []
    for due in dues:
        parts = taken[due.id]
        total = q2(sum(parts.values(), ZERO))
        if total <= ZERO:
            continue
        sequence = WITHIN_DUE[order]
        plan.append(
            {
                "document_type": name,
                "document_id": str(due.id),
                "amount": str(total),
                "components": [
                    {"component": c, "amount": str(q2(parts[c]))} for c in sequence if c in parts
                ],
            }
        )
    return plan


def payoff(*, tenant: Any, schedule_id: Any, on: dt.date) -> dict[str, str]:
    """What closes the schedule on `on`: every open due's remaining, by component (contracts
    §2.1). Dues not yet due are counted only for their principal — interest and fees not yet
    posted are not owed on a payoff date (the vertical rebates or charges them itself)."""
    schedule = _schedule(tenant, schedule_id)
    totals = {c.value: ZERO for c in Component}
    dues = (
        DuesDue.objects.filter(
            schedule=schedule,
            status__in=[DueStatus.DUE, DueStatus.OVERDUE, DueStatus.SCHEDULED],
        )
        .prefetch_related("components")
        .order_by("due_on", "seq", "id")
    )
    for due in dues:
        left = room(due)
        future = due.status == DueStatus.SCHEDULED and due.due_on > on
        for component, value in left.items():
            if future and component != Component.PRINCIPAL:
                continue
            totals[component] += value
    out = {name: str(q2(value)) for name, value in totals.items()}
    out["total"] = str(q2(sum(totals.values(), ZERO)))
    return out
