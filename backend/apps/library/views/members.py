"""`/api/v1/library/membership-types` and `/library/loan-rules` (LIB-04 §6, LIB-05 §6; task B06).

Read by any library `.read` codename or `library.settings.manage` (the counter
needs the rules; G9's `HasAnyPermission`); written with `library.settings.manage`.
There is no DELETE on a type: it is deactivated, never deleted (405).
"""

from __future__ import annotations

from typing import Any

from rest_framework.permissions import SAFE_METHODS, IsAuthenticated
from rest_framework.views import APIView

from apps.common.context import Ctx
from apps.common.permissions import HasPermission, ModuleEnabled
from apps.common.responses import StandardResponse
from apps.common.tenancy import get_effective_tenant
from apps.library.models import LibraryMembershipType
from apps.library.permissions import SETTINGS_READERS, HasAnyPermission
from apps.library.services import loan_rules, membership_types

MANAGE = "library.settings.manage"
EXEMPT = "The library has no row scoping (LIB-14 §1, ADR-052)."


class _ConfigView(APIView):
    scope_exempt = EXEMPT

    def get_permissions(self) -> list:
        gate = [IsAuthenticated, ModuleEnabled("library")]
        if self.request.method in SAFE_METHODS:
            return [cls() for cls in (*gate, HasAnyPermission(*SETTINGS_READERS))]
        return [cls() for cls in (*gate, HasPermission(MANAGE))]


class MembershipTypeListView(_ConfigView):
    def get(self, request: Any) -> Any:
        rows = LibraryMembershipType.objects.filter(tenant=get_effective_tenant(request)).order_by(
            "sort_order", "name", "id"
        )
        return StandardResponse.ok([membership_types.type_json(r) for r in rows])

    def post(self, request: Any) -> Any:
        row = membership_types.create_type(ctx=Ctx.from_request(request), data=request.data)
        return StandardResponse.created(membership_types.type_json(row))


class MembershipTypeDetailView(_ConfigView):
    def patch(self, request: Any, type_id: Any) -> Any:
        row = membership_types.update_type(
            ctx=Ctx.from_request(request), type_id=type_id, data=request.data
        )
        return StandardResponse.ok(membership_types.type_json(row))


class LoanRuleView(_ConfigView):
    def _response(self, tenant: Any) -> Any:
        return StandardResponse.ok(
            [loan_rules.rule_json(r) for r in loan_rules.rules_for(tenant)],
            meta={"effective": loan_rules.effective_matrix(tenant)},
        )

    def get(self, request: Any) -> Any:
        return self._response(get_effective_tenant(request))

    def put(self, request: Any) -> Any:
        ctx = Ctx.from_request(request)
        loan_rules.replace_rules(ctx=ctx, data=request.data)
        return self._response(ctx.tenant)
