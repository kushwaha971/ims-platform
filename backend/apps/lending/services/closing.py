"""Ending a loan that will not be repaid as agreed (FRD lending LEN-10 FR-3, FR-4).

* **Write-off** (owner only, not delegable — R§12): what the borrower still owes on
  this loan is credited off their khata in one line, every instalment not yet paid
  is cancelled so nothing more posts or is reminded, and the loan becomes
  `written_off`. Nothing is deleted: every collection, fee and waiver stays. The
  amount is the one the owner SAW (`amount`, pinned): if a collection moved it in
  between, 409 `balance_changed` with the new figure, the PTY-04 pattern.
  "Still owes" is every open instalment's outstanding plus the PRINCIPAL of every
  future one — the principal is in the khata from the day the cash was handed
  over, while future interest never posted and is simply not charged.
* **Cancel** (owner or admin, `lending.loan.close`): only a loan with no standing
  collection. The loan never happened in the books: status first (the disbursal
  target refuses to unapply a RUNNING loan's payment), then every instalment
  cancelled, every line its schedule posted reversed (interest, fees, late fees,
  waivers, the file charge), and the disbursal payment voided.

A written-off or cancelled loan never reopens (BR-8); reminders already ignore any
loan that is not `active`.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db import transaction

from apps.common.audit import AuditAction, write_audit
from apps.common.dates import tenant_today
from apps.common.exceptions import BusinessRuleViolation, PermissionDenied, ValidationFailed
from apps.common.money import q2
from apps.lending.constants import SOURCE_DEDUCTION, LoanStatus
from apps.lending.models import LendingLoan

ZERO = Decimal("0.00")
SOURCE_WRITE_OFF = "lending_write_off"
WRITE_OFF_REASONS = ("cannot_trace", "death", "bad_debt", "other")
REASON_MIN = 3
REASON_MAX = 255


def _reason(raw: Any) -> str:
    text = " ".join(str(raw or "").split())
    if len(text) < REASON_MIN:
        raise ValidationFailed({"reason": ["Say why, in a few words."]})
    return text[:REASON_MAX]


def _lock(ctx: Any, loan_id: Any) -> tuple[LendingLoan, Any]:
    from apps.common.exceptions import NotFound
    from apps.parties.services.balance import lock_party

    loan = LendingLoan.objects.filter(tenant=ctx.tenant, pk=loan_id).first()
    if loan is None:
        raise NotFound()
    party = lock_party(tenant=ctx.tenant, party_id=loan.party_id)
    loan = LendingLoan.objects.select_for_update().get(pk=loan.pk)
    if loan.status != LoanStatus.ACTIVE:
        raise BusinessRuleViolation(
            "loan_not_active", "This loan is not running.", details={"status": loan.status}
        )
    return loan, party


def _unpaid_dues(loan: LendingLoan) -> list[Any]:
    from apps.dues.models import DuesDue

    return list(
        DuesDue.objects.select_for_update()
        .filter(schedule_id=loan.schedule_id)
        .exclude(status__in=["paid", "cancelled", "skipped"])
        .order_by("due_on", "seq")
    )


def write_off_amount(loan: LendingLoan) -> Decimal:
    """What the borrower's khata still carries for this loan (see the module note)."""
    from apps.dues.constants import OPEN_DUE_STATUSES
    from apps.dues.models import DuesDue, DuesDueComponent
    from apps.dues.services.settlement import outstanding

    total = ZERO
    dues = DuesDue.objects.filter(schedule_id=loan.schedule_id).exclude(
        status__in=["paid", "cancelled", "skipped"]
    )
    for due in dues:
        if due.status in OPEN_DUE_STATUSES:
            total += outstanding(due)
            continue
        row = DuesDueComponent.objects.filter(due=due, component="principal").first()
        if row is not None:
            total += max(Decimal(row.amount) - Decimal(row.waived) - Decimal(row.settled), ZERO)
    return q2(total)


def _cancel_dues(dues: list[Any], reason: str) -> None:
    from apps.dues.models import DuesDue

    DuesDue.objects.filter(pk__in=[d.pk for d in dues]).update(
        status="cancelled", cancel_reason=reason[:120]
    )


def _is_owner(ctx: Any) -> bool:
    from apps.platform_app.models import MembershipStatus

    actor = getattr(ctx, "actor", None)
    return bool(
        actor is not None
        and actor.memberships.filter(
            tenant=ctx.tenant, status=MembershipStatus.ACTIVE, role__code="owner"
        ).exists()
    )


@transaction.atomic
def write_off(*, ctx: Any, loan_id: Any, amount: Any, reason_code: Any, reason: Any) -> dict:
    from apps.ledger.constants import EntryType
    from apps.ledger.services.postings import post_source_entry

    if not _is_owner(ctx):
        raise PermissionDenied("Only the owner can write off a loan.")
    if reason_code not in WRITE_OFF_REASONS:
        raise ValidationFailed({"reason_code": ["Choose a reason."]})
    text = _reason(reason)
    loan, party = _lock(ctx, loan_id)
    dues = _unpaid_dues(loan)
    figure = write_off_amount(loan)
    try:
        pinned = q2(Decimal(str(amount)))
    except Exception:  # noqa: BLE001
        pinned = None
    if pinned != figure:
        raise BusinessRuleViolation(
            "balance_changed",
            "What is owed on this loan has changed. Check the new figure.",
            details={"balance": str(figure)},
        )
    if figure <= ZERO:
        raise BusinessRuleViolation(
            "nothing_to_write_off", "Nothing is owed on this loan.", details={}
        )
    entry, _balance = post_source_entry(
        ctx=ctx,
        party=party,
        amount=figure,
        entry_date=tenant_today(ctx.tenant),
        entry_type=EntryType.ADJUSTMENT_CREDIT,
        source_type=SOURCE_WRITE_OFF,
        source_id=loan.id,
        note=f"Written off · {loan.number}",
        bucket="loan",
    )
    _cancel_dues(dues, "Written off")
    loan.status = LoanStatus.WRITTEN_OFF
    loan.close_reason = "write_off"
    loan.closed_on = tenant_today(ctx.tenant)
    loan.status_reason = f"{reason_code}: {text}"[:REASON_MAX]
    loan.version += 1
    loan.save(
        update_fields=[
            "status",
            "close_reason",
            "closed_on",
            "status_reason",
            "version",
            "updated_at",
        ]
    )
    write_audit(
        ctx=ctx,
        action=AuditAction.LENDING_LOAN_WRITTEN_OFF,
        entity_type="lending_loan",
        entity_id=loan.id,
        after={"status": loan.status, "amount": str(figure)},
        metadata={"reason_code": reason_code, "reason": text, "ledger_entry_id": str(entry.id)},
    )
    return {"amount": str(figure)}


@transaction.atomic
def cancel(*, ctx: Any, loan_id: Any, reason: Any) -> dict:
    from apps.dues.constants import SOURCE_ADJUSTMENT, SOURCE_COMPONENT
    from apps.dues.models import DuesAdjustment, DuesDue, DuesDueComponent
    from apps.ledger.services.postings import reverse_source_entries
    from apps.lending.models import LendingCollection
    from apps.payments.services.void import void_payment

    text = _reason(reason)
    loan, _party = _lock(ctx, loan_id)
    standing = LendingCollection.objects.filter(loan=loan, voided_at__isnull=True).count()
    if standing:
        raise BusinessRuleViolation(
            "loan_has_collections",
            "Money has been collected on this loan, so it cannot be cancelled. Write it off or close it.",
            details={"count": standing},
        )
    loan.status = LoanStatus.CANCELLED
    loan.close_reason = "cancelled"
    loan.closed_on = tenant_today(ctx.tenant)
    loan.status_reason = text
    loan.version += 1
    loan.save(
        update_fields=[
            "status",
            "close_reason",
            "closed_on",
            "status_reason",
            "version",
            "updated_at",
        ]
    )
    dues = list(DuesDue.objects.select_for_update().filter(schedule_id=loan.schedule_id))
    _cancel_dues([d for d in dues if d.status != "cancelled"], "Loan cancelled")
    due_ids = [d.id for d in dues]
    for component_id in DuesDueComponent.objects.filter(
        due_id__in=due_ids, posted_entry_id__isnull=False
    ).values_list("id", flat=True):
        reverse_source_entries(
            ctx=ctx, source_type=SOURCE_COMPONENT, source_id=component_id, reason=text
        )
    for adjustment_id in DuesAdjustment.objects.filter(
        due_id__in=due_ids, posted_entry_id__isnull=False
    ).values_list("id", flat=True):
        reverse_source_entries(
            ctx=ctx, source_type=SOURCE_ADJUSTMENT, source_id=adjustment_id, reason=text
        )
    for deduction_id in loan.deductions.values_list("id", flat=True):
        reverse_source_entries(
            ctx=ctx, source_type=SOURCE_DEDUCTION, source_id=deduction_id, reason=text
        )
    if loan.disbursal_payment_id is not None:
        void_payment(ctx=ctx, payment_id=loan.disbursal_payment_id, reason=text)
    write_audit(
        ctx=ctx,
        action=AuditAction.LENDING_LOAN_CANCELLED,
        entity_type="lending_loan",
        entity_id=loan.id,
        after={"status": loan.status},
        metadata={"reason": text},
    )
    return {"status": loan.status}
