"""`GET /api/v1/library/home` — the library's day and its quick actions (LIB-11 §6; B14)."""

from __future__ import annotations

from typing import Any

from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.common.dates import tenant_today
from apps.common.permissions import HasPermission, ModuleEnabled
from apps.common.responses import StandardResponse
from apps.common.tenancy import get_effective_tenant
from apps.library.selectors.home import library_home


class LibraryHomeView(APIView):
    scope_exempt = "The library has no row scoping (LIB-14 §1, ADR-052)."

    def get_permissions(self) -> list:
        return [IsAuthenticated(), ModuleEnabled("library")(), HasPermission("library.loan.read")()]

    def get(self, request: Any) -> Any:
        from apps.common.permissions_registry import permissions_for

        tenant = get_effective_tenant(request)
        membership = getattr(tenant, "_ub_membership", None)
        granted = permissions_for(membership) if membership is not None else frozenset()
        return StandardResponse.ok(library_home(tenant, tenant_today(tenant), granted))
