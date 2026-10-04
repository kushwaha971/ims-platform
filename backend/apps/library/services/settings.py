"""Library settings, the preset seed and the numbering raise (LIB-01, task B03).

`seed_library` is the module enable hook (R15): `update_enabled_modules` calls
it inside the switching transaction, so a seed that fails leaves the module
off. It must be idempotent (BR-4, EC-2) — switching off and on runs it again
and must never overwrite what the librarian set. B06 adds the "Standard"
membership type through its own hook.

`settings_for` get-or-creates as well, because a tenant can carry `library` in
`enabled_modules` without the hook ever running (a flagged dev database, a
fixture). Reading the screen there must show the defaults, not 404.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any

from django.db import IntegrityError, transaction

from apps.common.audit import AuditAction, diff_fields, write_audit
from apps.common.exceptions import BusinessRuleViolation, StaleVersion, ValidationFailed
from apps.library.constants import (
    FineRounding,
    LostFoundPaid,
    OverdueIssueRule,
    RenewFrom,
    RenewOverdue,
)
from apps.library.models import LibrarySettings
from apps.library.models.settings import MAX_REMINDER_DAYS
from apps.platform_app.services import calendar, sequences

MODULE = "library"
#: LIB-01 §9: every library amount.
MONEY_MAX = Decimal("99999999.99")
#: The two series the library settings screen may raise. `library_charge` is
#: an FY series (it resets each 1 April) and `raise_counter` refuses it.
RAISABLE_KINDS = ("library_accession", "library_member")

_CHOICES = {
    "fine_rounding": FineRounding,
    "overdue_issue_rule": OverdueIssueRule,
    "renew_from": RenewFrom,
    "renew_overdue": RenewOverdue,
    "lost_found_paid": LostFoundPaid,
}
_BOOLEANS = (
    "fine_skip_closed_days",
    "lost_counts_toward_limit",
    "remind_day_before",
)
#: field -> (minimum, maximum)
_SMALLINTS = {"hold_pickup_days": (1, 30), "damage_major_percent": (1, 100)}
#: field -> nullable
_MONEY = {
    "lost_processing_fee": False,
    "damage_minor_amount": False,
    "fallback_price": True,
    "waiver_ceiling": True,
}

#: What `PUT /library/settings` carries, in FRD §5 order (plus `version`).
EDITABLE_FIELDS: tuple[str, ...] = (
    "fine_skip_closed_days",
    "fine_rounding",
    "overdue_issue_rule",
    "lost_counts_toward_limit",
    "renew_from",
    "renew_overdue",
    "hold_pickup_days",
    "lost_multiplier",
    "lost_processing_fee",
    "lost_found_paid",
    "fallback_price",
    "damage_minor_amount",
    "damage_major_percent",
    "waiver_ceiling",
    "overdue_reminder_days",
    "remind_day_before",
)


# ── Reading and seeding ──────────────────────────────────────────────────────


def settings_for(tenant: Any, *, actor: Any = None) -> LibrarySettings:
    """The tenant's row, created with the §5 defaults when absent (race-safe)."""
    row = LibrarySettings.objects.filter(tenant=tenant).first()
    if row is not None:
        return row
    try:
        with transaction.atomic():
            return LibrarySettings.objects.create(tenant=tenant, created_by=actor)
    except IntegrityError:  # a concurrent first read created it — fine
        return LibrarySettings.objects.get(tenant=tenant)


def seed_library(ctx: Any, tenant: Any) -> None:
    """The enable hook (FR-2, BR-4): the settings row if absent, and — on the first switch-on
    only, when the business has no membership type at all — a "Standard" type and the one
    seeded rule, reference copies not for loan (LIB-05 §5).

    "First switch-on" is read as "no type exists": a library that later deletes its reference
    rule and switches the module off and on again keeps its own rules (B06 test 6).
    """
    from apps.library.models import LibraryLoanRule, LibraryMembershipType

    actor = getattr(ctx, "actor", None)
    settings_for(tenant, actor=actor)
    if LibraryMembershipType.objects.filter(tenant=tenant).exists():
        return
    LibraryMembershipType.objects.create(tenant=tenant, created_by=actor, name="Standard")
    if not LibraryLoanRule.objects.filter(tenant=tenant).exists():
        LibraryLoanRule.objects.create(
            tenant=tenant,
            created_by=actor,
            membership_type=None,
            material_type="reference",
            loanable=False,
        )


def settings_json(row: LibrarySettings) -> dict:
    """`LibrarySettings`: the columns in snake case, money as strings."""

    def money(value: Decimal | None) -> str | None:
        return None if value is None else f"{value:.2f}"

    return {
        "version": row.version,
        "fine_skip_closed_days": row.fine_skip_closed_days,
        "fine_rounding": row.fine_rounding,
        "overdue_issue_rule": row.overdue_issue_rule,
        "lost_counts_toward_limit": row.lost_counts_toward_limit,
        "renew_from": row.renew_from,
        "renew_overdue": row.renew_overdue,
        "hold_pickup_days": row.hold_pickup_days,
        "lost_multiplier": money(row.lost_multiplier),
        "lost_processing_fee": money(row.lost_processing_fee),
        "lost_found_paid": row.lost_found_paid,
        "fallback_price": money(row.fallback_price),
        "damage_minor_amount": money(row.damage_minor_amount),
        "damage_major_percent": row.damage_major_percent,
        "waiver_ceiling": money(row.waiver_ceiling),
        "overdue_reminder_days": list(row.overdue_reminder_days),
        "remind_day_before": row.remind_day_before,
    }


def numbering_meta(tenant: Any) -> dict:
    """`meta.numbering`: the next accession number, and the member series'
    prefix (the core screen may have changed it on the row) and next number."""
    from apps.platform_app.models import DocumentSequence

    member_spec = sequences.number_kind("library_member")
    row = DocumentSequence.objects.filter(
        tenant=tenant, kind="library_member", fy_label=sequences.PERPETUAL
    ).first()
    prefix = row.prefix if row is not None else (member_spec.default_prefix if member_spec else "")
    return {
        "accession": {"next": sequences.peek_counter(tenant=tenant, kind="library_accession")},
        "member": {
            "prefix": prefix,
            "next": sequences.peek_counter(tenant=tenant, kind="library_member"),
        },
    }


def closed_weekdays_for(tenant: Any) -> list[int]:
    """The weekdays fines skip: the library's override, else the tenant's."""
    weekdays = calendar.closed_weekdays(tenant)
    return weekdays["modules"].get(MODULE, weekdays["value"])


# ── Validation ───────────────────────────────────────────────────────────────


def _decimal(value: Any, *, places: int = 2) -> Decimal | None:
    if isinstance(value, bool) or not isinstance(value, (str, int, float, Decimal)):
        return None
    try:
        number = Decimal(str(value).strip())
        if not number.is_finite():
            return None
        # `quantize` itself raises InvalidOperation beyond 28 significant digits,
        # so it stays inside the `try`: an absurd figure is a 400 on its key,
        # never a 500 (B03 QA-B03-1).
        quantized = number.quantize(Decimal(1).scaleb(-places))
    except InvalidOperation:
        return None
    if number != quantized:
        return None
    return quantized


def clean_settings(data: Any) -> dict[str, Any]:
    """Every editable field, validated; `ValidationFailed` names each bad key."""
    if not isinstance(data, dict):
        raise ValidationFailed({"non_field_errors": ["Expected an object."]})
    errors: dict[str, list[str]] = {}
    cleaned: dict[str, Any] = {}
    for field in EDITABLE_FIELDS:
        if field not in data:
            errors[field] = ["This field is required."]
            continue
        value = data[field]
        if field in _BOOLEANS:
            if not isinstance(value, bool):
                errors[field] = ["Choose yes or no."]
            else:
                cleaned[field] = value
        elif field in _CHOICES:
            if value not in _CHOICES[field].values:
                errors[field] = ["Choose one of the options."]
            else:
                cleaned[field] = value
        elif field in _SMALLINTS:
            low, high = _SMALLINTS[field]
            if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
                errors[field] = [f"Enter a whole number from {low} to {high}."]
            else:
                cleaned[field] = value
        elif field in _MONEY:
            if value is None and _MONEY[field]:
                cleaned[field] = None
                continue
            amount = _decimal(value)
            if amount is None or not Decimal("0") <= amount <= MONEY_MAX:
                errors[field] = ["Enter an amount from 0 to 99,999,999.99."]
            else:
                cleaned[field] = amount
        elif field == "lost_multiplier":
            multiplier = _decimal(value)
            if multiplier is None or not Decimal("0") <= multiplier <= Decimal("10"):
                errors[field] = ["Enter a number from 0 to 10, at most two decimals."]
            else:
                cleaned[field] = multiplier
        elif field == "overdue_reminder_days":
            days = _reminder_days(value)
            if isinstance(days, str):
                errors[field] = [days]
            else:
                cleaned[field] = days
    if errors:
        raise ValidationFailed(errors)
    return cleaned


def _reminder_days(value: Any) -> list[int] | str:
    """BR-3: unique, sorted, each 1–365, at most six — or the message."""
    if not isinstance(value, list) or not all(
        isinstance(day, int) and not isinstance(day, bool) for day in value
    ):
        return "Choose days after the due date."
    days = sorted(set(value))
    if not all(1 <= day <= 365 for day in days):
        return "Each day must be from 1 to 365."
    if len(days) > MAX_REMINDER_DAYS:
        return f"Choose at most {MAX_REMINDER_DAYS} days."
    return days


# ── Writing ──────────────────────────────────────────────────────────────────


@transaction.atomic
def update_settings(*, ctx: Any, data: Any) -> LibrarySettings:
    """`PUT /library/settings`: the full row with `version` (409 when stale)."""
    version = data.get("version") if isinstance(data, dict) else None
    if isinstance(version, bool) or not isinstance(version, int):
        raise ValidationFailed({"version": ["This field is required."]})
    cleaned = clean_settings(data)
    settings_for(ctx.tenant, actor=getattr(ctx, "actor", None))
    row = LibrarySettings.objects.select_for_update().get(tenant=ctx.tenant)
    if row.version != version:
        raise StaleVersion(row.version)
    before = settings_json(row)
    changed = [field for field, value in cleaned.items() if getattr(row, field) != value]
    if not changed:
        return row
    for field in changed:
        setattr(row, field, cleaned[field])
    row.version += 1
    row.save(update_fields=[*changed, "version", "updated_at"])
    old, new = diff_fields(before, settings_json(row), fields=changed)
    write_audit(
        ctx=ctx,
        action=AuditAction.LIBRARY_SETTINGS_UPDATED,
        entity_type="library_settings",
        entity_id=row.id,
        before=old,
        after=new,
    )
    return row


def raise_number(*, ctx: Any, kind: Any, next_number: Any) -> None:
    """`POST /library/settings/numbering` (FR-3): continue a paper register."""
    if kind not in RAISABLE_KINDS:
        raise ValidationFailed({"kind": ["Choose the book or the member series."]})
    if next_number is None:
        raise ValidationFailed({"next_number": ["This field is required."]})
    if kind == "library_accession" and isinstance(next_number, int):
        highest = _highest_accession_at_or_above(ctx.tenant, next_number)
        if highest is not None:
            # LIB-01 BR-2: never at or below a number already in the register.
            # The counter alone cannot say so when a typed number sits at its
            # ceiling, where it is parked rather than passed (QA-B05-2).
            raise BusinessRuleViolation(
                "sequence_backwards",
                f"Number {highest} is already used.",
                details={"current": highest + 1, "requested": next_number},
            )
    sequences.raise_counter(ctx=ctx, kind=kind, next_number=next_number, via="settings")


def _highest_accession_at_or_above(tenant: Any, number: int) -> int | None:
    """The largest all-digit accession number (after the series prefix) that is
    ≥ `number`, or None. A settings action, rare: one scan of the tenant's copies."""
    from django.db import connection

    from apps.platform_app.models import DocumentSequence

    row = DocumentSequence.objects.filter(
        tenant=tenant, kind="library_accession", fy_label=sequences.PERPETUAL
    ).first()
    prefix = (row.prefix if row is not None else "").upper()
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT max(substr(upper(accession_number), %s)::numeric)
              FROM library_copy
             WHERE tenant_id = %s
               AND left(upper(accession_number), %s) = %s
               AND substr(upper(accession_number), %s) ~ '^[0-9]+$'
            """,
            [len(prefix) + 1, tenant.pk, len(prefix), prefix, len(prefix) + 1],
        )
        (highest,) = cursor.fetchone()
    return int(highest) if highest is not None and highest >= number else None
