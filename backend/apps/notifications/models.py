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
from apps.common.models import TenantModel, TimeStampedModel
from apps.notifications.constants import (
    MessageChannel,
    MessageStatus,
    NotificationCategory,
    NotificationSeverity,
    TemplateCategory,
)


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


class Notification(TenantModel):
    """One row of the in-app inbox (NTF-01, Part 21 §21.3.2 + CCR-37).

    `user` set → a personal row, read state in `read_at`. `user` NULL → a
    BROADCAST to every active member whose role holds the type's
    `required_permission` (FR-5); per-member read state is `read_by`, a JSON
    list of user-id strings, so one row serves the whole shop instead of N.

    The permission is evaluated at READ time against the member's current role
    (BR-1), which is why the type code is stored and the permission is not: a
    role downgraded after the row was raised stops seeing it immediately.

    `title` and `body` are the English rendering at write time, kept for a
    support query in psql; the client renders from `type` + `data.params`
    through its own catalogue so a Hindi member reads Hindi (BR-10).
    """

    user = models.ForeignKey(
        "platform.User", on_delete=models.CASCADE, null=True, blank=True, related_name="+"
    )
    type = models.CharField(max_length=32)
    category = models.CharField(max_length=16, choices=NotificationCategory.choices)
    severity = models.CharField(
        max_length=8, choices=NotificationSeverity.choices, default=NotificationSeverity.INFO
    )
    title = models.CharField(max_length=200)
    body = models.CharField(max_length=300, blank=True, default="")
    data = models.JSONField(default=dict, blank=True)
    #: FR-6 — rows with the same key coalesce while unread.
    group_key = models.CharField(max_length=80, null=True, blank=True)
    count = models.PositiveSmallIntegerField(default=1)
    read_at = models.DateTimeField(null=True, blank=True)
    read_by = models.JSONField(default=list, blank=True)

    class Meta:
        db_table = "notifications_notification"
        verbose_name = "notification"
        verbose_name_plural = "notifications"
        indexes = [
            # §21.3.2's index: a member's personal inbox, newest first.
            models.Index(
                fields=["tenant", "user", "read_at", "-created_at"],
                name="ix_notification_inbox",
            ),
            # §15 — the coalescing lookup and the 180-day purge both walk this.
            models.Index(
                fields=["tenant", "type", "group_key", "-created_at"],
                name="ix_notification_group",
            ),
            models.Index(fields=["created_at"], name="ix_notification_created"),
        ]

    def __str__(self) -> str:  # pragma: no cover - admin convenience
        return f"{self.type}:{self.id}"


class MessageTemplate(TimeStampedModel):
    """A message body in the registry (NTF-02 FR-6, Part 21 §21.3.2).

    Resolution for `(code, channel, locale)` is tenant → partner → global, then
    the code-level defaults in `services/templates.py`, then `locale='en'`. A
    global row exists only when an operator has seeded or edited one — most
    commonly to set `dlt_template_id` once DLT approval lands, which is the one
    thing a code default can never know.
    """

    id = uuid7_pk()
    partner = models.ForeignKey(
        "platform.Partner", on_delete=models.CASCADE, null=True, blank=True, related_name="+"
    )
    tenant = models.ForeignKey(
        "platform.Tenant", on_delete=models.CASCADE, null=True, blank=True, related_name="+"
    )
    code = models.CharField(max_length=48)
    channel = models.CharField(max_length=16, choices=MessageChannel.choices)
    locale = models.CharField(max_length=8, default="en")
    body = models.TextField()
    #: NTF-02 BR-5 — null at MVP; required by a live provider that declares DLT.
    dlt_template_id = models.CharField(max_length=32, null=True, blank=True)
    whatsapp_template_name = models.CharField(max_length=64, null=True, blank=True)
    category = models.CharField(
        max_length=16, choices=TemplateCategory.choices, default=TemplateCategory.SERVICE_IMPLICIT
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "notifications_template"
        verbose_name = "message template"
        verbose_name_plural = "message templates"
        constraints = [
            # One row per scope × code × channel × locale. NULLS NOT DISTINCT so
            # two GLOBAL rows for the same key are refused too — without it the
            # partial-null scopes would each be allowed a duplicate.
            models.UniqueConstraint(
                fields=["partner", "tenant", "code", "channel", "locale"],
                name="uq_template_scope_code",
                nulls_distinct=False,
            ),
        ]

    def __str__(self) -> str:  # pragma: no cover - admin convenience
        return f"{self.code}/{self.channel}/{self.locale}"
