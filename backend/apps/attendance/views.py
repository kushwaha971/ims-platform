"""The engine's read endpoints (FRD 00 ATT-01 §6, ATT-02 §6, ATT-05 §6; ADR-041: GET only).

Permission order (`apps/common/permissions.py`): authenticated → the engine is
on (`EngineEnabled("attendance")`, 403 `module_disabled {module:
"attendance"}`) → the member holds SOME consuming module's read codename.
Rows are then narrowed to `readable_engine_modules`: a `module` parameter
outside that set lists nothing, and a group of an unreadable module is 404,
like another tenant's (canon §0.11 rule 2).

Writes go through the vertical's endpoints, which call the services.
"""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal, InvalidOperation
from typing import Any

from django.http import Http404
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.attendance import selectors
from apps.attendance.constants import SUBJECT_TYPE_MAX
from apps.attendance.serializers import (
    group_json,
    mark_json,
    open_visit_json,
    party_json,
    percent_json,
    register_json,
    session_json,
)
from apps.common.exceptions import ValidationFailed
from apps.common.pagination import CursorPagination
from apps.common.permissions import EngineEnabled, HasEngineReadPermission, readable_engine_modules
from apps.common.responses import StandardResponse
from apps.common.tenancy import get_effective_tenant

PERMISSIONS = [IsAuthenticated, EngineEnabled("attendance"), HasEngineReadPermission("attendance")]
MAX_RANGE_DAYS = 400


class MarkPagination(CursorPagination):
    ordering = ("-on_date", "-id")


def _uuid(params: Any, name: str, errors: dict, *, required: bool = False) -> uuid.UUID | None:
    raw = params.get(name)
    if not raw:
        if required:
            errors.setdefault(name, []).append("This is required.")
        return None
    try:
        return uuid.UUID(str(raw))
    except ValueError:
        errors.setdefault(name, []).append("Not a valid id.")
        return None


def _day(params: Any, name: str, errors: dict, *, required: bool = False) -> dt.date | None:
    raw = params.get(name)
    if not raw:
        if required:
            errors.setdefault(name, []).append("This is required.")
        return None
    try:
        return dt.date.fromisoformat(raw)
    except ValueError:
        errors.setdefault(name, []).append("Use a date like 2026-10-01.")
        return None


def _range(params: Any, errors: dict, *, required: bool = False) -> tuple[Any, Any]:
    date_from = _day(params, "from", errors, required=required)
    date_to = _day(params, "to", errors, required=required)
    if date_from and date_to:
        if date_from > date_to:
            errors.setdefault("to", []).append("The end is before the start.")
        elif (date_to - date_from).days > MAX_RANGE_DAYS:
            errors.setdefault("to", []).append("Choose at most a year.")
    return date_from, date_to


def _module(params: Any, modules: frozenset[str], errors: dict, *, required: bool) -> Any:
    """The `module` filter: outside the readable set it lists nothing (not 403)."""
    module = params.get("module")
    if not module:
        if required:
            errors.setdefault("module", []).append("This is required.")
        return None, modules
    return module, (frozenset({module}) & modules)


def _context(request: Any) -> tuple[Any, frozenset[str], Any]:
    return (
        get_effective_tenant(request),
        readable_engine_modules(request, "attendance"),
        request.query_params,
    )


def _group(tenant: Any, modules: frozenset[str], group_id: Any) -> Any:
    group = selectors.groups_queryset(tenant, modules=modules).filter(pk=group_id).first()
    if group is None:
        raise Http404
    return group


class GroupListView(APIView):
    """GET /api/v1/attendance/groups — `module`, `subject_type`, `subject_id`."""

    permission_classes = PERMISSIONS

    def get(self, request: Any) -> Any:
        tenant, modules, params = _context(request)
        errors: dict[str, list[str]] = {}
        _, modules = _module(params, modules, errors, required=False)
        subject_id = _uuid(params, "subject_id", errors)
        subject_type = params.get("subject_type")
        if subject_type and len(subject_type) > SUBJECT_TYPE_MAX:
            errors.setdefault("subject_type", []).append("Not a subject type.")
        if errors:
            raise ValidationFailed(errors)
        queryset = selectors.groups_queryset(tenant, modules=modules)
        if subject_type:
            queryset = queryset.filter(subject_type=subject_type)
        if subject_id:
            queryset = queryset.filter(subject_id=subject_id)
        return StandardResponse.ok([group_json(g) for g in queryset.order_by("module", "name")])


class SessionListView(APIView):
    """GET /api/v1/attendance/sessions — `group_id`, `from`, `to`."""

    permission_classes = PERMISSIONS

    def get(self, request: Any) -> Any:
        tenant, modules, params = _context(request)
        errors: dict[str, list[str]] = {}
        group_id = _uuid(params, "group_id", errors, required=True)
        date_from, date_to = _range(params, errors)
        if errors:
            raise ValidationFailed(errors)
        group = _group(tenant, modules, group_id)
        rows = selectors.sessions_with_counts(
            tenant, group=group, date_from=date_from, date_to=date_to
        )
        return StandardResponse.ok([session_json(row) for row in rows])


class OpenVisitListView(APIView):
    """GET /api/v1/attendance/open-visits — "In now"."""

    permission_classes = PERMISSIONS

    def get(self, request: Any) -> Any:
        tenant, modules, params = _context(request)
        errors: dict[str, list[str]] = {}
        _, modules = _module(params, modules, errors, required=False)
        if errors:
            raise ValidationFailed(errors)
        rows = (
            selectors.open_visits(tenant, modules=modules)
            .select_related("party")
            .order_by("-check_in_at", "-id")
        )
        return StandardResponse.ok([open_visit_json(m) for m in rows])


class MarkListView(APIView):
    """GET /api/v1/attendance/marks — `party_id`, `module`, `group_id`, `from`, `to`; cursor-paged."""

    permission_classes = PERMISSIONS

    def get(self, request: Any) -> Any:
        tenant, modules, params = _context(request)
        errors: dict[str, list[str]] = {}
        _, modules = _module(params, modules, errors, required=False)
        party_id = _uuid(params, "party_id", errors)
        group_id = _uuid(params, "group_id", errors)
        date_from, date_to = _range(params, errors)
        if errors:
            raise ValidationFailed(errors)
        queryset = selectors.marks_for(
            tenant,
            party_id=party_id,
            group_id=group_id,
            date_from=date_from,
            date_to=date_to,
            modules=modules,
        )
        paginator = MarkPagination()
        page = paginator.paginate_queryset(queryset.select_related("party"), request, view=self)
        return StandardResponse.ok([mark_json(m) for m in page], meta=paginator.get_meta())


class RegisterView(APIView):
    """GET /api/v1/attendance/register — `group_id`, `month` (`2026-10`)."""

    permission_classes = PERMISSIONS

    def get(self, request: Any) -> Any:
        tenant, modules, params = _context(request)
        errors: dict[str, list[str]] = {}
        group_id = _uuid(params, "group_id", errors, required=True)
        month = params.get("month") or ""
        try:
            selectors.month_bounds(month)
        except ValueError:
            errors.setdefault("month", []).append("Use a month like 2026-10.")
        if errors:
            raise ValidationFailed(errors)
        group = _group(tenant, modules, group_id)
        return StandardResponse.ok(register_json(selectors.register_grid(tenant, group.id, month)))


class PercentView(APIView):
    """GET /api/v1/attendance/percent — `group_id`, `period` (a month) or `from`/`to`,
    `party_id`, `below` (an optional threshold, e.g. 75)."""

    permission_classes = PERMISSIONS

    def get(self, request: Any) -> Any:
        tenant, modules, params = _context(request)
        errors: dict[str, list[str]] = {}
        group_id = _uuid(params, "group_id", errors, required=True)
        party_id = _uuid(params, "party_id", errors)
        period = None
        if params.get("period"):
            try:
                period = selectors.month_bounds(params["period"])
            except ValueError:
                errors.setdefault("period", []).append("Use a month like 2026-10.")
        else:
            date_from, date_to = _range(params, errors)
            if date_from and date_to:
                period = (date_from, date_to)
            elif date_from or date_to:
                errors.setdefault("from", []).append("Give both ends of the period.")
        below = None
        if params.get("below"):
            try:
                below = Decimal(params["below"])
                if not Decimal(0) <= below <= Decimal(100):
                    raise InvalidOperation
            except InvalidOperation:
                errors.setdefault("below", []).append("Enter a percentage from 0 to 100.")
        if errors:
            raise ValidationFailed(errors)
        group = _group(tenant, modules, group_id)
        rows = selectors.attendance_percent(tenant, group.id, party_id=party_id, period=period)
        if below is not None:
            rows = [r for r in rows if r["percent"] is not None and r["percent"] < below]
        return StandardResponse.ok([percent_json(r) for r in rows])


class NotVisitedView(APIView):
    """GET /api/v1/attendance/not-visited — `module`, `days`."""

    permission_classes = PERMISSIONS

    def get(self, request: Any) -> Any:
        tenant, modules, params = _context(request)
        errors: dict[str, list[str]] = {}
        module, modules = _module(params, modules, errors, required=True)
        try:
            days = int(params.get("days", ""))
            if not 1 <= days <= 3650:
                raise ValueError
        except ValueError:
            errors.setdefault("days", []).append("Enter a number of days from 1 to 3650.")
            days = 0
        if errors:
            raise ValidationFailed(errors)
        if module not in modules:
            return StandardResponse.ok([])
        rows = selectors.not_visited_since(tenant, module=module, days=days)
        return StandardResponse.ok(
            [
                {"party": party_json(r["party"]), "last_visit_on": r["last_visit_on"].isoformat()}
                for r in rows
            ]
        )


class VisitsByHourView(APIView):
    """GET /api/v1/attendance/visits-by-hour — `module`, `from`, `to`."""

    permission_classes = PERMISSIONS

    def get(self, request: Any) -> Any:
        tenant, modules, params = _context(request)
        errors: dict[str, list[str]] = {}
        module, modules = _module(params, modules, errors, required=True)
        date_from, date_to = _range(params, errors, required=True)
        if errors:
            raise ValidationFailed(errors)
        if module not in modules:
            return StandardResponse.ok([])
        return StandardResponse.ok(
            selectors.visits_by_hour(tenant, module=module, date_from=date_from, date_to=date_to)
        )
