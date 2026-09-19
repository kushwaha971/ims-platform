"""Partner and Plan (Part 21 §21.3.1)."""

from __future__ import annotations

from django.contrib.postgres.fields import ArrayField
from django.db import models

from apps.common.db.fields import MoneyField, uuid7_pk
from apps.common.models import TimeStampedModel
from apps.platform_app.constants import PartnerStatus


class Partner(TimeStampedModel):
    """White-label reseller. Metis Labs itself is the default partner (canon §0.2)."""

    id = uuid7_pk()
    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=120)
    status = models.CharField(
        max_length=16, choices=PartnerStatus.choices, default=PartnerStatus.ACTIVE
    )
    branding = models.JSONField(default=dict, blank=True)
    allowed_modules = ArrayField(models.CharField(max_length=32), default=list)
    default_plan = models.ForeignKey(
        "platform.Plan", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    support_contact = models.JSONField(default=dict, blank=True)
    hostnames = ArrayField(models.CharField(max_length=253), default=list, blank=True)
    settings = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "platform_partner"
        verbose_name = "partner"
        verbose_name_plural = "partners"
        indexes = [
            models.Index(fields=["status"], name="ix_partner_status"),
        ]

    def __str__(self) -> str:
        return f"{self.code} ({self.name})"


class Plan(TimeStampedModel):
    """Entitlement bundle (Part 21 §21.3.1)."""

    id = uuid7_pk()
    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=120)
    modules = ArrayField(models.CharField(max_length=32), default=list)
    limits = models.JSONField(default=dict, blank=True)
    price_inr_month = MoneyField(max_digits=10, null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "platform_plan"
        verbose_name = "plan"
        verbose_name_plural = "plans"
        indexes = [
            models.Index(fields=["is_active"], name="ix_plan_active"),
        ]

    def __str__(self) -> str:
        return self.code
