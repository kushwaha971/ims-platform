"""The counter: issue, return, renew, cancel, change due (LIB-06; task B09).

── Locks (BR-1, BR-2) ─────────────────────────────────────────────────────────
party → membership → copy (→ title, inside `move_copy`) → loan → charges → sequence.
Two desks issuing one copy serialise on the copy row, and the partial unique index
`uq_library_loan_open_copy` refuses a second open loan from any writer (BR-6).

── The server decides (BR-8) ──────────────────────────────────────────────────
Every block is computed here, under the locks, from what is committed; the
counter only shows the last answer. A refusal carries what the screen needs to
say the way forward (`blocks`, `with`, `held_for`, `reason`).

── Fines (LIB-07) ─────────────────────────────────────────────────────────────
Charged at the moment the copy comes back (or is renewed while overdue), from the
loan's own rule snapshot and the calendar as it is on that day (BR-3), through
B10's calculator and `create_charge`. Never accrued nightly; `fine_so_far` on a
row is computed, not stored.

Holds (`on_hold_shelf`, a waiting hold refusing a renewal, a return routing to the
hold shelf) arrive with B11, which owns `library_hold`; damage at return and lost
and found are B10b's.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from django.db import IntegrityError, transaction
from django.db.models import Count
from django.db.models.functions import Upper
from django.utils import timezone

from apps.common.audit import AuditAction, write_audit
from apps.common.dates import tenant_today
from apps.common.exceptions import BusinessRuleViolation, NotFound, ValidationFailed
from apps.common.money import ZERO
from apps.library.constants import (
    REASON_MAX,
    WAIVER_REASON_MIN,
    ChargeKind,
    CopyEventReason,
    CopyStatus,
    LoanEventKind,
    LoanStatus,
    OverdueIssueRule,
    RenewOverdue,
)
from apps.library.models import (
    LibraryCharge,
    LibraryCopy,
    LibraryLoan,
    LibraryLoanEvent,
    LibraryLoanRule,
    LibraryMembership,
)
from apps.library.services import codes, copy_status, due_dates
from apps.library.services.charges import create_charge
from apps.library.services.fields import Errors, date, text, uuid_or_none
from apps.library.services.fines import FineCalc, calculate_fine
from apps.library.services.members import effective_status, member_blocks
from apps.library.services.rules import resolve_rule

OVERRIDE = "library.loan.override"
ADJUST = "library.loan.adjust"


# ── Helpers ─────────────────────────────────────────────────────────────────


def actor_can(ctx: Any, codename: str) -> bool:
    """Does the signed-in member hold `codename` here? (A body field — `override_reason`,
    a past `returned_on` — asks for more than the endpoint's own codename.)"""
    from apps.common.permissions_registry import permissions_for
    from apps.platform_app.models import Membership, MembershipStatus

    if ctx.actor is None:
        return False
    membership = Membership.objects.filter(
        user=ctx.actor, tenant=ctx.tenant, status=MembershipStatus.ACTIVE
    ).first()
    return membership is not None and codename in permissions_for(membership)


def _settings(tenant: Any) -> Any:
    from apps.library.services.settings import settings_for

    return settings_for(tenant)


def _copy_by(ctx: Any, data: dict, *, lock: bool) -> LibraryCopy:
    """`copy_id`, or a `code` that is an accession number or a barcode (BR-8 order)."""
    qs = LibraryCopy.objects.filter(tenant=ctx.tenant).select_related("title")
    if lock:
        qs = qs.select_for_update(of=("self",))
    if data.get("copy_id"):
        pk = uuid_or_none(data.get("copy_id"))
        row = qs.filter(pk=pk).first() if pk else None
    else:
        key = codes.number_key(str(data.get("code") or ""))
        row = None
        if key:
            row = (
                qs.annotate(k=Upper("accession_number")).filter(k=key).first()
                or qs.annotate(k=Upper("barcode")).filter(k=key).first()
            )
    if row is None:
        raise NotFound("No book with this number.")
    return row


def _lock_member(ctx: Any, membership_id: Any) -> LibraryMembership:
    from apps.parties.services.balance import lock_party

    pk = uuid_or_none(membership_id)
    peek = LibraryMembership.objects.filter(tenant=ctx.tenant, pk=pk).first() if pk else None
    if peek is None:
        raise NotFound("No such member.")
    lock_party(tenant=ctx.tenant, party_id=peek.party_id)
    return (
        LibraryMembership.objects.select_for_update(of=("self",))
        .select_related("party", "membership_type")
        .get(pk=peek.pk)
    )


def _event(
    ctx: Any,
    loan: LibraryLoan,
    kind: str,
    on: dt.date,
    *,
    reason: str = "",
    from_due: dt.date | None = None,
    to_due: dt.date | None = None,
    charge: Any = None,
    blocks: list[str] | None = None,
) -> None:
    LibraryLoanEvent.objects.create(
        tenant=ctx.tenant,
        created_by=getattr(ctx, "actor", None),
        loan=loan,
        kind=kind,
        on_date=on,
        reason=reason,
        from_due=from_due,
        to_due=to_due,
        charge=charge,
        blocks_overridden=blocks or [],
    )


def open_loans(m: LibraryMembership) -> Any:
    return LibraryLoan.objects.filter(membership=m, status=LoanStatus.OPEN)


def loan_blocks(m: LibraryMembership, today: dt.date, numbers: Any = None) -> list[dict]:
    """BR-10's two loan blocks, from the member's figures (`members.figures`)."""
    from apps.library.services.members import figures

    numbers = numbers or figures(m, today)
    settings = _settings(m.tenant)
    blocks: list[dict] = []
    held = numbers.loans_open
    if settings.lost_counts_toward_limit:  # BR-7, D18
        held += numbers.lost_unsettled
    if held >= m.membership_type.max_copies:
        blocks.append(
            {
                "code": "copy_limit_reached",
                "overridable": True,
                "params": {"held": held, "max": m.membership_type.max_copies},
            }
        )
    if numbers.loans_overdue and settings.overdue_issue_rule == OverdueIssueRule.BLOCK:
        blocks.append(
            {"code": "has_overdue", "overridable": True, "params": {"count": numbers.loans_overdue}}
        )
    return blocks


def fine_for(loan: LibraryLoan, on: dt.date) -> FineCalc:
    """LIB-07 §9 for this loan returned (or renewed, or lost) on `on`."""
    from apps.platform_app.services.calendar import closed_days_between

    settings = _settings(loan.tenant)
    closed = (
        closed_days_between(loan.tenant, loan.due_on + dt.timedelta(days=1), on, module="library")
        if on > loan.due_on and settings.fine_skip_closed_days
        else set()
    )
    already = sum(
        (
            Decimal(c.amount)
            for c in loan.charges.filter(kind=ChargeKind.OVERDUE_FINE, reversed_at__isnull=True)
        ),
        ZERO,
    )
    return calculate_fine(
        due_on=loan.due_on,
        returned_on=on,
        closed=closed,
        skip_closed=settings.fine_skip_closed_days,
        fine_per_day=Decimal(loan.fine_per_day),
        grace_days=loan.grace_days,
        fine_cap=loan.fine_cap,
        price=loan.copy.price,
        fallback_price=settings.fallback_price,
        already_charged=already,
        rounding=settings.fine_rounding,
    )


def _charge_fine(ctx: Any, loan: LibraryLoan, calc: FineCalc, on: dt.date) -> LibraryCharge | None:
    if calc.amount <= ZERO:
        return None  # EC-2: no fine, no charge
    charge = create_charge(
        ctx=ctx,
        membership=loan.membership,
        kind=ChargeKind.OVERDUE_FINE,
        amount=calc.amount,
        description=(
            f"Overdue fine – {loan.copy.title.title} ({loan.copy.accession_number}), "
            f"{calc.days_late} days"
        ),
        charge_date=on,
        copy=loan.copy,
        fine_days=calc.days_late,
        fine_rate=calc.rate,
    )
    LibraryCharge.objects.filter(pk=charge.pk).update(loan=loan)
    charge.loan = loan
    return charge


def loan_json(loan: LibraryLoan, today: dt.date) -> dict:
    overdue = max((today - loan.due_on).days, 0) if loan.status == LoanStatus.OPEN else 0
    so_far = (
        f"{fine_for(loan, today).amount:.2f}"
        if loan.status == LoanStatus.OPEN and overdue
        else "0.00"
    )
    return {
        "id": str(loan.id),
        "copy": {
            "id": str(loan.copy_id),
            "accession_number": loan.copy.accession_number,
            "title": loan.copy.title.title,
            "authors": loan.copy.title.authors,
        },
        "membership": {
            "id": str(loan.membership_id),
            "member_number": loan.membership.member_number,
            "name": loan.membership.party.name,
            "group_label": loan.membership.group_label,
        },
        "issued_on": loan.issued_on.isoformat(),
        "due_on": loan.due_on.isoformat(),
        "returned_on": loan.returned_on.isoformat() if loan.returned_on else None,
        "status": loan.status,
        "renew_count": loan.renew_count,
        "max_renewals": loan.max_renewals,
        "days_overdue": overdue,
        "fine_so_far": so_far,
        "override_reason": loan.override_reason,
        "version": loan.version,
    }


def _loaded(loan_id: Any) -> LibraryLoan:
    return LibraryLoan.objects.select_related(
        "copy__title", "membership__party", "membership__membership_type"
    ).get(pk=loan_id)


# ── Issue (FR-3, FR-4, BR-1) ────────────────────────────────────────────────


@transaction.atomic
def issue(*, ctx: Any, data: Any) -> dict:
    """`POST /library/loans`. Returns `{loan, member, warnings, due_moved_from}`."""
    if not isinstance(data, dict):
        raise ValidationFailed({"non_field_errors": ["Expected an object."]})
    errors = Errors()
    override = text(errors, data, "override_reason", REASON_MAX)
    if override and len(override) < WAIVER_REASON_MIN:
        errors.add("override_reason", "Say why in a few words.")
    errors.raise_if_any()
    if override and not actor_can(ctx, OVERRIDE):
        raise BusinessRuleViolation(
            "permission_denied",
            "Only someone allowed to override can lend past a block.",
            details={},
        )
    m = _lock_member(ctx, data.get("membership_id"))
    copy = _copy_by(ctx, data, lock=True)
    today = tenant_today(ctx.tenant)

    status = effective_status(m, today)
    if status != "active":
        raise BusinessRuleViolation(
            "library_membership_inactive",
            {
                "expired": "This membership has expired. Renew it first.",
                "suspended": "This membership is suspended. Reactivate it first.",
                "closed": "This membership is closed.",
            }[status],
            details={
                "effective_status": status,
                "valid_until": m.valid_until.isoformat() if m.valid_until else None,
            },
        )
    if copy.status != CopyStatus.AVAILABLE:
        details: dict[str, Any] = {"status": copy.status}
        if copy.status == CopyStatus.ON_LOAN:
            current = (
                LibraryLoan.objects.filter(copy=copy, status=LoanStatus.OPEN)
                .select_related("membership__party")
                .first()
            )
            if current is not None:
                details["with"] = {
                    "name": current.membership.party.name,
                    "member_number": current.membership.member_number,
                    "due_on": current.due_on.isoformat(),
                    "membership_id": str(current.membership_id),
                }
        raise BusinessRuleViolation(
            "library_copy_unavailable", "This copy is not available.", details=details
        )

    rules = list(LibraryLoanRule.objects.filter(tenant=ctx.tenant))
    rule = resolve_rule(
        m.membership_type, rules, copy.title.material_type, is_reference=copy.is_reference
    )
    blocks = member_blocks(m, today)
    if not rule.loanable:
        blocks.append(
            {
                "code": "not_loanable",
                "overridable": True,
                "params": {"material_type": copy.title.material_type},
            }
        )
    final = [b for b in blocks if not b["overridable"]]
    if final:
        raise BusinessRuleViolation(
            "library_member_blocked",
            "This member cannot borrow right now.",
            details={"blocks": blocks, "override_permission": OVERRIDE},
        )
    if blocks and not override:
        raise BusinessRuleViolation(
            "library_member_blocked",
            "This member cannot borrow right now.",
            details={"blocks": blocks, "override_permission": OVERRIDE},
        )

    due_on, moved_from = due_dates.due_on_for_issue(
        ctx.tenant, issued_on=today, loan_days=rule.loan_days
    )
    try:
        with transaction.atomic():
            loan = LibraryLoan.objects.create(
                tenant=ctx.tenant,
                created_by=getattr(ctx, "actor", None),
                copy=copy,
                membership=m,
                party_id=m.party_id,
                issued_on=today,
                issued_at=timezone.now(),
                due_on=due_on,
                loan_days=rule.loan_days,
                fine_per_day=rule.fine_per_day,
                fine_cap=rule.fine_cap,
                grace_days=rule.grace_days,
                max_renewals=rule.max_renewals,
                override_reason=override or "",
            )
    except IntegrityError:  # BR-6: another desk issued it a moment ago
        raise BusinessRuleViolation(
            "library_copy_unavailable", "This copy is not available.", details={"status": "on_loan"}
        ) from None
    copy_status.move_copy(
        ctx=ctx,
        copy=copy,
        to_status=CopyStatus.ON_LOAN,
        reason_code=CopyEventReason.ISSUED,
        on_date=today,
        source_type="library_loan",
        source_id=loan.id,
    )
    LibraryCopy.objects.filter(pk=copy.pk, issued_ever=False).update(issued_ever=True)
    _event(ctx, loan, LoanEventKind.ISSUED, today, to_due=due_on)
    codes_overridden = [b["code"] for b in blocks]
    if codes_overridden:
        _event(
            ctx,
            loan,
            LoanEventKind.OVERRIDDEN,
            today,
            reason=override or "",
            blocks=codes_overridden,
        )
        write_audit(
            ctx=ctx,
            action=AuditAction.LIBRARY_LOAN_OVERRIDDEN,
            entity_type="library_loan",
            entity_id=loan.id,
            after={"blocks": codes_overridden, "reason": override},
        )
    write_audit(
        ctx=ctx,
        action=AuditAction.LIBRARY_LOAN_ISSUED,
        entity_type="library_loan",
        entity_id=loan.id,
        after={
            "copy": copy.accession_number,
            "member": m.member_number,
            "due_on": due_on.isoformat(),
        },
    )
    warnings = []
    if m.valid_until is not None and m.valid_until < due_on:
        warnings.append({"code": "expires_before_due", "valid_until": m.valid_until.isoformat()})
    return {
        "loan": _loaded(loan.id),
        "member": m,
        "warnings": warnings,
        "due_moved_from": moved_from,
    }


# ── Return (FR-5, BR-2) ─────────────────────────────────────────────────────


@transaction.atomic
def return_copy(*, ctx: Any, data: Any) -> dict:
    """`POST /library/returns`: by copy alone; the fine is charged at once."""
    from apps.parties.services.balance import lock_party

    if not isinstance(data, dict):
        raise ValidationFailed({"non_field_errors": ["Expected an object."]})
    from apps.library.services.losses import apply_damage, clean_damage

    today = tenant_today(ctx.tenant)
    errors = Errors()
    returned_on = date(errors, data, "returned_on") or today
    if returned_on > today:
        errors.add("returned_on", "A return cannot be in the future.")
    damage = clean_damage(errors, data)
    errors.raise_if_any()
    if returned_on < today and not actor_can(ctx, ADJUST):
        raise BusinessRuleViolation(
            "permission_denied",
            "Only someone allowed to adjust loans can backdate a return.",
            details={},
        )
    peek = _copy_by(ctx, data, lock=False)
    loan_peek = LibraryLoan.objects.filter(copy=peek, status=LoanStatus.OPEN).first()
    if loan_peek is None:
        if peek.status == CopyStatus.AVAILABLE:  # EC-1: already on the shelf — it was seen
            LibraryCopy.objects.filter(pk=peek.pk).update(last_seen_on=today)
        raise BusinessRuleViolation(
            "library_copy_not_on_loan",
            "This copy is not on loan.",
            details={
                "status": peek.status,
                "offer_found": peek.status in (CopyStatus.LOST, CopyStatus.MISSING),
            },
        )
    lock_party(tenant=ctx.tenant, party_id=loan_peek.party_id)
    LibraryMembership.objects.select_for_update(of=("self",)).get(pk=loan_peek.membership_id)
    copy = _copy_by(ctx, {"copy_id": peek.id}, lock=True)
    loan = (
        LibraryLoan.objects.select_for_update(of=("self",))
        .select_related("membership__party", "copy__title")
        .get(pk=loan_peek.pk)
    )
    if loan.status != LoanStatus.OPEN:
        raise BusinessRuleViolation(
            "library_copy_not_on_loan", "This copy is not on loan.", details={"status": copy.status}
        )
    last_change = (
        loan.events.filter(kind__in=[LoanEventKind.RENEWED, LoanEventKind.ISSUED])
        .order_by("-on_date")
        .values_list("on_date", flat=True)
        .first()
    )
    if returned_on < loan.issued_on or (last_change and returned_on < last_change):
        raise ValidationFailed(
            {
                "returned_on": [
                    f"The book was last issued or renewed on {last_change or loan.issued_on}."
                ]
            }
        )
    calc = fine_for(loan, returned_on)
    charge = _charge_fine(ctx, loan, calc, returned_on)
    damage_charge, to_status = (
        apply_damage(ctx, loan, damage, returned_on)
        if damage
        else (None, CopyStatus.AVAILABLE.value)
    )
    loan.status = LoanStatus.RETURNED
    loan.returned_on = returned_on
    loan.returned_at = timezone.now()
    loan.version += 1
    loan.save(update_fields=["status", "returned_on", "returned_at", "version", "updated_at"])
    copy_status.move_copy(
        ctx=ctx,
        copy=copy,
        to_status=to_status,
        reason_code=CopyEventReason.RETURNED,
        on_date=returned_on,
        note=(damage or {}).get("note", ""),
        source_type="library_loan",
        source_id=loan.id,
        withdrawn_reason="damaged" if to_status == CopyStatus.WITHDRAWN else None,
    )
    LibraryCopy.objects.filter(pk=copy.pk).update(last_seen_on=returned_on)
    _event(ctx, loan, LoanEventKind.RETURNED, returned_on, charge=charge)
    write_audit(
        ctx=ctx,
        action=AuditAction.LIBRARY_LOAN_RETURNED,
        entity_type="library_loan",
        entity_id=loan.id,
        after={"returned_on": returned_on.isoformat(), "fine": f"{calc.amount:.2f}"},
    )
    return {
        "loan": _loaded(loan.id),
        "member": loan.membership,
        "fine": calc if calc.calendar_days else None,
        "charges": [c for c in (charge, damage_charge) if c is not None],
        "copy_status": to_status,
    }


# ── Renew (FR-8, BR-3) ──────────────────────────────────────────────────────


def _renewal_refused(
    reason: str, message: str, *, overridable: bool = False
) -> BusinessRuleViolation:
    return BusinessRuleViolation(
        "library_renewal_refused",
        message,
        details={"reason": reason, "overridable": overridable},
    )


def _renew_locked(ctx: Any, loan: LibraryLoan, today: dt.date, override: str | None) -> dict:
    m = loan.membership
    if loan.status != LoanStatus.OPEN:
        raise BusinessRuleViolation(
            "library_loan_not_open", "This loan is already closed.", details={"status": loan.status}
        )
    if loan.renew_count >= loan.max_renewals:
        raise _renewal_refused("max_renewals", "This book has been renewed as often as it can be.")
    status = effective_status(m, today)
    # A renewal adds no book, so the copy limit is not its business, and an overdue loan is
    # decided below by `renew_overdue` rather than by the issue rule.
    blocks = [
        b
        for b in member_blocks(m, today)
        if b["code"] not in ("membership_expired", "copy_limit_reached", "has_overdue")
    ]
    if status != "active" or any(not b["overridable"] for b in blocks):
        raise _renewal_refused("member_blocked", "This member cannot renew right now.")
    overridable = [b for b in blocks if b["overridable"]]
    if overridable and not override:
        raise _renewal_refused(
            "member_blocked", "This member cannot renew right now.", overridable=True
        )
    charge = None
    settings = _settings(ctx.tenant)
    if loan.due_on < today:
        calc = fine_for(loan, today)
        if calc.days_late > loan.grace_days:
            if settings.renew_overdue == RenewOverdue.BLOCK:
                raise _renewal_refused("overdue_blocked", "Return the overdue book instead.")
            charge = _charge_fine(ctx, loan, calc, today)
    old_due = loan.due_on
    new_due, _moved = due_dates.renewal_due_on(
        ctx.tenant,
        renewal_day=today,
        old_due_on=old_due,
        loan_days=loan.loan_days,
        renew_from=settings.renew_from,
    )
    loan.due_on = new_due
    loan.renew_count += 1
    loan.version += 1
    loan.save(update_fields=["due_on", "renew_count", "version", "updated_at"])
    _event(ctx, loan, LoanEventKind.RENEWED, today, from_due=old_due, to_due=new_due, charge=charge)
    write_audit(
        ctx=ctx,
        action=AuditAction.LIBRARY_LOAN_RENEWED,
        entity_type="library_loan",
        entity_id=loan.id,
        before={"due_on": old_due.isoformat()},
        after={"due_on": new_due.isoformat(), "renew_count": loan.renew_count},
    )
    return {"loan": _loaded(loan.id), "member": m, "fine_charge": charge}


def _lock_loan(ctx: Any, loan_id: Any) -> LibraryLoan:
    from apps.parties.services.balance import lock_party

    pk = uuid_or_none(loan_id)
    peek = LibraryLoan.objects.filter(tenant=ctx.tenant, pk=pk).first() if pk else None
    if peek is None:
        raise NotFound()
    lock_party(tenant=ctx.tenant, party_id=peek.party_id)
    LibraryMembership.objects.select_for_update(of=("self",)).get(pk=peek.membership_id)
    LibraryCopy.objects.select_for_update(of=("self",)).get(pk=peek.copy_id)
    return (
        LibraryLoan.objects.select_for_update(of=("self",))
        .select_related("copy__title", "membership__party", "membership__membership_type")
        .get(pk=peek.pk)
    )


@transaction.atomic
def renew(*, ctx: Any, loan_id: Any, data: Any) -> dict:
    data = data if isinstance(data, dict) else {}
    override = (data.get("override_reason") or "").strip() or None
    if override and not actor_can(ctx, OVERRIDE):
        raise BusinessRuleViolation(
            "permission_denied",
            "Only someone allowed to override can renew past a block.",
            details={},
        )
    loan = _lock_loan(ctx, loan_id)
    return _renew_locked(ctx, loan, tenant_today(ctx.tenant), override)


def renew_all(*, ctx: Any, membership_id: Any) -> dict:
    """FR-8 "Renew all": every open loan that can be, each in its own savepoint."""
    pk = uuid_or_none(membership_id)
    m = LibraryMembership.objects.filter(tenant=ctx.tenant, pk=pk).first() if pk else None
    if m is None:
        raise NotFound()
    renewed, refused = [], []
    for loan_id in open_loans(m).order_by("due_on", "id").values_list("id", flat=True):
        try:
            with transaction.atomic():
                renewed.append(renew(ctx=ctx, loan_id=loan_id, data={})["loan"])
        except BusinessRuleViolation as exc:
            refused.append({"loan_id": str(loan_id), "reason": exc.details.get("reason", exc.code)})
    return {"renewed": renewed, "refused": refused}


# ── Cancel issue, change due (FR-10, D20; LIB-05 FR-8) ──────────────────────


@transaction.atomic
def cancel(*, ctx: Any, loan_id: Any, data: Any) -> dict:
    """BR-4: the same business day, never renewed or returned; the copy goes back exactly."""
    data = data if isinstance(data, dict) else {}
    errors = Errors()
    reason = text(errors, data, "reason", REASON_MAX, required=True)
    errors.raise_if_any()
    loan = _lock_loan(ctx, loan_id)
    today = tenant_today(ctx.tenant)
    if loan.status != LoanStatus.OPEN or loan.renew_count or loan.issued_on != today:
        raise BusinessRuleViolation(
            "library_cancel_window_passed",
            "This issue can no longer be undone.",
            details={"issued_on": loan.issued_on.isoformat()},
        )
    loan.status = LoanStatus.CANCELLED
    loan.version += 1
    loan.save(update_fields=["status", "version", "updated_at"])
    copy_status.move_copy(
        ctx=ctx,
        copy=loan.copy,
        to_status=CopyStatus.AVAILABLE,
        reason_code=CopyEventReason.CANCELLED_ISSUE,
        on_date=today,
        source_type="library_loan",
        source_id=loan.id,
    )
    _event(ctx, loan, LoanEventKind.CANCELLED, today, reason=reason or "")
    write_audit(
        ctx=ctx,
        action=AuditAction.LIBRARY_LOAN_CANCELLED,
        entity_type="library_loan",
        entity_id=loan.id,
        after={"reason": reason},
    )
    return {"loan": _loaded(loan.id), "member": loan.membership}


@transaction.atomic
def change_due(*, ctx: Any, loan_id: Any, data: Any) -> dict:
    """`library.loan.adjust`: one loan's due date with a reason, moved off closed days."""
    data = data if isinstance(data, dict) else {}
    errors = Errors()
    wanted = date(errors, data, "due_on")
    reason = text(errors, data, "reason", REASON_MAX, required=True)
    if wanted is None and "due_on" not in errors:
        errors.add("due_on", "This field is required.")
    errors.raise_if_any()
    loan = _lock_loan(ctx, loan_id)
    if loan.status != LoanStatus.OPEN:
        raise BusinessRuleViolation(
            "library_loan_not_open", "This loan is already closed.", details={"status": loan.status}
        )
    assert wanted is not None
    if wanted < loan.issued_on:
        raise ValidationFailed({"due_on": ["The due date cannot be before the issue date."]})
    from apps.platform_app.services.calendar import SEARCH_HORIZON_DAYS, closed_days_between

    closed = closed_days_between(
        ctx.tenant, wanted, wanted + dt.timedelta(days=SEARCH_HORIZON_DAYS), module="library"
    )
    due_on, moved_from = due_dates.compute_due(wanted, closed)
    old = loan.due_on
    loan.due_on = due_on
    loan.version += 1
    loan.save(update_fields=["due_on", "version", "updated_at"])
    today = tenant_today(ctx.tenant)
    _event(
        ctx,
        loan,
        LoanEventKind.DUE_CHANGED,
        today,
        reason=reason or "",
        from_due=old,
        to_due=due_on,
    )
    write_audit(
        ctx=ctx,
        action=AuditAction.LIBRARY_LOAN_DUE_CHANGED,
        entity_type="library_loan",
        entity_id=loan.id,
        before={"due_on": old.isoformat()},
        after={"due_on": due_on.isoformat(), "reason": reason},
    )
    return {"loan": _loaded(loan.id), "member": loan.membership, "due_moved_from": moved_from}


# ── Holidays over due dates (LIB-05 FR-6, G18) ──────────────────────────────


def due_on_between(tenant: Any, start: dt.date, end: dt.date) -> dict:
    """`GET /library/loans/due-on`: open loans falling due in `[start, end]`, by date."""
    from apps.platform_app.services.calendar import SEARCH_HORIZON_DAYS, closed_days_between

    rows = (
        LibraryLoan.objects.filter(
            tenant=tenant, status=LoanStatus.OPEN, due_on__gte=start, due_on__lte=end
        )
        .values("due_on")
        .annotate(n=Count("id"))
        .order_by("due_on")
    )
    by_date = {r["due_on"].isoformat(): r["n"] for r in rows}
    after = end + dt.timedelta(days=1)
    closed = closed_days_between(
        tenant, after, after + dt.timedelta(days=SEARCH_HORIZON_DAYS), module="library"
    )
    next_open, _ = due_dates.compute_due(after, closed)
    return {
        "count": sum(by_date.values()),
        "by_date": by_date,
        "next_open_day": next_open.isoformat(),
    }


@transaction.atomic
def shift_due(*, ctx: Any, data: Any) -> dict:
    """`POST /library/loans/shift-due {from, to, reason}`: move every open loan due in the
    closure to the next open day after it, each with a `due_changed` event (FR-6)."""
    data = data if isinstance(data, dict) else {}
    errors = Errors()
    start = date(errors, data, "from")
    end = date(errors, data, "to")
    reason = text(errors, data, "reason", REASON_MAX, required=True)
    if start is None and "from" not in errors:
        errors.add("from", "This field is required.")
    errors.raise_if_any()
    assert start is not None
    end = end or start
    info = due_on_between(ctx.tenant, start, end)
    target = dt.date.fromisoformat(info["next_open_day"])
    today = tenant_today(ctx.tenant)
    moved = 0
    for loan in LibraryLoan.objects.select_for_update().filter(
        tenant=ctx.tenant, status=LoanStatus.OPEN, due_on__gte=start, due_on__lte=end
    ):
        old = loan.due_on
        LibraryLoan.objects.filter(pk=loan.pk).update(due_on=target, version=loan.version + 1)
        _event(
            ctx,
            loan,
            LoanEventKind.DUE_CHANGED,
            today,
            reason=f"Library closed: {reason}"[:REASON_MAX],
            from_due=old,
            to_due=target,
        )
        moved += 1
    return {"moved": moved, "to": target.isoformat()}


def due_date_preview(tenant: Any, membership_id: Any, copy_id: Any, on: dt.date) -> dict:
    """`GET /library/due-date-preview`: what an issue now would set, and why."""
    m = (
        LibraryMembership.objects.filter(tenant=tenant, pk=uuid_or_none(membership_id))
        .select_related("membership_type")
        .first()
    )
    copy = (
        LibraryCopy.objects.filter(tenant=tenant, pk=uuid_or_none(copy_id))
        .select_related("title")
        .first()
    )
    if m is None or copy is None:
        raise NotFound()
    rule = resolve_rule(
        m.membership_type,
        list(LibraryLoanRule.objects.filter(tenant=tenant)),
        copy.title.material_type,
        is_reference=copy.is_reference,
    )
    due_on, moved_from = due_dates.due_on_for_issue(tenant, issued_on=on, loan_days=rule.loan_days)
    out = {
        "due_on": due_on.isoformat(),
        "rule": {"loan_days": rule.loan_days, "source": rule.source},
    }
    if moved_from is not None:
        out["moved_from"] = moved_from.isoformat()
    return out


def loans_filtered(tenant: Any, params: Any, today: dt.date) -> Any:
    """`GET /library/loans`."""
    errors: dict[str, list[str]] = {}
    qs = LibraryLoan.objects.filter(tenant=tenant).select_related(
        "copy__title", "membership__party", "membership__membership_type"
    )
    status = params.get("status")
    if status == "overdue":
        qs = qs.filter(status=LoanStatus.OPEN, due_on__lt=today)
    elif status:
        if status not in LoanStatus.values:
            errors["status"] = ["Choose open, overdue, returned, lost or cancelled."]
        qs = qs.filter(status=status)
    for name, lookup in (
        ("due_from", "due_on__gte"),
        ("due_to", "due_on__lte"),
        ("issued_from", "issued_on__gte"),
        ("issued_to", "issued_on__lte"),
    ):
        raw = params.get(name)
        if raw:
            try:
                qs = qs.filter(**{lookup: dt.date.fromisoformat(raw)})
            except ValueError:
                errors[name] = ["Use a date like 2026-10-01."]
    for name, field in (("membership", "membership_id"), ("copy", "copy_id")):
        raw = params.get(name)
        if raw:
            pk = uuid_or_none(raw)
            if pk is None:
                errors[name] = ["Not a valid id."]
            else:
                qs = qs.filter(**{field: pk})
    group = (params.get("group") or "").strip()
    if group:
        qs = qs.filter(membership__group_label__iexact=group)
    ordering = params.get("ordering") or "due_on"
    orderings = {"due_on": ("due_on", "id"), "-issued_on": ("-issued_on", "-id")}
    if ordering not in orderings:
        errors["ordering"] = ["Choose due_on or -issued_on."]
    if errors:
        raise ValidationFailed(errors)
    return qs.order_by(*orderings[ordering])
