"""`/api/v1/library/…` (LIB-01 §6 so far; task B03).

Check order on every endpoint (LIB-14 BR-1): authenticated → the module is on
and released (`ModuleEnabled("library")`, 403 `module_disabled`) → the
codename → role checks inside the service.

Weekly closed days are written through the core `PUT /calendar/weekdays`
(W-P3, G8), which already lets `library.settings.manage` write the library's
override; this module has no second write path for them.
"""

from __future__ import annotations

from typing import Any

from rest_framework.permissions import SAFE_METHODS, IsAuthenticated
from rest_framework.views import APIView

from apps.common.context import Ctx
from apps.common.permissions import HasPermission, ModuleEnabled
from apps.common.responses import StandardResponse
from apps.common.tenancy import get_effective_tenant
from apps.library.permissions import SETTINGS_READERS, HasAnyPermission
from apps.library.services import settings as settings_service

MANAGE = "library.settings.manage"
_GATE = [IsAuthenticated, ModuleEnabled("library")]


def _settings_response(tenant: Any, row: Any) -> Any:
    return StandardResponse.ok(
        settings_service.settings_json(row),
        meta={
            "numbering": settings_service.numbering_meta(tenant),
            "closed_weekdays": settings_service.closed_weekdays_for(tenant),
        },
    )


class LibrarySettingsView(APIView):
    """`GET` (settings.manage or any library read) and `PUT` (settings.manage)."""

    scope_exempt = "One row per tenant; the library has no row scoping (LIB-14 §1, ADR-052)."

    def get_permissions(self) -> list:
        # Every safe method reads, so HEAD and OPTIONS admit the same readers as
        # GET (B03 QA-B03-2).
        if self.request.method in SAFE_METHODS:
            classes = [*_GATE, HasAnyPermission(*SETTINGS_READERS)]
        else:
            classes = [*_GATE, HasPermission(MANAGE)]
        return [cls() for cls in classes]

    def get(self, request: Any) -> Any:
        tenant = get_effective_tenant(request)
        return _settings_response(tenant, settings_service.settings_for(tenant))

    def put(self, request: Any) -> Any:
        ctx = Ctx.from_request(request)
        row = settings_service.update_settings(ctx=ctx, data=request.data)
        return _settings_response(ctx.tenant, row)


class LibraryNumberingView(APIView):
    """`POST /library/settings/numbering {kind, next_number}` (FR-3)."""

    scope_exempt = "A tenant-wide counter; the library has no row scoping (LIB-14 §1, ADR-052)."

    permission_classes = [*_GATE, HasPermission(MANAGE)]

    def post(self, request: Any) -> Any:
        body = request.data if isinstance(request.data, dict) else {}
        kind = body.get("kind")
        next_number = body.get("next_number")
        settings_service.raise_number(
            ctx=Ctx.from_request(request), kind=kind, next_number=next_number
        )
        return StandardResponse.ok({"kind": kind, "next_number": next_number})
