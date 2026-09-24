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


# ── NTF-01 — the in-app inbox ────────────────────────────────────────────────


class NotificationCategory(models.TextChoices):
    """NTF-01 FR-1 / CCR-37 — the five chip filters of the inbox."""

    MONEY = "money", _("Money")
    STOCK = "stock", _("Stock")
    REMINDERS = "reminders", _("Reminders")
    TEAM = "team", _("Team")
    SYSTEM = "system", _("System")


class NotificationSeverity(models.TextChoices):
    """NTF-01 FR-1 — decorative only; the title always carries the meaning."""

    INFO = "info", _("Info")
    SUCCESS = "success", _("Success")
    WARNING = "warning", _("Warning")
    DANGER = "danger", _("Danger")


#: FR-10 / Part 21 §21.3.2 — everything in the inbox is gone after 180 days.
NOTIFICATION_RETENTION_DAYS = 180
#: BR-12 — the ceilings on a coalesced row.
COALESCE_MAX_COUNT = 999
COALESCE_MAX_IDS = 50
#: §10 — the page size of the inbox.
INBOX_DEFAULT_LIMIT = 25
INBOX_MAX_LIMIT = 50


# ── NTF-02 — the template registry ───────────────────────────────────────────


class TemplateCategory(models.TextChoices):
    """NTF-02 FR-6 / CCR-39 — the TRAI/DLT category a template is registered under."""

    TRANSACTIONAL = "transactional", _("Transactional")
    SERVICE_IMPLICIT = "service_implicit", _("Service implicit")
    SERVICE_EXPLICIT = "service_explicit", _("Service explicit")
    PROMOTIONAL = "promotional", _("Promotional")


#: The locales a template body exists in. `en` is the fallback (NTF-02 BR-4).
TEMPLATE_LOCALES: tuple[str, ...] = ("en", "hi")
TEMPLATE_FALLBACK_LOCALE = "en"

# Template codes owned by LED-06/07/08 and NTF-03. One constant per code so a
# typo is a NameError in a test rather than a `template_not_registered` row.
TEMPLATE_REMINDER_MANUAL = "REMINDER_MANUAL"
TEMPLATE_REMINDER_MANUAL_SMS = "REMINDER_MANUAL_SMS"
TEMPLATE_REMINDER_D1 = "REMINDER_D1"
TEMPLATE_REMINDER_D0 = "REMINDER_D0"
TEMPLATE_LEDGER_ENTRY_GAVE = "LEDGER_ENTRY_GAVE"
TEMPLATE_LEDGER_ENTRY_GOT = "LEDGER_ENTRY_GOT"
TEMPLATE_LEDGER_ENTRY_MULTI = "LEDGER_ENTRY_MULTI"
TEMPLATE_WRITE_OFF = "WRITE_OFF"

#: `notifications_message_log.provider` values written by this app.
PROVIDER_WA_ME = "wa_me"
PROVIDER_SMS_LINK = "sms_link"
PROVIDER_CONSOLE = "console"
PROVIDER_NONE = "none"

#: `notifications_message_log.error` values a merchant can be told about.
ERROR_CHANNEL_NOT_CONFIGURED = "channel_not_configured"
ERROR_PARTY_OPTED_OUT = "party_opted_out"
ERROR_NO_MOBILE = "no_mobile"
ERROR_INVALID_NUMBER = "invalid_number"
ERROR_TEMPLATE_NOT_REGISTERED = "template_not_registered"
ERROR_PROVIDER = "provider_error"
