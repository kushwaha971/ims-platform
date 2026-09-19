"""DRF permission classes (Part 20 §20.5.5).

Order of checks on a viewset: authentication → entitlement (`ModuleEnabled`) →
quota (`PlanLimit`) → authorisation (`HasPermission`). A staff member hitting a
module the tenant never bought is told `module_disabled`, not `permission_denied`.
"""

from __future__ import annotations

from typing import Any, Callable

from django.core.exceptions import ImproperlyConfigured
from django.utils.translation import gettext_lazy as _
from rest_framework import exceptions as drf_exc
from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.common.exceptions import ModuleDisabled, PlanLimitReached
from apps.common.permissions_registry import PERMISSIONS, permissions_for
from apps.common.tenancy import get_effective_tenant


def HasPermission(mapping: str | dict[str, str]) -> type[BasePermission]:
    """Declarative per-action permission gate.

    Usage::

        permission_classes = [IsAuthenticated, HasPermission({
            "list": "parties.party.read", "create": "parties.party.write",
        })]

    or, for a single-permission view::

        permission_classes = [IsAuthenticated, HasPermission("reports.financial.read")]

    Fail closed twice over: an action missing from the mapping is DENIED (never
    "allowed by default"), and an unresolvable tenant is DENIED.
    """
    required = {"*": mapping} if isinstance(mapping, str) else dict(mapping)
    unknown = set(required.values()) - PERMISSIONS
    if unknown:  # fails at import time, i.e. at deploy time, not at request time
        raise ImproperlyConfigured(f"Unknown permission codename(s): {sorted(unknown)}")

    class _HasPermission(BasePermission):
        message = _("You do not have permission to do this.")

        def has_permission(self, request: Any, view: Any) -> bool:
            user = getattr(request, "user", None)
            if not (user and user.is_authenticated and user.is_active):
                return False
            tenant = get_effective_tenant(request)
            if tenant is None:
                return False
            claims = getattr(request, "auth_claims", {}) or {}
            if claims.get("imp") and request.method not in SAFE_METHODS:
                self.message = _("Support access is read-only.")
                return False  # §20.4.8 rule 5
            membership = getattr(tenant, "_ub_membership", None)
            if membership is None:
                return False
            claimed_version = claims.get("ver")
            if claimed_version is not None and claimed_version != membership.permissions_version:
                raise drf_exc.AuthenticationFailed("token_stale")
            codename = required.get(getattr(view, "action", None) or "*") or required.get("*")
            if codename is None:
                return False  # unmapped action → denied
            return codename in permissions_for(membership)

        def has_object_permission(self, request: Any, view: Any, obj: Any) -> bool:
            # Object-level rules that are *about ownership*, not about tenancy —
            # tenancy is already guaranteed by the scoped queryset.
            checker = getattr(view, "check_object_permission", None)
            return True if checker is None else bool(checker(request, obj))

    _HasPermission.__name__ = "HasPermission_" + "_".join(sorted(set(required.values())))[:60]
    return _HasPermission


def ModuleEnabled(module: str) -> type[BasePermission]:
    """403 `module_disabled` — tenant ∩ plan ∩ partner (Part 20 §20.5.6 rule 1)."""

    class _ModuleEnabled(BasePermission):
        message = f"The '{module}' module is not enabled for this business."

        def has_permission(self, request: Any, view: Any) -> bool:
            tenant = get_effective_tenant(request)
            if tenant is None:
                return False
            if module not in (tenant.enabled_modules or []):
                raise ModuleDisabled(self.message, details={"module": module})
            if module not in (tenant.plan.modules or []):
                raise ModuleDisabled(self.message, details={"module": module})
            if module not in (tenant.partner.allowed_modules or []):
                raise ModuleDisabled(self.message, details={"module": module})
            return True

    _ModuleEnabled.__name__ = f"ModuleEnabled_{module}"
    return _ModuleEnabled


def PlanLimit(limit_key: str, counter: Callable[[Any], int]) -> type[BasePermission]:
    """403 `plan_limit_reached`.

    Checked at the action that consumes the quota (invoice issue, member invite),
    never on reads. `counter(tenant) -> int` lives in the owning app's selectors.
    """

    class _PlanLimit(BasePermission):
        def has_permission(self, request: Any, view: Any) -> bool:
            if request.method in SAFE_METHODS:
                return True
            tenant = get_effective_tenant(request)
            if tenant is None:
                return False
            cap = (tenant.plan.limits or {}).get(limit_key)
            if cap is None:
                return True
            current = counter(tenant)
            if current >= cap:
                raise PlanLimitReached(
                    f"Your plan allows {cap}. Contact support to upgrade.",
                    details={"limit": limit_key, "current": current, "maximum": cap},
                )
            return True

    _PlanLimit.__name__ = f"PlanLimit_{limit_key}"
    return _PlanLimit


class IsSuperAdmin(BasePermission):
    """Metis Labs operations endpoints only."""

    message = _("You do not have permission to do this.")

    def has_permission(self, request: Any, view: Any) -> bool:
        user = getattr(request, "user", None)
        return bool(user and user.is_authenticated and getattr(user, "is_super_admin", False))
