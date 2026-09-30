"""The ledger's one doorway into the notifications app.

Part 20 §20.1.4 lets `ledger` import `{common, platform_app, parties, files}` at
module level and not `notifications`; the notifications app in turn may not
import the ledger. Reminders need both halves — the reminder row is the
ledger's, the rendered text and the message log are notifications' — so the
ledger reaches across here, and ONLY here, with imports deferred into the
function body. That is the escape `common/audit.py` uses for the same reason,
it is invisible to the module-level walker by design, and it makes no cycle:
nothing in `notifications` ever imports back.

Keeping every crossing in one file means a reader looking for "what does the
ledger ask of messaging" reads eight small functions, not a grep.
"""

from __future__ import annotations

from typing import Any


def compose_reminder(**kwargs: Any) -> Any:
    from apps.notifications.services.whatsapp_text import compose_reminder as _compose

    return _compose(**kwargs)


def pay_line(**kwargs: Any) -> str:
    from apps.notifications.services.whatsapp_text import pay_line as _pay_line

    return _pay_line(**kwargs)


def message_locale(tenant: Any) -> str:
    from apps.notifications.services.whatsapp_text import message_locale as _locale

    return _locale(tenant)


def shop_name(tenant: Any) -> str:
    from apps.notifications.services.whatsapp_text import shop_name as _shop

    return _shop(tenant)


def format_rs(amount: Any) -> str:
    from apps.notifications.services.templates import format_rs as _format

    return _format(amount)


def log_manual_share(**kwargs: Any) -> Any:
    from apps.notifications.services.dispatch import log_manual_share as _log

    return _log(**kwargs)


def deliver_sms(**kwargs: Any) -> Any:
    from apps.notifications.services.dispatch import deliver_sms as _deliver

    return _deliver(**kwargs)


def sms_configured() -> bool:
    from apps.notifications.services.dispatch import sms_configured as _configured

    return _configured()


def has_sent_sms(*, party: Any) -> bool:
    from apps.notifications.services.dispatch import has_sent_sms as _has_sent

    return _has_sent(party=party)


def notify(tenant: Any, type_code: str, **kwargs: Any) -> Any:
    from apps.notifications.services.notify import notify as _notify

    return _notify(tenant, type_code, **kwargs)


def message_log_model() -> Any:
    from django.apps import apps

    return apps.get_model("notifications", "MessageLog")


# ── A7 ── PLT-X06: a module reminder's text, from its registered template ────


def compose_source_reminder(
    *, tenant: Any, template_key: str, params: dict, mobile: str | None
) -> Any:
    """The WhatsApp text, the SMS-app text and the links for one module reminder.

    The words are the module's (`template_key` registered through A10's
    `register_default_templates`, `whatsapp` and `sms` channels); the frame is
    the same tenant → partner → global → default resolution every message uses.
    A missing SMS body falls back to the WhatsApp one, which is plain text too.
    """
    from types import SimpleNamespace

    from apps.notifications.services.dispatch import whatsapp_digits
    from apps.notifications.services.templates import (
        TemplateNotRegistered,
        render,
        resolve_template,
    )
    from apps.notifications.services.whatsapp_text import (
        message_locale as _locale,
    )
    from apps.notifications.services.whatsapp_text import sms_url, tel_url, wa_url

    locale = _locale(tenant)
    wa = resolve_template(tenant=tenant, code=template_key, channel="whatsapp", locale=locale)
    text = render(wa.body, params)
    try:
        sms = resolve_template(tenant=tenant, code=template_key, channel="sms", locale=locale)
        sms_text = render(sms.body, params)
    except TemplateNotRegistered:
        sms_text = text
    digits = whatsapp_digits(mobile)
    return SimpleNamespace(
        text=text,
        sms_text=sms_text,
        template_code=template_key,
        locale=wa.locale,
        params=params,
        digits=digits,
        wa_url=wa_url(digits, text),
        sms_url=sms_url(digits, sms_text),
        tel_url=tel_url(digits),
    )
