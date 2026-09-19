"""Models for the notifications app.

`notifications_notification` (the in-app inbox) lands with `NTF-01`. Only
`notifications_message_log` is built in Sprint 1, because `PLT-01` FR-3 and
AC-5 are written against it: every OTP dispatch writes one row, and the
acceptance check for the console SMS backend is the existence of that row with
`provider='console'`. A feature whose acceptance criterion cannot be evaluated
is not a feature that has been built.

Deviation from Part 21 §21.3.2, recorded in `CR-LOG`: `tenant_id` is nullable
here. An OTP is dispatched before any tenant context exists — sign-up has no
tenant at all, and login does not know which tenant the user will land in — so
the row that PLT-01 FR-3 requires cannot carry one.
"""

from __future__ import annotations

from django.db import models

from apps.common.db.fields import uuid7_pk
from apps.common.models import TimeStampedModel
from apps.notifications.constants import MessageChannel, MessageStatus


class MessageLog(TimeStampedModel):
    """One row per outbound message attempt (Part 21 §21.3.2)."""

    id = uuid7_pk()
    tenant = models.ForeignKey(
        "platform.Tenant",
        on_delete=models.RESTRICT,
        null=True,
        blank=True,
        related_name="message_logs",
    )
    party = models.ForeignKey(
        "parties.Party", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    channel = models.CharField(max_length=16, choices=MessageChannel.choices)
    template_code = models.CharField(max_length=48)
    to_address = models.CharField(max_length=254)
    payload = models.JSONField(default=dict, blank=True)
    provider = models.CharField(max_length=32)
    provider_message_id = models.CharField(max_length=128, null=True, blank=True)
    status = models.CharField(
        max_length=16, choices=MessageStatus.choices, default=MessageStatus.QUEUED
    )
    error = models.TextField(null=True, blank=True)
    cost = models.DecimalField(max_digits=8, decimal_places=4, null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    related_type = models.CharField(max_length=48, null=True, blank=True)
    related_id = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = "notifications_message_log"
        verbose_name = "message log"
        verbose_name_plural = "message logs"
        indexes = [
            models.Index(fields=["tenant", "-created_at"], name="ix_message_log_tenant_created"),
            models.Index(fields=["provider_message_id"], name="ix_message_log_provider_id"),
        ]

    def __str__(self) -> str:
        return f"{self.channel}:{self.template_code}:{self.status}"
