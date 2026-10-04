"""`/api/v1/library/verifications` — stock verification (LIB-10 §6; task B13)."""

from __future__ import annotations

from typing import Any

from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.common.context import Ctx
from apps.common.idempotency import idempotent
from apps.common.pagination import PagePagination
from apps.common.permissions import HasPermission, ModuleEnabled
from apps.common.responses import StandardResponse
from apps.common.tenancy import get_effective_tenant
from apps.library.models import LibraryVerification
from apps.library.services import verification as vf

RUN = "library.verification.run"
CLOSE = "library.verification.close"
WITHDRAW = "library.copy.withdraw"
EXEMPT = "The library has no row scoping (LIB-14 §1, ADR-052)."


class _View(APIView):
    scope_exempt = EXEMPT
    codenames: tuple[str, ...] = (RUN,)

    def get_permissions(self) -> list:
        return [
            IsAuthenticated(),
            ModuleEnabled("library")(),
            *(HasPermission(codename)() for codename in self.codenames),
        ]


class VerificationListView(_View):
    def get(self, request: Any) -> Any:
        qs = LibraryVerification.objects.filter(tenant=get_effective_tenant(request)).order_by(
            "-started_on", "-id"
        )
        status = request.query_params.get("status")
        if status in ("open", "closed"):
            qs = qs.filter(status=status)
        paginator = PagePagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response([vf.verification_json(v) for v in page])

    @idempotent("library.verification.start")
    def post(self, request: Any) -> Any:
        v, meta = vf.start(ctx=Ctx.from_request(request), data=request.data)
        return StandardResponse.created(vf.verification_json(v), meta=meta)


class VerificationDetailView(_View):
    def get(self, request: Any, verification_id: Any) -> Any:
        v = vf.get(get_effective_tenant(request), verification_id)
        recent = (
            vf.live_scans(v)
            .select_related("copy", "copy__title", "copy__location")
            .order_by("-scanned_at", "-id")[:20]
        )
        body = {
            **vf.verification_json(v),
            "progress": vf.progress(v),
            "recent_scans": [vf.scan_json(row) for row in recent],
        }
        if v.status == "closed":
            body["loss"] = vf.loss_per_thousand(v)
        return StandardResponse.ok(body)


class ScanView(_View):
    @idempotent("library.verification.scan")
    def post(self, request: Any, verification_id: Any) -> Any:
        row, params = vf.scan(
            ctx=Ctx.from_request(request), verification_id=verification_id, data=request.data
        )
        return StandardResponse.created(vf.scan_json(row, params))


class VoidScanView(_View):
    def post(self, request: Any, verification_id: Any, scan_id: Any) -> Any:
        row = vf.void_scan(
            ctx=Ctx.from_request(request), verification_id=verification_id, scan_id=scan_id
        )
        return StandardResponse.ok(vf.scan_json(row))


class CloseView(_View):
    def post(self, request: Any, verification_id: Any) -> Any:
        v = vf.close(
            ctx=Ctx.from_request(request), verification_id=verification_id, data=request.data
        )
        return StandardResponse.ok(vf.verification_json(v), meta={"loss": vf.loss_per_thousand(v)})


class ReopenView(_View):
    codenames = (RUN, CLOSE)

    def post(self, request: Any, verification_id: Any) -> Any:
        v = vf.reopen(
            ctx=Ctx.from_request(request), verification_id=verification_id, data=request.data
        )
        return StandardResponse.ok(vf.verification_json(v))


class ResultsView(_View):
    def get(self, request: Any, verification_id: Any) -> Any:
        rows = vf.results(
            get_effective_tenant(request),
            verification_id,
            request.query_params.get("bucket") or "missing",
        )
        paginator = PagePagination()
        page = paginator.paginate_queryset(rows, request, view=self)
        return paginator.get_paginated_response(page)


class MarkMissingView(_View):
    codenames = (RUN, CLOSE)

    def post(self, request: Any, verification_id: Any) -> Any:
        return StandardResponse.ok(
            vf.mark_missing(
                ctx=Ctx.from_request(request), verification_id=verification_id, data=request.data
            )
        )


class WithdrawMissingView(_View):
    codenames = (RUN, CLOSE, WITHDRAW)

    def post(self, request: Any, verification_id: Any) -> Any:
        return StandardResponse.ok(
            vf.withdraw_missing(
                ctx=Ctx.from_request(request), verification_id=verification_id, data=request.data
            )
        )
