"""Permission classes for the notifications app (canon §0.9, Part 20 §20.5.5)."""

from __future__ import annotations

from typing import Any

from rest_framework.permissions import BasePermission

from apps.common.permissions_registry import permissions_for
from apps.common.tenancy import get_effective_tenant


class IsTenantMember(BasePermission):
    """NTF-01 §12 — the bell and one's own inbox need only an active membership.

    There is no codename for "may have an inbox": every member has one. What a
    member SEES in it is filtered by permission per row type (BR-1), in the
    selector, which is where the real boundary is.
    """

    def has_permission(self, request: Any, view: Any) -> bool:
        user = getattr(request, "user", None)
        if not (user and user.is_authenticated and user.is_active):
            return False
        tenant = get_effective_tenant(request)
        return tenant is not None and getattr(tenant, "_ub_membership", None) is not None


def member_permissions(request: Any) -> frozenset[str]:
    tenant = get_effective_tenant(request)
    membership = getattr(tenant, "_ub_membership", None)
    return permissions_for(membership) if membership is not None else frozenset()
