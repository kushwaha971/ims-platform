"""`platform_idempotency_key` (Part 21 §21.3.1, Part 20 §20.6.5)."""

from __future__ import annotations

from django.db import models

from apps.common.constants import IdempotencyStatus
from apps.common.db.fields import uuid7_pk
from apps.common.models import TimeStampedModel


class IdempotencyKey(TimeStampedModel):
    """One row per (tenant, scope, key).

    The unique index is the lock that makes two concurrent identical requests
    impossible to both execute (Part 22 §22.1).
    """

    id = uuid7_pk()
    tenant = models.ForeignKey(
        "platform.Tenant", on_delete=models.RESTRICT, related_name="idempotency_keys"
    )
    user = models.ForeignKey(
        "platform.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    key = models.CharField(max_length=64)
    scope = models.CharField(max_length=48)
    request_hash = models.CharField(max_length=64)
    status = models.CharField(max_length=12, choices=IdempotencyStatus.choices)
    response_status = models.SmallIntegerField(null=True, blank=True)
    response_body = models.JSONField(null=True, blank=True)
    entity_id = models.UUIDField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField()

    class Meta:
        db_table = "platform_idempotency_key"
        verbose_name = "idempotency key"
        verbose_name_plural = "idempotency keys"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "scope", "key"], name="uq_idempotency_tenant_scope_key"
            ),
        ]
        indexes = [
            models.Index(fields=["expires_at"], name="ix_idempotency_expires"),
        ]

    def __str__(self) -> str:
        return f"{self.scope}:{self.key}"
