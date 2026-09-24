"""INV-04 — categories and units, the two small masters items depend on.

Create-only at MVP (FR-6: canon exposes `GET/POST` only; CCR-02 asks for
PATCH/DELETE). Both are created inline from the item form as often as from a
settings page, which is why a category whose name already exists among its
siblings is RETURNED rather than refused (EC-2): the merchant who typed
"snacks" into the picker meant the "Snacks" that is already there.
"""

from __future__ import annotations

import re
from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models.functions import Lower

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.exceptions import NotFound, ValidationFailed
from apps.inventory.constants import (
    CATEGORY_NAME_MAX_LENGTH,
    UNIT_CODE_MAX_LENGTH,
    UNIT_NAME_MAX_LENGTH,
)
from apps.inventory.models import Category, Unit
from apps.inventory.services.parsing import Errors, clean_text, parse_bool

UNIT_CODE_RE = re.compile(r"^[A-Z0-9]+$")


def is_uqc(code: str) -> bool:
    """BR-5 — the GST units are exactly the seeded system codes."""
    return Unit.objects.filter(tenant__isnull=True, code=code).exists()


@transaction.atomic
def create_category(*, ctx: Ctx, name: Any, parent_id: Any = None) -> tuple[Category, bool]:
    """`(category, created)`. A case-insensitive sibling match returns the existing row."""
    errors = Errors()
    clean = clean_text(name)
    if not clean:
        errors.add("name", "Enter a category name.", "required")
    elif len(clean) > CATEGORY_NAME_MAX_LENGTH:
        errors.add("name", f"Keep it under {CATEGORY_NAME_MAX_LENGTH} characters.", "max_length")
    parent = None
    if parent_id:
        try:
            parent = Category.objects.filter(tenant=ctx.tenant, pk=parent_id).first()
        except (ValueError, TypeError, DjangoValidationError):
            parent = None
        if parent is None:
            raise NotFound("No such parent category.")
        if parent.parent_id is not None:
            errors.add("parent_id", "Only one level of sub-categories.", "nesting_too_deep")
    if errors:
        raise ValidationFailed(errors.payload())

    existing = (
        Category.objects.annotate(lname=Lower("name"))
        .filter(tenant=ctx.tenant, parent=parent, lname=clean.lower())
        .first()
    )
    if existing is not None:
        return existing, False
    try:
        with transaction.atomic():
            category = Category.objects.create(
                tenant=ctx.tenant,
                created_by=ctx.actor if ctx.actor_type == "user" else None,
                name=clean,
                parent=parent,
            )
    except IntegrityError:
        # Lost a race to an identical create: the row now exists — return it.
        return (
            Category.objects.annotate(lname=Lower("name")).get(
                tenant=ctx.tenant, parent=parent, lname=clean.lower()
            ),
            False,
        )
    write_audit(
        ctx=ctx,
        action=AuditAction.CATEGORY_CREATED,
        entity_type="inventory_category",
        entity_id=category.id,
        after={"name": category.name, "parent_id": str(parent.id) if parent else None},
    )
    return category, True


@transaction.atomic
def create_unit(*, ctx: Ctx, code: Any, name: Any, allow_decimal: Any) -> tuple[Unit, list[dict]]:
    """`(unit, warnings)`. A code equal to a system code, or to one of ours, is refused."""
    errors = Errors()
    clean_code = clean_text(code).upper().replace(" ", "")
    clean_name = clean_text(name)
    if not clean_code:
        errors.add("code", "Enter a unit code.", "required")
    elif len(clean_code) > UNIT_CODE_MAX_LENGTH or not UNIT_CODE_RE.match(clean_code):
        errors.add("code", "Use up to 8 letters or digits.", "invalid_code")
    if not clean_name:
        errors.add("name", "Enter a unit name.", "required")
    elif len(clean_name) > UNIT_NAME_MAX_LENGTH:
        errors.add("name", f"Keep it under {UNIT_NAME_MAX_LENGTH} characters.", "max_length")
    if clean_code and not errors.details.get("code"):
        if Unit.objects.filter(tenant__isnull=True, code=clean_code).exists():
            errors.add(
                "code", "That is a standard GST unit — pick it from the list.", "duplicate_code"
            )
        elif Unit.objects.filter(tenant=ctx.tenant, code=clean_code).exists():
            errors.add("code", "Unit code already exists.", "duplicate_code")
    if errors:
        raise ValidationFailed(errors.payload())
    try:
        with transaction.atomic():
            unit = Unit.objects.create(
                tenant=ctx.tenant,
                created_by=ctx.actor if ctx.actor_type == "user" else None,
                code=clean_code,
                name=clean_name,
                allow_decimal=parse_bool(allow_decimal, False),
                is_system=False,
            )
    except IntegrityError:
        dup = Errors()
        dup.add("code", "Unit code already exists.", "duplicate_code")
        raise ValidationFailed(dup.payload()) from None
    write_audit(
        ctx=ctx,
        action=AuditAction.UNIT_CREATED,
        entity_type="inventory_unit",
        entity_id=unit.id,
        after={"code": unit.code, "name": unit.name, "allow_decimal": unit.allow_decimal},
    )
    # FR-3 — a custom code prints as typed on invoices; say so, do not refuse.
    warnings = [
        {
            "code": "not_uqc",
            "field": "code",
            "message": "Not a GST unit code — it will print as typed on invoices.",
        }
    ]
    return unit, warnings
