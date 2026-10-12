"""`/api/v1/library/reports` — the library's own report screens (LIB-12 §6; task B15).

The same eight reports the core hub lists (`GET /reports`), served where the
library's screens fetch them: the JSON paged, `?format=csv` through the shared
export rules (`registered_csv_response` — the core's own path, so the two can
never disagree about who may take a file out), and `/print` unpaged up to 2,000.
"""

from __future__ import annotations

from typing import Any

from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.common import exports as common_exports
from apps.common.exceptions import NotFound
from apps.common.permissions import HasPermission, ModuleEnabled
from apps.common.renderers import EnvelopeJSONRenderer, PassthroughCsvRenderer
from apps.common.responses import StandardResponse
from apps.common.tenancy import get_effective_tenant
from apps.common.throttling import ScopedUserRateThrottle
from apps.library.selectors import reports as rp


class _View(APIView):
    scope_exempt = "The library has no row scoping (LIB-14 §1, ADR-052)."

    def get_permissions(self) -> list:
        return [
            IsAuthenticated(),
            ModuleEnabled("library")(),
            HasPermission("library.reports.read")(),
        ]


def _report(name: str) -> rp.Report:
    report = rp.REPORTS.get(name)
    if report is None:
        raise NotFound("No such report.")
    return report


def _params(request: Any) -> dict:
    return {name: request.query_params.get(name) for name in request.query_params}


class ReportIndexView(_View):
    def get(self, request: Any) -> Any:
        return StandardResponse.ok(
            [
                {"key": r.key, "name": r.name, "label_id": r.label_id, "has_csv": True}
                for r in rp.REPORTS.values()
            ]
        )


class ReportView(_View):
    #: FR-3 — viewing is not throttled; the file is, in the handler, by the export rules.
    throttle_classes = [ScopedUserRateThrottle]
    #: DRF resolves `?format=` against the renderers before the handler runs.
    renderer_classes = [EnvelopeJSONRenderer, PassthroughCsvRenderer]

    def get(self, request: Any, name: str) -> Any:
        report = _report(name)
        tenant = get_effective_tenant(request)
        params = _params(request)
        if params.get("format") == "csv":
            clean = {k: v for k, v in params.items() if k not in common_exports.PAGE_PARAMS}
            return common_exports.registered_csv_response(
                request,
                self,
                tenant,
                key=report.key,
                params=clean,
                rows=list(rp.report_csv(report, tenant, clean)),
            )
        data = rp.report_page(report, tenant, params)
        meta = {
            key: data.pop(key) for key in ("count", "page", "page_size", "filters", "orientation")
        }
        return StandardResponse.ok(data, meta=meta)


class ReportPrintView(_View):
    def get(self, request: Any, name: str) -> Any:
        data = rp.report_print(_report(name), get_effective_tenant(request), _params(request))
        meta = {key: data.pop(key) for key in ("count", "filters", "orientation")}
        return StandardResponse.ok(data, meta=meta)


class ProfitView(_View):
    """`GET /library/profit?from&to` — fees in, expenses out, what is left (Library P0).

    The period defaults to this month so far; at most a year.
    """

    def get(self, request: Any) -> Any:
        import datetime as dt

        from apps.common.dates import tenant_today
        from apps.common.exceptions import ValidationFailed
        from apps.library.services.profit import has_any_money, profit

        tenant = get_effective_tenant(request)
        today = tenant_today(tenant)

        def day(name: str, default: dt.date) -> dt.date:
            raw = request.query_params.get(name)
            if not raw:
                return default
            try:
                return dt.date.fromisoformat(raw)
            except ValueError as error:
                raise ValidationFailed({name: ["Enter a date like 2026-10-01."]}) from error

        start = day("from", today.replace(day=1))
        end = day("to", today)
        if end < start or (end - start).days > 366:
            raise ValidationFailed({"to": ["Choose a period of up to a year."]})
        return StandardResponse.ok(
            profit(tenant, start, end), meta={"has_any": has_any_money(tenant)}
        )
