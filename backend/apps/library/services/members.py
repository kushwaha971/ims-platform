"""Memberships: enrol, edit, renew, change type, suspend, close, re-join, deposits (LIB-04; task B07).

A member is a party with a library membership — one contact across every module
(ADR-046) and one membership row per party for ever (C10): a member who leaves is
`closed` and re-joins on the same row, keeping their number.

── Money never lives here ─────────────────────────────────────────────────────
Fees are `library_charge` rows (B10's `create_charge`, BR-4). The deposit is a
core held deposit (`open_deposit`, `receive_deposit`, `apply_deposit`,
`refund_deposit`; ADR-044), so it is never income and never offsets dues by
itself (BR-5). "Collect now" at enrolment records TWO payments when both blocks
are filled — one IN allocated to the fee charges (main), one through
`receive_deposit` (deposit) — because one payment settles one kind of balance
(contracts §1.4, FR-4).

── Status is derived (BR-1) ───────────────────────────────────────────────────
`closed`, else `suspended` while the suspension lasts, else `expired` past
`valid_until`, else `active`. No job flips a status, so a missed job can never
leave a member wrongly active; every read calls `effective_status`.

── Locks (BR-9) ───────────────────────────────────────────────────────────────
party → membership → charges → deposit → payments → sequences. The member number
is taken from its counter after the party lock, before any charge number.

Loans and holds do not exist yet (B09, B11): the close guard on open loans and
the hold cancellation join `close` with them (G24); the summary omits the loan
and hold figures rather than claiming 0 (PTY-03).
"""

from __future__ import annotations

import calendar
import datetime as dt
from decimal import Decimal
from typing import Any

from django.db import IntegrityError, transaction
from django.db.models.functions import Upper

from apps.common.audit import AuditAction, write_audit
from apps.common.dates import tenant_today
from apps.common.exceptions import BusinessRuleViolation, NotFound, StaleVersion, ValidationFailed
from apps.common.money import ZERO, q2
from apps.library.constants import (
    GROUP_LABEL_MAX,
    REASON_MAX,
    WAIVER_REASON_MIN,
    ChargeKind,
    MembershipStatus,
    PeriodKind,
)
from apps.library.models import (
    LibraryCharge,
    LibraryCopy,
    LibraryMembership,
    LibraryMembershipPeriod,
    LibraryMembershipType,
)
from apps.library.services import codes, numbering
from apps.library.services.charges import create_charge
from apps.library.services.fields import Errors, date, owned, text, uuid_or_none

MEMBER_KIND = "library_member"
MODULE = "library"
SUBJECT_TYPE = "library_membership"
DEPOSIT_PURPOSE = "Library deposit"
#: LIB-04 §9: a start date at most this far ahead, and never before 2000.
START_AHEAD_DAYS = 30
EARLIEST_START = dt.date(2000, 1, 1)


# ── Derived figures (BR-1, BR-2) ────────────────────────────────────────────


def effective_status(m: LibraryMembership, today: dt.date) -> str:
    if m.status == MembershipStatus.CLOSED:
        return "closed"
    if m.status == MembershipStatus.SUSPENDED and (
        m.suspended_until is None or m.suspended_until >= today
    ):
        return "suspended"
    if m.valid_until is not None and m.valid_until < today:
        return "expired"
    return "active"


def add_months(day: dt.date, months: int) -> dt.date:
    """`day` plus `months`, the day clamped to the month's end (31 Jan + 1 → 28/29 Feb)."""
    index = day.month - 1 + months
    year, month = day.year + index // 12, index % 12 + 1
    return dt.date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def valid_until_for(start: dt.date, months: int | None) -> dt.date | None:
    """BR-2: `start + months − 1 day` (1 Oct + 6 months → 31 Mar); none when the type has none."""
    if months is None:
        return None
    return add_months(start, months) - dt.timedelta(days=1)


def dues_amount(m: LibraryMembership) -> Decimal:
    """Σ `amount_due` of the member's open library charges (G20: open = owing, not reversed)."""
    return q2(
        sum(
            (c.amount_due for c in LibraryCharge.objects.filter(membership=m).open()),
            ZERO,
        )
    )


def deposit_for(m: LibraryMembership) -> Any:
    """The membership's standing held deposit, or None."""
    from apps.payments.constants import DepositStatus
    from apps.payments.models import HeldDeposit

    return (
        HeldDeposit.objects.filter(
            tenant_id=m.tenant_id, module=MODULE, subject_type=SUBJECT_TYPE, subject_id=m.id
        )
        .exclude(status=DepositStatus.RELEASED)
        .order_by("-created_at")
        .first()
    )


def member_blocks(m: LibraryMembership, today: dt.date) -> list[dict]:
    """BR-10 — what stops this member borrowing. The loan blocks (`copy_limit_reached`,
    `has_overdue`) join with B09, which owns loans."""
    status = effective_status(m, today)
    blocks: list[dict] = []
    if status in ("expired", "suspended", "closed"):
        blocks.append({"code": f"membership_{status}", "overridable": False, "params": {}})
    kind = m.membership_type
    if kind.dues_block_amount is not None:
        owed = dues_amount(m)
        if owed > Decimal(kind.dues_block_amount):
            blocks.append(
                {
                    "code": "dues_over_limit",
                    "overridable": True,
                    "params": {"dues": f"{owed:.2f}", "limit": f"{kind.dues_block_amount:.2f}"},
                }
            )
    if kind.deposit_required_to_borrow and Decimal(kind.deposit_amount) > ZERO:
        deposit = deposit_for(m)
        held = Decimal(deposit.held_amount) if deposit is not None else ZERO
        expected = Decimal(deposit.expected_amount) if deposit is not None else kind.deposit_amount
        if held < Decimal(expected):
            blocks.append(
                {
                    "code": "deposit_not_received",
                    "overridable": True,
                    "params": {"expected": f"{Decimal(expected):.2f}", "held": f"{held:.2f}"},
                }
            )
    return blocks


# ── Reading ─────────────────────────────────────────────────────────────────


def member_summary(m: LibraryMembership, today: dt.date) -> dict:
    deposit = deposit_for(m)
    return {
        "membership_id": str(m.id),
        "party_id": str(m.party_id),
        "name": m.party.name,
        "member_number": m.member_number,
        "type": {
            "id": str(m.membership_type_id),
            "name": m.membership_type.name,
            "max_copies": m.membership_type.max_copies,
        },
        "status": m.status,
        "effective_status": effective_status(m, today),
        "starts_on": m.starts_on.isoformat(),
        "valid_until": m.valid_until.isoformat() if m.valid_until else None,
        "group_label": m.group_label,
        "dues_amount": f"{dues_amount(m):.2f}",
        "deposit": (
            {
                "id": str(deposit.id),
                "expected": f"{Decimal(deposit.expected_amount):.2f}",
                "held": f"{Decimal(deposit.held_amount):.2f}",
            }
            if deposit is not None
            else None
        ),
        "blocks": member_blocks(m, today),
    }


def member_detail(m: LibraryMembership, today: dt.date) -> dict:
    from apps.library.services.charges import charge_json
    from apps.parties.models import PartyRelation

    guardian = (
        PartyRelation.objects.filter(party_id=m.party_id, kind="guardian", to_on__isnull=True)
        .select_related("related_party")
        .first()
    )
    party = m.party
    return {
        **member_summary(m, today),
        "party": {"id": str(party.id), "name": party.name, "mobile": party.mobile},
        "guardian": (
            {"party_id": str(guardian.related_party_id), "name": guardian.related_party.name}
            if guardian is not None
            else None
        ),
        "suspended_until": m.suspended_until.isoformat() if m.suspended_until else None,
        "suspension_reason": m.suspension_reason,
        "closed_on": m.closed_on.isoformat() if m.closed_on else None,
        "closed_reason": m.closed_reason,
        "notes": m.notes,
        "periods": [
            {
                "kind": p.kind,
                "membership_type_id": str(p.membership_type_id),
                "starts_on": p.starts_on.isoformat(),
                "valid_until": p.valid_until.isoformat() if p.valid_until else None,
                "fee_charge_id": str(p.fee_charge_id) if p.fee_charge_id else None,
                "reason": p.reason,
                "on_date": p.on_date.isoformat(),
            }
            for p in m.periods.order_by("-created_at", "-id")
        ],
        "charges_open": [
            charge_json(c)
            for c in LibraryCharge.objects.filter(membership=m)
            .open()
            .order_by("charge_date", "number", "id")
        ],
        "version": m.version,
    }


# ── Small parts ─────────────────────────────────────────────────────────────


def _period(
    ctx: Any,
    m: LibraryMembership,
    kind: str,
    *,
    on: dt.date,
    fee: Any = None,
    reason: str = "",
    starts_on: dt.date | None = None,
    valid_until: Any = "same",
) -> None:
    LibraryMembershipPeriod.objects.create(
        tenant=ctx.tenant,
        created_by=getattr(ctx, "actor", None),
        membership=m,
        kind=kind,
        membership_type_id=m.membership_type_id,
        starts_on=starts_on or m.starts_on,
        valid_until=m.valid_until if valid_until == "same" else valid_until,
        fee_charge=fee,
        reason=reason,
        on_date=on,
    )


def _audit(ctx: Any, action: str, m: LibraryMembership, **after: Any) -> None:
    write_audit(
        ctx=ctx,
        action=action,
        entity_type="library_membership",
        entity_id=m.id,
        after={"status": m.status, "member_number": m.member_number, **after},
    )


def _fee(
    ctx: Any, m: LibraryMembership, kind: str, amount: Any, label: str, on: dt.date
) -> LibraryCharge | None:
    """A fee charge (BR-4), or none for a zero fee (EC-2 of LIB-07)."""
    if amount is None or Decimal(amount) <= ZERO:
        return None
    return create_charge(
        ctx=ctx,
        membership=m,
        kind=kind,
        amount=Decimal(amount),
        description=f"{label} – {m.membership_type.name} ({m.member_number})",
        charge_date=on,
    )


def _block(errors: Errors, data: dict, field: str) -> dict | None:
    """A PaymentBlock `{mode_breakup, payment_date?}` (LIB-04 §6), its amount summed; the
    lines themselves are validated by `record_payment`."""
    raw = data.get(field)
    if raw in (None, {}):
        return None
    if not isinstance(raw, dict) or not isinstance(raw.get("mode_breakup"), list):
        errors.add(field, "Give how the money was paid.")
        return None
    total = ZERO
    for line in raw["mode_breakup"]:
        try:
            total += Decimal(str((line or {}).get("amount") or "0"))
        except Exception:  # noqa: BLE001 — record_payment reports the line itself
            errors.add(f"{field}.mode_breakup", "Enter an amount.")
            return None
    if total <= ZERO:
        errors.add(field, "Enter an amount above zero.")
        return None
    return {
        "mode_breakup": raw["mode_breakup"],
        "payment_date": raw.get("payment_date"),
        "total": q2(total),
    }


def _collect_fees(ctx: Any, m: LibraryMembership, block: dict, charges: list) -> Any:
    """One payment IN allocated to these fee charges, oldest first (FR-4)."""
    from apps.payments.services.record import record_payment

    due = sum((Decimal(c.amount_due) for c in charges), ZERO)
    if block["total"] > due:
        raise ValidationFailed({"collect_fees": ["More than the fees due."]})
    left = block["total"]
    allocations = []
    for charge in charges:
        take = min(Decimal(charge.amount_due), left)
        if take > ZERO:
            allocations.append(
                {
                    "document_type": "library_charge",
                    "document_id": str(charge.id),
                    "amount": str(take),
                }
            )
            left -= take
    payload = {
        "direction": "in",
        "party_id": str(m.party_id),
        "mode_breakup": block["mode_breakup"],
        "allocations": allocations,
    }
    if block.get("payment_date"):
        payload["payment_date"] = block["payment_date"]
    return record_payment(ctx=ctx, payload=payload)["payment"]


def _collect_deposit(ctx: Any, deposit: Any, block: dict) -> Any:
    from apps.payments.services.deposits import receive_deposit

    if deposit is None:
        raise ValidationFailed({"collect_deposit": ["This membership type takes no deposit."]})
    owed = Decimal(deposit.expected_amount) - Decimal(deposit.received_amount)
    if block["total"] > owed:
        raise ValidationFailed({"collect_deposit": ["More than the deposit due."]})
    return receive_deposit(
        ctx=ctx,
        deposit_id=deposit.id,
        amount=str(block["total"]),
        mode_breakup=block["mode_breakup"],
        payment_date=block.get("payment_date"),
    )["payment"]


def _open_deposit(ctx: Any, m: LibraryMembership) -> Any:
    from apps.payments.services.deposits import open_deposit

    amount = Decimal(m.membership_type.deposit_amount)
    if amount <= ZERO:
        return None
    return open_deposit(
        ctx=ctx,
        party_id=m.party_id,
        module=MODULE,
        subject_type=SUBJECT_TYPE,
        subject_id=m.id,
        purpose=DEPOSIT_PURPOSE,
        expected_amount=str(amount),
    )


def _number_clash(tenant: Any, key: str, *, exclude: Any = None) -> None:
    """Unique among members (409 `library_member_number_taken`) and never a copy's number or
    barcode (409 `library_code_ambiguous`, BR-8: the counter's scan resolver must not guess)."""
    taken = (
        LibraryMembership.objects.annotate(k=Upper("member_number"))
        .filter(tenant=tenant, k=key)
        .exclude(pk=exclude)
        .select_related("party")
        .first()
    )
    if taken is not None:
        raise BusinessRuleViolation(
            "library_member_number_taken",
            f"{taken.member_number} is already {taken.party.name}.",
            details={"number": taken.member_number, "membership_id": str(taken.id)},
        )
    for column in ("accession_number", "barcode"):
        copy = LibraryCopy.objects.annotate(k=Upper(column)).filter(tenant=tenant, k=key).first()
        if copy is not None:
            raise BusinessRuleViolation(
                "library_code_ambiguous",
                "This code is already used by another record.",
                details={"code": key, "matches": [{"kind": "copy", "id": str(copy.id)}]},
            )


def _typed_number(errors: Errors, data: dict) -> str | None:
    raw = data.get("member_number")
    if raw in (None, ""):
        return None
    try:
        return codes.validate_number(str(raw))
    except codes.InvalidNumber as exc:
        errors.add("member_number", str(exc))
        return None


def _next_number(tenant: Any) -> str:
    """The counter's next number, passing over any a copy already wears (as B05 does for
    barcodes; a rolled-back enrol returns it)."""
    from apps.platform_app.services.sequences import allocate_counter

    while True:
        number = allocate_counter(tenant=tenant, kind=MEMBER_KIND)
        try:
            _number_clash(tenant, codes.number_key(number))
        except BusinessRuleViolation:
            continue
        return number


def _locked(ctx: Any, membership_id: Any) -> LibraryMembership:
    from apps.parties.services.balance import lock_party

    pk = uuid_or_none(membership_id)
    peek = LibraryMembership.objects.filter(tenant=ctx.tenant, pk=pk).first() if pk else None
    if peek is None:
        raise NotFound()
    lock_party(tenant=ctx.tenant, party_id=peek.party_id)
    return (
        LibraryMembership.objects.select_for_update(of=("self",))
        .select_related("party", "membership_type")
        .get(pk=peek.pk)
    )


def _reason(errors: Errors, data: dict, *, required: bool = True) -> str | None:
    reason = text(errors, data, "reason", REASON_MAX, required=required)
    if required and reason is not None and len(reason) < WAIVER_REASON_MIN:
        errors.add("reason", "Say why in a few words.")
    return reason


def _active_type(errors: Errors, tenant: Any, raw: Any) -> LibraryMembershipType | None:
    kind = owned(LibraryMembershipType, tenant, raw, errors, "membership_type_id")
    if kind is None and "membership_type_id" not in errors:
        errors.add("membership_type_id", "This field is required.")
    elif kind is not None and not kind.is_active:
        errors.add("membership_type_id", "This membership type is switched off.")
    return kind


def _dates(
    errors: Errors, data: dict, kind: LibraryMembershipType | None, today: dt.date
) -> tuple[dt.date | None, dt.date | None]:
    start = date(errors, data, "starts_on") or today
    if start > today + dt.timedelta(days=START_AHEAD_DAYS) or start < EARLIEST_START:
        errors.add("starts_on", f"Start within {START_AHEAD_DAYS} days of today.")
    until = date(errors, data, "valid_until")
    if until is None and kind is not None and "valid_until" not in data:
        until = valid_until_for(start, kind.validity_months)
    if until is not None and until < start:
        errors.add("valid_until", "The end date is before the start date.")
    return start, until


# ── Enrol (FR-2…FR-4) ───────────────────────────────────────────────────────


def _party(ctx: Any, data: dict, errors: Errors) -> Any:
    """`party_id`, or `party: {name, mobile, …}` created through the parties service."""
    from apps.parties.models import Party
    from apps.parties.services.crud import create_party

    if data.get("party_id"):
        party = owned(Party, ctx.tenant, data.get("party_id"), errors, "party_id")
        if party is not None and party.status != "active":
            errors.add("party_id", "This party is archived. Restore them first.")
        return party
    raw = data.get("party")
    if not isinstance(raw, dict) or not raw.get("name"):
        errors.add("party_id", "Choose a person or enter their name.")
        return None
    errors.raise_if_any()
    try:
        party, _warnings = create_party(ctx=ctx, payload=raw)
    except ValidationFailed as exc:
        raise ValidationFailed({f"party.{k}": v for k, v in exc.details.items()}) from None
    return party


def _guardian(ctx: Any, member_party: Any, raw: Any) -> None:
    from apps.parties.services.crud import create_party
    from apps.parties.services.relations import create_relation

    if not raw:
        return
    if not isinstance(raw, dict):
        raise ValidationFailed({"guardian": ["Choose the guardian or enter their name."]})
    related_id = raw.get("party_id")
    if not related_id:
        try:
            guardian, _warnings = create_party(
                ctx=ctx, payload={"name": raw.get("name"), "mobile": raw.get("mobile")}
            )
        except ValidationFailed as exc:
            raise ValidationFailed({f"guardian.{k}": v for k, v in exc.details.items()}) from None
        related_id = guardian.id
    create_relation(
        ctx=ctx,
        party=member_party,
        related_party_id=related_id,
        kind="guardian",
        receives_messages=True,
    )


@transaction.atomic
def enrol(*, ctx: Any, data: Any) -> dict:
    """`POST /library/members`. Returns `{membership, charges, payments, deposit}`."""
    from apps.parties.services.balance import lock_party

    if not isinstance(data, dict):
        raise ValidationFailed({"non_field_errors": ["Expected an object."]})
    today = tenant_today(ctx.tenant)
    errors = Errors()
    kind = _active_type(errors, ctx.tenant, data.get("membership_type_id"))
    start, until = _dates(errors, data, kind, today)
    typed = _typed_number(errors, data)
    group = text(errors, data, "group_label", GROUP_LABEL_MAX)
    fees_block = _block(errors, data, "collect_fees")
    deposit_block = _block(errors, data, "collect_deposit")
    party = _party(ctx, data, errors)
    errors.raise_if_any()
    assert kind is not None and party is not None and start is not None

    party = lock_party(tenant=ctx.tenant, party_id=party.id)
    existing = LibraryMembership.objects.filter(tenant=ctx.tenant, party=party).first()
    if existing is not None:
        raise BusinessRuleViolation(
            "library_membership_exists",
            f"{party.name} is already member {existing.member_number}.",
            details={"membership_id": str(existing.id), "status": existing.status},
        )
    if typed is not None:
        _number_clash(ctx.tenant, codes.number_key(typed))
    number = typed or _next_number(ctx.tenant)
    try:
        with transaction.atomic():
            m = LibraryMembership.objects.create(
                tenant=ctx.tenant,
                created_by=getattr(ctx, "actor", None),
                party=party,
                member_number=number,
                member_number_sort=codes.natural_sort_key(number),
                membership_type=kind,
                starts_on=start,
                valid_until=until,
                group_label=group or "",
            )
    except IntegrityError:  # EC-5: another device enrolled the same party a moment ago
        raise BusinessRuleViolation(
            "library_membership_exists",
            f"{party.name} is already a member.",
            details={"status": "active"},
        ) from None
    _guardian(ctx, party, data.get("guardian"))
    admission = _fee(ctx, m, ChargeKind.ADMISSION_FEE, kind.admission_fee, "Admission", today)
    fee = _fee(ctx, m, ChargeKind.MEMBERSHIP_FEE, kind.fee_amount, "Membership", today)
    _period(ctx, m, PeriodKind.ENROL, on=today, fee=fee)
    deposit = _open_deposit(ctx, m)
    charges = [c for c in (admission, fee) if c is not None]
    payments = []
    if fees_block is not None:
        payments.append(_collect_fees(ctx, m, fees_block, charges))
    if deposit_block is not None:
        payments.append(_collect_deposit(ctx, deposit, deposit_block))
    if typed is not None:
        numbering.raise_for_typed(ctx, MEMBER_KIND, [typed])
    _audit(ctx, AuditAction.LIBRARY_MEMBERSHIP_ENROLLED, m, membership_type_id=str(kind.id))
    for charge in charges:
        charge.refresh_from_db()
    if deposit is not None:
        deposit.refresh_from_db()
    return {"membership": m, "charges": charges, "payments": payments, "deposit": deposit}


# ── Edit, renew, change type (FR-5, FR-6) ───────────────────────────────────


@transaction.atomic
def patch(*, ctx: Any, membership_id: Any, data: Any) -> LibraryMembership:
    """Group, validity, notes and the member number (until the first loan, B09)."""
    if not isinstance(data, dict):
        raise ValidationFailed({"non_field_errors": ["Expected an object."]})
    m = _locked(ctx, membership_id)
    version = data.get("version")
    if isinstance(version, bool) or not isinstance(version, int):
        raise ValidationFailed({"version": ["This field is required."]})
    if m.version != version:
        raise StaleVersion(m.version)
    errors = Errors()
    changes: dict[str, Any] = {}
    if "group_label" in data:
        changes["group_label"] = text(errors, data, "group_label", GROUP_LABEL_MAX)
    if "notes" in data:
        changes["notes"] = text(errors, data, "notes", 2000)
    if "valid_until" in data:
        until = date(errors, data, "valid_until")
        if until is not None and until < m.starts_on:
            errors.add("valid_until", "The end date is before the start date.")
        changes["valid_until"] = until
    typed = _typed_number(errors, data) if "member_number" in data else None
    errors.raise_if_any()
    if typed is not None and codes.number_key(typed) != codes.number_key(m.member_number):
        _number_clash(ctx.tenant, codes.number_key(typed), exclude=m.pk)
        changes["member_number"] = typed
        changes["member_number_sort"] = codes.natural_sort_key(typed)
    if "guardian" in data:
        _guardian(ctx, m.party, data.get("guardian"))
    changed = [f for f, v in changes.items() if getattr(m, f) != v]
    for field in changed:
        setattr(m, field, changes[field])
    m.version += 1
    m.save(update_fields=[*changed, "version", "updated_at"])
    if "member_number" in changed:
        numbering.raise_for_typed(ctx, MEMBER_KIND, [m.member_number])
    _audit(ctx, AuditAction.LIBRARY_MEMBERSHIP_UPDATED, m, changed=sorted(changed))
    return m


def _not_closed(m: LibraryMembership) -> None:
    if m.status == MembershipStatus.CLOSED:
        raise BusinessRuleViolation(
            "library_membership_closed",
            "This membership is closed. Re-join instead.",
            details={"membership_id": str(m.id)},
        )


@transaction.atomic
def renew(*, ctx: Any, membership_id: Any, data: Any) -> dict:
    """FR-5, BR-3 (D17): from the old end when renewed on or before it, else from today."""
    data = data if isinstance(data, dict) else {}
    m = _locked(ctx, membership_id)
    _not_closed(m)
    months = m.membership_type.validity_months
    if months is None or m.valid_until is None:
        raise ValidationFailed({"membership_type_id": ["This membership does not expire."]})
    errors = Errors()
    block = _block(errors, data, "collect")
    errors.raise_if_any()
    today = tenant_today(ctx.tenant)
    start = m.valid_until + dt.timedelta(days=1) if today <= m.valid_until else today
    m.valid_until = valid_until_for(start, months)
    m.version += 1
    m.save(update_fields=["valid_until", "version", "updated_at"])
    fee = _fee(ctx, m, ChargeKind.RENEWAL_FEE, m.membership_type.fee_amount, "Renewal", today)
    _period(ctx, m, PeriodKind.RENEW, on=today, fee=fee, starts_on=start)
    payments = []
    if block is not None:
        if fee is None:
            raise ValidationFailed({"collect": ["There is no fee to collect."]})
        payments.append(_collect_fees(ctx, m, block, [fee]))
    _audit(ctx, AuditAction.LIBRARY_MEMBERSHIP_RENEWED, m, valid_until=m.valid_until.isoformat())
    return {"membership": m, "charges": [fee] if fee else [], "payments": payments}


@transaction.atomic
def change_type(*, ctx: Any, membership_id: Any, data: Any) -> LibraryMembership:
    """FR-6, BR-8: new loans and renewals only; open loans keep their dates; the deposit
    expectation is not changed automatically (C11)."""
    data = data if isinstance(data, dict) else {}
    m = _locked(ctx, membership_id)
    _not_closed(m)
    errors = Errors()
    kind = _active_type(errors, ctx.tenant, data.get("membership_type_id"))
    reason = _reason(errors, data)
    errors.raise_if_any()
    assert kind is not None
    if kind.pk == m.membership_type_id:
        return m
    before = str(m.membership_type_id)
    m.membership_type = kind
    m.version += 1
    m.save(update_fields=["membership_type", "version", "updated_at"])
    _period(ctx, m, PeriodKind.TYPE_CHANGE, on=tenant_today(ctx.tenant), reason=reason or "")
    _audit(
        ctx, AuditAction.LIBRARY_MEMBERSHIP_TYPE_CHANGED, m, before_type=before, type=str(kind.pk)
    )
    return m


# ── Suspend, reactivate (FR-7) ──────────────────────────────────────────────


@transaction.atomic
def suspend(*, ctx: Any, membership_id: Any, data: Any) -> LibraryMembership:
    data = data if isinstance(data, dict) else {}
    m = _locked(ctx, membership_id)
    _not_closed(m)
    errors = Errors()
    until = date(errors, data, "until")
    reason = _reason(errors, data)
    today = tenant_today(ctx.tenant)
    if until is not None and until < today:
        errors.add("until", "Choose today or a later date.")
    errors.raise_if_any()
    m.status = MembershipStatus.SUSPENDED
    m.suspended_until = until
    m.suspension_reason = reason or ""
    m.version += 1
    m.save(
        update_fields=["status", "suspended_until", "suspension_reason", "version", "updated_at"]
    )
    _period(ctx, m, PeriodKind.SUSPEND, on=today, reason=reason or "")
    _audit(
        ctx, AuditAction.LIBRARY_MEMBERSHIP_SUSPENDED, m, until=until.isoformat() if until else None
    )
    return m


@transaction.atomic
def reactivate(*, ctx: Any, membership_id: Any, data: Any) -> LibraryMembership:
    m = _locked(ctx, membership_id)
    if m.status != MembershipStatus.SUSPENDED:
        raise BusinessRuleViolation(
            "library_membership_inactive",
            "This membership is not suspended.",
            details={"status": m.status},
        )
    m.status = MembershipStatus.ACTIVE
    m.suspended_until = None
    m.suspension_reason = ""
    m.version += 1
    m.save(
        update_fields=["status", "suspended_until", "suspension_reason", "version", "updated_at"]
    )
    _period(ctx, m, PeriodKind.REACTIVATE, on=tenant_today(ctx.tenant))
    _audit(ctx, AuditAction.LIBRARY_MEMBERSHIP_REACTIVATED, m)
    return m


# ── Deposits (FR-12, D25, D28) ──────────────────────────────────────────────


def _may_refund(ctx: Any) -> bool:
    """D28: a refund needs the owner or admin ROLE — `library.member.close` granted to the
    counter by override still cannot hand money back (T-LIB-04-5)."""
    from apps.parties.services.credit import may_override

    return ctx.actor is not None and may_override(tenant=ctx.tenant, user=ctx.actor)


def _refuse_refund() -> BusinessRuleViolation:
    return BusinessRuleViolation(
        "permission_denied", "Only the owner or an admin can return a deposit.", details={}
    )


def _apply_to_dues(
    ctx: Any, m: LibraryMembership, deposit: Any, reason: str, amount: Any = None
) -> Decimal:
    """Apply the held deposit to the member's open charges, oldest first, up to `amount`."""
    from apps.payments.services.deposits import apply_deposit

    held = Decimal(deposit.held_amount) if deposit is not None else ZERO
    cap = held if amount is None else min(held, Decimal(amount))
    left = cap
    allocations = []
    for charge in (
        LibraryCharge.objects.filter(membership=m).open().order_by("charge_date", "number", "id")
    ):
        take = min(Decimal(charge.amount_due), left)
        if take > ZERO:
            allocations.append(
                {
                    "document_type": "library_charge",
                    "document_id": str(charge.id),
                    "amount": str(take),
                }
            )
            left -= take
    if not allocations:
        return ZERO
    apply_deposit(ctx=ctx, deposit_id=deposit.id, allocations=allocations, reason=reason)
    return q2(cap - left)


@transaction.atomic
def receive(*, ctx: Any, membership_id: Any, data: Any) -> Any:
    """`POST …/deposit/receive` — a PaymentBlock, or `opening: true` for one held before
    go-live (R37: an adjustment payment, never today's cash)."""
    from apps.payments.services.deposits import receive_deposit

    data = data if isinstance(data, dict) else {}
    m = _locked(ctx, membership_id)
    deposit = deposit_for(m) or _open_deposit(ctx, m)
    if deposit is None:
        raise ValidationFailed({"non_field_errors": ["This membership type takes no deposit."]})
    if data.get("opening") is True:
        return receive_deposit(
            ctx=ctx,
            deposit_id=deposit.id,
            amount=data.get("amount"),
            payment_date=data.get("payment_date"),
            opening=True,
        )["payment"]
    errors = Errors()
    block = _block(errors, {"collect_deposit": data}, "collect_deposit")
    errors.raise_if_any()
    assert block is not None
    return _collect_deposit(ctx, deposit, block)


@transaction.atomic
def apply(*, ctx: Any, membership_id: Any, data: Any) -> Decimal:
    """`POST …/deposit/apply` (D25): explicit, with a reason; oldest charges first."""
    data = data if isinstance(data, dict) else {}
    m = _locked(ctx, membership_id)
    errors = Errors()
    reason = _reason(errors, data)
    errors.raise_if_any()
    deposit = deposit_for(m)
    if deposit is None or Decimal(deposit.held_amount) <= ZERO:
        raise BusinessRuleViolation(
            "deposit_insufficient", "Nothing is held for this member.", details={"held": "0.00"}
        )
    return _apply_to_dues(ctx, m, deposit, reason or "", data.get("amount"))


@transaction.atomic
def refund(*, ctx: Any, membership_id: Any, data: Any) -> Any:
    from apps.payments.services.deposits import refund_deposit

    if not _may_refund(ctx):
        raise _refuse_refund()
    data = data if isinstance(data, dict) else {}
    m = _locked(ctx, membership_id)
    deposit = deposit_for(m)
    if deposit is None:
        raise BusinessRuleViolation(
            "deposit_insufficient", "Nothing is held for this member.", details={"held": "0.00"}
        )
    return refund_deposit(
        ctx=ctx,
        deposit_id=deposit.id,
        amount=data.get("amount"),
        mode_breakup=data.get("mode_breakup"),
        payment_date=data.get("payment_date"),
        reason=data.get("reason") or "",
    )["payment"]


# ── Close and re-join (FR-8, FR-9) ──────────────────────────────────────────


@transaction.atomic
def close(*, ctx: Any, membership_id: Any, data: Any) -> dict:
    """BR-6: apply the deposit to dues (when asked), then refund (owner/admin role), then
    close. What is still owed stays on the party (EC-4). Loans and holds join with B09/B11."""
    from apps.payments.services.deposits import refund_deposit

    data = data if isinstance(data, dict) else {}
    errors = Errors()
    reason = _reason(errors, data)
    refund_block = data.get("refund")
    if refund_block not in (None, {}) and not isinstance(refund_block, dict):
        errors.add("refund", "Give the amount and how it was paid.")
    errors.raise_if_any()
    if refund_block and not _may_refund(ctx):
        raise _refuse_refund()
    m = _locked(ctx, membership_id)
    _not_closed(m)
    today = tenant_today(ctx.tenant)
    deposit = deposit_for(m)
    applied = ZERO
    if data.get("apply_to_dues") and deposit is not None:
        applied = _apply_to_dues(ctx, m, deposit, reason or "Membership closed")
        deposit.refresh_from_db()
    refunded = ZERO
    if refund_block:
        if deposit is None:
            raise BusinessRuleViolation(
                "deposit_insufficient", "Nothing is held for this member.", details={"held": "0.00"}
            )
        payment = refund_deposit(
            ctx=ctx,
            deposit_id=deposit.id,
            amount=refund_block.get("amount"),
            mode_breakup=refund_block.get("mode_breakup"),
            payment_date=refund_block.get("payment_date"),
            reason=reason or "",
        )["payment"]
        refunded = Decimal(payment.amount)
    m.status = MembershipStatus.CLOSED
    m.closed_on = today
    m.closed_reason = reason or ""
    m.suspended_until = None
    m.version += 1
    m.save(
        update_fields=[
            "status",
            "closed_on",
            "closed_reason",
            "suspended_until",
            "version",
            "updated_at",
        ]
    )
    _period(ctx, m, PeriodKind.CLOSE, on=today, reason=reason or "")
    still_owed = dues_amount(m)
    _audit(
        ctx,
        AuditAction.LIBRARY_MEMBERSHIP_CLOSED,
        m,
        applied=f"{applied:.2f}",
        refunded=f"{refunded:.2f}",
        still_owed=f"{still_owed:.2f}",
    )
    return {
        "membership": m,
        "applied": f"{applied:.2f}",
        "refunded": f"{refunded:.2f}",
        "still_owed": f"{still_owed:.2f}",
    }


@transaction.atomic
def rejoin(*, ctx: Any, membership_id: Any, data: Any) -> dict:
    """FR-9 (C10): a closed member re-opened on the same row with a new type, dates, fee and
    deposit; the number is kept. The admission fee is once, so it is not charged again."""
    data = data if isinstance(data, dict) else {}
    m = _locked(ctx, membership_id)
    if m.status != MembershipStatus.CLOSED:
        raise BusinessRuleViolation(
            "library_membership_exists",
            f"{m.party.name} is already member {m.member_number}.",
            details={"membership_id": str(m.id), "status": m.status},
        )
    today = tenant_today(ctx.tenant)
    errors = Errors()
    kind = _active_type(errors, ctx.tenant, data.get("membership_type_id"))
    start, until = _dates(errors, data, kind, today)
    fees_block = _block(errors, data, "collect_fees")
    deposit_block = _block(errors, data, "collect_deposit")
    errors.raise_if_any()
    assert kind is not None and start is not None
    m.membership_type = kind
    m.starts_on = start
    m.valid_until = until
    m.status = MembershipStatus.ACTIVE
    m.closed_on = None
    m.closed_reason = ""
    m.version += 1
    m.save(
        update_fields=[
            "membership_type",
            "starts_on",
            "valid_until",
            "status",
            "closed_on",
            "closed_reason",
            "version",
            "updated_at",
        ]
    )
    fee = _fee(ctx, m, ChargeKind.MEMBERSHIP_FEE, kind.fee_amount, "Membership", today)
    _period(ctx, m, PeriodKind.REJOIN, on=today, fee=fee)
    deposit = deposit_for(m) or _open_deposit(ctx, m)
    payments = []
    if fees_block is not None:
        payments.append(_collect_fees(ctx, m, fees_block, [fee] if fee else []))
    if deposit_block is not None:
        payments.append(_collect_deposit(ctx, deposit, deposit_block))
    _audit(ctx, AuditAction.LIBRARY_MEMBERSHIP_REJOINED, m, membership_type_id=str(kind.id))
    return {
        "membership": m,
        "charges": [fee] if fee else [],
        "payments": payments,
        "deposit": deposit,
    }


# ── Registrations with parties (FR-11, EC-8; contracts §1.6) ────────────────


def member_party_ids(tenant: Any) -> Any:
    """`GET /parties?role=library_member`: parties with a membership that is not closed."""
    return (
        LibraryMembership.objects.filter(tenant=tenant)
        .exclude(status=MembershipStatus.CLOSED)
        .values("party_id")
    )


def archive_guard(tenant: Any, party: Any) -> dict | None:
    """EC-8: a party with an open membership cannot be archived; close it first. What a
    closed member still owes is held by the ordinary balance guard (BR-6)."""
    if (
        LibraryMembership.objects.filter(tenant=tenant, party=party)
        .exclude(status=MembershipStatus.CLOSED)
        .exists()
    ):
        return {"module": MODULE, "count": 1, "label_id": "library.archive.member"}
    return None
