"""NTF-02 FR-5 — every party-facing message goes through here, and is logged once.

Two entry points, because the product sends two kinds of thing:

* `deliver_sms()` — a message the PRODUCT sends through the configured SMS
  adapter (LED-07's D-1/D0 reminders, LED-08's transaction SMS, a provider-sent
  manual reminder). Called from a job handler, never from a request: the job is
  already the asynchronous hop NTF-02 FR-5 describes, so this does not enqueue
  a second one. It checks consent, renders, calls the backend and writes exactly
  one `notifications_message_log` row with a terminal status (BR-1/BR-2).
* `log_manual_share()` — a message the MERCHANT sends from their own WhatsApp or
  SMS app via a `wa.me` / `sms:` link (NTF-03). Nothing leaves the building;
  the row records that the merchant was handed the text (NTF-02 BR-10), with
  `status='sent'` meaning exactly that and `cost=0`.

── Console is "not configured", not "sent" ──────────────────────────────────
NTF-02 FR-2 and LED-07 BR-6: a tenant with no provider NEVER sends, and the row
says `skipped` with `error='channel_not_configured'` so "failed" keeps meaning
"the customer did not get it". The `ConsoleSmsBackend` still returns `sent` for
PLT-01's OTP path (its acceptance criterion); here it is recognised by name and
not called at all — calling it would write the party's name and balance into
the application log, which is exactly the PII the log must not hold.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Mapping

from django.conf import settings
from django.utils import timezone
from django.utils.module_loading import import_string

from apps.notifications.constants import (
    ERROR_CHANNEL_NOT_CONFIGURED,
    ERROR_INVALID_NUMBER,
    ERROR_NO_MOBILE,
    ERROR_PARTY_OPTED_OUT,
    ERROR_PROVIDER,
    ERROR_TEMPLATE_NOT_REGISTERED,
    PROVIDER_CONSOLE,
    PROVIDER_NONE,
    MessageChannel,
    MessageStatus,
)
from apps.notifications.models import MessageLog
from apps.notifications.services.templates import (
    TemplateNotRegistered,
    TemplateRenderError,
    render,
    resolve_template,
)

logger = logging.getLogger("ub.notifications")

#: LED-07 §10 / NTF-02 §10 — the only numbers an Indian transactional SMS reaches.
E164_IN = re.compile(r"^\+91[6-9]\d{9}$")


class ProviderError(RuntimeError):
    """A retryable provider failure; the job runner's backoff retries it (FR-10)."""


def _sms_backend_path() -> str:
    return getattr(settings, "UB_SMS_BACKEND", "") or ""


def sms_configured() -> bool:
    """`feature_flags.sms_configured` — a real provider, not the console printer."""
    path = _sms_backend_path()
    return bool(path) and not path.endswith("ConsoleSmsBackend")


def whatsapp_digits(mobile: str | None) -> str | None:
    """E.164 without the plus (`919812345678`), or None when there is no usable number.

    LED-06 BR-2. The stored mobile is already E.164 (`platform_app.mobile`
    normalises every write); a legacy ten-digit value is read as Indian, which
    is the only market (PLT-01). Anything else is refused rather than guessed —
    sending somebody's balance to a half-parsed number cannot be taken back.
    """
    if not mobile:
        return None
    digits = re.sub(r"\D", "", mobile)
    if mobile.strip().startswith("+"):
        return digits if 8 <= len(digits) <= 15 else None
    if len(digits) == 10:
        return "91" + digits
    if len(digits) == 12 and digits.startswith("91"):
        return digits
    return None


def mask(to: str) -> str:
    """Part 26 R9.3 — never a full number in a log line."""
    return f"{to[:3]}•••••{to[-3:]}" if len(to) > 6 else "•••"


@dataclass(frozen=True, slots=True)
class SmsOutcome:
    log: MessageLog
    #: True when the attempt failed for a reason worth retrying (FR-10).
    retryable: bool = False


def _row(**fields: Any) -> MessageLog:
    return MessageLog.objects.create(**fields)


def deliver_sms(
    *,
    tenant: Any,
    party: Any,
    template_code: str,
    params: Mapping[str, Any],
    locale: str = "en",
    related_type: str | None = None,
    related_id: Any = None,
    require_opt_in: bool = True,
) -> SmsOutcome:
    """Render and send one SMS to a party; always returns the one log row it wrote.

    FR-9's consent gate runs HERE, at send time, not at composition time (BR-6):
    consent can be withdrawn between the two, and a queued job must not honour
    a promise the customer has since taken back.
    """
    to = (getattr(party, "mobile", None) or "").strip()
    base = {
        "tenant": tenant,
        "party": party,
        "channel": MessageChannel.SMS,
        "template_code": template_code,
        "to_address": to,
        "related_type": related_type,
        "related_id": related_id,
    }
    if require_opt_in and not getattr(party, "sms_opt_in", False):
        return SmsOutcome(
            _row(
                **base,
                provider=PROVIDER_NONE,
                status=MessageStatus.SKIPPED,
                error=ERROR_PARTY_OPTED_OUT,
            )
        )
    if not to:
        return SmsOutcome(
            _row(
                **base, provider=PROVIDER_NONE, status=MessageStatus.SKIPPED, error=ERROR_NO_MOBILE
            )
        )
    if not E164_IN.match(to):
        # LED-07 §10 / LED-08 EC-2 — a landline or a foreign number: `failed`
        # with a reason the merchant can fix, never a guess.
        return SmsOutcome(
            _row(
                **base,
                provider=PROVIDER_NONE,
                status=MessageStatus.FAILED,
                error=ERROR_INVALID_NUMBER,
            )
        )

    try:
        template = resolve_template(tenant=tenant, code=template_code, channel="sms", locale=locale)
        body = render(template.body, params)
    except (TemplateNotRegistered, TemplateRenderError) as exc:
        logger.error(
            "sms.template_error",
            extra={"template": template_code, "error_class": type(exc).__name__},
        )
        return SmsOutcome(
            _row(
                **base,
                provider=PROVIDER_NONE,
                status=MessageStatus.FAILED,
                error=ERROR_TEMPLATE_NOT_REGISTERED,
                payload={"params": dict(params)},
            )
        )

    payload = {
        "body": body,
        "params": {k: str(v) for k, v in params.items()},
        "locale": template.locale,
    }
    if not sms_configured():
        return SmsOutcome(
            _row(
                **base,
                provider=PROVIDER_CONSOLE if _sms_backend_path() else PROVIDER_NONE,
                status=MessageStatus.SKIPPED,
                error=ERROR_CHANNEL_NOT_CONFIGURED,
                payload=payload,
                cost=Decimal("0"),
            )
        )

    backend = import_string(_sms_backend_path())()
    try:
        result = backend.send(
            to=to,
            body=body,
            sender_id=getattr(settings, "UB_SMS_SENDER_ID", ""),
            template_id=template.dlt_template_id,
        )
    except Exception as exc:  # noqa: BLE001 — a provider must never 500 its caller
        logger.warning(
            "sms.provider_error",
            extra={
                "template": template_code,
                "to_masked": mask(to),
                "error_class": type(exc).__name__,
            },
        )
        return SmsOutcome(
            _row(
                **base,
                provider=getattr(backend, "name", "unknown"),
                status=MessageStatus.FAILED,
                error=ERROR_PROVIDER,
                payload=payload,
            ),
            retryable=True,
        )

    status = result.status if result.status in MessageStatus.values else MessageStatus.FAILED
    return SmsOutcome(
        _row(
            **base,
            provider=result.provider,
            provider_message_id=result.provider_message_id,
            status=status,
            error=result.error,
            payload=payload,
            sent_at=timezone.now() if status == MessageStatus.SENT else None,
        ),
        retryable=status == MessageStatus.FAILED,
    )


def log_manual_share(
    *,
    tenant: Any,
    party: Any,
    channel: str,
    provider: str,
    to: str,
    template_code: str,
    body: str,
    params: Mapping[str, Any] | None = None,
    related_type: str | None = None,
    related_id: Any = None,
) -> MessageLog:
    """NTF-03 FR-4 / LED-06 BR-6 — the merchant was handed this text; cost nothing."""
    return _row(
        tenant=tenant,
        party=party,
        channel=channel,
        template_code=template_code,
        to_address=to,
        provider=provider,
        status=MessageStatus.SENT,
        cost=Decimal("0"),
        sent_at=timezone.now(),
        payload={"body": body, "params": {k: str(v) for k, v in (params or {}).items()}},
        related_type=related_type,
        related_id=related_id,
    )


def has_sent_sms(*, party: Any) -> bool:
    """LED-08 FR-7 — has this party ever actually received an SMS from us?"""
    return MessageLog.objects.filter(
        party=party,
        channel=MessageChannel.SMS,
        status__in=(MessageStatus.SENT, MessageStatus.DELIVERED),
    ).exists()
