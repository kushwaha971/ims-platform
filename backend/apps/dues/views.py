"""The engine's read endpoints (FRD 00 DUE-01 §6, ADR-041: GET only).

Permission order (`apps/common/permissions.py`): authenticated → the engine is
on (`EngineEnabled("dues")`, 403 `module_disabled {module: "dues"}`) → the
member holds SOME consuming module's read codename. Rows are then narrowed to
`readable_engine_modules`: a member holding library's reader never sees gym's
dues here, and a schedule of an unreadable module is 404, like another
tenant's (canon §0.11 rule 2).
"""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

from django.http import Http404
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.common.exceptions import ValidationFailed
from apps.common.pagination import CursorPagination
from apps.common.permissions import EngineEnabled, HasEngineReadPermission, readable_engine_modules
from apps.common.responses import StandardResponse
from apps.common.tenancy import get_effective_tenant
from apps.dues.constants import SUBJECT_TYPE_MAX, DueStatus
from apps.dues.selectors.dues import DUE_ORDERING, dues_queryset, labels_for, totals
from apps.dues.selectors.schedules import schedules_queryset
from apps.dues.serializers import due_json, schedule_json

PERMISSIONS = [IsAuthenticated, EngineEnabled("dues"), HasEngineReadPermission("dues")]


class DuePagination(CursorPagination):
    ordering = DUE_ORDERING


def _uuid(params: Any, name: str, errors: dict) -> uuid.UUID | None:
    raw = params.get(name)
    if not raw:
        return None
    try:
        return uuid.UUID(str(raw))
    except ValueError:
        errors.setdefault(name, []).append("Not a valid id.")
        return None


def _day(params: Any, name: str, errors: dict) -> dt.date | None:
    raw = params.get(name)
    if not raw:
        return None
    try:
        return dt.date.fromisoformat(raw)
    except ValueError:
        errors.setdefault(name, []).append("Use a date like 2026-10-01.")
        return None


class DueListView(APIView):
    """GET /api/v1/dues/dues — `Due[]`, cursor-paged, `meta.totals` over the filtered set."""

    permission_classes = PERMISSIONS

    def get(self, request: Any) -> Any:
        tenant = get_effective_tenant(request)
        modules = readable_engine_modules(request, "dues")
        params = request.query_params
        errors: dict[str, list[str]] = {}
        filters: dict[str, Any] = {}
        party_id = _uuid(params, "party_id", errors)
        if party_id:
            filters["party_id"] = party_id
        subject_id = _uuid(params, "subject_id", errors)
        if subject_id:
            filters["schedule__subject_id"] = subject_id
        subject_type = params.get("subject_type")
        if subject_type:
            if len(subject_type) > SUBJECT_TYPE_MAX:
                errors.setdefault("subject_type", []).append("Not a subject type.")
            filters["schedule__subject_type"] = subject_type
        module = params.get("module")
        if module:
            if module not in modules:
                modules = frozenset()  # a module the member cannot read lists nothing
            filters["module"] = module
        if params.get("status"):
            statuses = [s.strip() for s in params["status"].split(",") if s.strip()]
            if not statuses or any(s not in DueStatus.values for s in statuses):
                errors.setdefault("status", []).append(
                    f"Choose from {', '.join(DueStatus.values)}."
                )
            filters["status__in"] = statuses
        due_from = _day(params, "due_from", errors)
        due_to = _day(params, "due_to", errors)
        if due_from:
            filters["due_on__gte"] = due_from
        if due_to:
            filters["due_on__lte"] = due_to
        if due_from and due_to and due_from > due_to:
            errors.setdefault("due_to", []).append("The end is before the start.")
        if errors:
            raise ValidationFailed(errors)

        queryset = dues_queryset(tenant, modules=modules).filter(**filters)
        figures = totals(queryset)
        paginator = DuePagination()
        page = paginator.paginate_queryset(
            queryset.select_related("schedule", "party"), request, view=self
        )
        labels = labels_for(page)
        return StandardResponse.ok(
            [due_json(due, labels=labels) for due in page],
            meta={**paginator.get_meta(), "totals": figures},
        )


class ScheduleDetailView(APIView):
    """GET /api/v1/dues/schedules/{id} — the schedule with `dues[]` and `pauses[]`."""

    permission_classes = PERMISSIONS

    def get(self, request: Any, pk: uuid.UUID) -> Any:
        tenant = get_effective_tenant(request)
        modules = readable_engine_modules(request, "dues")
        schedule = schedules_queryset(tenant, modules=modules).filter(pk=pk).first()
        if schedule is None:
            raise Http404
        labels = labels_for([type("_", (), {"schedule": schedule})()])
        return StandardResponse.ok(schedule_json(schedule, labels=labels))
