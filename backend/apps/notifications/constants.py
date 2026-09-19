"""Notification enumerations (Part 26 §26.16 R16.1).

Values match canon §0.7 (`MessageLog`) and Part 21 §21.3.2 exactly.
"""

from __future__ import annotations

from django.db import models
from django.utils.translation import gettext_lazy as _


class MessageChannel(models.TextChoices):
    """Part 21 §21.3.2 `notifications_message_log.channel`."""

    SMS = "sms", _("SMS")
    WHATSAPP = "whatsapp", _("WhatsApp")
    EMAIL = "email", _("Email")
    PUSH = "push", _("Push")


class MessageStatus(models.TextChoices):
    """Canon §0.7 `MessageLog`. `skipped` = provider not configured."""

    QUEUED = "queued", _("Queued")
    SENT = "sent", _("Sent")
    DELIVERED = "delivered", _("Delivered")
    FAILED = "failed", _("Failed")
    SKIPPED = "skipped", _("Skipped")


# Template codes this sprint writes. `otp` is PLT-01 FR-3 and is reachable only
# when `UB_AUTH_OTP_ENABLED=1`; the two email templates are the MVP path (DEC-010).
TEMPLATE_OTP = "otp"
TEMPLATE_PASSWORD_RESET = "password_reset"
TEMPLATE_EMAIL_VERIFY = "email_verify"
