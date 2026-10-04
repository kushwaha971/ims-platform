"""Loan rules (LIB-05 FR-1; task B06): the whole list replaced in one transaction.

Rules carry no `version`; two admins saving at once are serialised on the
library settings row instead, so the second save replaces the first whole
rather than interleaving rows from both.
"""

from __future__ import annotations

from typing import Any

from django.db import transaction

from apps.common.audit import AuditAction, write_audit
from apps.common.exceptions import ValidationFailed
from apps.library.constants import TYPE_BOUNDS, MaterialType
from apps.library.models import LibraryLoanRule, LibraryMembershipType, LibrarySettings
from apps.library.services.fields import Errors, boolean, choice, integer, money, owned
from apps.library.services.rules import RULE_COLUMNS, resolve_rule

_MONEY_COLUMNS = ("fine_per_day", "fine_cap")


def rule_json(row: LibraryLoanRule) -> dict:
    def m(value: Any) -> str | None:
        return None if value is None else f"{value:.2f}"

    return {
        "id": str(row.id),
        "membership_type_id": str(row.membership_type_id) if row.membership_type_id else None,
        "material_type": row.material_type,
        "loanable": row.loanable,
        "loan_days": row.loan_days,
        "max_renewals": row.max_renewals,
        "fine_per_day": m(row.fine_per_day),
        "fine_cap": m(row.fine_cap),
        "grace_days": row.grace_days,
    }


def rules_for(tenant: Any) -> list[LibraryLoanRule]:
    return list(
        LibraryLoanRule.objects.filter(tenant=tenant).order_by(
            "material_type", "membership_type_id", "id"
        )
    )


def effective_matrix(tenant: Any) -> list[dict]:
    """`meta.effective` (LIB-05 §6): what the counter will use for every type × material."""
    rules = rules_for(tenant)
    out = []
    for kind in LibraryMembershipType.objects.filter(tenant=tenant).order_by("sort_order", "name"):
        for material in MaterialType.values:
            out.append(
                {
                    "membership_type_id": str(kind.id),
                    "material_type": material,
                    **resolve_rule(kind, rules, material).as_json(),
                }
            )
    return out


def _clean_rows(tenant: Any, data: Any) -> list[dict]:
    rows = data.get("rows") if isinstance(data, dict) else data
    if not isinstance(rows, list):
        raise ValidationFailed({"rows": ["Send the whole list of rules."]})
    errors = Errors()
    cleaned: list[dict] = []
    seen: set[tuple] = set()
    for index, raw in enumerate(rows):
        prefix = f"rows.{index}"
        if not isinstance(raw, dict):
            errors.add(prefix, "Expected an object.")
            continue
        row_errors = Errors()
        kind = owned(
            LibraryMembershipType,
            tenant,
            raw.get("membership_type_id"),
            row_errors,
            "membership_type_id",
        )
        material = choice(row_errors, raw, "material_type", MaterialType, "")
        values: dict[str, Any] = {
            "membership_type": kind,
            "material_type": material,
            "loanable": boolean(row_errors, raw, "loanable", True),
        }
        for column in RULE_COLUMNS:
            if column in _MONEY_COLUMNS:
                values[column] = money(row_errors, raw, column)
            else:
                low, high = TYPE_BOUNDS[column]
                values[column] = integer(row_errors, raw, column, low, high)
        key = (kind.id if kind else None, material)
        if not row_errors and key in seen:
            row_errors.add("material_type", "This rule is already in the list.")
        seen.add(key)
        for field, messages in row_errors.items():
            for message in messages:
                errors.add(f"{prefix}.{field}", message)
        cleaned.append(values)
    errors.raise_if_any()
    return cleaned


@transaction.atomic
def replace_rules(*, ctx: Any, data: Any) -> list[LibraryLoanRule]:
    """`PUT /library/loan-rules`: validate every row, then replace the list (400 changes nothing)."""
    from apps.library.services.settings import settings_for

    rows = _clean_rows(ctx.tenant, data)
    settings_for(ctx.tenant, actor=getattr(ctx, "actor", None))
    LibrarySettings.objects.select_for_update().get(tenant=ctx.tenant)  # the serialisation point
    before = [rule_json(r) for r in rules_for(ctx.tenant)]
    LibraryLoanRule.objects.filter(tenant=ctx.tenant).delete()
    LibraryLoanRule.objects.bulk_create(
        [
            LibraryLoanRule(tenant=ctx.tenant, created_by=getattr(ctx, "actor", None), **values)
            for values in rows
        ]
    )
    after = rules_for(ctx.tenant)
    write_audit(
        ctx=ctx,
        action=AuditAction.LIBRARY_LOAN_RULES_UPDATED,
        entity_type="library_settings",
        entity_id=LibrarySettings.objects.get(tenant=ctx.tenant).id,
        before={"rules": before},
        after={"rules": [rule_json(r) for r in after]},
    )
    return after
