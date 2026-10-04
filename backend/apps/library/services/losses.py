"""Lost, found, replaced and damaged books (LIB-07 FR-4…FR-7, BR-6…BR-10; task B10b).

Each loss is charges and waivers like any other library money (B10): a lost book is
the fine to the declared day (its own row) plus one `lost_book` charge; a found book
waives what is unpaid on that charge and — when the library refunds (D6) — refunds
what was paid as a `found_refund` waiver plus a payment OUT, in one transaction
(C12), so the member's khata goes back to where it was before the loss.

The copy's status moves only through `copy_status.move_copy`; the loan's own
status (`lost`, then `returned` when found) through this module and `loans`.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from django.db import transaction

from apps.common.audit import AuditAction, write_audit
from apps.common.dates import tenant_today
from apps.common.exceptions import BusinessRuleViolation, NotFound, ValidationFailed
from apps.common.money import ZERO, q2, round_amount
from apps.library.constants import (
    REASON_MAX,
    ChargeKind,
    CopyEventReason,
    CopyStatus,
    LoanEventKind,
    LoanStatus,
    LostFoundPaid,
    WaiverKind,
    WithdrawReason,
)
from apps.library.models import LibraryCharge, LibraryCopy, LibraryLoan
from apps.library.services import copy_status
from apps.library.services.charges import _post_waiver, _save, create_charge
from apps.library.services.fields import Errors, date, money, text, uuid_or_none
from apps.library.services.loans import (
    _charge_fine,
    _event,
    _loaded,
    _lock_loan,
    _settings,
    actor_can,
    fine_for,
)

DAMAGE_LEVELS = ("minor", "major", "unusable")


def _lost_amount(settings: Any, base: Decimal) -> Decimal:
    """BR-6: `round(base × lost_multiplier, paise) + lost_processing_fee`."""
    return q2(
        round_amount(Decimal(base) * Decimal(settings.lost_multiplier), "paise")
        + Decimal(settings.lost_processing_fee)
    )


def _base_price(copy: LibraryCopy, settings: Any, typed: Decimal | None) -> Decimal:
    """The copy's price, else the library's fallback, else what the librarian typed (EC-1)."""
    for value in (copy.price, settings.fallback_price, typed):
        if value is not None:
            return Decimal(value)
    raise ValidationFailed({"price": ["Enter the book's price."]})


def _lost_charge(ctx: Any, loan: LibraryLoan, amount: Decimal, label: str, on: dt.date) -> Any:
    charge = create_charge(
        ctx=ctx,
        membership=loan.membership,
        kind=ChargeKind.LOST_BOOK,
        amount=amount,
        description=f"{label} – {loan.copy.title.title} ({loan.copy.accession_number})",
        charge_date=on,
        copy=loan.copy,
    )
    LibraryCharge.objects.filter(pk=charge.pk).update(loan=loan)
    charge.loan = loan
    return charge


# ── Lost (FR-4, BR-6) ───────────────────────────────────────────────────────


@transaction.atomic
def mark_lost(*, ctx: Any, loan_id: Any, data: Any) -> dict:
    """`POST /library/loans/{id}/lost`: the fine to the declared day first, then the book."""
    data = data if isinstance(data, dict) else {}
    today = tenant_today(ctx.tenant)
    errors = Errors()
    declared = date(errors, data, "declared_on") or today
    typed = money(errors, data, "price")
    reason = text(errors, data, "reason", REASON_MAX)
    if declared > today:
        errors.add("declared_on", "Choose today or an earlier date.")
    errors.raise_if_any()
    loan = _lock_loan(ctx, loan_id)
    if loan.status != LoanStatus.OPEN:
        raise BusinessRuleViolation(
            "library_loan_not_open", "This loan is already closed.", details={"status": loan.status}
        )
    if declared < loan.issued_on:
        raise ValidationFailed({"declared_on": ["The book was issued after this date."]})
    settings = _settings(ctx.tenant)
    base = _base_price(loan.copy, settings, typed)
    if loan.copy.price is None and typed is not None:  # EC-1: remembered for next time
        LibraryCopy.objects.filter(pk=loan.copy_id).update(price=typed)
    calc = fine_for(loan, declared)
    fine = _charge_fine(ctx, loan, calc, declared)
    lost = _lost_charge(ctx, loan, _lost_amount(settings, base), "Lost book", declared)
    loan.status = LoanStatus.LOST
    loan.lost_on = declared
    loan.version += 1
    loan.save(update_fields=["status", "lost_on", "version", "updated_at"])
    copy_status.move_copy(
        ctx=ctx,
        copy=loan.copy,
        to_status=CopyStatus.LOST,
        reason_code=CopyEventReason.LOST,
        on_date=declared,
        note=reason or "",
        source_type="library_loan",
        source_id=loan.id,
    )
    _event(ctx, loan, LoanEventKind.LOST, declared, reason=reason or "", charge=lost)
    write_audit(
        ctx=ctx,
        action=AuditAction.LIBRARY_LOAN_LOST,
        entity_type="library_loan",
        entity_id=loan.id,
        after={"declared_on": declared.isoformat(), "lost_charge": str(lost.amount)},
    )
    return {
        "loan": _loaded(loan.id),
        "member": loan.membership,
        "fine": calc,
        "charges": [c for c in (fine, lost) if c is not None],
    }


# ── Found (FR-6, BR-9) ──────────────────────────────────────────────────────


@transaction.atomic
def mark_found(*, ctx: Any, copy_id: Any, data: Any) -> dict:
    """`POST /library/copies/{id}/found`: waive what is unpaid; refund what was paid (D6)."""
    from apps.parties.services.balance import lock_party
    from apps.payments.services.record import record_payment

    data = data if isinstance(data, dict) else {}
    pk = uuid_or_none(copy_id)
    peek = (
        LibraryCopy.objects.filter(tenant=ctx.tenant, pk=pk).select_related("title").first()
        if pk
        else None
    )
    if peek is None:
        raise NotFound()
    if peek.status not in (CopyStatus.LOST, CopyStatus.MISSING):
        raise BusinessRuleViolation(
            "library_copy_unavailable",
            "This copy is not lost or missing.",
            details={"status": peek.status},
        )
    lost_charge = (
        LibraryCharge.objects.filter(copy=peek, kind=ChargeKind.LOST_BOOK, reversed_at__isnull=True)
        .order_by("-charge_date", "-number")
        .first()
    )
    if lost_charge is not None:
        lock_party(tenant=ctx.tenant, party_id=lost_charge.party_id)
    today = tenant_today(ctx.tenant)
    settings = _settings(ctx.tenant)
    waivers: list[Any] = []
    refund_payment = None
    if lost_charge is not None:
        charge = (
            LibraryCharge.objects.select_for_update().select_related("party").get(pk=lost_charge.pk)
        )
        paid = Decimal(charge.amount_paid) - Decimal(charge.refunded_amount)
        refund = paid > ZERO and settings.lost_found_paid == LostFoundPaid.REFUND
        if refund and not actor_can(ctx, "payments.payment.write"):
            raise BusinessRuleViolation(
                "permission_denied", "Only someone who records payments can refund one.", details={}
            )
        if Decimal(charge.amount_due) > ZERO:
            waivers.append(
                _post_waiver(
                    ctx=ctx,
                    charge=charge,
                    kind=WaiverKind.FOUND.value,
                    amount=Decimal(charge.amount_due),
                    reason="Book found",
                    on=today,
                )
            )
            charge.waived_amount = q2(Decimal(charge.waived_amount) + Decimal(charge.amount_due))
        if refund:
            block = data.get("refund") if isinstance(data.get("refund"), dict) else {}
            lines = block.get("mode_breakup") or [{"mode": "cash", "amount": str(paid)}]
            refund_payment = record_payment(
                ctx=ctx,
                payload={
                    "direction": "out",
                    "party_id": str(charge.party_id),
                    "mode_breakup": lines,
                    "allocations": "none",
                    "context": "library_refund",
                    "meta": {"charge_id": str(charge.id)},
                },
            )["payment"]
            waivers.append(
                _post_waiver(
                    ctx=ctx,
                    charge=charge,
                    kind=WaiverKind.FOUND_REFUND.value,
                    amount=paid,
                    reason="Book found, paid amount refunded",
                    on=today,
                    refund_payment_id=refund_payment.id,
                )
            )
            charge.refunded_amount = q2(Decimal(charge.refunded_amount) + paid)
        _save(charge)
    loan = (
        LibraryLoan.objects.select_for_update(of=("self",))
        .filter(copy=peek, status=LoanStatus.LOST)
        .order_by("-issued_on")
        .first()
    )
    if loan is not None:
        loan.status = LoanStatus.RETURNED
        loan.returned_on = max(today, loan.issued_on)
        from django.utils import timezone

        loan.returned_at = timezone.now()
        loan.version += 1
        loan.save(update_fields=["status", "returned_on", "returned_at", "version", "updated_at"])
        _event(ctx, loan, LoanEventKind.FOUND, today)
    copy = copy_status.move_copy(
        ctx=ctx,
        copy=peek,
        to_status=CopyStatus.AVAILABLE,
        reason_code=CopyEventReason.FOUND,
        on_date=today,
    )
    LibraryCopy.objects.filter(pk=peek.pk).update(last_seen_on=today)
    write_audit(
        ctx=ctx,
        action=AuditAction.LIBRARY_COPY_FOUND,
        entity_type="library_copy",
        entity_id=peek.id,
        after={"refunded": str(refund_payment.amount) if refund_payment else "0.00"},
    )
    copy.refresh_from_db()
    return {"copy": copy, "waivers": waivers, "refund_payment": refund_payment}


# ── Replacement (FR-5, BR-10) ───────────────────────────────────────────────


@transaction.atomic
def replace(*, ctx: Any, loan_id: Any, data: Any) -> dict:
    """`POST /library/loans/{id}/replace`: the member brings the same title instead of paying."""
    from apps.library.services.catalogue import add_copies

    data = data if isinstance(data, dict) else {}
    if not actor_can(ctx, "library.catalogue.write"):  # a new copy joins the catalogue
        raise BusinessRuleViolation(
            "permission_denied", "Only someone who adds books can take a replacement.", details={}
        )
    loan = _lock_loan(ctx, loan_id)
    if loan.status != LoanStatus.LOST:
        raise BusinessRuleViolation(
            "library_loan_not_open",
            "Only a lost book can be replaced.",
            details={"status": loan.status},
        )
    charge = (
        LibraryCharge.objects.select_for_update()
        .select_related("party")
        .filter(loan=loan, kind=ChargeKind.LOST_BOOK, reversed_at__isnull=True)
        .first()
    )
    if charge is None or Decimal(charge.amount_paid) > ZERO:
        raise BusinessRuleViolation(
            "library_charge_not_open",
            "This book is already paid for. Use Found if it is back.",
            details={"status": charge.status if charge else "none"},
        )
    today = tenant_today(ctx.tenant)
    new = data.get("new_copy") if isinstance(data.get("new_copy"), dict) else {}
    block = {
        "count": 1,
        "location_id": new.get("location_id"),
        "price": (
            new.get("price")
            if new.get("price") not in (None, "")
            else (str(loan.copy.price) if loan.copy.price is not None else None)
        ),
        "source": "other",
        "source_note": (
            f"Replacement for {loan.copy.accession_number} by {loan.membership.member_number}"
        ),
    }
    if new.get("accession_number"):
        block["numbers"] = [new["accession_number"]]
    [replacement] = add_copies(ctx=ctx, title_id=loan.copy.title_id, data=block)
    waiver = _post_waiver(
        ctx=ctx,
        charge=charge,
        kind=WaiverKind.REPLACED.value,
        amount=Decimal(charge.amount_due),
        reason=f"Replaced by {replacement.accession_number}",
        on=today,
    )
    charge.waived_amount = q2(Decimal(charge.waived_amount) + Decimal(waiver.amount))
    _save(charge)
    copy_status.move_copy(
        ctx=ctx,
        copy=loan.copy,
        to_status=CopyStatus.WITHDRAWN,
        reason_code=CopyEventReason.WITHDRAWN,
        on_date=today,
        note=f"Replaced by {replacement.accession_number}",
        withdrawn_reason=WithdrawReason.LOST,
    )
    write_audit(
        ctx=ctx,
        action=AuditAction.LIBRARY_LOAN_REPLACED,
        entity_type="library_loan",
        entity_id=loan.id,
        after={"replacement": replacement.accession_number},
    )
    return {"loan": _loaded(loan.id), "member": loan.membership, "replacement": replacement}


# ── Damage at return (FR-7, BR-8) ───────────────────────────────────────────


def clean_damage(errors: Errors, data: dict) -> dict | None:
    raw = data.get("damage")
    if raw in (None, {}):
        return None
    if not isinstance(raw, dict) or raw.get("level") not in DAMAGE_LEVELS:
        errors.add("damage.level", "Choose minor, major or unusable.")
        return None
    out = {"level": raw["level"], "note": (raw.get("note") or "")[:REASON_MAX]}
    if raw.get("amount") not in (None, ""):
        sub = Errors()
        out["amount"] = money(sub, raw, "amount")
        for field, messages in sub.items():
            for message in messages:
                errors.add(f"damage.{field}", message)
    return out


def proposed_damage(copy: LibraryCopy, settings: Any, level: str) -> Decimal:
    if level == "minor":
        return Decimal(settings.damage_minor_amount)
    base = _base_price(copy, settings, None)
    if level == "major":
        return q2(base * Decimal(settings.damage_major_percent) / Decimal(100))
    return _lost_amount(settings, base)


def apply_damage(ctx: Any, loan: LibraryLoan, damage: dict, on: dt.date) -> tuple[Any, str]:
    """Charge the damage and say where the copy goes: minor → shelf, major → repair, unusable →
    withdrawn as damaged (BR-8). The librarian may lower the proposed amount; raising it needs
    `library.charge.write`."""
    settings = _settings(ctx.tenant)
    proposed = proposed_damage(loan.copy, settings, damage["level"])
    amount = damage.get("amount")
    if amount is None:
        amount = proposed
    elif amount > proposed and not actor_can(ctx, "library.charge.write"):
        raise BusinessRuleViolation(
            "permission_denied",
            "Only someone who raises charges can charge more than proposed.",
            details={},
        )
    charge = None
    if amount > ZERO:
        if damage["level"] == "unusable":
            charge = _lost_charge(ctx, loan, amount, "Damaged beyond use", on)
        else:
            charge = create_charge(
                ctx=ctx,
                membership=loan.membership,
                kind=ChargeKind.DAMAGE,
                amount=amount,
                description=(
                    f"Damage ({damage['level']}) – {loan.copy.title.title} "
                    f"({loan.copy.accession_number})"
                ),
                charge_date=on,
                copy=loan.copy,
            )
            LibraryCharge.objects.filter(pk=charge.pk).update(loan=loan)
    route = {
        "minor": CopyStatus.AVAILABLE,
        "major": CopyStatus.IN_REPAIR,
        "unusable": CopyStatus.WITHDRAWN,
    }
    return charge, route[damage["level"]].value
