"""Helpers for the recurring constraint and index patterns (Part 20 §20.2.2)."""

from __future__ import annotations

from django.db import models


def positive(field: str, *, name: str) -> models.CheckConstraint:
    """`CHECK (<field> > 0)` — amounts, quantities that may never be zero."""
    return models.CheckConstraint(condition=models.Q(**{f"{field}__gt": 0}), name=name)


def non_negative(field: str, *, name: str) -> models.CheckConstraint:
    """`CHECK (<field> >= 0)`."""
    return models.CheckConstraint(condition=models.Q(**{f"{field}__gte": 0}), name=name)


def unique_per_tenant_alive(*fields: str, name: str) -> models.UniqueConstraint:
    """Partial unique index over (tenant, *fields) excluding soft-deleted rows.

    Part 21 §21.1 rule 8: "Unique constraints are per tenant and exclude
    soft-deleted rows".
    """
    return models.UniqueConstraint(
        fields=("tenant", *fields),
        condition=models.Q(deleted_at__isnull=True),
        name=name,
    )
