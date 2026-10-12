"""Library charges and waivers: raise, waive, reverse; the allocation target (LIB-07; task B10).

── Locks (contracts §1.2, the global order) ───────────────────────────────────
party → membership → charge → (payments) → sequence. `create_charge` takes the
charge number LAST (`allocate_number`), so a rolled-back raise returns it.

── One writer per figure ──────────────────────────────────────────────────────
`amount_paid` moves only in the target's `apply`/`unapply`; `waived_amount` and
`refunded_amount` only in `waive` (and B10b's found and replace); every change
re-derives `amount_due` and `status` through `_save`, so the CHECK
`amount_due = amount − amount_paid − waived_amount` and BR-4's status can never
disagree with each other.

── The ceiling is a ROLE check (FR-3, 10-architecture §5) ─────────────────────
`library.charge.waive` is delegable; going over `waiver_ceiling` is not, the
same rule as LED-01's credit override (`parties.services.credit.may_override`).
G22: the ceiling is compared CUMULATIVELY per charge — three ₹90 waivers of one
fine would otherwise pass a ₹100 ceiling.

D7: a library charge is never refused by a credit limit (`post_source_entry`
runs no credit check).
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.common.audit import AuditAction, write_audit
from apps.common.dates import tenant_today
from apps.common.exceptions import BusinessRuleViolation, NotFound, ValidationFailed
from apps.common.money import ZERO, q2
from apps.library.constants import (
    CHARGE_DESCRIPTION_MAX,
    CHARGE_STATUS_AUDIT,
    MANUAL_CHARGE_KINDS,
    REASON_MAX,
    SOURCE_CHARGE,
    SOURCE_WAIVER,
    TARGET_LABEL_MAX,
    WAIVER_REASON_MIN,
    ChargeStatus,
    MembershipStatus,
    WaiverKind,
)
from apps.library.models import LibraryCharge, LibraryMembership, LibraryWaiver
from apps.library.services.fields import Errors, date, money, text, uuid_or_none

CHARGE_KIND = "library_charge"


# ── The one derivation (BR-4) ───────────────────────────────────────────────


def derive_status(charge: LibraryCharge) -> str:
    if charge.reversed_at is not None:
        return ChargeStatus.REVERSED.value
    if Decimal(charge.amount_due) > ZERO:
        return (
            ChargeStatus.PART_PAID if Decimal(charge.amount_paid) > ZERO else ChargeStatus.OPEN
        ).value
    if Decimal(charge.refunded_amount) > ZERO:
        return ChargeStatus.REFUNDED.value
    if Decimal(charge.waived_amount) == Decimal(charge.amount):
        return ChargeStatus.WAIVED.value
    return ChargeStatus.PAID.value


def _save(charge: LibraryCharge) -> None:
    charge.amount_due = q2(
        Decimal(charge.amount) - Decimal(charge.amount_paid) - Decimal(charge.waived_amount)
    )
    charge.status = derive_status(charge)
    charge.save(
        update_fields=[
            "amount_paid",
            "waived_amount",
            "refunded_amount",
            "amount_due",
            "status",
            "reversed_at",
            "reversed_reason",
            "updated_at",
        ]
    )


def charge_json(charge: LibraryCharge) -> dict:
    def m(value: Any) -> str | None:
        return None if value is None else f"{Decimal(value):.2f}"

    return {
        "id": str(charge.id),
        "membership_id": str(charge.membership_id),
        "party_id": str(charge.party_id),
        "number": charge.number,
        "kind": charge.kind,
        "amount": m(charge.amount),
        "charge_date": charge.charge_date.isoformat(),
        "copy_id": str(charge.copy_id) if charge.copy_id else None,
        "description": charge.description,
        "fine_days": charge.fine_days,
        "fine_rate": m(charge.fine_rate),
        "amount_paid": m(charge.amount_paid),
        "waived_amount": m(charge.waived_amount),
        "refunded_amount": m(charge.refunded_amount),
        "amount_due": m(charge.amount_due),
        "status": charge.status,
        "reversed_at": charge.reversed_at.isoformat() if charge.reversed_at else None,
        "reversed_reason": charge.reversed_reason,
    }


def waiver_json(waiver: LibraryWaiver) -> dict:
    return {
        "id": str(waiver.id),
        "kind": waiver.kind,
        "amount": f"{Decimal(waiver.amount):.2f}",
        "reason": waiver.reason,
        "on_date": waiver.on_date.isoformat(),
        "reversed_at": waiver.reversed_at.isoformat() if waiver.reversed_at else None,
    }


# ── Raising a charge ────────────────────────────────────────────────────────


def _fresh_party(ctx: Any, party_id: Any) -> Any:
    """The party as it is NOW, locked (re-entrant inside the caller's transaction).

    `apply_entry` moves the balance cache from the instance it is handed, so a party
    loaded before a payment in the same transaction would write back a stale balance:
    a found book's refund waiver posted after the refund payment left the member
    ₹250 in credit for money they had been handed back (B10b QA)."""
    from apps.parties.services.balance import lock_party

    return lock_party(tenant=ctx.tenant, party_id=party_id)


def create_charge(
    *,
    ctx: Any,
    membership: LibraryMembership,
    kind: str,
    amount: Decimal,
    description: str,
    charge_date: dt.date | None = None,
    copy: Any = None,
    fine_days: int | None = None,
    fine_rate: Decimal | None = None,
) -> LibraryCharge:
    """One postable fact (BR-1): the charge, its ledger line, its number. Inside the caller's
    transaction, with the party ALREADY LOCKED by the caller (B07, B09 and the manual path).
    A zero amount writes nothing (EC-2) — the caller checks, this refuses."""
    from apps.ledger.services.postings import post_source_entry
    from apps.platform_app.services.sequences import allocate_number

    amount = q2(amount)
    if amount <= ZERO:
        raise ValueError("a library charge must be more than zero (EC-2: write none instead)")
    on = charge_date or tenant_today(ctx.tenant)
    charge = LibraryCharge(
        tenant=ctx.tenant,
        created_by=getattr(ctx, "actor", None),
        membership=membership,
        party_id=membership.party_id,
        kind=kind,
        amount=amount,
        amount_due=amount,
        charge_date=on,
        copy=copy,
        description=description[:CHARGE_DESCRIPTION_MAX],
        fine_days=fine_days,
        fine_rate=fine_rate,
    )
    charge.number = allocate_number(tenant=ctx.tenant, kind=CHARGE_KIND, on_date=on)
    entry, _balance = post_source_entry(
        ctx=ctx,
        party=_fresh_party(ctx, membership.party_id),
        amount=amount,
        entry_date=on,
        entry_type="charge",
        source_type=SOURCE_CHARGE,
        source_id=charge.id,
        source_number=charge.number,
        note=charge.description,
        bucket="library",
    )
    charge.ledger_entry_id = entry.id
    charge.status = derive_status(charge)
    charge.save(force_insert=True)
    write_audit(
        ctx=ctx,
        action=AuditAction.LIBRARY_CHARGE_CREATED,
        entity_type="library_charge",
        entity_id=charge.id,
        after=charge_json(charge),
    )
    return charge


def _membership(ctx: Any, membership_id: Any, errors: Errors) -> LibraryMembership | None:
    pk = uuid_or_none(membership_id)
    row = LibraryMembership.objects.filter(tenant=ctx.tenant, pk=pk).first() if pk else None
    if row is None:
        errors.add("membership_id", "Choose one of the options.")
    return row


@transaction.atomic
def create_manual_charge(*, ctx: Any, data: Any) -> LibraryCharge:
    """`POST /library/charges` (FR-8): a `processing` or `other` charge by hand."""
    from apps.parties.services.balance import lock_party

    if not isinstance(data, dict):
        raise ValidationFailed({"non_field_errors": ["Expected an object."]})
    errors = Errors()
    membership = _membership(ctx, data.get("membership_id"), errors)
    kind = data.get("kind")
    if kind not in MANUAL_CHARGE_KINDS:
        errors.add("kind", "Choose processing or other.")
    amount = money(errors, data, "amount")
    if amount is not None and amount <= ZERO:
        errors.add("amount", "Enter an amount above zero.")
    elif amount is None and "amount" not in errors:
        errors.add("amount", "This field is required.")
    description = text(errors, data, "description", CHARGE_DESCRIPTION_MAX, required=True)
    on = date(errors, data, "charge_date")
    errors.raise_if_any()
    assert membership is not None and amount is not None
    lock_party(tenant=ctx.tenant, party_id=membership.party_id)
    membership = LibraryMembership.objects.select_for_update().get(pk=membership.pk)
    if membership.status == MembershipStatus.CLOSED:
        raise BusinessRuleViolation(
            "library_membership_closed",
            "This membership is closed.",
            details={"membership_id": str(membership.id)},
        )
    return create_charge(
        ctx=ctx,
        membership=membership,
        kind=kind,
        amount=amount,
        description=description,
        charge_date=on,
    )


# ── Waive and reverse ───────────────────────────────────────────────────────


def _locked_charge(ctx: Any, charge_id: Any) -> LibraryCharge:
    from apps.parties.services.balance import lock_party

    pk = uuid_or_none(charge_id)
    peek = LibraryCharge.objects.filter(tenant=ctx.tenant, pk=pk).first() if pk else None
    if peek is None:
        raise NotFound()
    lock_party(tenant=ctx.tenant, party_id=peek.party_id)
    return LibraryCharge.objects.select_for_update().select_related("party").get(pk=peek.pk)


def _post_waiver(
    *,
    ctx: Any,
    charge: LibraryCharge,
    kind: str,
    amount: Decimal,
    reason: str,
    on: dt.date,
    refund_payment_id: Any = None,
) -> LibraryWaiver:
    from apps.ledger.services.postings import post_source_entry

    waiver = LibraryWaiver(
        tenant=ctx.tenant,
        created_by=getattr(ctx, "actor", None),
        charge=charge,
        party_id=charge.party_id,
        kind=kind,
        amount=amount,
        reason=reason,
        on_date=on,
        refund_payment_id=refund_payment_id,
    )
    entry, _balance = post_source_entry(
        ctx=ctx,
        party=_fresh_party(ctx, charge.party_id),
        amount=amount,
        entry_date=on,
        entry_type="adjustment_credit",
        source_type=SOURCE_WAIVER,
        source_id=waiver.id,
        source_number=charge.number,
        note=(
            f"{charge.description} · {reason}"[:CHARGE_DESCRIPTION_MAX]
            if reason
            else charge.description
        ),
        bucket="library",
    )
    waiver.ledger_entry_id = entry.id
    waiver.save(force_insert=True)
    return waiver


@transaction.atomic
def waive(*, ctx: Any, charge_id: Any, data: Any) -> tuple[LibraryCharge, LibraryWaiver]:
    """`POST /library/charges/{id}/waive` (FR-3, BR-5). The codename is the view's."""
    from apps.library.services.settings import settings_for
    from apps.parties.services.credit import may_override

    if not isinstance(data, dict):
        raise ValidationFailed({"non_field_errors": ["Expected an object."]})
    charge = _locked_charge(ctx, charge_id)
    if charge.reversed_at is not None or Decimal(charge.amount_due) <= ZERO:
        raise BusinessRuleViolation(
            "library_charge_not_open",
            "Nothing is owed on this charge.",
            details={"status": charge.status},
        )
    errors = Errors()
    amount = money(errors, data, "amount")
    if amount is None and "amount" not in errors:
        errors.add("amount", "This field is required.")
    elif amount is not None and amount <= ZERO:
        errors.add("amount", "Enter an amount above zero.")
    elif amount is not None and amount > Decimal(charge.amount_due):
        errors.add("amount", f"At most ₹{charge.amount_due} is owed on this charge.")
    reason = text(errors, data, "reason", REASON_MAX, required=True)
    if reason is not None and len(reason) < WAIVER_REASON_MIN:
        errors.add("reason", "Say why in a few words.")
    errors.raise_if_any()
    assert amount is not None and reason is not None
    ceiling = settings_for(ctx.tenant).waiver_ceiling
    over = ceiling is not None and Decimal(charge.waived_amount) + amount > Decimal(ceiling)
    if over and not (ctx.actor is not None and may_override(tenant=ctx.tenant, user=ctx.actor)):
        raise BusinessRuleViolation(
            "library_waiver_over_ceiling",
            f"Waivers above ₹{ceiling} need the owner or an admin.",
            details={"ceiling": f"{Decimal(ceiling):.2f}"},
        )
    before = charge.status
    waiver = _post_waiver(
        ctx=ctx,
        charge=charge,
        kind=WaiverKind.WAIVER.value,
        amount=amount,
        reason=reason,
        on=tenant_today(ctx.tenant),
    )
    charge.waived_amount = q2(Decimal(charge.waived_amount) + amount)
    _save(charge)
    write_audit(
        ctx=ctx,
        action=AuditAction.LIBRARY_CHARGE_WAIVED,
        entity_type="library_charge",
        entity_id=charge.id,
        before={"status": before},
        after={"status": charge.status, "waiver": waiver_json(waiver)},
    )
    return charge, waiver


@transaction.atomic
def reverse(*, ctx: Any, charge_id: Any, data: Any) -> LibraryCharge:
    """`POST /library/charges/{id}/reverse` (FR-9, BR-11): only while nothing is paid."""
    from apps.ledger.services.postings import reverse_source_entries
    from apps.payments.models import Allocation

    charge = _locked_charge(ctx, charge_id)
    errors = Errors()
    reason = text(
        errors, data if isinstance(data, dict) else {}, "reason", REASON_MAX, required=True
    )
    if reason is not None and len(reason) < WAIVER_REASON_MIN:
        errors.add("reason", "Say why in a few words.")
    errors.raise_if_any()
    if charge.reversed_at is not None:
        raise BusinessRuleViolation(
            "library_charge_not_open",
            "This charge is already reversed.",
            details={"status": charge.status},
        )
    if Decimal(charge.amount_paid) > ZERO:
        payment_ids = sorted(
            {
                str(pid)
                for pid in Allocation.objects.filter(
                    tenant=ctx.tenant, document_type=CHARGE_KIND, document_id=charge.id
                ).values_list("payment_id", flat=True)
            }
        )
        raise BusinessRuleViolation(
            "library_charge_has_payments",
            "Void the payments on this charge first.",
            details={"payment_ids": payment_ids},
        )
    before = charge.status
    reverse_source_entries(ctx=ctx, source_type=SOURCE_CHARGE, source_id=charge.id, reason=reason)
    now = timezone.now()
    for waiver in charge.waivers.filter(reversed_at__isnull=True):
        reverse_source_entries(
            ctx=ctx, source_type=SOURCE_WAIVER, source_id=waiver.id, reason=reason
        )
        LibraryWaiver.objects.filter(pk=waiver.pk).update(reversed_at=now)
    charge.reversed_at = now
    charge.reversed_reason = reason
    _save(charge)
    write_audit(
        ctx=ctx,
        action=AuditAction.LIBRARY_CHARGE_REVERSED,
        entity_type="library_charge",
        entity_id=charge.id,
        before={"status": before},
        after={"status": charge.status, "reason": reason},
    )
    return charge


# ── The allocation target (contracts §1.4; T-LIB-07-4) ──────────────────────


class LibraryChargeTarget:
    """A payment IN settling library charges: `library` bucket (DEC-019), FIFO may choose it."""

    document_type = CHARGE_KIND
    direction = "in"
    bucket = "library"
    auto = True
    _ORDER = ("charge_date", "number", "id")

    def _rows(self, tenant: Any) -> Any:
        return LibraryCharge.objects.filter(tenant=tenant)

    def open_documents(self, *, tenant: Any, party_id: Any) -> list[Any]:
        return list(self._rows(tenant).open().filter(party_id=party_id).order_by(*self._ORDER))

    def find(self, *, tenant: Any, ids: list[Any]) -> list[Any]:
        return list(self._rows(tenant).filter(pk__in=ids).order_by(*self._ORDER))

    def lock(self, *, tenant: Any, ids: list[Any]) -> list[Any]:
        return list(
            self._rows(tenant).select_for_update().filter(pk__in=ids).order_by(*self._ORDER)
        )

    def lock_open_for_party(self, *, tenant: Any, party_id: Any) -> list[Any]:
        return list(
            self._rows(tenant)
            .select_for_update()
            .open()
            .filter(party_id=party_id)
            .order_by(*self._ORDER)
        )

    def is_open(self, document: Any) -> bool:
        return document.reversed_at is None and Decimal(document.amount_due) > ZERO

    def outstanding(self, document: Any) -> Decimal:
        if document.reversed_at is not None:
            return ZERO
        return max(Decimal(document.amount_due), ZERO)

    def party_id(self, document: Any) -> Any:
        return document.party_id

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
            raise BusinessRuleViolation(
                "over_allocated",
                "This is more than the charge still owes.",
                details={"outstanding": str(self.outstanding(document))},
            )
        before = document.status
        document.amount_paid = q2(Decimal(document.amount_paid) + amount)
        _save(document)
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
        # G21 — a lost charge refunded on "found" must not drop below what was refunded.
        if Decimal(document.amount_paid) - amount < Decimal(document.refunded_amount):
            raise BusinessRuleViolation(
                "library_charge_not_open",
                "This payment was refunded when the book was found.",
                details={"status": document.status},
            )
        before = document.status
        document.amount_paid = q2(Decimal(document.amount_paid) - amount)
        _save(document)
        return before, document.status

    def summary(self, document: Any) -> dict:
        return {
            "document_type": CHARGE_KIND,
            "document_id": str(document.id),
            "kind": "library_charge",
            "number": document.number,
            "label": document.description[:TARGET_LABEL_MAX],
            "document_date": document.charge_date.isoformat(),
            "due_on": None,
            "grand_total": f"{Decimal(document.amount):.2f}",
            "amount_due": f"{self.outstanding(document):.2f}",
            "status": document.status,
        }

    def audit_action(self) -> str:
        return CHARGE_STATUS_AUDIT


# ── Khata resolvers and the module-off guard ────────────────────────────────


def resolve_charges(ids: set[str]) -> dict[str, dict]:
    rows = LibraryCharge.objects.filter(pk__in=ids).values_list("id", "number", "status")
    return {
        str(pk): {"number": number, "status": status, "kind": "library_charge"}
        for pk, number, status in rows
    }


def resolve_waivers(ids: set[str]) -> dict[str, dict]:
    rows = LibraryWaiver.objects.filter(pk__in=ids).values_list("id", "charge__number", "kind")
    return {
        str(pk): {"number": number, "status": kind, "kind": "library_waiver"}
        for pk, number, kind in rows
    }


class OpenChargesCounter:
    """`library.off.chargesOpen`: open charges block switching the module off (G20: open means
    owing AND not reversed). A frozen-equality class, so a second `ready()` registers nothing new.
    """

    def __call__(self, tenant: Any) -> int:
        try:
            return LibraryCharge.objects.filter(tenant=tenant).open().count()
        except Exception:  # noqa: BLE001 — a counter must never raise (EC-3)
            return 0

    def __eq__(self, other: object) -> bool:
        return isinstance(other, OpenChargesCounter)

    def __hash__(self) -> int:
        return hash(OpenChargesCounter)
