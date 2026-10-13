"""One cash handover for several loans: "Collect from Geeta" (review L5, 12 Oct 2026).

A borrower with two running loans hands over ₹650 at the door. Every money path
in this module is per LOAN, and stays so: this service only decides how the
amount is SPLIT across the person's running loans, and then records one ordinary
collection per loan through `collections.collect` — the same payment, the same
allocation oldest instalment first, the same receipt number per loan. Nothing
here touches the dues or the ledger directly.

The rule, which the screen states before anything is saved:

1. first what is due NOW on each loan (late instalments and today's), the loan
   whose oldest unpaid instalment is oldest first;
2. then, if money is left, ahead on each loan in the same order, up to what is
   left on it;
3. more than everything left on all the person's running loans is refused.

The split shown is the split saved. The client sends back the split it showed;
if a collection on one of the loans (from another phone, say) has changed the
answer in between, the save is refused with the fresh split, so the merchant
never records a division they were not shown.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction

from apps.common.dates import tenant_today
from apps.common.exceptions import BusinessRuleViolation, NotFound, ValidationFailed
from apps.common.money import ZERO, q2
from apps.lending.constants import LoanStatus
from apps.lending.models import LendingBorrower, LendingLoan
from apps.lending.services import collections
from apps.lending.services.loans import figures


def _borrower(ctx: Any, borrower_id: Any) -> LendingBorrower:
    try:
        return LendingBorrower.objects.select_related("party").get(
            tenant=ctx.tenant, pk=borrower_id
        )
    except (LendingBorrower.DoesNotExist, ValidationError, ValueError, TypeError) as exc:
        raise NotFound("Borrower not found.") from exc


def _oldest_open(f: dict, today: dt.date) -> dt.date:
    """The date of the loan's oldest unpaid instalment: the order loans are paid in."""
    if f["days_past_due"]:
        return today - dt.timedelta(days=f["days_past_due"])
    if Decimal(f["due_today"]) > ZERO:
        return today
    return dt.date.fromisoformat(f["next_due_on"]) if f["next_due_on"] else dt.date.max


def plan(*, ctx: Any, borrower_id: Any, amount: Any) -> dict:
    """The split of `amount` across the borrower's running loans; records nothing."""
    borrower = _borrower(ctx, borrower_id)
    value = collections._amount(amount)
    today = tenant_today(ctx.tenant)
    loans = list(
        LendingLoan.objects.filter(
            tenant=ctx.tenant, borrower=borrower, status=LoanStatus.ACTIVE
        ).order_by("number")
    )
    rows = []
    for loan in loans:
        f = figures(loan, today)
        left = collections.remaining(loan)
        if left <= ZERO:
            continue
        rows.append(
            {
                "loan": loan,
                "now": min(q2(Decimal(f["due_today"]) + Decimal(f["arrears"])), left),
                "left": left,
                "late": Decimal(f["arrears"]) > ZERO,
                "order": (_oldest_open(f, today), loan.number),
                "share": ZERO,
            }
        )
    if not rows:
        raise BusinessRuleViolation(
            "lending_nothing_due",
            f"{borrower.party.name} has no running loan with anything left to pay.",
            details={"borrower_id": str(borrower.id)},
        )
    total_left = q2(sum((r["left"] for r in rows), ZERO))
    if value > total_left:
        raise BusinessRuleViolation(
            "collection_over_payoff",
            f"This is more than the ₹{total_left:,.2f} left on all of "
            f"{borrower.party.name}'s loans.",
            details={"payoff": f"{total_left:.2f}", "amount": f"{value:.2f}"},
        )
    rows.sort(key=lambda r: r["order"])
    rest = value
    for cap in ("now", "left"):
        for r in rows:
            take = min(rest, r[cap] - r["share"])
            if take > ZERO:
                r["share"] += take
                rest -= take
    return {
        "borrower_id": str(borrower.id),
        "name": borrower.party.name,
        "amount": f"{value:.2f}",
        "left_after": f"{q2(total_left - value):.2f}",
        "loans": [
            {
                "loan_id": str(r["loan"].id),
                "number": r["loan"].number,
                "amount": f"{q2(r['share']):.2f}",
                "due_now": f"{r['now']:.2f}",
                "late": r["late"],
                "left_after": f"{q2(r['left'] - r['share']):.2f}",
            }
            for r in rows
        ],
    }


def _shares(result: dict) -> dict[str, str]:
    return {row["loan_id"]: row["amount"] for row in result["loans"] if Decimal(row["amount"])}


@transaction.atomic
def collect(*, ctx: Any, borrower_id: Any, data: Any) -> dict:
    """`POST /lending/borrowers/<id>/collections` — one collection per loan, all or none."""
    from apps.parties.services.balance import lock_party

    data = data if isinstance(data, dict) else {}
    borrower = _borrower(ctx, borrower_id)
    # Every loan of one borrower posts to the same party: holding it for the
    # whole split means no other collection can move a figure the split read.
    lock_party(tenant=ctx.tenant, party_id=borrower.party_id)
    fresh = plan(ctx=ctx, borrower_id=borrower_id, amount=data.get("amount"))
    shown = data.get("split")
    if not isinstance(shown, list):
        raise ValidationFailed({"split": ["Send the split that was shown."]})
    try:
        shown_shares = {
            str(row["loan_id"]): f"{q2(Decimal(str(row['amount']))):.2f}"
            for row in shown
            if Decimal(str(row["amount"]))
        }
    except (KeyError, TypeError, ArithmeticError, ValueError):
        raise ValidationFailed({"split": ["Send the split that was shown."]}) from None
    if shown_shares != _shares(fresh):
        raise BusinessRuleViolation(
            "balance_changed",
            "Something was collected on these loans meanwhile. Check the new split.",
            details={"split": fresh},
        )
    recorded = [
        collections.collect(
            ctx=ctx,
            loan_id=row["loan_id"],
            data={
                "amount": row["amount"],
                "mode": data.get("mode"),
                "reference": data.get("reference"),
                "note": data.get("note"),
                # QA B45 — every loan's share on the day the money was really taken.
                "collected_on": data.get("collected_on"),
            },
        )
        | {"loan_id": row["loan_id"], "number": row["number"]}
        for row in fresh["loans"]
        if Decimal(row["amount"])
    ]
    return {"amount": fresh["amount"], "left_after": fresh["left_after"], "collections": recorded}
