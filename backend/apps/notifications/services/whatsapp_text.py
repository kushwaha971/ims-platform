"""NTF-03 — the words of a reminder, and the deep links that carry them.

The SERVER composes every message that contains money (NTF-03 FR-2, BR-2): the
balance in the text is read from the same row the app shows, and the client
never builds a number into a URL. What the client does with the result is open
it from a real `<a>` so no popup blocker can eat it.

── The optional lines ────────────────────────────────────────────────────────
LED-06 BR-3: "missing optional placeholders collapse with their line". The
template holds `{{upi_line}}`, `{{due_line}}`, `{{note_line}}`; this module
builds each fragment in the message's language or leaves it empty. The template
stays a sentence with holes in it and the decisions stay in Python.

── The UPI line ──────────────────────────────────────────────────────────────
Only when the tenant has a VPA (NTF-03 / LED-06 EC-7). It is the NPCI intent
URL with the balance as the amount (LED-06 BR-8); on a phone WhatsApp renders
`upi://` as tappable and the customer's UPI app opens with the figure filled in.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from decimal import Decimal
from typing import Any
from urllib.parse import quote

from apps.common.integrations.upi.intent import build_upi_url
from apps.common.integrations.whatsapp.deep_link import WaMeBackend
from apps.notifications.constants import TEMPLATE_REMINDER_MANUAL, TEMPLATE_REMINDER_MANUAL_SMS
from apps.notifications.services.dispatch import whatsapp_digits
from apps.notifications.services.templates import format_rs, render, resolve_template

#: NTF-03 FR-7 — practical ceiling for a `wa.me` prefill across browsers.
MAX_SHARE_TEXT = 900

#: The fragments each optional placeholder expands to, per language.
FRAGMENTS: dict[str, dict[str, str]] = {
    "en": {
        "due_line": " (collection date {date})",
        "upi_line": "Pay via UPI: {link}\n",
        "pay_line": "Pay: {link} ",
        "pay_at_shop": "Please pay at the shop. ",
        "note_line": "{note}\n",
        "sms_note": "{note} ",
    },
    "hi": {
        "due_line": " (वसूली तारीख {date})",
        "upi_line": "UPI से भुगतान: {link}\n",
        "pay_line": "भुगतान: {link} ",
        "pay_at_shop": "कृपया दुकान पर भुगतान करें। ",
        "note_line": "{note}\n",
        "sms_note": "{note} ",
    },
}


def message_locale(tenant: Any) -> str:
    """NTF-03 FR-14's last step — the tenant's language (party locale is CCR-40, unbuilt)."""
    locale = (getattr(tenant, "locale", None) or "en").split("-")[0]
    return locale if locale in FRAGMENTS else "en"


def shop_name(tenant: Any, limit: int = 30) -> str:
    """LED-08 BR-2 — ≤ 30 characters, truncated with an ellipsis, never empty."""
    name = (getattr(tenant, "name", "") or "").strip()
    return name if len(name) <= limit else name[: limit - 1] + "…"


def upi_link(*, tenant: Any, amount: Decimal, reference: str | None = None) -> str | None:
    vpa = (getattr(tenant, "upi_vpa", None) or "").strip()
    if not vpa or amount <= 0:
        return None
    shop = shop_name(tenant)
    return build_upi_url(
        vpa=vpa, payee_name=shop, amount=amount, note=f"Payment to {shop}", reference=reference
    )


def wa_url(digits: str | None, text: str) -> str:
    """LED-06 BR-2 — `quote(text, safe='')`, so `&`, `#`, `?`, `+` cannot end the parameter."""
    return WaMeBackend().build_share_url(to=digits or "", body=text)


def sms_url(digits: str | None, text: str) -> str:
    """RFC 5724 with the `?&body=` spelling both platforms read."""
    return f"sms:{('+' + digits) if digits else ''}?&body={quote(text, safe='')}"


def tel_url(digits: str | None) -> str | None:
    return f"tel:+{digits}" if digits else None


@dataclass(frozen=True, slots=True)
class ComposedReminder:
    text: str
    sms_text: str
    template_code: str
    locale: str
    params: dict
    digits: str | None
    wa_url: str
    sms_url: str
    tel_url: str | None
    has_upi: bool


def compose_reminder(
    *,
    tenant: Any,
    party: Any,
    balance: Decimal,
    note: str = "",
    reference: str | None = None,
    today: dt.date | None = None,
) -> ComposedReminder:
    """The WhatsApp text and the SMS-app text for one manual reminder (LED-06 §17)."""
    locale = message_locale(tenant)
    frag = FRAGMENTS[locale]
    shop = shop_name(tenant)
    link = upi_link(tenant=tenant, amount=balance, reference=reference)
    due = getattr(party, "collection_date", None)
    due_line = frag["due_line"].format(date=due.strftime("%d/%m/%Y")) if due else ""
    note = (note or "").strip()

    params = {
        "party_name": (getattr(party, "name", "") or "").strip(),
        "shop": shop,
        "balance": format_rs(balance),
        "due_line": due_line,
        "upi_line": frag["upi_line"].format(link=link) if link else "",
        "note_line": frag["note_line"].format(note=note) if note else "",
    }
    wa_template = resolve_template(
        tenant=tenant, code=TEMPLATE_REMINDER_MANUAL, channel="whatsapp", locale=locale
    )
    text = render(wa_template.body, params)
    if len(text) > MAX_SHARE_TEXT and note:
        # FR-7 — truncate the optional middle before anything else, never the
        # amount, the link or the sign-off.
        params = {**params, "note_line": ""}
        text = render(wa_template.body, params)

    sms_params = {
        **params,
        "pay_line": frag["pay_line"].format(link=link) if link else frag["pay_at_shop"],
        "note_line": frag["sms_note"].format(note=note) if note else "",
    }
    sms_template = resolve_template(
        tenant=tenant, code=TEMPLATE_REMINDER_MANUAL_SMS, channel="sms", locale=locale
    )
    sms_text = render(sms_template.body, sms_params)

    digits = whatsapp_digits(getattr(party, "mobile", None))
    return ComposedReminder(
        text=text,
        sms_text=sms_text,
        template_code=TEMPLATE_REMINDER_MANUAL,
        locale=wa_template.locale,
        params=params,
        digits=digits,
        wa_url=wa_url(digits, text),
        sms_url=sms_url(digits, sms_text),
        tel_url=tel_url(digits),
        has_upi=link is not None,
    )


def pay_line(*, tenant: Any, amount: Decimal, reference: str | None = None) -> str:
    """LED-07 §17 — the UPI part of an automated SMS, or "please pay at the shop"."""
    frag = FRAGMENTS[message_locale(tenant)]
    link = upi_link(tenant=tenant, amount=amount, reference=reference)
    return frag["pay_line"].format(link=link) if link else frag["pay_at_shop"]
