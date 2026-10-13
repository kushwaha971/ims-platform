"""Collections, visits and today's round (FRD lending LEN-06, LEN-07, LEN-08).

The owner's words (4 Oct 2026): money comes daily or monthly, and sometimes a
borrower skips a few days and pays everything together; every payment has a
mode and a note. So a collection is ANY amount up to the payoff:

* the dues engine plans it oldest first across the instalments — missed days,
  then today, then days ahead (`plan_allocation(…, allow_scheduled=True)`),
  so a lump sum after a gap clears the oldest first and pays ahead with the rest;
* it is one payment IN with its mode, reference and note, allocated to those
  instalments (the `dues_instalment` target, loan bucket);
* a loan whose last instalment is settled closes itself (`on_due_changed`).

A stop with no money is a visit: not paid, not at home, or promised a date.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal, InvalidOperation
from typing import Any

from django.db import transaction
from django.db.models import Sum

from apps.common.audit import write_audit
from apps.common.dates import tenant_today
from apps.common.exceptions import BusinessRuleViolation, NotFound, ValidationFailed
from apps.common.money import ZERO, q2
from apps.lending.constants import REASON_MAX, LoanStatus, VisitOutcome
from apps.lending.models import LendingCollection, LendingLoan, LendingVisit
from apps.lending.services.loans import PAYMENT_MODES, figures

MAX_LEN = {"reference": 64, "note": 255}


def _loan(ctx: Any, loan_id: Any, *, lock: bool = False) -> LendingLoan:
    qs = LendingLoan.objects.filter(tenant=ctx.tenant, pk=loan_id).select_related(
        "party", "borrower", "route"
    )
    loan = (qs.select_for_update(of=("self",)) if lock else qs).first()
    if loan is None:
        raise NotFound()
    return loan


def _active(loan: LendingLoan) -> None:
    if loan.status != LoanStatus.ACTIVE:
        raise BusinessRuleViolation(
            "loan_not_active", "This loan is not running.", details={"status": loan.status}
        )


def remaining(loan: LendingLoan) -> Decimal:
    """What the borrower still owes under the schedule (every open instalment)."""
    from apps.dues.models import DuesDue
    from apps.dues.services.settlement import outstanding

    return q2(
        sum(
            (
                outstanding(d)
                for d in DuesDue.objects.filter(schedule_id=loan.schedule_id).exclude(
                    status__in=["paid", "cancelled", "skipped"]
                )
            ),
            ZERO,
        )
    )


def preview(*, ctx: Any, loan_id: Any, amount: Any) -> dict:
    """What `amount` would clear, without recording anything: "₹2,500 clears 2
    missed days, today and 2 days ahead"."""
    from apps.dues.models import DuesDue
    from apps.dues.services.settlement import plan_allocation

    loan = _loan(ctx, loan_id)
    _active(loan)
    value = _amount(amount)
    payoff = remaining(loan)
    if value > payoff:
        raise _over(payoff, value)
    plan = plan_allocation(
        tenant=ctx.tenant, schedule_id=loan.schedule_id, amount=value, allow_scheduled=True
    )
    dues = {
        str(d.id): d for d in DuesDue.objects.filter(pk__in=[row["document_id"] for row in plan])
    }
    today = tenant_today(ctx.tenant)
    return {
        "amount": f"{value:.2f}",
        "remaining_after": f"{q2(payoff - value):.2f}",
        "clears": [
            {
                "seq": dues[row["document_id"]].seq,
                "due_on": dues[row["document_id"]].due_on.isoformat(),
                "amount": row["amount"],
                "when": _when(dues[row["document_id"]].due_on, today),
            }
            for row in plan
        ],
    }


def _when(day: dt.date, today: dt.date) -> str:
    return "missed" if day < today else ("today" if day == today else "ahead")


def _amount(raw: Any) -> Decimal:
    try:
        value = q2(Decimal(str(raw)))
    except (InvalidOperation, ValueError):
        raise ValidationFailed({"amount": ["Enter an amount."]}) from None
    if value <= ZERO:
        raise ValidationFailed({"amount": ["Enter an amount above zero."]})
    return value


def _over(payoff: Decimal, value: Decimal) -> BusinessRuleViolation:
    return BusinessRuleViolation(
        "collection_over_payoff",
        f"This is more than the ₹{payoff:,.2f} still owed on the loan.",
        details={"payoff": f"{payoff:.2f}", "amount": f"{value:.2f}"},
    )


def _collected_on(raw: Any, loan: LendingLoan, today: dt.date) -> dt.date:
    """QA B45 — the day the money was really taken: today unless said, never in the
    future, never before the loan was given."""
    if raw in (None, ""):
        return today
    try:
        on = dt.date.fromisoformat(str(raw))
    except ValueError:
        raise ValidationFailed({"collected_on": ["Enter a date."]}) from None
    if on > today:
        raise ValidationFailed({"collected_on": ["A collection cannot be in the future."]})
    if on < loan.disbursed_on:
        raise ValidationFailed(
            {"collected_on": ["A collection cannot be before the loan was given."]}
        )
    return on


def record_opening(*, ctx: Any, loan: LendingLoan, amount: Decimal, on: dt.date) -> Any:
    """QA F8 — what a loan brought in from paper had already collected, as history.

    An `adjustment` payment (R24/R37: money that did not move today), allocated oldest
    instalment first like any collection, so the late days run from the first
    instalment really unpaid. The row is `is_opening`: no day's round counts it and
    the loan's page shows it as collected before, with no receipt.
    """
    from apps.dues.services.settlement import plan_allocation
    from apps.payments.services.record import record_adjustment

    plan = plan_allocation(
        tenant=ctx.tenant, schedule_id=loan.schedule_id, amount=amount, allow_scheduled=True
    )
    result = record_adjustment(
        ctx=ctx,
        payload={
            "direction": "in",
            "party_id": str(loan.party_id),
            "payment_date": on.isoformat(),
            "mode_breakup": [{"mode": "adjustment", "amount": f"{amount:.2f}"}],
            "allocations": [
                {
                    "document_type": r["document_type"],
                    "document_id": r["document_id"],
                    "amount": r["amount"],
                }
                for r in plan
            ],
            "note": f"Loan {loan.number} — collected before records began",
        },
    )
    row = LendingCollection.objects.create(
        tenant=ctx.tenant,
        created_by=getattr(ctx, "actor", None),
        loan=loan,
        payment_id=result["payment"].id,
        amount=amount,
        collected_on=on,
        route=loan.route,
        is_opening=True,
    )
    write_audit(
        ctx=ctx,
        action="lending.collection.opening",
        entity_type="lending_collection",
        entity_id=row.id,
        after={"loan": loan.number, "amount": f"{amount:.2f}"},
    )
    return row


@transaction.atomic
def collect(*, ctx: Any, loan_id: Any, data: Any) -> dict:
    """`POST /lending/loans/<id>/collections` — record one collection."""
    from apps.dues.services.settlement import plan_allocation
    from apps.parties.services.balance import lock_party
    from apps.payments.services.record import record_payment

    data = data if isinstance(data, dict) else {}
    value = _amount(data.get("amount"))
    mode = data.get("mode") or "cash"
    if mode not in PAYMENT_MODES:
        raise ValidationFailed({"mode": ["Choose cash, UPI, bank or cheque."]})
    reference = str(data.get("reference") or "").strip()[: MAX_LEN["reference"]]
    note = str(data.get("note") or "").strip()[: MAX_LEN["note"]]
    loan = _loan(ctx, loan_id)
    lock_party(tenant=ctx.tenant, party_id=loan.party_id)
    loan = _loan(ctx, loan_id, lock=True)
    _active(loan)
    payoff = remaining(loan)
    if value > payoff:
        raise _over(payoff, value)
    plan = plan_allocation(
        tenant=ctx.tenant, schedule_id=loan.schedule_id, amount=value, allow_scheduled=True
    )
    today = tenant_today(ctx.tenant)
    on = _collected_on(data.get("collected_on"), loan, today)
    result = record_payment(
        ctx=ctx,
        payload={
            "direction": "in",
            "party_id": str(loan.party_id),
            "payment_date": on.isoformat(),
            "mode_breakup": [
                {
                    "mode": mode,
                    "amount": f"{value:.2f}",
                    **({"reference": reference} if reference else {}),
                }
            ],
            "allocations": [
                {
                    "document_type": r["document_type"],
                    "document_id": r["document_id"],
                    "amount": r["amount"],
                }
                for r in plan
            ],
            **({"reference": reference} if reference else {}),
            "note": note or f"Loan {loan.number}",
        },
    )
    payment = result["payment"]
    row = LendingCollection.objects.create(
        tenant=ctx.tenant,
        created_by=getattr(ctx, "actor", None),
        loan=loan,
        payment_id=payment.id,
        amount=value,
        collected_on=on,
        route=loan.route,
        collected_by=(
            getattr(ctx, "actor", None) if getattr(ctx, "actor_type", "") == "user" else None
        ),
    )
    write_audit(
        ctx=ctx,
        action="lending.collection.recorded",
        entity_type="lending_collection",
        entity_id=row.id,
        after={
            "loan": loan.number,
            "amount": f"{value:.2f}",
            "mode": mode,
            "payment": payment.number,
        },
    )
    loan.refresh_from_db()
    if loan.status == LoanStatus.ACTIVE and remaining(loan) <= ZERO:
        # Paid in full, possibly ahead of the dates: instalments settled in
        # advance stay `scheduled` until their day (the engine's EC-2), so the
        # engine's hook would close the loan only on the last date. Nothing is
        # owed now, so it closes now — early when the last date is still ahead.
        loan.status = LoanStatus.CLOSED
        loan.close_reason = "early" if loan.maturity_on > today else "completed"
        loan.closed_on = today
        loan.save(update_fields=["status", "close_reason", "closed_on", "updated_at"])
        write_audit(
            ctx=ctx,
            action="lending.loan.closed",
            entity_type="lending_loan",
            entity_id=loan.id,
            after={"number": loan.number, "close_reason": loan.close_reason},
        )
    return {
        "collection_id": str(row.id),
        "payment_id": str(payment.id),
        "receipt_number": payment.number,
        "amount": f"{value:.2f}",
        "mode": mode,
        "loan_status": loan.status,
        "figures": figures(loan, today),
    }


@transaction.atomic
def void_collection(*, ctx: Any, collection_id: Any, reason: Any) -> dict:
    from apps.payments.services.void import void_payment

    row = (
        LendingCollection.objects.select_for_update()
        .filter(tenant=ctx.tenant, pk=collection_id, voided_at__isnull=True)
        .select_related("loan")
        .first()
    )
    if row is None:
        raise NotFound()
    text = str(reason or "").strip()
    if len(text) < 3:
        raise ValidationFailed({"reason": ["Say why, in a few words."]})
    void_payment(ctx=ctx, payment_id=row.payment_id, reason=text[:REASON_MAX])
    from django.utils import timezone

    row.voided_at = timezone.now()
    row.save(update_fields=["voided_at", "updated_at"])
    write_audit(
        ctx=ctx,
        action="lending.collection.voided",
        entity_type="lending_collection",
        entity_id=row.id,
        after={"loan": row.loan.number, "amount": f"{row.amount:.2f}", "reason": text},
    )
    loan = row.loan
    loan.refresh_from_db()
    if loan.status == LoanStatus.CLOSED and remaining(loan) > ZERO:
        loan.status, loan.close_reason, loan.closed_on = LoanStatus.ACTIVE, "", None
        loan.save(update_fields=["status", "close_reason", "closed_on", "updated_at"])
        write_audit(
            ctx=ctx,
            action="lending.loan.reopened",
            entity_type="lending_loan",
            entity_id=loan.id,
            after={"number": loan.number, "reason": text},
        )
    return {"loan_status": loan.status}


@transaction.atomic
def record_visit(*, ctx: Any, loan_id: Any, data: Any) -> LendingVisit:
    """A stop with no money (LEN-08): not paid, not at home, or a promised date."""
    data = data if isinstance(data, dict) else {}
    outcome = data.get("outcome") or VisitOutcome.NOT_PAID
    if outcome not in VisitOutcome.values:
        raise ValidationFailed({"outcome": ["Choose not paid, not at home or promised."]})
    promised = None
    if outcome == VisitOutcome.PROMISED:
        try:
            promised = dt.date.fromisoformat(str(data.get("promised_on")))
        except ValueError:
            raise ValidationFailed({"promised_on": ["When did they promise to pay?"]}) from None
    loan = _loan(ctx, loan_id)
    _active(loan)
    visit = LendingVisit.objects.create(
        tenant=ctx.tenant,
        created_by=getattr(ctx, "actor", None),
        loan=loan,
        on_date=tenant_today(ctx.tenant),
        outcome=outcome,
        reason=str(data.get("reason") or "").strip()[:REASON_MAX],
        promised_on=promised,
    )
    write_audit(
        ctx=ctx,
        action="lending.visit.created",
        entity_type="lending_visit",
        entity_id=visit.id,
        after={"loan": loan.number, "outcome": outcome, "reason": visit.reason},
    )
    return visit


# ── Today's round (LEN-08) ──────────────────────────────────────────────────


def _reminded_today(tenant: Any, today: dt.date) -> set[Any]:
    """Loans a reminder was recorded for today (L03), in one query."""
    from apps.ledger.models import Reminder
    from apps.ledger.services.reminder_seam import _day_bounds
    from apps.lending.constants import MODULE

    start, end = _day_bounds(tenant, today)
    return set(
        Reminder.objects.for_tenant(tenant)
        .filter(module=MODULE, source_type="lending_loan", sent_at__gte=start, sent_at__lt=end)
        .values_list("source_id", flat=True)
    )


def today_round(tenant: Any, route_id: Any = None) -> dict:
    """Every running loan with something due today or late, in route order, with
    what was collected and any visit note today. Paid stops stay on the list (the
    agent sees the round they walked), counted as done."""
    today = tenant_today(tenant)
    loans = (
        LendingLoan.objects.filter(tenant=tenant, status=LoanStatus.ACTIVE)
        .select_related("party", "borrower", "route")
        .order_by("route__sort_order", "route__name", "route_seq", "number")
    )
    if route_id:
        loans = loans.filter(route_id=route_id)
    collected = {
        r["loan_id"]: r["t"]
        for r in LendingCollection.objects.filter(
            tenant=tenant, collected_on=today, voided_at__isnull=True, is_opening=False
        )
        .values("loan_id")
        .annotate(t=Sum("amount"))
    }
    visits = {
        v.loan_id: v
        for v in LendingVisit.objects.filter(tenant=tenant, on_date=today).order_by("created_at")
    }
    reminded = _reminded_today(tenant, today)
    stops = []
    totals = {"due": ZERO, "collected": ZERO, "stops": 0, "done": 0}
    for loan in loans:
        f = figures(loan, today)
        due_today, arrears = Decimal(f["due_today"]), Decimal(f["arrears"])
        got = Decimal(collected.get(loan.id) or 0)
        if due_today + arrears <= ZERO and got <= ZERO:
            continue
        visit = visits.get(loan.id)
        totals["due"] += due_today + arrears + got
        totals["collected"] += got
        totals["stops"] += 1
        totals["done"] += 1 if (got > ZERO or visit is not None) else 0
        stops.append(
            {
                "loan_id": str(loan.id),
                "number": loan.number,
                "name": loan.party.name,
                "mobile": loan.party.mobile,
                "area": loan.borrower.area,
                "route": loan.route.name if loan.route_id else None,
                "seq": loan.route_seq,
                "frequency": loan.frequency,
                "instalment_amount": f"{loan.instalment_amount:.2f}",
                "due_today": f"{due_today:.2f}",
                "arrears": f"{arrears:.2f}",
                "days_past_due": f["days_past_due"],
                "collected_today": f"{q2(got):.2f}",
                "remaining": f["remaining"],
                "reminded_today": loan.id in reminded,
                "visit": (
                    {
                        "outcome": visit.outcome,
                        "reason": visit.reason,
                        "promised_on": visit.promised_on.isoformat() if visit.promised_on else None,
                    }
                    if visit
                    else None
                ),
            }
        )
    return {
        "on": today.isoformat(),
        # Has this business ever given a loan? An empty round on day one is a
        # first-use screen ("Give your first loan"); an empty round for a lender
        # with a book is "nothing to collect today". The client cannot tell the
        # two apart from an empty list (review §1.1, 12 Oct 2026).
        "has_loans": LendingLoan.objects.filter(tenant=tenant).exists(),
        "stops": stops,
        "totals": {
            "due": f"{q2(totals['due']):.2f}",
            "collected": f"{q2(totals['collected']):.2f}",
            "short": f"{q2(totals['due'] - totals['collected']):.2f}",
            "stops": totals["stops"],
            "done": totals["done"],
        },
    }


def loan_collections(loan: LendingLoan) -> list[dict]:
    from apps.payments.models import Payment

    rows = list(loan.collections.order_by("-collected_on", "-created_at"))
    payments = {p.id: p for p in Payment.objects.filter(pk__in=[r.payment_id for r in rows])}
    out = []
    for r in rows:
        p = payments.get(r.payment_id)
        out.append(
            {
                "id": str(r.id),
                "collected_on": r.collected_on.isoformat(),
                "amount": f"{r.amount:.2f}",
                "mode": p.primary_mode if p else "",
                "reference": p.reference if p else "",
                "note": p.note if p else "",
                # QA F8 — paper-era history: no receipt was ever given for it.
                "receipt_number": "" if r.is_opening else (p.number if p else ""),
                "opening": r.is_opening,
                "voided": r.voided_at is not None,
            }
        )
    return out


def loan_visits(loan: LendingLoan) -> list[dict]:
    return [
        {
            "on_date": v.on_date.isoformat(),
            "outcome": v.outcome,
            "reason": v.reason,
            "promised_on": v.promised_on.isoformat() if v.promised_on else None,
        }
        for v in loan.visits.order_by("-on_date", "-created_at")[:50]
    ]
