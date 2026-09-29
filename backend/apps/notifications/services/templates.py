"""NTF-02 FR-6/FR-7 — the message template registry and its renderer.

── Resolution: tenant → partner → global → code default ─────────────────────
`notifications_template` rows resolve for `(code, channel, locale)` in that
order, falling back to `locale='en'` (BR-4). Below the database sits
`DEFAULT_TEMPLATES`, the bodies Part 17 specifies, so a fresh database sends
the right words with no seed step — and `manage.py seed_message_templates`
copies them into global rows when an operator needs somewhere to put a DLT id
(the one thing a code default can never know).

── Placeholders only ─────────────────────────────────────────────────────────
Bodies carry `{{name}}` placeholders and nothing else: no conditionals, no
filters (Part 32 §32.8.6: "any conditional lives in the service that chooses
the template code"). The renderer is a strict whitelist — every placeholder in
the body must be supplied (an empty string is a value; a missing key is a
`TemplateRenderError`, never a half-rendered message), and a value can never
introduce a new placeholder because substitution is a single pass.

── `Rs`, never `₹` ───────────────────────────────────────────────────────────
NTF-02 FR-7 / NTF-03 BR-8: the rupee glyph is outside GSM-7 and turns a
160-character SMS into a 70-character one. `format_rs` supplies the figure.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Mapping

from django.core.exceptions import ImproperlyConfigured

from apps.notifications.constants import (
    TEMPLATE_FALLBACK_LOCALE,
    TEMPLATE_LEDGER_ENTRY_GAVE,
    TEMPLATE_LEDGER_ENTRY_GOT,
    TEMPLATE_LEDGER_ENTRY_MULTI,
    TEMPLATE_REMINDER_D0,
    TEMPLATE_REMINDER_D1,
    TEMPLATE_REMINDER_MANUAL,
    TEMPLATE_REMINDER_MANUAL_SMS,
    TEMPLATE_WRITE_OFF,
    MessageChannel,
)

PLACEHOLDER = re.compile(r"\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}")

SMS = MessageChannel.SMS.value
WHATSAPP = MessageChannel.WHATSAPP.value

#: The bodies of LED-06 §17, LED-07 §17 and LED-08 §17, keyed by
#: `(code, channel, locale)`. The `*_line` / `pay_line` placeholders are
#: fragments the calling service builds (or leaves empty) — see
#: `whatsapp_text.py` — which is how "missing optional placeholders collapse
#: with their line" (LED-06 BR-3) is done without logic in a template.
DEFAULT_TEMPLATES: dict[tuple[str, str, str], str] = {
    # LED-06 — the WhatsApp reminder. Polite Hinglish in `en` (§8), Hindi in `hi`.
    (TEMPLATE_REMINDER_MANUAL, WHATSAPP, "en"): (
        "Namaste {{party_name}} ji, {{shop}} ka Rs {{balance}} baaki hai{{due_line}}. "
        "Kripya bhugtan karein.\n{{upi_line}}{{note_line}}— {{shop}}"
    ),
    (TEMPLATE_REMINDER_MANUAL, WHATSAPP, "hi"): (
        "नमस्ते {{party_name}} जी, {{shop}} का Rs {{balance}} बाकी है{{due_line}}। "
        "कृपया भुगतान करें।\n{{upi_line}}{{note_line}}— {{shop}}"
    ),
    # The same words through the merchant's own SMS app (`sms:` link) and through
    # a provider. Shorter: SMS is billed per segment.
    (TEMPLATE_REMINDER_MANUAL_SMS, SMS, "en"): (
        "{{shop}}: Rs {{balance}} is due{{due_line}}. {{pay_line}}{{note_line}}-{{shop}}"
    ),
    (TEMPLATE_REMINDER_MANUAL_SMS, SMS, "hi"): (
        "{{shop}}: Rs {{balance}} बाकी है{{due_line}}। {{pay_line}}{{note_line}}-{{shop}}"
    ),
    # LED-07 — the automated D-1 / D0 SMS.
    (TEMPLATE_REMINDER_D1, SMS, "en"): (
        "{{shop}}: Rs {{balance}} is due tomorrow ({{due_date}}). {{pay_line}}-{{shop}}"
    ),
    (TEMPLATE_REMINDER_D1, SMS, "hi"): (
        "{{shop}}: Rs {{balance}} कल ({{due_date}}) देना है। {{pay_line}}-{{shop}}"
    ),
    (TEMPLATE_REMINDER_D0, SMS, "en"): (
        "{{shop}}: Rs {{balance}} is due today. {{pay_line}}-{{shop}}"
    ),
    (TEMPLATE_REMINDER_D0, SMS, "hi"): (
        "{{shop}}: Rs {{balance}} आज देना है। {{pay_line}}-{{shop}}"
    ),
    # LED-08 — the transaction SMS.
    (TEMPLATE_LEDGER_ENTRY_GAVE, SMS, "en"): (
        "{{shop}}: Rs {{amount}} udhaar added on {{date}}. "
        "Balance Rs {{balance}} ({{label}}). -{{shop}}{{notice}}"
    ),
    (TEMPLATE_LEDGER_ENTRY_GAVE, SMS, "hi"): (
        "{{shop}}: {{date}} को Rs {{amount}} उधार जोड़ा गया। "
        "बाकी Rs {{balance}} ({{label}})। -{{shop}}{{notice}}"
    ),
    (TEMPLATE_LEDGER_ENTRY_GOT, SMS, "en"): (
        "{{shop}}: Received Rs {{amount}} on {{date}}. Thank you. "
        "Balance Rs {{balance}} ({{label}}). -{{shop}}{{notice}}"
    ),
    (TEMPLATE_LEDGER_ENTRY_GOT, SMS, "hi"): (
        "{{shop}}: {{date}} को Rs {{amount}} प्राप्त हुए। धन्यवाद। "
        "बाकी Rs {{balance}} ({{label}})। -{{shop}}{{notice}}"
    ),
    (TEMPLATE_LEDGER_ENTRY_MULTI, SMS, "en"): (
        "{{shop}}: {{n}} entries added on {{date}}. "
        "Balance Rs {{balance}} ({{label}}). -{{shop}}{{notice}}"
    ),
    (TEMPLATE_LEDGER_ENTRY_MULTI, SMS, "hi"): (
        "{{shop}}: {{date}} को {{n}} एंट्री जोड़ी गईं। "
        "बाकी Rs {{balance}} ({{label}})। -{{shop}}{{notice}}"
    ),
    (TEMPLATE_WRITE_OFF, SMS, "en"): (
        "{{shop}}: Rs {{amount}} settled on {{date}}. "
        "Balance Rs {{balance}} ({{label}}). -{{shop}}{{notice}}"
    ),
    (TEMPLATE_WRITE_OFF, SMS, "hi"): (
        "{{shop}}: {{date}} को Rs {{amount}} का हिसाब बराबर किया गया। "
        "बाकी Rs {{balance}} ({{label}})। -{{shop}}{{notice}}"
    ),
}


# ── A10 ── `register_default_templates` (contracts §1.9, R29) ───────────────
#
# A module's message bodies join `DEFAULT_TEMPLATES` from its `ready()`, so they
# resolve through the same tenant → partner → global → code-default chain and
# `seed_message_templates` copies them like core's. Keys are
# `<module>_<purpose>` (≤ 48, the column), bodies per channel × locale, and
# every channel must carry `en` — the resolver's fallback. A registration never
# REPLACES a body: an equal one is a no-op, a different one raises, so a module
# can never rewrite the words of a core template every shop sends. The whole
# mapping is validated before anything is stored.

_MODULE_TEMPLATE_CODE = re.compile(r"^[a-z][a-z0-9]*_[a-z0-9_]+$")
TEMPLATE_CODE_MAX = 48
TEMPLATE_LOCALES = ("en", "hi")
_TEMPLATES_BASELINE: dict[tuple[str, str, str], str] | None = None


def register_default_templates(mapping: Mapping[str, Mapping[str, Mapping[str, str]]]) -> None:
    channels = {choice.value for choice in MessageChannel}
    staged: dict[tuple[str, str, str], str] = {}
    for code, by_channel in mapping.items():
        if not _MODULE_TEMPLATE_CODE.match(code) or len(code) > TEMPLATE_CODE_MAX:
            raise ImproperlyConfigured(
                f"template code {code!r} must be '<module>_<purpose>', at most "
                f"{TEMPLATE_CODE_MAX} characters"
            )
        for channel, by_locale in by_channel.items():
            if channel not in channels:
                raise ImproperlyConfigured(f"{code}: {channel!r} is not a message channel")
            if TEMPLATE_FALLBACK_LOCALE not in by_locale:
                raise ImproperlyConfigured(f"{code}/{channel}: an English body is required")
            for locale, body in by_locale.items():
                if locale not in TEMPLATE_LOCALES:
                    raise ImproperlyConfigured(f"{code}/{channel}: {locale!r} is not a locale")
                if not isinstance(body, str) or not body.strip():
                    raise ImproperlyConfigured(f"{code}/{channel}/{locale}: the body is empty")
                key = (code, channel, locale)
                existing = DEFAULT_TEMPLATES.get(key)
                if existing is not None and existing != body:
                    raise ImproperlyConfigured(f"template {key} is already registered")
                staged[key] = body
    DEFAULT_TEMPLATES.update(staged)


def _reset_for_tests() -> None:  # pragma: no cover - test helper
    """Back to the start-up bodies (core's literal plus every `ready()`)."""
    global _TEMPLATES_BASELINE
    if _TEMPLATES_BASELINE is None:
        _TEMPLATES_BASELINE = dict(DEFAULT_TEMPLATES)
    DEFAULT_TEMPLATES.clear()
    DEFAULT_TEMPLATES.update(_TEMPLATES_BASELINE)


class TemplateRenderError(ValueError):
    """A body could not be rendered: a declared placeholder had no value."""


class TemplateNotRegistered(LookupError):
    """No row and no default exists for the code/channel in any locale."""


@dataclass(frozen=True, slots=True)
class ResolvedTemplate:
    code: str
    channel: str
    locale: str
    body: str
    dlt_template_id: str | None
    #: `tenant` | `partner` | `global` | `default` — for the log and for support.
    origin: str


def _db_row(*, tenant: Any, code: str, channel: str, locale: str) -> tuple[Any, str] | None:
    from django.db.models import Q

    from apps.notifications.models import MessageTemplate

    partner_id = getattr(tenant, "partner_id", None)
    scopes = Q(tenant__isnull=True, partner__isnull=True)
    if tenant is not None:
        scopes |= Q(tenant=tenant)
    if partner_id is not None:
        scopes |= Q(tenant__isnull=True, partner_id=partner_id)
    rows = list(
        MessageTemplate.objects.filter(
            scopes, code=code, channel=channel, locale=locale, is_active=True
        )
    )
    for origin, test in (
        ("tenant", lambda r: tenant is not None and r.tenant_id == getattr(tenant, "id", None)),
        ("partner", lambda r: r.tenant_id is None and r.partner_id is not None),
        ("global", lambda r: r.tenant_id is None and r.partner_id is None),
    ):
        for row in rows:
            if test(row):
                return row, origin
    return None


def resolve_template(*, tenant: Any, code: str, channel: str, locale: str) -> ResolvedTemplate:
    """BR-4 — the body to send, from the most specific scope that has one."""
    locales = [locale] if locale == TEMPLATE_FALLBACK_LOCALE else [locale, TEMPLATE_FALLBACK_LOCALE]
    for candidate in locales:
        found = _db_row(tenant=tenant, code=code, channel=channel, locale=candidate)
        if found is not None:
            row, origin = found
            return ResolvedTemplate(code, channel, candidate, row.body, row.dlt_template_id, origin)
        default = DEFAULT_TEMPLATES.get((code, channel, candidate))
        if default is not None:
            return ResolvedTemplate(code, channel, candidate, default, None, "default")
    raise TemplateNotRegistered(f"{code}/{channel}/{locale}")


def placeholders(body: str) -> set[str]:
    return set(PLACEHOLDER.findall(body))


def render(body: str, params: Mapping[str, Any]) -> str:
    """FR-7 — one pass, strict whitelist; extra params are ignored."""
    missing = placeholders(body) - set(params)
    if missing:
        raise TemplateRenderError(f"missing placeholder(s): {sorted(missing)}")
    text = PLACEHOLDER.sub(lambda m: str(params[m.group(1)]), body)
    if not text.strip():
        raise TemplateRenderError("empty body")  # EC-9
    return text


def _group_indian(integer_part: str) -> str:
    """`1234567` → `12,34,567` — the last three, then pairs."""
    if len(integer_part) <= 3:
        return integer_part
    head, tail = integer_part[:-3], integer_part[-3:]
    pairs = []
    while len(head) > 2:
        pairs.insert(0, head[-2:])
        head = head[:-2]
    if head:
        pairs.insert(0, head)
    return ",".join(pairs + [tail])


def format_rs(amount: Decimal | str) -> str:
    """LED-06 BR-3 — en-IN grouping, magnitude only, no decimals when `.00`.

    The caller puts the `Rs` in the template; this supplies the figure only, so
    "Rs Rs 2,800" cannot happen the way "₹₹2,800.00" did in the client.
    """
    value = abs(Decimal(str(amount))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    integer_part, _, fraction = f"{value:.2f}".partition(".")
    grouped = _group_indian(integer_part)
    return grouped if fraction == "00" else f"{grouped}.{fraction}"
