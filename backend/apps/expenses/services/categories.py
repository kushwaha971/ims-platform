"""EXP-02 FR-4 — creating a category, which in this wave means INLINE, from the drawer.

The management screen (rename, recolour, reorder, archive, merge — FR-3, FR-5,
FR-6, FR-7) is not part of this wave. What the counter needs is the one write
that keeps it moving: staff type "Hamali", tap Create, and carry on recording.

── A duplicate answers with the row that already exists ────────────────────
EC-1/EC-2: two staff creating "Hamali" at the same second, or "hamali " against
"Hamali", is ONE category. The FRD's 409 `duplicate_category` is followed by
the client "silently selecting the existing row"; answering with that row
directly is the same outcome with one round trip fewer and no error code that
exists only to be swallowed — the same shape PTY-05's tag create already has.
`created` says which happened, so the view can pick 201 or 200.

The comparison is on NFC-normalised, whitespace-folded, case-folded text
(EC-3), because a Devanagari name typed on two phones can arrive composed one
way and decomposed the other, and they are the same word to the merchant.
"""

from __future__ import annotations

import unicodedata
from typing import Any

from django.db import IntegrityError, transaction

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation, ValidationFailed
from apps.expenses.constants import (
    CATEGORY_NAME_MAX_LENGTH,
    MAX_ACTIVE_CATEGORIES,
    CategoryStatus,
)
from apps.expenses.models import ExpenseCategory


def clean_category_name(raw: Any) -> str:
    """NFC, control characters out, internal whitespace folded, trimmed."""
    if not isinstance(raw, str):
        return ""
    text = unicodedata.normalize("NFC", raw)
    text = "".join(ch for ch in text if unicodedata.category(ch)[0] != "C")
    return " ".join(text.split())


def _same_name(tenant: Any, name: str) -> ExpenseCategory | None:
    """The live row this name already belongs to, compared case-insensitively."""
    return (
        ExpenseCategory.objects.for_tenant(tenant)
        .filter(deleted_at__isnull=True, name__iexact=name)
        .first()
    )


def create_category(*, ctx: Ctx, name: Any) -> dict:
    """Create a category, or hand back the one with this name. `{category, created}`.

    An ARCHIVED namesake is handed back as it is, not restored: restoring is
    the management screen's decision and a counter tap should not make it. The
    client shows it with its "(archived)" suffix and the expense still saves
    against it (EXP-02 EC-7).
    """
    cleaned = clean_category_name(name)
    if not cleaned or len(cleaned) > CATEGORY_NAME_MAX_LENGTH:
        raise ValidationFailed(
            {"name": [f"Enter a name of 1–{CATEGORY_NAME_MAX_LENGTH} characters."]}
        )

    existing = _same_name(ctx.tenant, cleaned)
    if existing is not None:
        return {"category": existing, "created": False}

    active = (
        ExpenseCategory.objects.for_tenant(ctx.tenant)
        .filter(deleted_at__isnull=True, status=CategoryStatus.ACTIVE)
        .count()
    )
    if active >= MAX_ACTIVE_CATEGORIES:
        raise BusinessRuleViolation(
            "plan_limit_reached",
            f"You already have {MAX_ACTIVE_CATEGORIES} categories — archive one first.",
            details={"limit": MAX_ACTIVE_CATEGORIES, "resource": "expense_categories"},
        )

    try:
        with transaction.atomic():
            category = ExpenseCategory.objects.create(
                tenant=ctx.tenant,
                created_by=ctx.actor if ctx.actor_type == "user" else None,
                name=cleaned,
                is_system=False,
                # After the seed's 0–8 and onboarding's extras from 100: a new
                # row goes to the end of the curated order, which is where FR-4
                # alternate B says it appears in the settings list.
                sort_order=200,
            )
            write_audit(
                ctx=ctx,
                action=AuditAction.EXPENSE_CATEGORY_CREATED,
                entity_type="expenses_category",
                entity_id=category.id,
                after={"name": category.name, "color": category.color, "system_code": None},
                metadata={"source": "inline"},
            )
    except IntegrityError:
        # The race in EC-1: the other tap won between the read above and this
        # insert. The unique constraint is exact-case, so this catches the
        # exact duplicate; the case-insensitive read above catches the rest.
        winner = _same_name(ctx.tenant, cleaned)
        if winner is None:  # pragma: no cover - an integrity error for another reason
            raise
        return {"category": winner, "created": False}
    return {"category": category, "created": True}
