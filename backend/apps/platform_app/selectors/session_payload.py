"""The `/auth/me` body (Part 22 §22.2, PLT-01 FR-5, PLT-15 FR-5).

One shape is returned by five endpoints — OTP verify, password login, refresh,
switch-tenant and `/auth/me` — because PLT-01 FR-5 and PLT-04 FR-2 both say "the
same body as `/auth/me`", and a second spelling of it is a second thing to keep
in step. Read-only (rule D8).
"""

from __future__ import annotations

from typing import Any

from apps.common.permissions_registry import permissions_for
from apps.platform_app.selectors.memberships import live_sessions_of, memberships_of


def user_block(user: Any, *, is_new: bool = False) -> dict:
    """PLT-01 FR-5. `has_password` exists so the client knows to offer "set one".

    The password hash itself never leaves the row, and neither does its
    algorithm or its length: `has_password` is a boolean and nothing more
    (PLT-02 BR-3).

    `email` is the identifier since DEC-010 and is always present; `mobile` is
    a profile field and may be `null`. `email_verified` and
    `email_verification_required` are the whole client-visible surface of the
    verification plumbing — the client may nag, but nothing here gates a login.
    """
    from django.conf import settings

    return {
        "id": str(user.id),
        "email": user.email,
        "mobile": user.mobile,
        "full_name": user.full_name,
        "locale": user.locale,
        "is_new": bool(is_new),
        "is_super_admin": bool(user.is_super_admin),
        "has_password": user.has_usable_password(),
        "email_verified": user.email_verified_at is not None,
        "email_verification_required": bool(settings.UB_EMAIL_VERIFICATION_ENABLED),
        "last_login_at": user.last_login_at,
    }


def tenant_rows(user: Any) -> list[dict]:
    """`tenants[]` — the switcher's whole data source (PLT-04 FR-1).

    §20 caps this payload at 8 kB for 50 memberships, which is why it carries
    names and nothing else; branding belongs to the active tenant alone.
    """
    return [
        {
            "id": str(m.tenant_id),
            "name": m.tenant.name,
            "role": m.role.code,
            "is_default": m.is_default,
            "status": m.status,
            "tenant_status": m.tenant.status,
            "onboarding_step": m.tenant.onboarding_step,
        }
        for m in memberships_of(user=user)
    ]


def active_tenant_block(tenant: Any) -> dict:
    """Part 22 §22.2: "active tenant summary (`enabled_modules`, `gst_type`, `branding`)"."""
    from apps.platform_app.services.entitlements import effective_modules

    return {
        "id": str(tenant.id),
        "name": tenant.name,
        "legal_name": tenant.legal_name,
        "business_type": tenant.business_type,
        "gst_type": tenant.gst_type,
        "gstin": tenant.gstin,
        "state_code": tenant.state_code,
        "currency": tenant.currency,
        "timezone": tenant.timezone,
        "locale": tenant.locale,
        "fy_start_month": tenant.fy_start_month,
        "status": tenant.status,
        "onboarding_step": tenant.onboarding_step,
        "enabled_modules": sorted(effective_modules(tenant)),
        "branding": tenant.branding or {},
    }


def session_rows(user: Any) -> list[dict]:
    """Part 27 §27.4.3: the device list a merchant can act on."""
    return [
        {
            "id": str(s.id),
            "device_label": s.device_label,
            "user_agent": s.user_agent,
            "ip": s.ip,
            "created_at": s.created_at,
            "expires_at": s.expires_at,
        }
        for s in live_sessions_of(user=user)[:25]
    ]


def build(
    *,
    user: Any,
    membership: Any = None,
    is_new: bool = False,
    access_token: str | None = None,
    refresh_token: str | None = None,
) -> dict:
    """The whole envelope payload. `membership=None` → no active tenant."""
    from django.conf import settings

    from apps.platform_app.services.entitlements import plan_limits_payload

    payload: dict[str, Any] = {
        "user": user_block(user, is_new=is_new),
        "tenants": tenant_rows(user),
        "active_tenant_id": str(membership.tenant_id) if membership is not None else None,
        "active_tenant": active_tenant_block(membership.tenant) if membership else None,
        "permissions": sorted(permissions_for(membership)) if membership is not None else [],
        "plan_limits": plan_limits_payload(membership.tenant) if membership else None,
        "feature_flags": dict(settings.UB_FEATURE_FLAGS or {}),
        "sessions": session_rows(user),
    }
    if access_token is not None:
        payload["access_token"] = access_token
    if refresh_token is not None:
        payload["refresh_token"] = refresh_token
    return payload
