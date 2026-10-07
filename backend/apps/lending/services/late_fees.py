"""Late fees and waivers on a loan's instalments (FRD lending LEN-09).

* A late fee is charged only when the loan's terms carry a rule (FR-1), and never
  automatically (FR-3): the loan page shows "late fee so far" per late instalment
  and the owner adds it, at most the suggestion (`preview`). It posts through the
  dues engine as a `penalty` adjustment — a charge, never interest (BR-1).
* A waiver forgives all or part of an instalment's interest, late fee or principal
  with a reason (FR-5). It is a business ceiling, so it is a ROLE check — owner or
  admin — on top of the codename (BR-2, the LED-03 rule).

The arithmetic is pure and in `Decimal`, rounded half-up once, at the end:

    start = due_on + grace;  days_late(on) = max(0, on − start)
    flat_once        value, once days_late ≥ 1 (a second one is refused)
    per_day          min(value × days_late, cap)
    simple_interest  min(Σ_{d=start+1..on} unpaid_PI(d) × value / 100 / 365, cap)

`unpaid_PI(d)` is the instalment's unpaid principal and interest at the end of day d —
collections reduce it from their payment date — so a fee never earns on a fee (G-6).
`suggested = max(0, rule − already charged − late fees already waived)`.
"""

from __future__ import annotations

import datetime as dt
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from django.db import transaction

from apps.common.audit import AuditAction, write_audit
from apps.common.exceptions import BusinessRuleViolation, PermissionDenied, ValidationFailed
from apps.common.money import q2
from apps.lending.constants import LoanStatus
from apps.lending.models import LendingLoan

ZERO = Decimal("0.00")
PI = ("principal", "interest")


def _days_late(due: Any, grace: int, on: dt.date) -> int:
    start = due.due_on + dt.timedelta(days=grace)
    return max((on - start).days, 0)


def _settled_pi_by_day(due: Any) -> list[tuple[dt.date, Decimal]]:
    """`[(payment date, principal + interest it settled on this due)]`, oldest first."""
    from apps.dues.models import DuesSettlement
    from apps.payments.models import Payment

    rows = list(DuesSettlement.objects.filter(due=due, component__in=PI))
    dates = dict(
        Payment.objects.filter(pk__in=[r.payment_id for r in rows]).values_list(
            "id", "payment_date"
        )
    )
    out = [(dates[r.payment_id], Decimal(r.amount)) for r in rows if r.payment_id in dates]
    return sorted(out)


def _pi_owed(due: Any) -> Decimal:
    rows = {c.component: c for c in due.components.all()}
    return sum((Decimal(rows[n].amount) - Decimal(rows[n].waived) for n in PI if n in rows), ZERO)


def rule_amount(loan: LendingLoan, due: Any, on: dt.date) -> tuple[Decimal, int]:
    """`(what the rule says is owed by `on`, days late)`, before anything was added."""
    days = _days_late(due, loan.late_fee_grace_days, on)
    kind, value = loan.late_fee_kind, Decimal(loan.late_fee_value or 0)
    cap = Decimal(loan.late_fee_cap) if loan.late_fee_cap is not None else None
    if kind == "none" or days <= 0:
        return ZERO, days
    if kind == "flat_once":
        return q2(value), days
    if kind == "per_day":
        amount = value * days
    else:  # simple_interest, day by day on the unpaid principal and interest
        start = due.due_on + dt.timedelta(days=loan.late_fee_grace_days)
        payments = _settled_pi_by_day(due)
        owed = _pi_owed(due)
        total = Decimal("0")
        for offset in range(1, days + 1):
            day = start + dt.timedelta(days=offset)
            paid = sum((amt for when, amt in payments if when <= day), Decimal("0"))
            base = max(owed - paid, Decimal("0"))
            total += base * value / Decimal(100) / Decimal(365)
        amount = total
    amount = amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return (min(amount, cap) if cap is not None else amount), days


def preview(*, loan: LendingLoan, due: Any, on: dt.date) -> dict:
    from apps.dues.services.adjustments import penalties

    rule, days = rule_amount(loan, due, on)
    charged, waived = penalties(due)
    suggested = max(rule - charged - waived, ZERO)
    if loan.late_fee_kind == "flat_once" and charged > ZERO:
        suggested = ZERO
    return {
        "rule": loan.late_fee_kind,
        "days_late": days,
        "rule_amount": f"{rule:.2f}",
        "already_charged": f"{charged:.2f}",
        "suggested": f"{q2(suggested):.2f}",
    }


def _require_active(loan: LendingLoan) -> None:
    if loan.status != LoanStatus.ACTIVE:
        raise BusinessRuleViolation(
            "loan_not_active",
            "This loan is not running.",
            details={"status": loan.status},
        )


def _locked(ctx: Any, loan_id: Any) -> tuple[LendingLoan, Any]:
    from apps.parties.services.balance import lock_party

    loan = LendingLoan.objects.filter(tenant=ctx.tenant, pk=loan_id).select_related("party").first()
    if loan is None:
        from apps.common.exceptions import NotFound

        raise NotFound()
    party = lock_party(tenant=ctx.tenant, party_id=loan.party_id)
    loan = LendingLoan.objects.select_for_update().get(pk=loan.pk)
    return loan, party


def _note(loan: LendingLoan, due: Any, what: str) -> str:
    return f"{what} · {loan.number} instalment {due.seq}"


@transaction.atomic
def add_late_fee(*, ctx: Any, loan_id: Any, due_id: Any, amount: Any, reason: Any) -> dict:
    from apps.common.dates import tenant_today
    from apps.dues.services.adjustments import add_penalty, lock_due

    loan, party = _locked(ctx, loan_id)
    _require_active(loan)
    if loan.late_fee_kind == "none":
        raise BusinessRuleViolation(
            "late_fee_not_in_terms",
            "This loan's terms have no late fee, so none can be added.",
            details={},
        )
    due = lock_due(tenant=ctx.tenant, due_id=due_id, schedule_id=loan.schedule_id)
    today = tenant_today(ctx.tenant)
    figures = preview(loan=loan, due=due, on=today)
    suggested = Decimal(figures["suggested"])
    if suggested <= ZERO:
        raise BusinessRuleViolation(
            "penalty_cap_reached",
            "Nothing more can be charged on this instalment under the agreed rule.",
            details={"cap": str(loan.late_fee_cap) if loan.late_fee_cap is not None else None},
        )
    try:
        value = q2(Decimal(str(amount)))
    except Exception as error:  # noqa: BLE001
        raise ValidationFailed({"amount": ["Enter an amount."]}) from error
    if value > suggested:
        raise ValidationFailed({"amount": [f"At most {suggested} under the agreed rule."]})
    adjustment = add_penalty(
        ctx=ctx,
        due=due,
        party=party,
        amount=value,
        reason=reason,
        note=_note(loan, due, "Late fee"),
    )
    write_audit(
        ctx=ctx,
        action=AuditAction.LENDING_LATE_FEE_ADDED,
        entity_type="lending_loan",
        entity_id=loan.id,
        after={"due": str(due.id), "amount": str(value)},
        metadata={
            "rule": loan.late_fee_kind,
            "days_late": figures["days_late"],
            "rule_amount": figures["rule_amount"],
        },
    )
    return {"adjustment_id": str(adjustment.id), "amount": str(value)}


def _may_waive(ctx: Any) -> bool:
    from apps.parties.services.credit import may_override

    return ctx.actor is not None and may_override(tenant=ctx.tenant, user=ctx.actor)


@transaction.atomic
def waive_due(
    *, ctx: Any, loan_id: Any, due_id: Any, component: str, amount: Any, reason: Any
) -> dict:
    from apps.dues.services.adjustments import lock_due, waive

    if not _may_waive(ctx):
        raise PermissionDenied("Only the owner can waive.")
    loan, party = _locked(ctx, loan_id)
    _require_active(loan)
    due = lock_due(tenant=ctx.tenant, due_id=due_id, schedule_id=loan.schedule_id)
    component = {"fee": "charge"}.get(component, component)
    words = {
        "interest": "Interest waived",
        "principal": "Principal waived",
        "charge": "Late fee waived",
    }
    adjustment = waive(
        ctx=ctx,
        due=due,
        party=party,
        component=component,
        amount=amount,
        reason=reason,
        note=_note(loan, due, words.get(component, "Waiver")),
    )
    write_audit(
        ctx=ctx,
        action=AuditAction.LENDING_WAIVER_CREATED,
        entity_type="lending_loan",
        entity_id=loan.id,
        after={"due": str(due.id), "component": component, "amount": str(-adjustment.amount)},
        metadata={"reason": adjustment.reason},
    )
    return {"adjustment_id": str(adjustment.id), "amount": str(-adjustment.amount)}


def due_figures(*, ctx: Any, loan: LendingLoan, due_id: Any, on: dt.date) -> dict:
    """The dialogs' read: the late-fee preview and what each component can still forgive."""
    from apps.dues.models import DuesDue
    from apps.dues.services.adjustments import waivable

    due = DuesDue.objects.filter(tenant=ctx.tenant, pk=due_id, schedule_id=loan.schedule_id).first()
    if due is None:
        raise ValidationFailed({"due_id": ["Choose an instalment of this loan."]})
    left = waivable(due)
    return {
        "due_id": str(due.id),
        "seq": due.seq,
        "status": due.status,
        "late_fee": preview(loan=loan, due=due, on=on) if loan.late_fee_kind != "none" else None,
        "waivable": {
            "interest": f"{left['interest']:.2f}",
            "fee": f"{left['charge']:.2f}",
            "principal": f"{left['principal']:.2f}",
        },
    }
