"""`GET /reports` and `GET /reports/<module>.<name>` — the reports modules register (A10).

The core reports hub is the client's static catalogue
(`features/reports/constants/reportCatalogue.ts`), one screen per report that
existed before modules did. What modules add is served from
`apps.reports.registry` (FRD 00 PLT-X13 §6):

* `GET /reports` lists the registered reports this reader may open: the
  report's module effectively on, its codename held. Nothing else is listed, so
  a row is never a door to a 403, and today's tenants get an empty list.
* `GET /reports/<key>` answers the report's JSON, and `?format=csv` its file.
  The detail refuses exactly what the list would hide: an unknown key is 404, a
  module that is off is 403 `module_disabled`, a missing codename 403.

**CSV is the export machinery's rules, not a second set.** `authorise_export`
first (cross-site refusal, `reports.export`, the ten-an-hour budget — the
budget is spent on the FILE only, the LED-04 lesson), then the audit row, then
a BOM, CRLF, numbers as plain decimals and every text cell formula-neutralised.
A registered report's rows are produced by the module and counted before the
first byte is sent; a file above `MAX_EXPORT_ROWS` is refused, and module
reports are streamed synchronously — the async >5,000-row path belongs to the
core exporters, whose jobs replay a queryset the job can find again.
"""

from __future__ import annotations

import csv as csv_module
from collections.abc import Iterator, Sequence
from decimal import Decimal
from typing import Any

from django.http import StreamingHttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.common import exports as common_exports
from apps.common.constants import ModuleCode
from apps.common.exceptions import (
    BusinessRuleViolation,
    ModuleDisabled,
    NotFound,
    PermissionDenied,
    ValidationFailed,
)
from apps.common.exports import audit_export_request, authorise_export, export_filename, neutralise
from apps.common.permissions import ModuleEnabled
from apps.common.responses import StandardResponse
from apps.common.throttling import ScopedUserRateThrottle
from apps.common.viewsets import TenantScopeMixin
from apps.reports import registry
from apps.reports.views.export_support import ReportFormatMixin, granted_permissions


def _effective_modules(tenant: Any) -> frozenset[str]:
    from apps.platform_app.services.entitlements import effective_modules

    return effective_modules(tenant)


def _cell(value: Any) -> str:
    # Numbers stay numbers (a negative amount must not be "neutralised" into
    # text); everything else is text and goes through the formula guard.
    if isinstance(value, (Decimal, int)) and not isinstance(value, bool):
        return str(value)
    return neutralise(value)


def _csv_lines(rows: Sequence[Sequence[Any]]) -> Iterator[str]:
    class _Echo:
        def write(self, value: str) -> str:
            return value

    writer = csv_module.writer(_Echo(), lineterminator="\r\n")
    for index, row in enumerate(rows):
        line = writer.writerow([_cell(value) for value in row])
        yield ("﻿" + line) if index == 0 else line


class ReportListView(TenantScopeMixin, APIView):
    permission_classes = [IsAuthenticated, ModuleEnabled(ModuleCode.REPORTS)]
    throttle_classes = [ScopedUserRateThrottle]

    def get(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        tenant = self.get_tenant()
        modules = _effective_modules(tenant)
        granted = granted_permissions(tenant)
        data = [
            {
                "key": report.key,
                "module": report.module,
                "label_id": report.label_id,
                "permission": report.permission,
                "has_csv": report.has_csv,
            }
            for report in registry.reports()
            if report.module in modules and report.permission in granted
        ]
        return StandardResponse.ok(data)


class ModuleReportView(ReportFormatMixin, TenantScopeMixin, APIView):
    permission_classes = [IsAuthenticated, ModuleEnabled(ModuleCode.REPORTS)]
    throttle_classes = [ScopedUserRateThrottle]

    def get(self, request: Any, key: str, *args: Any, **kwargs: Any) -> Any:
        tenant = self.get_tenant()
        report = registry.report(key)
        if report is None:
            raise NotFound()
        if report.module not in _effective_modules(tenant):
            raise ModuleDisabled()
        if report.permission not in granted_permissions(tenant):
            raise PermissionDenied()
        params = {
            name: request.query_params.get(name)
            for name in request.query_params
            if name not in common_exports.PAGE_PARAMS
        }
        if request.query_params.get("format") != "csv":
            return StandardResponse.ok(report.selector(tenant, params))

        if report.csv is None:
            raise ValidationFailed({"format": ["This report has no file to download."]})
        authorise_export(
            request,
            self,
            codename="reports.export",
            refusal="You do not have permission to export reports.",
        )
        rows = list(report.csv(tenant, params))
        count = max(len(rows) - 1, 0)
        maximum = common_exports.MAX_EXPORT_ROWS
        if count > maximum:
            raise BusinessRuleViolation(
                "export_too_large",
                "Narrow the date range — at most 1,00,000 rows per file.",
                details={"count": count, "maximum": maximum},
            )
        audit_export_request(request, tenant, report.key, params, count, sync=True)
        response = StreamingHttpResponse(
            (line.encode("utf-8") for line in _csv_lines(rows)),
            content_type="text/csv; charset=utf-8",
        )
        filename = export_filename(report.key.replace(".", "-"), tenant)
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        response["X-Row-Count"] = str(count)
        response["Cache-Control"] = "private, no-store"
        return response
