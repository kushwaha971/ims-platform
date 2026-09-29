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

from apps.common.authentication import support_write_allowed
from apps.common.exceptions import ModuleDisabled, PlanLimitReached
from apps.common.permissions_registry import PERMISSIONS, permissions_for
from apps.common.tenancy import get_effective_tenant


def _method_has_no_handler(request: Any, view: Any) -> bool:
    """True when the viewset implements no handler for this method on this route.

    DRF checks permissions in `initial()`, which runs *before* dispatch resolves
    a handler. So `POST /parties`, on a read-only viewset whose router maps only
    `get`, reached `HasPermission`, found no `create` entry in the map, and was
    denied — answering `403 permission_denied` for a method the endpoint does not
    implement at all. The caller reads that as "ask your owner for rights", and
    no amount of asking will ever make it work.

    The fail-closed rule is untouched by this. An action the viewset *does*
    implement and that is missing from the permission map is still denied — that
    is the case the rule exists for, a handler shipped without its permission
    entry. This only steps aside where there is no handler to guard: returning
    True here grants nothing, because dispatch then calls `http_method_not_allowed`
    and answers 405 before any handler runs.

    `action_map` is set by the router per matched route, so it is authoritative
    about *this* route rather than the viewset as a whole — `POST /parties/{id}`
    and `POST /parties` are judged separately. A plain `APIView` has no
    `action_map`; there the question does not arise and behaviour is unchanged.
    """
    action_map = getattr(view, "action_map", None)
    if not action_map:
        return False
    return request.method.lower() not in action_map


def _authenticated_membership(request: Any) -> Any:
    """The signed-in member's active membership of the resolved tenant, or None.

    Raises `token_stale` when the token's `ver` claim is behind the
    membership's `permissions_version`, so a demoted member's old token stops
    working at once. Shared by `HasPermission` and `HasEngineReadPermission`
    so the two can never disagree about who is asking.
    """
    user = getattr(request, "user", None)
    if not (user and user.is_authenticated and user.is_active):
        return None
    tenant = get_effective_tenant(request)
    if tenant is None:
        return None
    membership = getattr(tenant, "_ub_membership", None)
    if membership is None:
        return None
    claims = getattr(request, "auth_claims", {}) or {}
    claimed_version = claims.get("ver")
    if claimed_version is not None and claimed_version != membership.permissions_version:
        raise drf_exc.AuthenticationFailed("token_stale")
    return membership


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
            if _method_has_no_handler(request, view):
                return True  # let dispatch answer 405, not a misleading 403
            user = getattr(request, "user", None)
            if not (user and user.is_authenticated and user.is_active):
                return False
            tenant = get_effective_tenant(request)
            if tenant is None:
                return False
            claims = getattr(request, "auth_claims", {}) or {}
            if (
                claims.get("imp")
                and request.method not in SAFE_METHODS
                and not support_write_allowed(request)
            ):
                self.message = _("Support access is read-only.")
                return False  # §20.4.8 rule 5
            membership = _authenticated_membership(request)
            if membership is None:
                return False
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
    """403 `module_disabled` — tenant ∩ plan ∩ partner (Part 20 §20.5.6 rule 1).

    The set is computed by `platform.services.entitlements.effective_modules`,
    which is `PLT-15` FR-2's formula plus `BR-6`'s second half: the plan and the
    partner say what the tenant *may* have, `enabled_modules` says what the
    owner has switched on, and both must be true. Sprint 1 moved the arithmetic
    there so that one function answers the question for the permission class,
    for `GET /auth/me`'s `plan_limits.modules`, and for the nightly
    `reconcile_entitlements` — three readers that used to be able to disagree.

    Rule D1 forbids `common` importing another app at module level, so the
    entitlement service is resolved inside the call, exactly as `audit.py`
    resolves `AuditLog`.
    """

    class _ModuleEnabled(BasePermission):
        message = f"The '{module}' module is not enabled for this business."

        def has_permission(self, request: Any, view: Any) -> bool:
            if _method_has_no_handler(request, view):
                return True  # 405 is the truthful answer; see _method_has_no_handler
            from apps.platform_app.services.entitlements import effective_modules, hidden_modules

            tenant = get_effective_tenant(request)
            if tenant is None:
                return False
            # A1 (PLT-X11 BR-2): an unreleased module is refused before the
            # tenant's data is consulted, so the gate does not depend on how
            # `effective_modules` evolves.
            if module in hidden_modules() or module not in effective_modules(tenant):
                raise ModuleDisabled(self.message, details={"module": module})
            return True

    _ModuleEnabled.__name__ = f"ModuleEnabled_{module}"
    return _ModuleEnabled


def EngineEnabled(engine: str) -> type[BasePermission]:
    """A12 (ADR-041, contracts §1.1) — 403 `module_disabled` for an engine.

    An engine has no module code and no switch: it is on while any effective
    module lists it in `ENGINES_USED_BY` (`entitlements.engine_enabled`). The
    refusal names the ENGINE in `details.module`, so a client is told which
    thing is off. Sits where `ModuleEnabled` sits in the check order.
    """

    class _EngineEnabled(BasePermission):
        message = f"The '{engine}' records are not in use for this business."

        def has_permission(self, request: Any, view: Any) -> bool:
            if _method_has_no_handler(request, view):
                return True
            from apps.platform_app.services.entitlements import engine_enabled

            tenant = get_effective_tenant(request)
            if tenant is None:
                return False
            if not engine_enabled(tenant, engine):
                raise ModuleDisabled(self.message, details={"module": engine})
            return True

    _EngineEnabled.__name__ = f"EngineEnabled_{engine}"
    return _EngineEnabled


def readable_engine_modules(request: Any, engine: str) -> frozenset[str]:
    """A12 (R25) — the consuming modules whose engine rows this member may read.

    `enabled_modules_using(tenant, engine)` narrowed to the modules whose
    `ENGINE_READ_PERMISSIONS[engine][module]` codename the member holds. An
    engine read viewset filters `module__in=` this set; it is stricter than
    "enabled" alone, so a member granted library's reader never sees gym's
    marks through the shared endpoint. Empty when nothing resolves (fail closed).
    """
    from apps.common.permissions_registry import ENGINE_READ_PERMISSIONS
    from apps.platform_app.services.entitlements import enabled_modules_using

    tenant = get_effective_tenant(request)
    membership = getattr(tenant, "_ub_membership", None) if tenant is not None else None
    if membership is None:
        return frozenset()
    codenames = ENGINE_READ_PERMISSIONS.get(engine, {})
    # `permissions_for`, so module gating, the release gate and inactive
    # memberships apply exactly as for every other check — and a codename a
    # module has not registered yet cannot be held (fail closed).
    held = permissions_for(membership)
    return frozenset(
        module
        for module in enabled_modules_using(tenant, engine)
        if codenames.get(module) and codenames[module] in held
    )


def HasEngineReadPermission(engine: str) -> type[BasePermission]:
    """A12 (10-architecture §5, R25) — engine reads pass on ANY consumer's codename.

    Engine read endpoints are GET only (writes go through the vertical). The
    member passes when they hold the read codename a consuming, effective
    module named in `ENGINE_READ_PERMISSIONS`; `readable_engine_modules` then
    narrows the rows. Those codenames are ones no scoped module role holds
    (ADR-058), because an engine read applies no vertical scope.
    """

    class _HasEngineReadPermission(BasePermission):
        message = _("You do not have permission to do this.")

        def has_permission(self, request: Any, view: Any) -> bool:
            if _method_has_no_handler(request, view):
                return True
            if request.method not in SAFE_METHODS:
                return False  # engines have no write endpoints (ADR-041)
            if _authenticated_membership(request) is None:
                return False
            return bool(readable_engine_modules(request, engine))

    _HasEngineReadPermission.__name__ = f"HasEngineReadPermission_{engine}"
    return _HasEngineReadPermission


def PlanLimit(limit_key: str, counter: Callable[[Any], int]) -> type[BasePermission]:
    """403 `plan_limit_reached`.

    Checked at the action that consumes the quota (invoice issue, member invite),
    never on reads. `counter(tenant) -> int` lives in the owning app's selectors.

    **`DEC-001` narrowed what this may be used for.** At MVP `PLT-15` enforces
    module entitlement and member count and nothing else: the ledger is never
    capped, and `max_parties` and `max_invoices_per_month` are removed from
    enforcement on every plan. `platform.services.entitlements.LIMIT_KEYS` is the
    list; a `limit_key` outside it is refused here rather than silently reading a
    `plan.limits` entry that DEC-001 says must not be read.

    A seat check also needs the tenant row locked for the duration of the write
    (`PLT-15` BR-7), which a permission class runs too early to do; that is why
    `max_users` is enforced by `entitlements.assert_can_add_member` inside the
    service transaction and not by this class.
    """

    class _PlanLimit(BasePermission):
        def has_permission(self, request: Any, view: Any) -> bool:
            if request.method in SAFE_METHODS:
                return True
            tenant = get_effective_tenant(request)
            if tenant is None:
                return False
            from apps.platform_app.services.entitlements import LIMIT_KEYS, for_tenant

            if limit_key not in LIMIT_KEYS:
                raise ImproperlyConfigured(
                    f"{limit_key!r} is not enforced at MVP (DEC-001). "
                    f"Enforceable keys: {sorted(LIMIT_KEYS)}"
                )
            cap = for_tenant(tenant).limit(limit_key)
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
