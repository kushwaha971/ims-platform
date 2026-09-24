"""Tenant settings the sales app reads (Part 21 §21.3.1 well-known keys, CR-SAL-2).

The value of a setting is a JSON blob — `{"value": true}`, `{"days": 15}`,
`{"text": "…"}` — or, from a support script, a bare scalar. Anything
unreadable falls back to the default, the safe reading (the same rule the
credit-mode and negative-stock readers follow).
"""

from __future__ import annotations

from typing import Any

from apps.sales.constants import (
    DEFAULT_DUE_DAYS,
    DUE_DAYS_SETTING,
    FREE_TEXT_SETTING,
    REQUIRE_HSN_B2B_SETTING,
    ROUND_OFF_SETTING,
    SHOW_UPI_QR_SETTING,
    TERMS_SETTING,
)


def setting_field(tenant: Any, key: str, field: str, default: Any) -> Any:
    from apps.platform_app.models import TenantSetting

    row = TenantSetting.objects.filter(tenant=tenant, key=key).first()
    value = row.value if row is not None else None
    if isinstance(value, dict):
        value = value.get(field, default)
    if value is None:
        return default
    return value if isinstance(value, type(default)) else default


def round_off_default(tenant: Any) -> bool:
    return bool(setting_field(tenant, ROUND_OFF_SETTING, "value", True))


def default_due_days(tenant: Any) -> int:
    days = setting_field(tenant, DUE_DAYS_SETTING, "days", DEFAULT_DUE_DAYS)
    return days if 0 <= days <= 365 else DEFAULT_DUE_DAYS


def allow_free_text_lines(tenant: Any) -> bool:
    return bool(setting_field(tenant, FREE_TEXT_SETTING, "value", False))


def require_hsn_b2b(tenant: Any) -> bool:
    return bool(setting_field(tenant, REQUIRE_HSN_B2B_SETTING, "value", False))


def default_terms(tenant: Any) -> str:
    return str(setting_field(tenant, TERMS_SETTING, "text", ""))


def show_upi_qr(tenant: Any) -> bool:
    return bool(setting_field(tenant, SHOW_UPI_QR_SETTING, "value", True))
