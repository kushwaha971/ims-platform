"""Tenant — one business (Part 21 §21.3.1)."""

from __future__ import annotations

from django.contrib.postgres.fields import ArrayField
from django.core.validators import RegexValidator
from django.db import models

from apps.common.db.fields import uuid7_pk
from apps.common.models import TimeStampedModel
from apps.platform_app.constants import BusinessType, GstType, TenantStatus

GSTIN_VALIDATOR = RegexValidator(
    regex=r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$",
    message="Enter a valid 15-character GSTIN.",
)
PAN_VALIDATOR = RegexValidator(
    regex=r"^[A-Z]{5}[0-9]{4}[A-Z]{1}$", message="Enter a valid 10-character PAN."
)


class Tenant(TimeStampedModel):
    """A business. Owns all business data (canon §0.2)."""

    id = uuid7_pk()
    partner = models.ForeignKey(
        "platform.Partner", on_delete=models.RESTRICT, related_name="tenants"
    )
    plan = models.ForeignKey("platform.Plan", on_delete=models.RESTRICT, related_name="tenants")
    name = models.CharField(max_length=160)
    legal_name = models.CharField(max_length=200, null=True, blank=True)
    business_type = models.CharField(max_length=32, choices=BusinessType.choices)
    gst_type = models.CharField(
        max_length=16, choices=GstType.choices, default=GstType.UNREGISTERED
    )
    gstin = models.CharField(max_length=15, null=True, blank=True, validators=[GSTIN_VALIDATOR])
    pan = models.CharField(max_length=10, null=True, blank=True, validators=[PAN_VALIDATOR])
    state_code = models.CharField(max_length=2)
    address = models.JSONField(default=dict, blank=True)
    phone = models.CharField(max_length=15)
    email = models.EmailField(max_length=254, null=True, blank=True)
    currency = models.CharField(max_length=3, default="INR")
    timezone = models.CharField(max_length=64, default="Asia/Kolkata")
    locale = models.CharField(max_length=8, default="en")
    fy_start_month = models.SmallIntegerField(default=4)
    enabled_modules = ArrayField(models.CharField(max_length=32), default=list)
    branding = models.JSONField(default=dict, blank=True)
    bank_details = models.JSONField(default=dict, blank=True)
    upi_vpa = models.CharField(max_length=80, null=True, blank=True)
    status = models.CharField(
        max_length=16, choices=TenantStatus.choices, default=TenantStatus.ACTIVE
    )
    deletion_requested_at = models.DateTimeField(null=True, blank=True)
    onboarding_step = models.SmallIntegerField(default=0)

    class Meta:
        db_table = "platform_tenant"
        verbose_name = "tenant"
        verbose_name_plural = "tenants"
        constraints = [
            # Part 21 §21.3.1: one tenant per GSTIN per partner, ignoring deleted rows.
            models.UniqueConstraint(
                fields=["partner", "gstin"],
                condition=models.Q(gstin__isnull=False) & ~models.Q(status="deleted"),
                name="uq_tenant_partner_gstin",
            ),
            models.CheckConstraint(
                condition=models.Q(fy_start_month__gte=1) & models.Q(fy_start_month__lte=12),
                name="ck_tenant_fy_start_month",
            ),
        ]
        indexes = [
            models.Index(fields=["partner"], name="ix_tenant_partner"),
            models.Index(fields=["status"], name="ix_tenant_status"),
        ]

    def __str__(self) -> str:
        return self.name
