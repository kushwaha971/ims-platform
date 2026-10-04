"""`/api/v1/library/holds` and a title's queue (LIB-08 §6; task B11)."""

from __future__ import annotations

from typing import Any

from rest_framework.permissions import SAFE_METHODS, IsAuthenticated
from rest_framework.views import APIView

from apps.common.context import Ctx
from apps.common.exceptions import ValidationFailed
from apps.common.idempotency import idempotent
from apps.common.pagination import PagePagination
from apps.common.permissions import HasPermission, ModuleEnabled
from apps.common.responses import StandardResponse
from apps.common.tenancy import get_effective_tenant
from apps.library import serializers as out
from apps.library.constants import HoldStatus
from apps.library.models import LibraryHold
from apps.library.services import holds
from apps.library.services.fields import uuid_or_none

READ = "library.loan.read"
WRITE = "library.loan.write"
EXEMPT = "The library has no row scoping (LIB-14 §1, ADR-052)."


class _HoldView(APIView):
    scope_exempt = EXEMPT

    def get_permissions(self) -> list:
        codename = READ if self.request.method in SAFE_METHODS else WRITE
        return [IsAuthenticated(), ModuleEnabled("library")(), HasPermission(codename)()]


def _rows(tenant: Any, params: Any) -> Any:
    errors: dict[str, list[str]] = {}
    qs = LibraryHold.objects.filter(tenant=tenant).select_related(
        "title", "copy", "ready_copy", "membership__party"
    )
    status = params.get("status")
    if status:
        if status not in HoldStatus.values:
            errors["status"] = ["Choose waiting, ready, collected, expired or cancelled."]
        qs = qs.filter(status=status)
    for name, field in (("title", "title_id"), ("membership", "membership_id")):
        if params.get(name):
            pk = uuid_or_none(params.get(name))
            if pk is None:
                errors[name] = ["Not a valid id."]
            qs = qs.filter(**{field: pk})
    ordering = params.get("ordering") or "placed_at"
    if ordering not in ("placed_at", "collect_by"):
        errors["ordering"] = ["Choose placed_at or collect_by."]
    if errors:
        raise ValidationFailed(errors)
    return qs.order_by(ordering, "id")


class HoldListView(_HoldView):
    def get(self, request: Any) -> Any:
        qs = _rows(get_effective_tenant(request), request.query_params)
        paginator = PagePagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response([holds.hold_json(h) for h in page])

    @idempotent("library.hold.place")
    def post(self, request: Any) -> Any:
        result = holds.place(ctx=Ctx.from_request(request), data=request.data)
        hold = result["hold"]
        return StandardResponse.created(
            holds.hold_json(hold),
            meta={
                "position": holds.position(hold),
                "available_copies": [out.copy_row(c) for c in result["available_copies"]],
            },
        )


def _act(service: Any) -> type:
    class _Act(_HoldView):
        def post(self, request: Any, hold_id: Any) -> Any:
            result = service(ctx=Ctx.from_request(request), hold_id=hold_id, data=request.data)
            meta = {}
            if "next_ready" in result:
                nxt = result["next_ready"]
                meta["next_ready"] = holds.hold_json(nxt) if nxt is not None else None
            return StandardResponse.ok(holds.hold_json(result["hold"]), meta=meta)

    _Act.__name__ = f"Hold{service.__name__.title().replace('_', '')}View"
    return _Act


HoldSetAsideView = _act(holds.set_aside)
HoldCancelView = _act(holds.cancel)
HoldExtendView = _act(holds.extend)
HoldMoveView = _act(holds.move)


class TitleHoldsView(_HoldView):
    def get(self, request: Any, title_id: Any) -> Any:
        qs = (
            LibraryHold.objects.filter(
                tenant=get_effective_tenant(request),
                title_id=title_id,
                status__in=[HoldStatus.WAITING, HoldStatus.READY],
            )
            .select_related("title", "copy", "ready_copy", "membership__party")
            .order_by("placed_at", "id")
        )
        return StandardResponse.ok([holds.hold_json(h) for h in qs])
