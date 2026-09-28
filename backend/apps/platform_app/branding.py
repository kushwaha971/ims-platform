"""Branding arithmetic and resolution shared by WLB-01 and WLB-02.

Pure functions only — no writes, no requests — so the tenant endpoint, the
Django admin's partner form and `/auth/me` all compute the same answer.

**Contrast.** WCAG 2.x relative luminance and contrast ratio, the same formula
as the frontend's `contrastRatio` (WLB-01 §5: "tested equal"). A brand colour
must reach 3:1 against white (FR-3) because it is the fill of every primary
button with white text on it; below that the button's label is unreadable.

**Resolution (FR-2).** Every key resolves tenant → partner → product default,
and the resolved value travels with its `source` so the page can say "Using
Metis default". A key the partner has LOCKED (WLB-02 BR-2, EC-4) resolves to
the partner's value whatever the tenant stored: the tenant's value is ignored,
not deleted, so unlocking restores it.
"""

from __future__ import annotations

import colorsys
import re
from typing import Any

HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
MIN_PRIMARY_CONTRAST = 3.0
WHITE = "#FFFFFF"

#: Part 23 / `docs/DESIGN-SYSTEM.md` §1: the product's own indigo.
PRODUCT_DEFAULTS: dict[str, Any] = {
    "primary_hex": "#4A47D6",
    "secondary_hex": None,
    "app_name": "YourKhata",
    "doc_header": "",
    "doc_footer": "",
    "logo_attachment_id": None,
}

#: The keys a tenant may set (WLB-01 BR-1). `signature_attachment_id` is PLT-07's
#: and is never inherited from a partner — a partner's signature on a merchant's
#: bill would be a forgery.
TENANT_KEYS: tuple[str, ...] = (
    "primary_hex",
    "secondary_hex",
    "app_name",
    "doc_header",
    "doc_footer",
    "logo_attachment_id",
)

#: WLB-02 §10: `locked_keys ⊆ {primary_hex, secondary_hex, app_name, doc_footer, logo}`.
LOCKABLE_KEYS: tuple[str, ...] = ("primary_hex", "secondary_hex", "app_name", "doc_footer", "logo")
LOCK_NAME_OF_KEY: dict[str, str] = {
    "primary_hex": "primary_hex",
    "secondary_hex": "secondary_hex",
    "app_name": "app_name",
    "doc_footer": "doc_footer",
    "logo_attachment_id": "logo",
}

APP_NAME_RANGE = (2, 30)
DOC_HEADER_MAX = 120
DOC_FOOTER_MAX = 300
LEGAL_FOOTER_MAX = 300


def _channel(value: int) -> float:
    c = value / 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def relative_luminance(hex_colour: str) -> float:
    h = hex_colour.lstrip("#")
    r, g, b = (int(h[i : i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * _channel(r) + 0.7152 * _channel(g) + 0.0722 * _channel(b)


def contrast_ratio(a: str, b: str) -> float:
    la, lb = relative_luminance(a), relative_luminance(b)
    lighter, darker = max(la, lb), min(la, lb)
    return (lighter + 0.05) / (darker + 0.05)


def suggest_darker(
    hex_colour: str, *, against: str = WHITE, minimum: float = MIN_PRIMARY_CONTRAST
) -> str:
    """The same hue, darkened in 1 % lightness steps until it reaches `minimum`.

    EC-1: `#FFEE00` is refused with a suggestion rather than a bare "no" — the
    merchant chose yellow, and a dark yellow that passes is closer to what they
    meant than our indigo.
    """
    h = hex_colour.lstrip("#")
    r, g, b = (int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))
    hue, lightness, saturation = colorsys.rgb_to_hls(r, g, b)
    while lightness > 0:
        candidate = _hls_hex(hue, lightness, saturation)
        if contrast_ratio(candidate, against) >= minimum:
            return candidate
        lightness = max(0.0, lightness - 0.01)
    return "#000000"


def _hls_hex(hue: float, lightness: float, saturation: float) -> str:
    r, g, b = colorsys.hls_to_rgb(hue, lightness, saturation)
    return "#{:02X}{:02X}{:02X}".format(round(r * 255), round(g * 255), round(b * 255))


def normalise_hex(value: str) -> str:
    return value.strip().upper()


def validate_text_fields(values: dict) -> dict[str, list[str]]:
    """§10's lengths for the text keys present in `values`."""
    errors: dict[str, list[str]] = {}
    low, high = APP_NAME_RANGE
    if "app_name" in values and values["app_name"] is not None:
        name = values["app_name"]
        if not isinstance(name, str) or not low <= len(name.strip()) <= high:
            errors["app_name"] = [f"Use {low}–{high} characters."]
    for key, limit in (("doc_header", DOC_HEADER_MAX), ("doc_footer", DOC_FOOTER_MAX)):
        if key in values and values[key] is not None:
            text = values[key]
            if not isinstance(text, str) or len(text) > limit:
                errors[key] = [f"Keep this under {limit} characters."]
    for key in ("primary_hex", "secondary_hex"):
        if key in values and values[key] not in (None, ""):
            if not isinstance(values[key], str) or not HEX_RE.match(values[key].strip()):
                errors[key] = ["Enter a colour like #2B6BE0."]
    return errors


def attachment_url(attachment_id: Any) -> str | None:
    """The authenticated URL a stored image is read from (`GET /files/{id}`)."""
    return f"/api/v1/files/{attachment_id}" if attachment_id else None


def partner_defaults(partner: Any) -> dict[str, Any]:
    branding = dict(getattr(partner, "branding", None) or {})
    return {key: branding.get(key) for key in TENANT_KEYS}


def locked_keys(partner: Any) -> list[str]:
    branding = dict(getattr(partner, "branding", None) or {})
    raw = branding.get("locked_keys") or []
    return [k for k in raw if k in LOCKABLE_KEYS]


def resolve(tenant: Any) -> dict[str, Any]:
    """FR-1/FR-2 — the resolved branding with a `source` per key. Zero queries.

    `tenant.partner` is already loaded by the tenancy layer's `select_related`,
    and the attachment URLs are built from ids, so this is safe to call on
    `/auth/me`, the first request of every cold load.
    """
    stored = dict(tenant.branding or {})
    partner = tenant.partner
    defaults = partner_defaults(partner)
    locks = set(locked_keys(partner))
    values: dict[str, Any] = {}
    sources: dict[str, str] = {}
    for key in TENANT_KEYS:
        tenant_value = stored.get(key)
        partner_value = defaults.get(key)
        if LOCK_NAME_OF_KEY.get(key) in locks and partner_value not in (None, ""):
            values[key], sources[key] = partner_value, "partner"
        elif tenant_value not in (None, "") and LOCK_NAME_OF_KEY.get(key) not in locks:
            values[key], sources[key] = tenant_value, "tenant"
        elif partner_value not in (None, ""):
            values[key], sources[key] = partner_value, "partner"
        else:
            values[key], sources[key] = PRODUCT_DEFAULTS[key], "default"
    partner_branding = dict(partner.branding or {})
    return {
        "primary_hex": values["primary_hex"],
        "secondary_hex": values["secondary_hex"],
        "app_name": values["app_name"],
        "doc_header": values["doc_header"],
        "doc_footer": values["doc_footer"],
        "logo_attachment_id": values["logo_attachment_id"],
        "logo_url": attachment_url(values["logo_attachment_id"]),
        "signature_attachment_id": stored.get("signature_attachment_id"),
        "signature_url": attachment_url(stored.get("signature_attachment_id")),
        "legal_footer": partner_branding.get("legal_footer") or "",
        "sources": sources,
        "locked_keys": sorted(locks),
        "partner_name": partner.name,
        "partner_defaults": {
            **{k: defaults.get(k) for k in TENANT_KEYS},
            "logo_url": attachment_url(defaults.get("logo_attachment_id")),
        },
    }


def validate_partner_branding(branding: Any) -> dict[str, list[str]]:
    """WLB-02 §10 — the partner's `branding` jsonb, used by the Django admin form."""
    if not isinstance(branding, dict):
        return {"branding": ["Branding must be a JSON object."]}
    allowed = set(TENANT_KEYS) | {"legal_footer", "locked_keys", "favicon_attachment_id"}
    errors: dict[str, list[str]] = {}
    unknown = sorted(set(branding) - allowed)
    if unknown:
        errors["branding"] = [f"Unknown branding key {unknown[0]!r}."]
    errors.update(validate_text_fields(branding))
    primary = branding.get("primary_hex")
    if primary and "primary_hex" not in errors:
        ratio = contrast_ratio(normalise_hex(primary), WHITE)
        if ratio < MIN_PRIMARY_CONTRAST:
            errors["primary_hex"] = [
                f"Too light for buttons ({ratio:.1f}:1). Try {suggest_darker(primary)}."
            ]
    legal = branding.get("legal_footer")
    if legal is not None and (not isinstance(legal, str) or len(legal) > LEGAL_FOOTER_MAX):
        errors["legal_footer"] = [f"Keep this under {LEGAL_FOOTER_MAX} characters."]
    locks = branding.get("locked_keys", [])
    if not isinstance(locks, list) or not set(locks) <= set(LOCKABLE_KEYS):
        errors["locked_keys"] = [f"Choose from {', '.join(LOCKABLE_KEYS)}."]
    return errors
