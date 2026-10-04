"""Card, overdue notice and no-dues payloads for the print sheets (LIB-13 §6; task B16)."""

from __future__ import annotations

from typing import Any

from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.common.context import Ctx
from apps.common.permissions import HasPermission, ModuleEnabled
from apps.common.responses import StandardResponse
from apps.common.tenancy import get_effective_tenant
from apps.library.services import documents as docs


class _View(APIView):
    scope_exempt = "The library has no row scoping (LIB-14 §1, ADR-052)."
    codename = "library.member.read"

    def get_permissions(self) -> list:
        return [IsAuthenticated(), ModuleEnabled("library")(), HasPermission(self.codename)()]


class MemberCardView(_View):
    def get(self, request: Any, membership_id: Any) -> Any:
        return StandardResponse.ok(docs.card(get_effective_tenant(request), membership_id))


class CardsView(_View):
    def get(self, request: Any) -> Any:
        return StandardResponse.ok(docs.cards(get_effective_tenant(request), request.query_params))


class CardPrintedView(_View):
    codename = "library.member.write"

    def post(self, request: Any, membership_id: Any) -> Any:
        return StandardResponse.ok(
            docs.card_printed(ctx=Ctx.from_request(request), membership_id=membership_id)
        )


class OverdueNoticeView(_View):
    codename = "library.loan.read"

    def get(self, request: Any, membership_id: Any) -> Any:
        return StandardResponse.ok(
            docs.overdue_notice(get_effective_tenant(request), membership_id)
        )


class NoDuesView(_View):
    def get(self, request: Any, membership_id: Any) -> Any:
        issue = (request.query_params.get("issue") or "") in ("1", "true")
        return StandardResponse.ok(
            docs.no_dues_certificate(
                ctx=Ctx.from_request(request), membership_id=membership_id, issue=issue
            )
        )


class NoDuesGroupView(_View):
    def get(self, request: Any) -> Any:
        return StandardResponse.ok(
            docs.no_dues_group(get_effective_tenant(request), request.query_params.get("group"))
        )
