"""AuditLog — append-only (Part 21 §21.3.1, §21.7)."""

from __future__ import annotations

from django.db import models

from apps.common.constants import ActorType
from apps.common.db.fields import uuid7_pk
from apps.common.models import ImmutableModel


class AuditLog(ImmutableModel):
    """Append-only actor/tenant/entity/before/after (canon §0.6).

    `tenant` is NULL for platform-level events. Retention is ≥ 7 years for
    financial actions (GST record-keeping, 72 months).
    """

    MUTABLE_FIELDS: tuple[str, ...] = ()

    id = uuid7_pk()
    tenant = models.ForeignKey(
        "platform.Tenant", on_delete=models.RESTRICT, null=True, blank=True, related_name="+"
    )
    actor = models.ForeignKey(
        "platform.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    actor_type = models.CharField(max_length=16, choices=ActorType.choices, default=ActorType.USER)
    action = models.CharField(max_length=64)
    entity_type = models.CharField(max_length=48)
    entity_id = models.UUIDField(null=True, blank=True)
    before = models.JSONField(null=True, blank=True)
    after = models.JSONField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "platform_audit_log"
        verbose_name = "audit log"
        verbose_name_plural = "audit logs"
        indexes = [
            models.Index(fields=["tenant", "-created_at"], name="ix_audit_tenant_recent"),
            models.Index(
                fields=["tenant", "entity_type", "entity_id"], name="ix_audit_tenant_entity"
            ),
            # PLT-08 §15 CCR-8: the viewer's "Who" filter.
            models.Index(fields=["tenant", "actor", "-created_at"], name="ix_audit_tenant_actor"),
        ]

    def __str__(self) -> str:
        return f"{self.action}:{self.entity_type}:{self.entity_id}"
