"""Tenant resolution and the execution-context tenant (Part 20 §20.4.2).

Fail closed, everywhere: a request with no resolvable tenant sees nothing, never
everything (canon §0.11 rule 2).
"""

from __future__ import annotations

import contextvars
from typing import Any

_current_tenant: contextvars.ContextVar = contextvars.ContextVar("ub_current_tenant", default=None)

_UNSET = "unset"


def get_effective_tenant(request: Any) -> Any:
    """Resolve the tenant for this request. Returns None when there is none.

    Resolution order (normative — do not add steps):

    1. `request._ub_tenant` if it has already been resolved (memoised).
    2. Super-admin impersonation: the `imp` claim, valid only when the user has
       `is_super_admin` and the impersonation grant row is live (§20.4.8).
    3. The `tid` claim on the validated access token. The membership is
       re-checked against the database on every request, so a revoked membership
       does not survive until token expiry.
    4. None.

    The `X-Tenant-Id` header is NEVER consulted (canon §22.1). A client that
    wants to change tenant calls POST /auth/switch-tenant and gets a new token.
    """
    # DRF wraps the Django `HttpRequest` in its own `Request`, and that wrapper
    # proxies attribute *reads* but not *writes*. Memoising on the wrapper would
    # therefore resolve the tenant once per wrapper and leave the underlying
    # request untouched — which is what the middleware and the access log read.
    # So the memo always lives on the underlying request.
    base = getattr(request, "_request", request)

    cached = getattr(base, "_ub_tenant", _UNSET)
    if cached != _UNSET:
        return cached

    tenant = None
    user = getattr(request, "user", None)
    claims = getattr(request, "auth_claims", None) or {}

    if user is not None and getattr(user, "is_authenticated", False):
        impersonated = claims.get("imp")
        if impersonated and getattr(user, "is_super_admin", False):
            tenant = _resolve_impersonation(user, impersonated)
        elif claims.get("tid"):
            tenant = _resolve_membership_tenant(user, claims["tid"])

    base._ub_tenant = tenant
    return tenant


def _resolve_membership_tenant(user: Any, tenant_id: Any) -> Any:
    from apps.platform_app.models import Membership, MembershipStatus, TenantStatus

    membership = (
        Membership.objects.select_related("tenant", "role")
        .filter(user=user, tenant_id=tenant_id, status=MembershipStatus.ACTIVE)
        .first()
    )
    if membership is None:
        return None  # revoked / suspended → no tenant → fail closed
    if membership.tenant.status not in (TenantStatus.ACTIVE, TenantStatus.PENDING_DELETION):
        return None
    # Memoise the membership for the permission classes (§20.5.5).
    membership.tenant._ub_membership = membership
    return membership.tenant


def _resolve_impersonation(user: Any, tenant_id: Any) -> Any:
    """Super-admin impersonation (§20.4.8).

    At Sprint 0 there is no impersonation-grant table yet, so this resolves to
    None: an impersonation claim grants nothing until `PLT` builds the grant.
    Failing closed here is deliberate — an unimplemented grant must not become an
    implicit one.
    """
    return None


def current_tenant() -> Any:
    """The tenant for the current execution context, for code with no request.

    Set by the authentication class for HTTP and by the job runner for each job
    (§20.8.6), so the log formatter can stamp `tenant_id` without threading it
    through every call.
    """
    return _current_tenant.get()


class TenantContext:
    """`with TenantContext(tenant): ...` — used by the job runner and commands."""

    def __init__(self, tenant: Any) -> None:
        self.tenant = tenant
        self._token: Any = None

    def __enter__(self) -> Any:
        self._token = _current_tenant.set(self.tenant)
        return self.tenant

    def __exit__(self, *exc: object) -> bool:
        if self._token is not None:
            _current_tenant.reset(self._token)
        return False
