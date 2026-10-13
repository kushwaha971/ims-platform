"""`/api/v1/library/shifts`, `/seats`, `/seats/row` and `/seat-map` (W02).

Read by any library `.read` codename (admission needs the lists); written with
`library.settings.manage`, like the membership types beside them. No DELETE: a
shift or seat is taken out of use (`is_active: false`), never deleted, because
memberships and their history point at it.
"""

from __future__ import annotations

from typing import Any

from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.common.exceptions import ValidationFailed
from apps.common.permissions import HasPermission, ModuleEnabled
from apps.common.responses import StandardResponse
from apps.common.tenancy import get_effective_tenant
from apps.library.models import LibrarySeat, LibraryShift
from apps.library.services import seats
from apps.library.services.fields import uuid_or_none
from apps.library.views.members import _ConfigView

EXEMPT = "The library has no row scoping (LIB-14 §1, ADR-052)."


class ShiftListView(_ConfigView):
    def get(self, request: Any) -> Any:
        rows = LibraryShift.objects.filter(tenant=get_effective_tenant(request))
        return StandardResponse.ok([seats.shift_json(r) for r in seats.in_day_order(rows)])

    def post(self, request: Any) -> Any:
        row = seats.create_shift(ctx=Ctx.from_request(request), data=request.data)
        return StandardResponse.created(seats.shift_json(row))


class ShiftDetailView(_ConfigView):
    def patch(self, request: Any, shift_id: Any) -> Any:
        row = seats.update_shift(
            ctx=Ctx.from_request(request), shift_id=shift_id, data=request.data
        )
        return StandardResponse.ok(seats.shift_json(row))


class SeatListView(_ConfigView):
    def get(self, request: Any) -> Any:
        rows = LibrarySeat.objects.filter(tenant=get_effective_tenant(request)).order_by(
            "label_sort", "id"
        )
        return StandardResponse.ok([seats.seat_json(r) for r in rows])

    def post(self, request: Any) -> Any:
        row = seats.create_seat(ctx=Ctx.from_request(request), data=request.data)
        return StandardResponse.created(seats.seat_json(row))


class SeatRowView(_ConfigView):
    """`POST /library/seats/row {prefix, from, to, zone}` — A1…A24 in one request."""

    def post(self, request: Any) -> Any:
        rows = seats.create_seat_row(ctx=Ctx.from_request(request), data=request.data)
        return StandardResponse.created(
            [seats.seat_json(r) for r in rows], meta={"created": len(rows)}
        )


class SeatDetailView(_ConfigView):
    def patch(self, request: Any, seat_id: Any) -> Any:
        row = seats.update_seat(ctx=Ctx.from_request(request), seat_id=seat_id, data=request.data)
        return StandardResponse.ok(seats.seat_json(row))


class SeatMapView(APIView):
    """`GET /library/seat-map?shift=<id>` — every seat and who holds it in that shift."""

    scope_exempt = EXEMPT

    def get_permissions(self) -> list:
        return [
            IsAuthenticated(),
            ModuleEnabled("library")(),
            HasPermission("library.member.read")(),
        ]

    def get(self, request: Any) -> Any:
        tenant = get_effective_tenant(request)
        shift = None
        raw = request.query_params.get("shift")
        if raw:
            pk = uuid_or_none(raw)
            shift = LibraryShift.objects.filter(tenant=tenant, pk=pk).first() if pk else None
            if shift is None:
                raise ValidationFailed({"shift": ["Choose one of the shifts."]})
        result = seats.seat_map(tenant, shift, tenant_today(tenant))
        return StandardResponse.ok(
            result["seats"],
            meta={"counts": result["counts"], "shift_counts": result["shift_counts"]},
        )
