"""Held deposits — money a party left with the business (ADR-044, contracts §1.4, PLT-X02).

A library or room security deposit is not the business's money, so it can never
be a "You got": that would show the member in advance and let FIFO swallow it
into the next bill. It is one core concept instead:

* a `payments_held_deposit` row, OPENED by the vertical when a membership starts
  or a booking is confirmed (`expected`);
* RECEIVED by an ordinary payment IN allocated to the `held_deposit` target, whose
  bucket is `deposit` — the khata line moves `deposit_held`, never the balance;
* RETURNED by a payment OUT allocated to `held_deposit_refund`;
* APPLIED to what the party owes only by an explicit act, which writes two linked
  `adjustment` payments: OUT of the deposit bucket, IN to the charges in the main
  bucket. One act on screen, one `payments_deposit_application` row.

Both deposit targets are `auto = False`, so FIFO never reaches them (BR-5). The
four money columns are caches the targets move as payments settle and un-settle
the deposit; the payments, their allocations and their ledger lines are the
evidence (T-PLT-X02-7 replays them).

── Locks ─────────────────────────────────────────────────────────────────────
party → deposit → documents → payments → number (the global order of
`parties.services.balance`). Every function here locks the party of the deposit
first, then the deposit, then hands the payment to `record_payment`, which takes
the same locks again (re-entrant inside one transaction) and the rest in order.

── `adjustment` ──────────────────────────────────────────────────────────────
Only this module writes it (R24), through `record.record_adjustment`: the two
halves of an application, and an opening deposit taken before go-live (R37),
which is money that arrived in the paper era and must not appear as today's cash.
The cashbook skips every adjustment share (R4).

Voiding either half of an application voids the other (`void.void_payment`, BR-7);
voiding a receipt that would leave less than nothing held is refused by the
target (`deposit_insufficient`, BR-8).
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.db.models import QuerySet

from apps.common.audit import AuditAction, write_audit
from apps.common.constants import LedgerBucket, PaymentMode
from apps.common.context import Ctx
from apps.common.db.fields import uuid7
from apps.common.exceptions import BusinessRuleViolation, NotFound, StaleVersion, ValidationFailed
from apps.common.money import ZERO, q2
from apps.ledger.services.entries import _clean_text, _parse_amount
from apps.parties.constants import PartyStatus
from apps.parties.services.balance import lock_party, lock_party_of
from apps.payments.constants import (
    DEPOSIT_CONTEXT_ADJUSTMENT,
    DEPOSIT_CONTEXT_OPENING,
    DEPOSIT_CONTEXT_RECEIPT,
    DEPOSIT_CONTEXT_REFUND,
    DEPOSIT_MODULE_MAX,
    DEPOSIT_NOTE_MAX,
    DEPOSIT_PURPOSE_MAX,
    DEPOSIT_REASON_MAX,
    DEPOSIT_SUBJECT_TYPE_MAX,
    HELD_DEPOSIT,
    HELD_DEPOSIT_REFUND,
    DepositStatus,
    PaymentDirection,
)
from apps.payments.models import DepositApplication, HeldDeposit, Payment

# ── Derived figures ─────────────────────────────────────────────────────────


def derive(deposit: HeldDeposit) -> None:
    """BR-1 and BR-2, recomputed from the three movements after every change.

    A deposit cancelled before anything was received (EC-5) stays `released`:
    nothing can move it again, because receive refuses a released deposit.
    """
    deposit.held_amount = q2(
        Decimal(deposit.received_amount)
        - Decimal(deposit.applied_amount)
        - Decimal(deposit.refunded_amount)
    )
    received = Decimal(deposit.received_amount)
    if deposit.status == DepositStatus.RELEASED and received == ZERO:
        return
    if received == ZERO:
        deposit.status = DepositStatus.EXPECTED
    elif deposit.held_amount > ZERO:
        deposit.status = DepositStatus.HELD
    else:
        deposit.status = DepositStatus.RELEASED


def _insufficient(deposit: HeldDeposit, message: str | None = None) -> BusinessRuleViolation:
    return BusinessRuleViolation(
        "deposit_insufficient",
        message or f"Only ₹{deposit.held_amount} of the deposit is held.",
        details={"held_amount": str(deposit.held_amount), "deposit_id": str(deposit.id)},
    )


def _released(deposit: HeldDeposit) -> BusinessRuleViolation:
    return BusinessRuleViolation(
        "deposit_released",
        "This deposit is already settled.",
        details={"deposit_id": str(deposit.id), "status": deposit.status},
    )


def _payment_context(payment_id: Any) -> str:
    if payment_id is None:
        return ""
    meta = Payment.objects.filter(pk=payment_id).values_list("meta", flat=True).first() or {}
    return str(meta.get("context") or "")


def deposit_summary(deposit: HeldDeposit, *, amount_due: Decimal) -> dict:
    """What a receipt, the allocation panel and the payment page show for a deposit."""
    return {
        "document_type": HELD_DEPOSIT,
        "document_id": str(deposit.id),
        "kind": "deposit",
        "number": deposit.purpose,
        "document_date": deposit.created_at.date().isoformat() if deposit.created_at else None,
        "due_on": None,
        "grand_total": str(deposit.expected_amount),
        "amount_due": str(amount_due),
        "status": deposit.status,
    }


# ── The two allocation targets (contracts §1.4 table) ───────────────────────


class _DepositTargetBase:
    bucket = LedgerBucket.DEPOSIT.value
    auto = False

    def _rows(self, tenant: Any) -> QuerySet:
        return HeldDeposit.objects.for_tenant(tenant)

    def open_documents(self, *, tenant: Any, party_id: Any) -> list[Any]:
        rows = self._rows(tenant).filter(party_id=party_id).order_by("created_at", "id")
        return [row for row in rows if self.is_open(row)]

    def find(self, *, tenant: Any, ids: list[Any]) -> list[Any]:
        return list(self._rows(tenant).filter(pk__in=ids).order_by("created_at", "id"))

    def lock(self, *, tenant: Any, ids: list[Any]) -> list[Any]:
        return list(
            self._rows(tenant).select_for_update().filter(pk__in=ids).order_by("created_at", "id")
        )

    def lock_open_for_party(self, *, tenant: Any, party_id: Any) -> list[Any]:
        rows = (
            self._rows(tenant)
            .select_for_update()
            .filter(party_id=party_id)
            .order_by("created_at", "id")
        )
        return [row for row in rows if self.is_open(row)]

    def party_id(self, document: Any) -> Any:
        return document.party_id

    def audit_action(self) -> str:
        return AuditAction.DEPOSIT_STATUS_CHANGED

    def _save(self, deposit: HeldDeposit) -> None:
        derive(deposit)
        deposit.version += 1
        deposit.save(
            update_fields=[
                "received_amount",
                "applied_amount",
                "refunded_amount",
                "held_amount",
                "status",
                "version",
                "updated_at",
            ]
        )


class HeldDepositTarget(_DepositTargetBase):
    """A payment IN that RECEIVES a deposit: bucket `deposit`, never auto (BR-5)."""

    document_type = HELD_DEPOSIT
    direction = PaymentDirection.IN.value

    def is_open(self, document: Any) -> bool:
        return document.status != DepositStatus.RELEASED and self.outstanding(document) > ZERO

    def outstanding(self, document: Any) -> Decimal:
        return max(Decimal(document.expected_amount) - Decimal(document.received_amount), ZERO)

    def apply(
        self,
        *,
        document: Any,
        amount: Decimal,
        today: dt.date,
        payment_id: Any = None,
        ctx: Any = None,
    ) -> tuple[str, str]:
        before = document.status
        document.received_amount = Decimal(document.received_amount) + amount
        self._save(document)
        return before, document.status

    def unapply(
        self,
        *,
        document: Any,
        amount: Decimal,
        today: dt.date,
        payment_id: Any = None,
        ctx: Any = None,
    ) -> tuple[str, str]:
        # BR-8 — a receipt whose money was already applied or returned cannot be
        # undone first: the deposit would hold less than nothing.
        if Decimal(document.held_amount) < amount:
            raise _insufficient(
                document,
                "Void the adjustment or the return from this deposit first.",
            )
        before = document.status
        document.received_amount = Decimal(document.received_amount) - amount
        self._save(document)
        return before, document.status

    def summary(self, document: Any) -> dict:
        return deposit_summary(document, amount_due=self.outstanding(document))


class HeldDepositRefundTarget(_DepositTargetBase):
    """A payment OUT that takes money out of a deposit: a RETURN to the party, or
    the OUT half of an APPLICATION (an `adjustment` payment, context
    `deposit_adjustment`) — the target reads which from the payment it serves."""

    document_type = HELD_DEPOSIT_REFUND
    direction = PaymentDirection.OUT.value

    def is_open(self, document: Any) -> bool:
        return Decimal(document.held_amount) > ZERO

    def outstanding(self, document: Any) -> Decimal:
        return max(Decimal(document.held_amount), ZERO)

    def _column(self, payment_id: Any) -> str:
        applied = _payment_context(payment_id) == DEPOSIT_CONTEXT_ADJUSTMENT
        return "applied_amount" if applied else "refunded_amount"

    def apply(
        self,
        *,
        document: Any,
        amount: Decimal,
        today: dt.date,
        payment_id: Any = None,
        ctx: Any = None,
    ) -> tuple[str, str]:
        if amount > self.outstanding(document):
            raise _insufficient(document)
        before = document.status
        column = self._column(payment_id)
        setattr(document, column, Decimal(getattr(document, column)) + amount)
        self._save(document)
        return before, document.status

    def unapply(
        self,
        *,
        document: Any,
        amount: Decimal,
        today: dt.date,
        payment_id: Any = None,
        ctx: Any = None,
    ) -> tuple[str, str]:
        before = document.status
        column = self._column(payment_id)
        setattr(document, column, max(Decimal(getattr(document, column)) - amount, ZERO))
        self._save(document)
        return before, document.status

    def summary(self, document: Any) -> dict:
        return {
            **deposit_summary(document, amount_due=self.outstanding(document)),
            "document_type": HELD_DEPOSIT_REFUND,
        }


def register_deposit_targets() -> None:
    """Called from `PaymentsConfig.ready()`: payments' own targets."""
    from apps.payments.services.targets import register_target

    register_target(HeldDepositTarget())
    register_target(HeldDepositRefundTarget())


# ── Validation helpers ──────────────────────────────────────────────────────


def _amount(raw: Any, field: str) -> Decimal:
    errors: dict[str, list[str]] = {}
    value = _parse_amount(raw, errors)
    if errors or value is None:
        raise ValidationFailed({field: errors.get("amount") or ["Enter an amount greater than 0."]})
    return value


def _reason(raw: Any) -> str:
    reason = _clean_text(raw or "")
    if not reason:
        raise ValidationFailed({"reason": ["Say why."]})
    if len(reason) > DEPOSIT_REASON_MAX:
        raise ValidationFailed(
            {"reason": [f"Keep the reason under {DEPOSIT_REASON_MAX} characters."]}
        )
    return reason


def _lock(ctx: Ctx, deposit_id: Any) -> HeldDeposit:
    """party → deposit. Another tenant's deposit is not found (canon §0.11 rule 2)."""
    rows = HeldDeposit.objects.for_tenant(ctx.tenant)
    try:
        lock_party_of(tenant=ctx.tenant, rows=rows, pk=deposit_id)
        deposit = rows.select_for_update().filter(pk=deposit_id).first()
    except (ValueError, TypeError):
        deposit = None
    if deposit is None:
        raise NotFound("No such deposit.")
    return deposit


def _check_version(deposit: HeldDeposit, version: Any) -> None:
    """Part 22 §22.1 — only when the client sent the version it read."""
    if version in (None, ""):
        return
    try:
        sent = int(version)
    except (TypeError, ValueError):
        raise ValidationFailed({"version": ["Send the version you read."]}) from None
    if sent != deposit.version:
        raise StaleVersion(current_version=deposit.version)


def _snapshot(deposit: HeldDeposit) -> dict:
    return {
        "status": deposit.status,
        "expected_amount": str(deposit.expected_amount),
        "received_amount": str(deposit.received_amount),
        "applied_amount": str(deposit.applied_amount),
        "refunded_amount": str(deposit.refunded_amount),
        "held_amount": str(deposit.held_amount),
    }


def _audit(
    ctx: Ctx, action: str, deposit: HeldDeposit, before: dict | None, **metadata: Any
) -> None:
    write_audit(
        ctx=ctx,
        action=action,
        entity_type="payments_held_deposit",
        entity_id=deposit.id,
        before=before,
        after=_snapshot(deposit),
        metadata={
            "module": deposit.module,
            "subject_type": deposit.subject_type,
            "subject_id": str(deposit.subject_id),
            **metadata,
        },
    )


# ── The services (contracts §1.4) ───────────────────────────────────────────


@transaction.atomic
def open_deposit(
    *,
    ctx: Ctx,
    party_id: Any,
    module: str,
    subject_type: str,
    subject_id: Any,
    purpose: str,
    expected_amount: Any,
) -> HeldDeposit:
    """A deposit the vertical expects: status `expected`, every amount 0.

    Idempotent by `(module, subject_type, subject_id, purpose)` while the standing
    row is not released — a second open returns it (a re-submitted membership form
    does not ask for the deposit twice)."""
    details: dict[str, list[str]] = {}
    module = str(module or "").strip()
    subject_type = str(subject_type or "").strip()
    purpose = _clean_text(purpose or "")
    if not module or len(module) > DEPOSIT_MODULE_MAX:
        details["module"] = ["Name the module."]
    if not subject_type or len(subject_type) > DEPOSIT_SUBJECT_TYPE_MAX:
        details["subject_type"] = ["Name what the deposit is for."]
    if not purpose or len(purpose) > DEPOSIT_PURPOSE_MAX:
        details["purpose"] = [
            f"Say what the deposit is for, under {DEPOSIT_PURPOSE_MAX} characters."
        ]
    expected: Decimal | None = None
    try:
        expected = _amount(expected_amount, "expected_amount")
    except ValidationFailed as exc:
        details.update(exc.details or {})
    if subject_id in (None, ""):
        details["subject_id"] = ["Name what the deposit is for."]
    if details:
        raise ValidationFailed(details)

    party = lock_party(tenant=ctx.tenant, party_id=party_id)
    if party is None:
        raise NotFound("No such party.")
    if party.status == PartyStatus.ARCHIVED:
        raise BusinessRuleViolation(
            "party_archived",
            "This party is archived. Restore them to take a deposit.",
            details={"party_id": str(party.id), "name": party.name},
        )
    standing = (
        HeldDeposit.objects.for_tenant(ctx.tenant)
        .filter(
            module=module,
            subject_type=subject_type,
            subject_id=subject_id,
            purpose=purpose,
        )
        .exclude(status=DepositStatus.RELEASED)
        .first()
    )
    if standing is not None:
        return standing
    deposit = HeldDeposit.objects.create(
        tenant=ctx.tenant,
        created_by=ctx.actor if ctx.actor_type == "user" else None,
        party=party,
        module=module,
        subject_type=subject_type,
        subject_id=subject_id,
        purpose=purpose,
        expected_amount=expected,
    )
    _audit(ctx, AuditAction.DEPOSIT_OPENED, deposit, None)
    return deposit


@transaction.atomic
def receive_deposit(
    *,
    ctx: Ctx,
    deposit_id: Any,
    amount: Any,
    mode_breakup: Any = None,
    payment_date: Any = None,
    reference: str = "",
    note: str = "",
    opening: bool = False,
    version: Any = None,
) -> dict:
    """Money IN to the deposit: a payment allocated to `held_deposit`, bucket `deposit`.

    `opening=True` (R37) is a deposit taken before go-live: the payment's mode is
    `adjustment`, so neither the cashbook nor any collection report shows paper-era
    cash as today's, and the receipt prints "Opening deposit". Returns
    `{deposit, payment}`."""
    from apps.payments.services.record import record_adjustment, record_payment

    value = _amount(amount, "amount")
    deposit = _lock(ctx, deposit_id)
    _check_version(deposit, version)
    if deposit.status == DepositStatus.RELEASED:
        raise _released(deposit)
    left = Decimal(deposit.expected_amount) - Decimal(deposit.received_amount)
    if value > left:
        raise BusinessRuleViolation(
            "over_allocated",
            f"Only ₹{q2(left)} more of this deposit is expected.",
            details={
                "deposit_id": str(deposit.id),
                "allocatable": str(q2(left)),
                "requested": str(value),
            },
        )
    before = _snapshot(deposit)
    payload: dict[str, Any] = {
        "direction": PaymentDirection.IN.value,
        "party_id": str(deposit.party_id),
        "payment_date": payment_date,
        "amount": str(value),
        "reference": reference,
        "note": _clean_text(note or "")[:DEPOSIT_NOTE_MAX],
        "allocations": [
            {"document_type": HELD_DEPOSIT, "document_id": str(deposit.id), "amount": str(value)}
        ],
        "context": DEPOSIT_CONTEXT_OPENING if opening else DEPOSIT_CONTEXT_RECEIPT,
        "meta": {"deposit_id": str(deposit.id)},
    }
    if opening:
        payload["mode_breakup"] = [{"mode": PaymentMode.ADJUSTMENT.value, "amount": str(value)}]
        result = record_adjustment(ctx=ctx, payload=payload)
    else:
        payload["mode_breakup"] = mode_breakup
        result = record_payment(ctx=ctx, payload=payload)
    deposit.refresh_from_db()
    _audit(
        ctx,
        AuditAction.DEPOSIT_RECEIVED,
        deposit,
        before,
        payment_id=str(result["payment"].id),
        opening=bool(opening),
    )
    return {"deposit": deposit, "payment": result["payment"]}


@transaction.atomic
def adjust_expected(*, ctx: Ctx, deposit_id: Any, expected_amount: Any, reason: Any) -> HeldDeposit:
    """R35 — the vertical raises (or lowers) what it expects; never below what
    was already received (400 on `expected_amount`)."""
    value = _amount(expected_amount, "expected_amount")
    why = _reason(reason)
    deposit = _lock(ctx, deposit_id)
    if deposit.status == DepositStatus.RELEASED:
        raise _released(deposit)
    if value < Decimal(deposit.received_amount):
        raise ValidationFailed(
            {"expected_amount": [f"₹{deposit.received_amount} has already been received."]}
        )
    before = _snapshot(deposit)
    deposit.expected_amount = value
    deposit.version += 1
    deposit.save(update_fields=["expected_amount", "version", "updated_at"])
    _audit(ctx, AuditAction.DEPOSIT_EXPECTED_CHANGED, deposit, before, reason=why)
    return deposit


def _clean_allocations(raw: Any) -> tuple[list[dict], Decimal]:
    """The charges an application settles: main-bucket targets IN, each > 0."""
    from apps.payments.services.targets import target_for

    if not isinstance(raw, list) or not raw:
        raise ValidationFailed({"allocations": ["Choose what to adjust the deposit against."]})
    details: dict[str, list[str]] = {}
    rows: list[dict] = []
    total = ZERO
    for index, row in enumerate(raw):
        row = row if isinstance(row, dict) else {}
        document_type = str(row.get("document_type") or "")
        target = target_for(document_type)
        if (
            target is None
            or target.direction != PaymentDirection.IN
            or target.bucket != LedgerBucket.MAIN
        ):
            details[f"allocations.{index}.document_type"] = [
                "A deposit is adjusted against what the party owes."
            ]
            continue
        errors: dict[str, list[str]] = {}
        value = _parse_amount(row.get("amount"), errors)
        if errors or value is None:
            details[f"allocations.{index}.amount"] = errors.get("amount") or ["Enter an amount."]
            continue
        rows.append(
            {
                "document_type": document_type,
                "document_id": str(row.get("document_id") or ""),
                "amount": str(value),
            }
        )
        total += value
    if details:
        raise ValidationFailed(details)
    return rows, total


@transaction.atomic
def apply_deposit(
    *, ctx: Ctx, deposit_id: Any, allocations: Any, reason: Any, version: Any = None
) -> dict:
    """Adjust a held deposit against what the party owes — one act, two payments.

    OUT: an `adjustment` payment allocated to `held_deposit_refund` (bucket
    `deposit`) for the whole amount; IN: an `adjustment` payment allocated to the
    caller's charges (bucket `main`). Both take the ordinary payment series (R12)
    and print "Adjustment · deposit". Capped at what is held (BR-4). Returns
    `{deposit, application, refund_payment, settle_payment, documents}`."""
    from apps.payments.services.record import record_adjustment

    why = _reason(reason)
    rows, total = _clean_allocations(allocations)
    deposit = _lock(ctx, deposit_id)
    _check_version(deposit, version)
    if deposit.status == DepositStatus.RELEASED:
        raise _released(deposit)
    if total > Decimal(deposit.held_amount):
        raise _insufficient(deposit)
    before = _snapshot(deposit)
    application_id = uuid7()
    common = {
        "party_id": str(deposit.party_id),
        "amount": str(total),
        "mode_breakup": [{"mode": PaymentMode.ADJUSTMENT.value, "amount": str(total)}],
        "note": why[:DEPOSIT_NOTE_MAX],
        "context": DEPOSIT_CONTEXT_ADJUSTMENT,
        "meta": {"deposit_id": str(deposit.id), "deposit_application_id": str(application_id)},
    }
    out = record_adjustment(
        ctx=ctx,
        payload={
            **common,
            "direction": PaymentDirection.OUT.value,
            "allocations": [
                {
                    "document_type": HELD_DEPOSIT_REFUND,
                    "document_id": str(deposit.id),
                    "amount": str(total),
                }
            ],
        },
    )
    settle = record_adjustment(
        ctx=ctx, payload={**common, "direction": PaymentDirection.IN.value, "allocations": rows}
    )
    application = DepositApplication.objects.create(
        id=application_id,
        tenant=ctx.tenant,
        created_by=ctx.actor if ctx.actor_type == "user" else None,
        deposit=deposit,
        amount=total,
        reason=why,
        refund_payment=out["payment"],
        settle_payment=settle["payment"],
    )
    deposit.refresh_from_db()
    _audit(
        ctx,
        AuditAction.DEPOSIT_APPLIED,
        deposit,
        before,
        application_id=str(application.id),
        refund_payment_id=str(out["payment"].id),
        settle_payment_id=str(settle["payment"].id),
        allocations=rows,
    )
    return {
        "deposit": deposit,
        "application": application,
        "refund_payment": out["payment"],
        "settle_payment": settle["payment"],
        "documents": settle["documents"],
    }


@transaction.atomic
def refund_deposit(
    *,
    ctx: Ctx,
    deposit_id: Any,
    amount: Any,
    mode_breakup: Any,
    payment_date: Any = None,
    reason: Any = "",
    version: Any = None,
) -> dict:
    """Money OUT of the deposit, back to the party: a payment allocated to
    `held_deposit_refund`. Capped at what is held (BR-4). Returns `{deposit, payment}`."""
    from apps.payments.services.record import record_payment

    value = _amount(amount, "amount")
    why = _reason(reason)
    deposit = _lock(ctx, deposit_id)
    _check_version(deposit, version)
    if deposit.status == DepositStatus.RELEASED:
        raise _released(deposit)
    if value > Decimal(deposit.held_amount):
        raise _insufficient(deposit)
    before = _snapshot(deposit)
    result = record_payment(
        ctx=ctx,
        payload={
            "direction": PaymentDirection.OUT.value,
            "party_id": str(deposit.party_id),
            "payment_date": payment_date,
            "amount": str(value),
            "mode_breakup": mode_breakup,
            "note": why[:DEPOSIT_NOTE_MAX],
            "allocations": [
                {
                    "document_type": HELD_DEPOSIT_REFUND,
                    "document_id": str(deposit.id),
                    "amount": str(value),
                }
            ],
            "context": DEPOSIT_CONTEXT_REFUND,
            "meta": {"deposit_id": str(deposit.id)},
        },
    )
    deposit.refresh_from_db()
    _audit(
        ctx,
        AuditAction.DEPOSIT_REFUNDED,
        deposit,
        before,
        payment_id=str(result["payment"].id),
        reason=why,
    )
    return {"deposit": deposit, "payment": result["payment"]}


@transaction.atomic
def cancel_expected_deposit(*, ctx: Ctx, deposit_id: Any, reason: Any) -> HeldDeposit:
    """EC-5 — a deposit that was expected and never paid, closed by its vertical
    (the membership ended first). Refused once anything was received."""
    why = _reason(reason)
    deposit = _lock(ctx, deposit_id)
    if deposit.status == DepositStatus.RELEASED:
        raise _released(deposit)
    if Decimal(deposit.received_amount) > ZERO:
        raise BusinessRuleViolation(
            "deposit_insufficient" if deposit.held_amount > 0 else "deposit_released",
            "Money was received against this deposit; return or adjust it instead.",
            details={"held_amount": str(deposit.held_amount), "deposit_id": str(deposit.id)},
        )
    before = _snapshot(deposit)
    deposit.status = DepositStatus.RELEASED
    deposit.version += 1
    deposit.save(update_fields=["status", "version", "updated_at"])
    _audit(ctx, AuditAction.DEPOSIT_CANCELLED, deposit, before, reason=why)
    return deposit


def deposits_for(
    *,
    tenant: Any,
    party_id: Any = None,
    module: str | None = None,
    subject_type: str | None = None,
    subject_id: Any = None,
    status: str | None = None,
) -> QuerySet:
    """Tenant-scoped deposits; the verticals' guards and panels read this."""
    rows = HeldDeposit.objects.for_tenant(tenant).select_related("party")
    if party_id is not None:
        rows = rows.filter(party_id=party_id)
    if module:
        rows = rows.filter(module=module)
    if subject_type:
        rows = rows.filter(subject_type=subject_type)
    if subject_id is not None:
        rows = rows.filter(subject_id=subject_id)
    if status:
        rows = rows.filter(status=status)
    return rows.order_by("-created_at", "-id")


# ── Guards ──────────────────────────────────────────────────────────────────


def open_deposit_counter(module: str) -> Any:
    """PLT-X10: a module cannot be switched off while any of its deposits is not
    released (T-PLT-X02-10). One counter per module, equal by module, so a second
    `ready()` does not register it twice (A12's dedupe is by equality)."""
    return _OpenDepositCounter(module)


class _OpenDepositCounter:
    def __init__(self, module: str) -> None:
        self.module = module

    def __eq__(self, other: object) -> bool:
        return isinstance(other, _OpenDepositCounter) and other.module == self.module

    def __hash__(self) -> int:
        return hash(("open_deposits", self.module))

    def __call__(self, tenant: Any) -> int:
        return (
            HeldDeposit.objects.for_tenant(tenant)
            .filter(module=self.module)
            .exclude(status=DepositStatus.RELEASED)
            .count()
        )


class _HeldDepositCounter:
    """PLT-X04 BR-5's other half: switching `payments` off would hide every
    deposit panel and skip the archive guard below (A6 BR-3), so it is refused
    while any deposit, of any module, still holds money."""

    def __eq__(self, other: object) -> bool:
        return isinstance(other, _HeldDepositCounter)

    def __hash__(self) -> int:
        return hash("held_deposits")

    def __call__(self, tenant: Any) -> int:
        return HeldDeposit.objects.for_tenant(tenant).filter(held_amount__gt=0).count()


def held_deposit_counter() -> Any:
    return _HeldDepositCounter()


#: The archive dialog's sentence (A6: the module's own words, with `{count}` and
#: `{name}`). Where the payments catalogue is not loaded the dialog falls back to
#: its generic sentence, which still carries the number.
DEPOSITS_HELD_LABEL_ID = "payments.deposit.archiveBlock"


def deposits_held_for_party(party: Any) -> int:
    """PLT-X04 BR-5 — how many of the party's deposits still hold money."""
    return (
        HeldDeposit.objects.filter(tenant_id=party.tenant_id, party_id=party.id, held_amount__gt=0)
        .only("id")
        .count()
    )


def deposits_archive_guard(tenant: Any, party: Any) -> dict | None:
    """A6's archive guard (PLT-X02 EC-7, PLT-X04 BR-5): a party whose deposit
    still holds money cannot be archived — return it or adjust it first. A
    deposit only EXPECTED holds nothing and does not block."""
    count = deposits_held_for_party(party)
    if not count:
        return None
    return {"module": "payments", "count": count, "label_id": DEPOSITS_HELD_LABEL_ID}
