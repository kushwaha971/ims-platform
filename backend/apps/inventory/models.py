"""Inventory reference tables (Part 21 §21.3.6).

The item, stock, movement and adjustment tables land with `INV-01`…`INV-08`
(Sprints 5 and 6). `Unit` is here from Sprint 0 because `seed_reference_data`
seeds the system UQC units (Part 32 §32.3.4 S0-39), and a system unit has
`tenant = NULL`.
"""

from __future__ import annotations

from django.db import models

from apps.common.db.fields import uuid7_pk
from apps.common.managers import AllObjectsManager, SoftDeleteManager
from apps.common.models import TenantModel, TimeStampedModel


class Unit(TimeStampedModel):
    """A unit of measure. System units (UQC codes) carry `tenant = NULL`."""

    id = uuid7_pk()
    tenant = models.ForeignKey(
        "platform.Tenant", on_delete=models.RESTRICT, null=True, blank=True, related_name="units"
    )
    created_by = models.ForeignKey(
        "platform.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    code = models.CharField(max_length=8)
    name = models.CharField(max_length=60)
    allow_decimal = models.BooleanField(default=True)
    is_system = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    objects = SoftDeleteManager()
    all_objects = AllObjectsManager()

    class Meta:
        db_table = "inventory_unit"
        verbose_name = "unit"
        verbose_name_plural = "units"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "code"],
                condition=models.Q(deleted_at__isnull=True),
                name="uq_unit_tenant_code",
            ),
            models.UniqueConstraint(
                fields=["code"],
                condition=models.Q(tenant__isnull=True) & models.Q(deleted_at__isnull=True),
                name="uq_unit_system_code",
            ),
        ]

    def __str__(self) -> str:
        return self.code


class Location(TenantModel):
    """A stock location (Part 21 §21.3.6).

    MVP auto-creates `MAIN` at onboarding (`PLT-03` FR-6) and hides the concept
    in the UI until Phase 2 (`INV-11`). The row exists from Sprint 1 so that
    `INV-11` is a UI and service change rather than a migration of live stock
    (Part 32 §32.9).
    """

    id = uuid7_pk()
    name = models.CharField(max_length=80)
    code = models.CharField(max_length=24)
    address = models.JSONField(default=dict, blank=True)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "inventory_location"
        verbose_name = "location"
        verbose_name_plural = "locations"
        constraints = [
            models.UniqueConstraint(fields=["tenant", "code"], name="uq_location_tenant_code"),
        ]

    def __str__(self) -> str:
        return self.code
