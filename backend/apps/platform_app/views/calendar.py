"""`/api/v1/calendar/…` — the tenant's closed-day calendar (A9b, FRD 00 PLT-X08 §6).

Reading is any active member (a counter clerk must know the shop is shut on
Sunday). Writing a tenant-wide closure or the weekdays needs
`platform.calendar.manage` (owner, admin — R26, owner Q2); a closure or override
for module X may also be written by a member holding X's settings codename
(`library.settings.manage`), so a librarian can close the library without being
able to close the shop.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.common.exceptions import NotFound, PermissionDenied, ValidationFailed
from apps.common.permissions_registry import permissions_for
from apps.common.responses import StandardResponse
from apps.platform_app.permissions import _membership
from apps.platform_app.services import calendar as calendar_service

CALENDAR_MANAGE = "platform.calendar.manage"


def _member(request: Any) -> Any:
    membership = _membership(request)
    if membership is None:
        raise PermissionDenied()
    return membership


def _may_write(request: Any, membership: Any, module: str | None) -> bool:
    claims = getattr(request, "auth_claims", {}) or {}
    if claims.get("imp"):
        return False  # a support session is view-only (§20.4.8 rule 5)
    held = permissions_for(membership)
    return CALENDAR_MANAGE in held or bool(module and f"{module}.settings.manage" in held)


def _date(raw: Any, field: str) -> dt.date:
    try:
        return dt.date.fromisoformat(str(raw))
    except (TypeError, ValueError):
        raise ValidationFailed({field: ["Enter a date as YYYY-MM-DD."]}) from None


def _row(row: Any) -> dict:
    return {
        "id": str(row.id),
        "date": row.date.isoformat(),
        "reason": row.reason,
        "module": row.module,
    }


class ClosedDayListView(APIView):
    """`GET` (range ≤ 400 days) and `POST` (range add ≤ 31 days) of closures."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Any) -> Any:
        membership = _member(request)
        tenant = membership.tenant
        today = tenant_today(tenant)
        start = _date(request.query_params.get("from") or today.isoformat(), "from")
        end = _date(
            request.query_params.get("to") or (start + dt.timedelta(days=365)).isoformat(), "to"
        )
        if end < start:
            raise ValidationFailed({"to": ["The last day must be on or after the first."]})
        if (end - start).days + 1 > calendar_service.MAX_READ_RANGE_DAYS:
            raise ValidationFailed(
                {"to": [f"Ask for at most {calendar_service.MAX_READ_RANGE_DAYS} days."]}
            )
        module = calendar_service.validate_module(tenant, request.query_params.get("module"))
        weekdays = calendar_service.closed_weekdays(tenant)
        rows = calendar_service.closed_day_rows(tenant, start, end, module=module)
        return StandardResponse.ok(
            [_row(row) for row in rows],
            meta={
                "closed_weekdays": weekdays["value"],
                "module_weekdays": weekdays["modules"],
                # The screen's per-module overrides and "Applies to" choices.
                "readers": calendar_service.readers_for(tenant),
            },
        )

    def post(self, request: Any) -> Any:
        membership = _member(request)
        body = request.data if isinstance(request.data, dict) else {}
        module = body.get("module") or None
        if not _may_write(request, membership, module if isinstance(module, str) else None):
            raise PermissionDenied()
        start = _date(body.get("from"), "from")
        end = _date(body["to"], "to") if body.get("to") else None
        rows, skipped = calendar_service.add_closed_days(
            ctx=Ctx.from_request(request),
            start=start,
            end=end,
            reason=body.get("reason"),
            module=module,
        )
        return StandardResponse.created(
            [_row(row) for row in rows], meta={"skipped_existing": skipped}
        )


class ClosedDayDetailView(APIView):
    """`DELETE /calendar/closed-days/{id}` — another tenant's id is 404 (ADR-032)."""

    permission_classes = [IsAuthenticated]

    def delete(self, request: Any, closed_day_id: Any) -> Any:
        from apps.platform_app.models import ClosedDay

        membership = _member(request)
        row = ClosedDay.objects.filter(tenant=membership.tenant, pk=closed_day_id).first()
        if row is None:
            raise NotFound()
        if not _may_write(request, membership, row.module):
            raise PermissionDenied()
        calendar_service.delete_closed_day(ctx=Ctx.from_request(request), row=row)
        return StandardResponse.no_content()


class WeekdaysView(APIView):
    """`PUT /calendar/weekdays {value, modules}` — the Business days screen's write.

    The tenant's own weekdays need `platform.calendar.manage`; a body that only
    changes one module's override may come from that module's settings codename.
    """

    permission_classes = [IsAuthenticated]

    def put(self, request: Any) -> Any:
        membership = _member(request)
        body = request.data if isinstance(request.data, dict) else {}
        modules = body.get("modules") or {}
        held_manage = _may_write(request, membership, None)
        if not held_manage:
            current = calendar_service.closed_weekdays(membership.tenant)["value"]
            only_modules = body.get("value", current) == current and isinstance(modules, dict)
            if not (
                only_modules
                and modules
                and all(_may_write(request, membership, m) for m in modules)
            ):
                raise PermissionDenied()
        saved = calendar_service.set_closed_weekdays(
            ctx=Ctx.from_request(request), value=body.get("value", []), modules=modules
        )
        return StandardResponse.ok(saved)
