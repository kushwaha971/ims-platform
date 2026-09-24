"""Tenant settings the purchases app reads, with the FRD's defaults.

The value of a setting is a JSON blob — `{"value": true}` — or, from a support
script, a bare scalar. Anything unreadable falls back to the default, the safe
reading (the rule every other settings reader in the product follows).
"""

from __future__ import annotations

from typing import Any

from apps.purchases.constants import FREE_TEXT_SETTING, ROUND_OFF_SETTING


def _flag(tenant: Any, key: str, default: bool) -> bool:
    from apps.platform_app.models import TenantSetting

    row = TenantSetting.objects.filter(tenant=tenant, key=key).first()
    value = row.value if row is not None else None
    if isinstance(value, dict):
        value = value.get("value", default)
    return value if isinstance(value, bool) else default


def round_off_default(tenant: Any) -> bool:
    """§17.7.0 — `documents.round_off`, default on."""
    return _flag(tenant, ROUND_OFF_SETTING, True)


def allow_free_text_lines(tenant: Any) -> bool:
    """FR-3 — the existing §21.3.7 switch, shared with sales; default off."""
    return _flag(tenant, FREE_TEXT_SETTING, False)


def itc_claimable(tenant: Any, itc_eligible: bool) -> bool:
    """§17.7.0 — only a regular tenant can claim input tax; FR-11 forces it off otherwise."""
    return tenant.gst_type == "regular" and bool(itc_eligible)
