"""`/api/v1/library/overdue`, a hold's Remind and the issue slip (LIB-09 §6; task B12)."""

from __future__ import annotations

from typing import Any

from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.common.context import Ctx
from apps.common.pagination import PagePagination
from apps.common.permissions import HasPermission, ModuleEnabled
from apps.common.responses import StandardResponse
from apps.common.tenancy import get_effective_tenant
from apps.library.services import reminders

READ = "library.loan.read"
REMIND = "ledger.reminder.write"
EXEMPT = "The library has no row scoping (LIB-14 §1, ADR-052)."


class _View(APIView):
    scope_exempt = EXEMPT
    codenames: tuple[str, ...] = (READ,)

    def get_permissions(self) -> list:
        return [
            IsAuthenticated(),
            ModuleEnabled("library")(),
            *(HasPermission(codename)() for codename in self.codenames),
        ]


class OverdueListView(_View):
    def get(self, request: Any) -> Any:
        rows, totals = reminders.overdue_list(get_effective_tenant(request), request.query_params)
        paginator = PagePagination()
        page = paginator.paginate_queryset(rows, request, view=self)
        return StandardResponse.ok(page, meta={**paginator.get_meta(), "totals": totals})


class OverduePreviewView(_View):
    def post(self, request: Any, membership_id: Any) -> Any:
        return StandardResponse.ok(
            reminders.preview_overdue(
                ctx=Ctx.from_request(request), membership_id=membership_id, data=request.data
            )
        )


class OverdueRemindView(_View):
    codenames = (READ, REMIND)

    def post(self, request: Any, membership_id: Any) -> Any:
        return StandardResponse.created(
            reminders.remind_overdue(
                ctx=Ctx.from_request(request), membership_id=membership_id, data=request.data
            )
        )


class OverdueBulkPrepareView(_View):
    codenames = (READ, REMIND)

    def post(self, request: Any) -> Any:
        return StandardResponse.ok(
            reminders.bulk_prepare(ctx=Ctx.from_request(request), data=request.data)
        )


class HoldRemindView(_View):
    codenames = (READ, REMIND)

    def post(self, request: Any, hold_id: Any) -> Any:
        return StandardResponse.created(
            reminders.remind_hold(ctx=Ctx.from_request(request), hold_id=hold_id, data=request.data)
        )


class MemberSlipView(_View):
    def post(self, request: Any, membership_id: Any) -> Any:
        return StandardResponse.ok(
            reminders.issue_slip(
                ctx=Ctx.from_request(request), membership_id=membership_id, data=request.data
            )
        )
