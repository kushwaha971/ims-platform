"""Dispatching an outbound message and recording it (PLT-01 FR-3, Part 20 §20.10.1).

`notifications_message_log` belongs to the `notifications` app, which the
Part 20 §20.1.4 matrix does not let `platform` import. The model is therefore
resolved through `django.apps.apps.get_model`, which is the same escape the
audit writer uses for exactly the same reason (`apps/common/audit.py`).

Two channels, one shape. `send_sms` carries the OTP when
`UB_AUTH_OTP_ENABLED=1`; `send_email` carries the password-reset and
address-verification links, which is the only delivery the default MVP path
performs. Both resolve an adapter from settings, both write exactly one
`MessageLog` row, and neither ever raises for a provider failure — a failed
send is a logged row, not a 500 on the sign-in screen.

PLT-01 FR-3's rule generalises: when no backend is configured the row is
written with `status='skipped'` and the request still returns 200 — the secret
cannot be delivered, the UI says the same thing regardless (no account
enumeration, §19), and the developer sees the `skipped` row.
"""

from __future__ import annotations

import logging
from typing import Any

from django.apps import apps
from django.conf import settings
from django.utils import timezone
from django.utils.module_loading import import_string

logger = logging.getLogger("ub.notifications")

# PLT-01 §17: the `otp` SMS template, en and hi.
OTP_TEMPLATES: dict[str, str] = {
    "en": "{code} is your {app_name} code. Valid {minutes} min. Do not share.",
    "hi": "{code} आपका {app_name} कोड है। {minutes} मिनट तक मान्य। किसी को न बताएँ।",
}

# The `password_reset` email, en and hi. The link is the whole message: there is
# nothing else a merchant can act on, and anything else is a line to translate.
RESET_SUBJECTS: dict[str, str] = {
    "en": "Reset your {app_name} password",
    "hi": "अपना {app_name} पासवर्ड रीसेट करें",
}
RESET_TEMPLATES: dict[str, str] = {
    "en": (
        "Open this link to set a new {app_name} password:\n{link}\n\n"
        "The link works once and expires in {minutes} minutes. "
        "If you did not ask for it, ignore this message — nothing has changed."
    ),
    "hi": (
        "नया {app_name} पासवर्ड बनाने के लिए यह लिंक खोलें:\n{link}\n\n"
        "यह लिंक एक ही बार चलेगा और {minutes} मिनट में समाप्त हो जाएगा। "
        "अगर आपने यह नहीं माँगा था तो इसे अनदेखा करें — कुछ नहीं बदला है।"
    ),
}

VERIFY_SUBJECTS: dict[str, str] = {
    "en": "Confirm your {app_name} email address",
    "hi": "अपना {app_name} ईमेल पता सत्यापित करें",
}
VERIFY_TEMPLATES: dict[str, str] = {
    "en": (
        "Open this link to confirm this address for {app_name}:\n{link}\n\n"
        "The link works once and expires in {hours} hours."
    ),
    "hi": (
        "{app_name} के लिए इस पते की पुष्टि करने हेतु यह लिंक खोलें:\n{link}\n\n"
        "यह लिंक एक ही बार चलेगा और {hours} घंटे में समाप्त हो जाएगा।"
    ),
}


def render_otp_sms(*, code: str, minutes: int, app_name: str, locale: str = "en") -> str:
    template = OTP_TEMPLATES.get(locale, OTP_TEMPLATES["en"])
    return template.format(code=code, minutes=minutes, app_name=app_name)


def render_reset_email(
    *, link: str, minutes: int, app_name: str, locale: str = "en"
) -> tuple[str, str]:
    """Returns `(subject, body)`."""
    subject = RESET_SUBJECTS.get(locale, RESET_SUBJECTS["en"]).format(app_name=app_name)
    body = RESET_TEMPLATES.get(locale, RESET_TEMPLATES["en"]).format(
        link=link, minutes=minutes, app_name=app_name
    )
    return subject, body


def render_verify_email(
    *, link: str, hours: int, app_name: str, locale: str = "en"
) -> tuple[str, str]:
    subject = VERIFY_SUBJECTS.get(locale, VERIFY_SUBJECTS["en"]).format(app_name=app_name)
    body = VERIFY_TEMPLATES.get(locale, VERIFY_TEMPLATES["en"]).format(
        link=link, hours=hours, app_name=app_name
    )
    return subject, body


def _resolve(setting_name: str) -> Any | None:
    """Resolve an adapter path from settings. `None` when unset or unimportable."""
    path = getattr(settings, setting_name, "") or ""
    if not path:
        return None
    try:
        return import_string(path)()
    except (ImportError, TypeError, ValueError):  # pragma: no cover - misconfiguration
        logger.error("messaging.backend_unresolvable", extra={"backend": path})
        return None


def _log_row(**fields: Any) -> Any:
    message_log = apps.get_model("notifications", "MessageLog")
    return message_log.objects.create(**fields)


def send_sms(
    *,
    to: str,
    body: str,
    template_code: str,
    tenant: Any = None,
    payload: dict | None = None,
    related_type: str | None = None,
    related_id: Any = None,
) -> Any:
    """Send through the configured SMS adapter and write one `MessageLog` row."""
    backend = _resolve("UB_SMS_BACKEND")
    now = timezone.now()

    if backend is None:
        return _log_row(
            tenant=tenant,
            channel="sms",
            template_code=template_code,
            to_address=to,
            payload=payload or {},
            provider="none",
            status="skipped",
            error="No SMS backend configured (UB_SMS_BACKEND is empty).",
            related_type=related_type,
            related_id=related_id,
        )

    try:
        result = backend.send(
            to=to, body=body, sender_id=settings.UB_SMS_SENDER_ID, template_id=template_code
        )
        status, provider, provider_message_id, error = (
            result.status,
            result.provider,
            result.provider_message_id,
            result.error,
        )
    except Exception as exc:  # noqa: BLE001 - a provider must never 500 the caller
        logger.error("sms.send_failed", extra={"template": template_code})
        status, provider, provider_message_id, error = (
            "failed",
            getattr(backend, "name", "unknown"),
            None,
            str(exc)[:500],
        )

    return _log_row(
        tenant=tenant,
        channel="sms",
        template_code=template_code,
        to_address=to,
        payload=payload or {},
        provider=provider,
        provider_message_id=provider_message_id,
        status=status,
        error=error,
        sent_at=now if status == "sent" else None,
        related_type=related_type,
        related_id=related_id,
    )


def send_email(
    *,
    to: str,
    subject: str,
    body: str,
    template_code: str,
    tenant: Any = None,
    payload: dict | None = None,
    related_type: str | None = None,
    related_id: Any = None,
) -> Any:
    """Send through the configured email adapter and write one `MessageLog` row.

    The `payload` written here must never contain the link or the token: the
    row is readable by anyone with database access and by the operator UI, and
    a reset token in a queryable column is a reset token that outlives its
    fifteen minutes. The console adapter logs the body, which is the documented
    developer path and is deliberately a different exposure from a stored row.
    """
    backend = _resolve("UB_EMAIL_ADAPTER")
    now = timezone.now()

    if backend is None:
        return _log_row(
            tenant=tenant,
            channel="email",
            template_code=template_code,
            to_address=to,
            payload=payload or {},
            provider="none",
            status="skipped",
            error="No email adapter configured (UB_EMAIL_ADAPTER is empty).",
            related_type=related_type,
            related_id=related_id,
        )

    try:
        result = backend.send(
            to=to,
            subject=subject,
            body=body,
            sender=settings.UB_EMAIL_FROM,
            template_id=template_code,
        )
        status, provider, provider_message_id, error = (
            result.status,
            result.provider,
            result.provider_message_id,
            result.error,
        )
    except Exception as exc:  # noqa: BLE001 - a provider must never 500 the caller
        logger.error("email.send_failed", extra={"template": template_code})
        status, provider, provider_message_id, error = (
            "failed",
            getattr(backend, "name", "unknown"),
            None,
            str(exc)[:500],
        )

    return _log_row(
        tenant=tenant,
        channel="email",
        template_code=template_code,
        to_address=to,
        payload=payload or {},
        provider=provider,
        provider_message_id=provider_message_id,
        status=status,
        error=error,
        sent_at=now if status == "sent" else None,
        related_type=related_type,
        related_id=related_id,
    )
