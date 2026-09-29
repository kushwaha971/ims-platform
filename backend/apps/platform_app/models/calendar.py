"""The tenant calendar's dated closures (A9b, ADR-055, FRD 00 PLT-X08 §5)."""

from __future__ import annotations

from django.db import models

from apps.common.models import TenantModel


class ClosedDay(TenantModel):
    """One day the business (or one module of it) is closed: "Diwali".

    `module` NULL closes every module; a module code closes only that module
    (the library shut for stock-taking while the shop is open). Weekly closed
    weekdays are not rows — they are the `calendar.closed_weekdays` settings.

    Configuration, not evidence: rows are HARD-deleted, and every add and delete
    is audited. Nothing computed from a closure (a posted fine, a due date) is
    rewritten when one is added or removed (BR-4).
    """

    date = models.DateField()
    reason = models.CharField(max_length=60)
    module = models.CharField(max_length=32, null=True, blank=True)

    class Meta:
        db_table = "platform_closed_day"
        verbose_name = "closed day"
        verbose_name_plural = "closed days"
        ordering = ("date", "module")
        constraints = [
            # NULLS NOT DISTINCT (PostgreSQL 15+): one tenant-wide row per date,
            # which a plain unique index would not give because NULL <> NULL.
            models.UniqueConstraint(
                fields=["tenant", "date", "module"],
                name="uq_closed_day",
                nulls_distinct=False,
            ),
        ]
        indexes = [models.Index(fields=["tenant", "date"], name="ix_closed_day_range")]

    def __str__(self) -> str:
        return f"{self.date} {self.module or '*'}"
