"""Membership types (LIB-04 FR-1; task B06): create, and patch with `version`.

A type is deactivated (`is_active = false`), never deleted: memberships and
their history point at it, and a deactivated type still resolves for the
members who hold it. There is deliberately no delete.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db import IntegrityError, transaction

from apps.common.audit import AuditAction, diff_fields, write_audit
from apps.common.exceptions import NotFound, StaleVersion, ValidationFailed
from apps.library.constants import TYPE_BOUNDS, TYPE_CODE_MAX, TYPE_NAME_MAX
from apps.library.models import LibraryMembershipType
from apps.library.services.fields import Errors, boolean, integer, money, text, uuid_or_none

#: (column, default) of every money column; `None` default = nullable ("no cap").
_MONEY = {
    "fine_per_day": Decimal("2.00"),
    "fine_cap": None,
    "fee_amount": Decimal("0.00"),
    "admission_fee": Decimal("0.00"),
    "deposit_amount": Decimal("0.00"),
    "dues_block_amount": None,
}
_INTEGERS = {
    "max_copies": 2,
    "loan_days": 14,
    "max_renewals": 2,
    "grace_days": 0,
    "max_holds": 2,
    "validity_months": None,
    "sort_order": 0,
}
_BOOLEANS = {
    "deposit_required_to_borrow": True,
    "allows_reference_loan": False,
    "is_active": True,
}
FIELDS = ("name", "code", *_INTEGERS, *_MONEY, *_BOOLEANS)


def type_json(row: LibraryMembershipType) -> dict:
    def m(value: Any) -> str | None:
        return None if value is None else f"{Decimal(value):.2f}"

    return {
        "id": str(row.id),
        "name": row.name,
        "code": row.code,
        **{field: getattr(row, field) for field in _INTEGERS},
        **{field: m(getattr(row, field)) for field in _MONEY},
        **{field: getattr(row, field) for field in _BOOLEANS},
        "version": row.version,
    }


def _clean(data: Any, *, partial: bool) -> dict:
    if not isinstance(data, dict):
        raise ValidationFailed({"non_field_errors": ["Expected an object."]})
    errors = Errors()
    out: dict[str, Any] = {}

    def wanted(field: str) -> bool:
        return not partial or field in data

    if wanted("name"):
        out["name"] = text(errors, data, "name", TYPE_NAME_MAX, required=True)
    if wanted("code"):
        out["code"] = text(errors, data, "code", TYPE_CODE_MAX)
    for field, default in _INTEGERS.items():
        if wanted(field):
            low, high = TYPE_BOUNDS.get(field, (-32768, 32767))
            out[field] = integer(errors, data, field, low, high, default=default)
    for field, default in _MONEY.items():
        if wanted(field):
            value = money(errors, data, field)
            out[field] = (
                default if value is None and field not in errors and default is not None else value
            )
    for field, default in _BOOLEANS.items():
        if wanted(field):
            out[field] = boolean(errors, data, field, default)
    errors.raise_if_any()
    return out


def _taken() -> ValidationFailed:
    return ValidationFailed({"name": ["A membership type with this name already exists."]})


def create_type(*, ctx: Any, data: Any) -> LibraryMembershipType:
    fields = _clean(data, partial=False)
    try:
        with transaction.atomic():
            row = LibraryMembershipType.objects.create(
                tenant=ctx.tenant, created_by=getattr(ctx, "actor", None), **fields
            )
    except IntegrityError:
        raise _taken() from None
    write_audit(
        ctx=ctx,
        action=AuditAction.LIBRARY_MEMBERSHIP_TYPE_CREATED,
        entity_type="library_membership_type",
        entity_id=row.id,
        after=type_json(row),
    )
    return row


@transaction.atomic
def update_type(*, ctx: Any, type_id: Any, data: Any) -> LibraryMembershipType:
    pk = uuid_or_none(type_id)
    row = (
        LibraryMembershipType.objects.select_for_update().filter(tenant=ctx.tenant, pk=pk).first()
        if pk
        else None
    )
    if row is None:
        raise NotFound()
    version = data.get("version") if isinstance(data, dict) else None
    if isinstance(version, bool) or not isinstance(version, int):
        raise ValidationFailed({"version": ["This field is required."]})
    if row.version != version:
        raise StaleVersion(row.version)
    fields = _clean(data, partial=True)
    changed = [field for field, value in fields.items() if getattr(row, field) != value]
    if not changed:
        return row
    before = type_json(row)
    for field in changed:
        setattr(row, field, fields[field])
    row.version += 1
    try:
        with transaction.atomic():
            row.save(update_fields=[*changed, "version", "updated_at"])
    except IntegrityError:
        raise _taken() from None
    old, new = diff_fields(before, type_json(row), fields=changed)
    write_audit(
        ctx=ctx,
        action=AuditAction.LIBRARY_MEMBERSHIP_TYPE_UPDATED,
        entity_type="library_membership_type",
        entity_id=row.id,
        before=old,
        after=new,
    )
    return row
