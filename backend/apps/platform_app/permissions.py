"""Permission classes and maps for the platform app (canon §0.9).

`platform.*` codenames are never module-gated (`permissions_for` in
`apps.common.permissions_registry` makes the exception explicit): they are how a
tenant switches modules on, so gating them on a module would be a lock whose key
is inside the box.
"""

from __future__ import annotations

from typing import Any

from django.utils.translation import gettext_lazy as _
from rest_framework import exceptions as drf_exc
from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.common.exceptions import NoActiveTenant
from apps.common.permissions import HasPermission
from apps.common.permissions_registry import permissions_for
from apps.common.tenancy import get_effective_tenant

TENANT_MANAGE = "platform.tenant.manage"

# Canon §0.9 excludes `platform.tenant.manage` from `admin` and annotates the
# exclusion **"(partial)"**, explaining it as "everything except tenant
# deletion, ownership transfer, billing". A codename set cannot express
# "partial", so the split has to live at the endpoint — and both places that
# name this endpoint say admin may use it: Part 22 §22.3 ("`PATCH
# /tenants/current` (owner/admin)") and PLT-03 §12's matrix ("Complete/edit
# wizard for current tenant — owner ✅ admin ✅ staff ❌ accountant ❌").
#
# So the *profile* half of `platform.tenant.manage` is open to admin here, and
# the three things canon actually withholds — `POST
# /tenants/current/delete-request` (PLT-10), ownership transfer (PLT-05) and
# billing (PLT-16) — require the codename itself when they land. `CR-LOG`
# carries the request that canon §0.9 either split the codename in two or state
# the exception, because "(partial)" is not something a registry can hold.
PROFILE_EDIT_ROLES: tuple[str, ...] = ("owner", "admin")


class TenantManagePermission(BasePermission):
    """`GET /tenants/current` for any member; `PATCH` for `platform.tenant.manage`.

    Part 22 §22.3 restricts only the PATCH ("owner/admin"); the profile itself is
    what the app shell renders the business name from, so a staff member who
    cannot read it cannot see which business they are in. PLT-03 §12's matrix
    says the same in the other direction: "Complete/edit wizard for current
    tenant — owner ✅ admin ✅ staff ❌ accountant ❌".

    Fail closed on both paths: no tenant, no membership, or a stale `ver` claim
    is a refusal, never a default-allow.

    "No tenant at all" is refused too, but it is refused with its OWN code.
    This class ran before the view and answered a flat `permission_denied` to a
    caller whose token simply carries no `tid`, so a client could not tell
    "choose a business first" from "you are not allowed in this one" — and the
    view's `NoActiveTenant` (Part 22 §22.1.1 `no_active_tenant`, "Choose a
    business first.") was unreachable behind it. Raising it here keeps the
    refusal — same 403, same absence of any view execution — and only makes the
    reason legible.
    """

    message = _("You do not have permission to do this.")

    def has_permission(self, request: Any, view: Any) -> bool:
        user = getattr(request, "user", None)
        if not (user and user.is_authenticated and user.is_active):
            return False
        tenant = get_effective_tenant(request)
        if tenant is None:
            raise NoActiveTenant()
        membership = getattr(tenant, "_ub_membership", None)
        if membership is None:
            return False

        claims = getattr(request, "auth_claims", {}) or {}
        if claims.get("imp") and request.method not in SAFE_METHODS:
            self.message = _("Support access is read-only.")
            return False  # Part 20 §20.4.8 rule 5

        if request.method in SAFE_METHODS:
            return True
        if TENANT_MANAGE in permissions_for(membership):
            return True
        return membership.role.code in PROFILE_EDIT_ROLES


# PLT-05's membership management. Declared here so that the endpoints which land
# with that feature cannot invent a different codename.
MembersManagePermission = HasPermission(
    {
        "list": "platform.members.manage",
        "retrieve": "platform.members.manage",
        "create": "platform.members.manage",
        "partial_update": "platform.members.manage",
        "destroy": "platform.members.manage",
        "*": "platform.members.manage",
    }
)

AuditReadPermission = HasPermission({"list": "platform.audit.read", "*": "platform.audit.read"})


# ── Settings surfaces ─────────────────────────────────────────────────────────
# Permission classes for the settings surfaces (PLT-06, PLT-07, WLB-01).
#
# Canon §0.9 has no `platform.settings.read`, and the FRD matrices draw the
# line in a place no single codename does:
#
# | | owner | admin | staff | accountant |
# |---|---|---|---|---|
# | View settings / profile (PLT-06, PLT-07 §12) | ✅ | ✅ | ❌ | ✅ |
# | Edit settings / profile | ✅ | ✅ | ❌ | ❌ |
# | Edit branding (WLB-01 §12) | ✅ | ✅ | ❌ | ❌ |
#
# EDIT follows the precedent `TenantManagePermission` already set for the
# profile: `platform.tenant.manage`, or the owner/admin role for the "(partial)"
# half canon gives admin. VIEW is edit rights OR `platform.audit.read` — the
# one platform codename canon gives the accountant and withholds from staff,
# and the same reason the FRD gives for letting the accountant in ("needs to know
# numbering/GST defaults for reconciliation") is why they read the audit log.
# `CR-LOG` (CR-2026-09-24-T1-A) asks canon to name the read right.
AUDIT_READ = "platform.audit.read"
BRANDING_MANAGE = "platform.branding.manage"


def _membership(request: Any) -> Any:
    user = getattr(request, "user", None)
    if not (user and user.is_authenticated and user.is_active):
        return None
    tenant = get_effective_tenant(request)
    if tenant is None:
        raise NoActiveTenant()
    membership = getattr(tenant, "_ub_membership", None)
    if membership is None:
        return None
    claims = getattr(request, "auth_claims", {}) or {}
    claimed = claims.get("ver")
    if claimed is not None and claimed != membership.permissions_version:
        raise drf_exc.AuthenticationFailed("token_stale")
    return membership


def may_edit_settings(membership: Any) -> bool:
    return TENANT_MANAGE in permissions_for(membership) or (
        membership.status == "active" and membership.role.code in PROFILE_EDIT_ROLES
    )


def may_view_settings(membership: Any) -> bool:
    return may_edit_settings(membership) or AUDIT_READ in permissions_for(membership)


def _read_only_impersonation(request: Any) -> bool:
    claims = getattr(request, "auth_claims", {}) or {}
    return bool(claims.get("imp")) and request.method not in SAFE_METHODS


class SettingsPermission(BasePermission):
    """PLT-06 §12: GET owner/admin/accountant; writes owner/admin."""

    message = _("You do not have permission to do this.")

    def has_permission(self, request: Any, view: Any) -> bool:
        membership = _membership(request)
        if membership is None or _read_only_impersonation(request):
            return False
        if request.method in SAFE_METHODS:
            return may_view_settings(membership)
        return may_edit_settings(membership)


class BrandingPermission(BasePermission):
    """WLB-01 §12: everyone sees branding; `platform.branding.manage` edits it."""

    message = _("You do not have permission to do this.")

    def has_permission(self, request: Any, view: Any) -> bool:
        membership = _membership(request)
        if membership is None or _read_only_impersonation(request):
            return False
        if request.method in SAFE_METHODS:
            return True
        return BRANDING_MANAGE in permissions_for(membership)
