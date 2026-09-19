"""Tax reference tables (Part 21 §21.3.5).

`tenant` is nullable so global rows seeded from GST law and tenant rows for
custom cess share one table (Part 21 §21.9). Rate lookup is always by
`(code, document_date)`, never by code alone — that is what makes the
2025-09-21 slab boundary correct for a backdated document.
"""

from __future__ import annotations

from django.db import models

from apps.common.db.fields import RateField, uuid7_pk
from apps.common.models import TimeStampedModel


class TaxRate(TimeStampedModel):
    """A GST slab with effective dates and cess (canon §0.6, table T-25)."""

    id = uuid7_pk()
    tenant = models.ForeignKey(
        "platform.Tenant",
        on_delete=models.RESTRICT,
        null=True,
        blank=True,
        related_name="tax_rates",
    )
    code = models.CharField(max_length=16)
    name = models.CharField(max_length=40)
    rate = RateField(default=0)
    cess_rate = RateField(default=0)
    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "tax_rate"
        verbose_name = "tax rate"
        verbose_name_plural = "tax rates"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "code", "effective_from"], name="uq_tax_rate_code_from"
            ),
        ]
        indexes = [
            models.Index(fields=["code", "effective_from"], name="ix_tax_rate_lookup"),
        ]

    def __str__(self) -> str:
        return f"{self.code}@{self.effective_from}"


class HsnCode(TimeStampedModel):
    """The public HSN/SAC master (Part 21 §21.3.5 `tax_hsn`).

    Rows are loaded by `seed_hsn`, which Part 32 §32.3.4 carries into Sprint 1.
    """

    id = uuid7_pk()
    code = models.CharField(max_length=8, unique=True)
    description = models.CharField(max_length=255)
    default_tax_code = models.CharField(max_length=16, blank=True, default="")
    is_service = models.BooleanField(default=False)

    class Meta:
        db_table = "tax_hsn"
        verbose_name = "HSN code"
        verbose_name_plural = "HSN codes"

    def __str__(self) -> str:
        return self.code
