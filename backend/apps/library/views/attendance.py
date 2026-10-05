"""`/api/v1/library/attendance` (W05) — the reading room's day register.

Read with `library.member.read`; checking a student in or out is
`library.member.write` (the desk's job, staff hold it). Overriding a block
(a student who left, or is on hold) needs `library.member.close`, which the
attendance engine checks against the policy's `override_permission`.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from rest_framework.permissions import SAFE_METHODS, IsAuthenticated
from rest_framework.views import APIView

from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.common.exceptions import ValidationFailed
from apps.common.permissions import HasPermission, ModuleEnabled
from apps.common.responses import StandardResponse
from apps.common.tenancy import get_effective_tenant
from apps.library.services import attendance
from apps.library.services.fields import uuid_or_none

EXEMPT = "The library has no row scoping (LIB-14 §1, ADR-052)."


class _AttendanceView(APIView):
    scope_exempt = EXEMPT

    def get_permissions(self) -> list:
        codename = (
            "library.member.read" if self.request.method in SAFE_METHODS else "library.member.write"
        )
        return [IsAuthenticated(), ModuleEnabled("library")(), HasPermission(codename)()]


def _day(raw: Any, default: dt.date, field: str = "date") -> dt.date:
    if not raw:
        return default
    try:
        return dt.date.fromisoformat(str(raw))
    except ValueError:
        raise ValidationFailed({field: ["Enter a date like 2026-10-05."]}) from None


class AttendanceView(_AttendanceView):
    def get(self, request: Any) -> Any:
        tenant = get_effective_tenant(request)
        today = tenant_today(tenant)
        on = _day(request.query_params.get("date"), today)
        if on > today:
            raise ValidationFailed({"date": ["That day has not come yet."]})
        shift = request.query_params.get("shift") or None
        if shift and uuid_or_none(shift) is None:
            raise ValidationFailed({"shift": ["Not a valid id."]})
        result = attendance.day_register(tenant, on, shift)
        return StandardResponse.ok(result["rows"], meta={"on": result["on"], **result["counts"]})

    def post(self, request: Any) -> Any:
        data = request.data if isinstance(request.data, dict) else {}
        pk = uuid_or_none(data.get("membership_id"))
        if pk is None:
            raise ValidationFailed({"membership_id": ["Choose the student."]})
        reason = data.get("override_reason")
        result = attendance.check_in(
            ctx=Ctx.from_request(request),
            membership_id=pk,
            override_reason=str(reason) if reason else None,
        )
        return StandardResponse.created(result)


class AttendanceOutView(_AttendanceView):
    def post(self, request: Any, mark_id: Any) -> Any:
        attendance.check_out(ctx=Ctx.from_request(request), mark_id=mark_id)
        return StandardResponse.ok({"mark_id": str(mark_id)})


class MemberAttendanceView(_AttendanceView):
    """`GET /library/members/<id>/attendance?month=2026-10` — the days they came."""

    def get(self, request: Any, membership_id: Any) -> Any:
        tenant = get_effective_tenant(request)
        raw = request.query_params.get("month")
        month = _day(f"{raw}-01" if raw else None, tenant_today(tenant), "month")
        days = attendance.month_days(tenant, membership_id, month)
        return StandardResponse.ok(days, meta={"month": month.strftime("%Y-%m")})


class FeeRemindersView(_AttendanceView):
    """`GET /library/fee-reminders` — today's scheduled fee messages (W06)."""

    def get(self, request: Any) -> Any:
        from apps.library.services import fee_messages

        return StandardResponse.ok(fee_messages.due_today(get_effective_tenant(request)))


class MemberMessageView(_AttendanceView):
    """`GET|POST /library/members/<id>/message/<kind>` — kind fee | welcome | receipt.

    GET prepares the text and the link and records nothing; POST is the tap that
    opens WhatsApp and records it like a reminder (W06).
    """

    def get(self, request: Any, membership_id: Any, kind: str) -> Any:
        from apps.library.services import fee_messages

        return StandardResponse.ok(
            fee_messages.preview(
                ctx=Ctx.from_request(request), membership_id=membership_id, kind=kind
            )
        )

    def post(self, request: Any, membership_id: Any, kind: str) -> Any:
        from apps.library.services import fee_messages

        return StandardResponse.ok(
            fee_messages.send(
                ctx=Ctx.from_request(request),
                membership_id=membership_id,
                kind=kind,
                data=request.data if isinstance(request.data, dict) else {},
            )
        )
