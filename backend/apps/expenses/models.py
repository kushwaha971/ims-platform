"""Expense categories (Part 21 §21.3.10).

`expenses_expense` lands with `EXP-01` (Sprint 8). The category table is here
from Sprint 0 because `seed_reference_data` seeds it (Part 32 §32.3.4 S0-39).
"""

from __future__ import annotations

from django.db import models

from apps.common.db.fields import uuid7_pk
from apps.common.models import SoftDeleteModel, TenantModel


class ExpenseCategory(TenantModel, SoftDeleteModel):
    """Seeded: Rent, Salaries, Electricity, Transport, Purchases-misc, Food,
    Marketing, Fees, Other (Part 21 §21.3.10)."""

    id = uuid7_pk()
    name = models.CharField(max_length=80)
    system_code = models.CharField(max_length=32, null=True, blank=True)
    is_system = models.BooleanField(default=False)
    sort_order = models.SmallIntegerField(default=0)

    class Meta:
        db_table = "expenses_category"
        verbose_name = "expense category"
        verbose_name_plural = "expense categories"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "name"],
                condition=models.Q(deleted_at__isnull=True),
                name="uq_expense_category_name",
            ),
        ]

    def __str__(self) -> str:
        return self.name
