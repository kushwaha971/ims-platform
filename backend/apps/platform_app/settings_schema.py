"""The tenant-settings key catalogue (PLT-06 FR-2, TSK-PLT-06-01).

Every key a merchant may edit through `PUT /tenants/current/settings` is
declared here once: which section it belongs to, what its stored value looks
like, what it defaults to, and how it is validated. A key that is not here is
refused (400 `validation_error`, `details.<key>`), which is FR-2's "rejects
unknown keys" and §19's "server-side JSON-schema validation".

**The stored shapes are the ones onboarding already writes** (`apply_preset`):
every value is a small object (`{"value": true}`, `{"days": 7}`,
`{"mode": "warn"}`) rather than a bare scalar. That shape is kept, not
"corrected" to FRD §7's flat table, because `parties.services.credit` already
reads `ledger.credit_limit_mode` as `{"mode": …}` and the reminder features
read `ledger.reminder_templates` as `{"en": …, "hi": …}` — changing either
would be a migration of live rows to make a table in a document prettier.

**Two keys are deliberately NOT editable here.** `plan.overrides` is support's
lever (PLT-14/PLT-15) and a merchant who could PUT it could grant themselves
seats. `numbering` is a key in the catalogue, but its prefix, next number and
padding live on `platform_document_sequence` for the current financial year,
which is where the number is allocated; `services.tenant_settings` owns that
half, and only `reset_fy` is stored in the setting row.

No `jsonschema` package (ADR-021): each validator is a short function, which is
also what lets the error name the offending field in the merchant's words.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Callable

from apps.platform_app.services import presets

SECTION_GENERAL = "general"
SECTION_DOCUMENTS = "documents"
SECTION_INVENTORY = "inventory"
SECTION_LEDGER = "ledger"
SECTION_PARTIES = "parties"
SECTIONS: tuple[str, ...] = (
    SECTION_GENERAL,
    SECTION_DOCUMENTS,
    SECTION_INVENTORY,
    SECTION_LEDGER,
    SECTION_PARTIES,
)

#: PLT-06 §10: which document kinds each GST registration may default to.
#: "`invoice` only for regular; `bill_of_supply` for composition/regular;
#: `estimate` any".
ALLOWED_KINDS_BY_GST: dict[str, tuple[str, ...]] = {
    "regular": ("invoice", "bill_of_supply", "estimate"),
    "composition": ("bill_of_supply", "estimate"),
    "unregistered": ("estimate",),
}

#: The placeholders a reminder template may carry — the vocabulary the seeded
#: templates (`presets.REMINDER_TEMPLATES`) and the reminder renderer use.
REMINDER_PLACEHOLDERS: tuple[str, ...] = (
    "party_name",
    "business_name",
    "amount",
    "due_date",
    "upi_link",
)
REMINDER_REQUIRED_PLACEHOLDER = "amount"
REMINDER_MAX_CHARS = 500
REMINDER_LOCALES: tuple[str, ...] = ("en", "hi")

NUMBER_FORMATS: tuple[str, ...] = ("en-IN", "hi-IN")
CREDIT_MODES: tuple[str, ...] = ("off", "warn", "block")
UNIT_CODE_RE = re.compile(r"^[A-Z]{2,8}$")
MAX_FAVOURITE_UNITS = 12
DOCUMENT_TERMS_MAX = 1000
PARTY_LABEL_MAX = 20

#: FR-3's numbering rules.
NUMBERING_PREFIX_RE = re.compile(r"^[A-Z0-9/\-]{0,12}$")
NUMBERING_PADDING_RANGE = (3, 6)
#: Rule 46 of the CGST Rules: a tax invoice number is at most 16 characters.
NUMBERING_MAX_LENGTH = 16
NUMBERING_KINDS: tuple[str, ...] = tuple(kind for kind, _prefix in presets.NUMBERING_PREFIXES)


class SettingError(Exception):
    """A key's value is invalid. `messages` is what goes into `details.<key>`."""

    def __init__(self, messages: list[str], *, code: str = "validation_error") -> None:
        super().__init__("; ".join(messages))
        self.messages = messages
        self.code = code


@dataclass(frozen=True, slots=True)
class SettingSpec:
    key: str
    section: str
    #: `(business_type) -> stored value` — the preset, then the product default.
    default: Callable[[str], Any]
    #: `(value, tenant) -> normalised stored value`, or raises `SettingError`.
    validate: Callable[[Any, Any], Any]
    schema_version: int = 1


# ── Validators ───────────────────────────────────────────────────────────────


def _object(value: Any) -> dict:
    if not isinstance(value, dict):
        raise SettingError(["Expected an object."])
    return value


def _bool_value(value: Any, _tenant: Any) -> dict:
    flag = _object(value).get("value")
    if not isinstance(flag, bool):
        raise SettingError(["Choose on or off."])
    return {"value": flag}


def _due_days(value: Any, _tenant: Any) -> dict:
    days = _object(value).get("days")
    if isinstance(days, bool) or not isinstance(days, int) or not 0 <= days <= 365:
        raise SettingError(["Enter 0–365 days."])
    return {"days": days}


def _default_kind(value: Any, _tenant: Any) -> dict:
    """`{"by_gst_type": {regular: …, composition: …, unregistered: …}}`.

    Stored per registration rather than as one kind, which is what makes
    PLT-06 BR-3 ("re-validated when `gst_type` changes") automatic: switching
    registration picks the entry for the new type, and every entry was
    validated against its own type when it was saved (EC-2).
    """
    mapping = _object(value).get("by_gst_type")
    if not isinstance(mapping, dict) or set(mapping) != set(ALLOWED_KINDS_BY_GST):
        raise SettingError(["Choose a default bill type for each GST registration."])
    for gst_type, kind in mapping.items():
        if kind not in ALLOWED_KINDS_BY_GST[gst_type]:
            raise SettingError(["Not allowed for your GST type."], code="kind_not_allowed")
    return {"by_gst_type": {k: mapping[k] for k in sorted(mapping)}}


def _terms(value: Any, _tenant: Any) -> dict:
    text = _object(value).get("text", "")
    if not isinstance(text, str) or len(text) > DOCUMENT_TERMS_MAX:
        raise SettingError([f"Keep terms under {DOCUMENT_TERMS_MAX} characters."])
    return {"text": text.strip()}


def _favourite_units(value: Any, _tenant: Any) -> dict:
    codes = _object(value).get("codes")
    if not isinstance(codes, list) or not all(isinstance(c, str) for c in codes):
        raise SettingError(["Choose units from the list."])
    cleaned = list(dict.fromkeys(c.strip().upper() for c in codes))
    if len(cleaned) > MAX_FAVOURITE_UNITS:
        raise SettingError([f"Choose up to {MAX_FAVOURITE_UNITS} units."])
    if any(not UNIT_CODE_RE.match(c) for c in cleaned):
        raise SettingError(["Choose units from the list."])
    return {"codes": cleaned}


def _credit_mode(value: Any, _tenant: Any) -> dict:
    mode = _object(value).get("mode")
    if mode not in CREDIT_MODES:
        raise SettingError(["Choose off, warn or block."])
    return {"mode": mode}


_PLACEHOLDER_RE = re.compile(r"\{([^{}]*)\}")


def reminder_template_errors(text: str) -> list[str]:
    """T-PLT-06-2: unknown placeholders, and a missing amount (EC-4, research F7)."""
    errors: list[str] = []
    if len(text) > REMINDER_MAX_CHARS:
        errors.append(f"Keep the message under {REMINDER_MAX_CHARS} characters.")
    names = [n.strip() for n in _PLACEHOLDER_RE.findall(text)]
    for name in names:
        if name not in REMINDER_PLACEHOLDERS:
            errors.append(f"Unknown placeholder {{{name}}}")
    if "{{" in text or "}}" in text:
        errors.append("Use single braces, like {amount}.")
    if text.strip() and REMINDER_REQUIRED_PLACEHOLDER not in names:
        errors.append("Include {amount} so the customer sees how much is due.")
    return errors


def _reminder_templates(value: Any, _tenant: Any) -> dict:
    """`{"en": str, "hi": str}`. An empty locale falls back to the default (BR-5)."""
    raw = _object(value)
    unknown = set(raw) - set(REMINDER_LOCALES)
    if unknown:
        raise SettingError([f"Unknown language {sorted(unknown)[0]!r}."])
    cleaned: dict[str, str] = {}
    errors: list[str] = []
    for locale in REMINDER_LOCALES:
        text = raw.get(locale, "")
        if not isinstance(text, str):
            raise SettingError(["Enter the message as text."])
        errors.extend(f"{locale}: {e}" for e in reminder_template_errors(text))
        cleaned[locale] = text.strip()
    if errors:
        raise SettingError(errors)
    return cleaned


def _party_labels(value: Any, _tenant: Any) -> dict:
    raw = _object(value)
    cleaned: dict[str, str] = {}
    for side in ("customer", "supplier"):
        label = raw.get(side)
        if not isinstance(label, str) or not 1 <= len(label.strip()) <= PARTY_LABEL_MAX:
            raise SettingError([f"Enter a {side} label of 1–{PARTY_LABEL_MAX} characters."])
        cleaned[side] = label.strip()
    return cleaned


def _number_format(value: Any, _tenant: Any) -> dict:
    fmt = _object(value).get("value")
    if fmt not in NUMBER_FORMATS:
        raise SettingError(["Choose a number format."])
    return {"value": fmt}


# ── The catalogue ────────────────────────────────────────────────────────────


def _preset(business_type: str) -> presets.Preset:
    return presets.preset_for(business_type)


SETTINGS: dict[str, SettingSpec] = {
    spec.key: spec
    for spec in (
        SettingSpec(
            "locale.number_format",
            SECTION_GENERAL,
            lambda bt: {"value": "en-IN"},
            _number_format,
        ),
        SettingSpec(
            "sales.default_kind",
            SECTION_DOCUMENTS,
            lambda bt: {"by_gst_type": dict(_preset(bt).default_kinds)},
            _default_kind,
        ),
        SettingSpec(
            "sales.default_due_days",
            SECTION_DOCUMENTS,
            lambda bt: {"days": _preset(bt).default_due_days},
            _due_days,
        ),
        SettingSpec("documents.terms", SECTION_DOCUMENTS, lambda bt: {"text": ""}, _terms),
        SettingSpec(
            "documents.show_upi_qr", SECTION_DOCUMENTS, lambda bt: {"value": True}, _bool_value
        ),
        SettingSpec(
            "inventory.enabled",
            SECTION_INVENTORY,
            lambda bt: {"value": bool(_preset(bt).inventory_enabled)},
            _bool_value,
        ),
        SettingSpec(
            "inventory.allow_negative_stock",
            SECTION_INVENTORY,
            lambda bt: {"value": False},
            _bool_value,
        ),
        SettingSpec(
            "inventory.favourite_units",
            SECTION_INVENTORY,
            lambda bt: {"codes": list(_preset(bt).favourite_units)},
            _favourite_units,
        ),
        SettingSpec(
            "ledger.credit_limit_mode",
            SECTION_LEDGER,
            lambda bt: {"mode": "warn"},
            _credit_mode,
        ),
        SettingSpec(
            "ledger.reminder_templates",
            SECTION_LEDGER,
            lambda bt: dict(presets.REMINDER_TEMPLATES),
            _reminder_templates,
        ),
        SettingSpec("ledger.auto_sms", SECTION_LEDGER, lambda bt: {"value": False}, _bool_value),
        SettingSpec(
            "ledger.party_sms_on_entry",
            SECTION_LEDGER,
            lambda bt: {"value": False},
            _bool_value,
        ),
        SettingSpec(
            "parties.labels",
            SECTION_PARTIES,
            lambda bt: {
                "customer": _preset(bt).party_labels[0],
                "supplier": _preset(bt).party_labels[1],
            },
            _party_labels,
        ),
    )
}

NUMBERING_KEY = "numbering"


def migrate_value(key: str, value: Any, schema_version: int) -> Any:
    """BR-7: bring an older stored version up to date. Every key is at v1 today."""
    return value


def format_number(*, prefix: str, fy_label: str, number: int, padding: int) -> str:
    """FR-3's preview — `INV/26-27/0042` (T-PLT-06-1).

    `fy_label` is Part 21's `2026-27`; the printed series uses the short form.
    An empty prefix drops its separator rather than printing a leading slash.
    """
    short_fy = fy_label[2:] if len(fy_label) == 7 else fy_label
    padded = str(number).zfill(padding)
    return f"{prefix}/{short_fy}/{padded}" if prefix else f"{short_fy}/{padded}"


def numbering_row_errors(
    *, prefix: str, padding: int, next_number: int, fy_label: str
) -> list[str]:
    """FR-3 and §10: the prefix pattern, the padding range and Rule 46's 16 characters."""
    errors: list[str] = []
    if not isinstance(prefix, str) or not NUMBERING_PREFIX_RE.match(prefix):
        errors.append("Use capital letters, numbers, / or - (max 12).")
        return errors
    low, high = NUMBERING_PADDING_RANGE
    if isinstance(padding, bool) or not isinstance(padding, int) or not low <= padding <= high:
        errors.append(f"Choose {low}–{high} digits.")
        return errors
    if isinstance(next_number, bool) or not isinstance(next_number, int) or next_number < 1:
        errors.append("Enter a whole number of 1 or more.")
        return errors
    sample = format_number(prefix=prefix, fy_label=fy_label, number=next_number, padding=padding)
    if len(sample) > NUMBERING_MAX_LENGTH:
        errors.append(f"Bill number too long — {len(sample)} of {NUMBERING_MAX_LENGTH} characters.")
    return errors
