"""`GET /reports/gst-summary` — RPT-07.

Thin: parse (every §10 rule, before any row is read), refuse an unregistered
tenant (409 `gst_not_registered`, FR-11), ask `gst_report.gst_summary`,
serialise. `?format=csv` is the ZIP of per-section CSVs (FR-14 / RPT-08 BR-9)
behind the same export gate every list uses.

── Why the CSV is always synchronous ───────────────────────────────────────
RPT-08 BR-3 counts the GST summary's CONTRIBUTING DOCUMENTS for the async
threshold because its output is "many small sheets". Those sheets are
aggregates — tens of rows whatever the document count — computed by a fixed
number of GROUP BY statements, so the request never holds the documents in
memory; the threshold exists to bound exactly that. The async job
(`reports.build_export`) replays a LIST queryset into one CSV and has no
multi-sheet form. So this export streams in the request, and the document
count is recorded in the audit row for the day the async path is needed.
"""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal
from typing import Any

from django.http import HttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.common.constants import ModuleCode
from apps.common.dates import fy_start_month, tenant_today
from apps.common.exceptions import BusinessRuleViolation
from apps.common.exports import authorise_export
from apps.common.permissions import HasPermission, ModuleEnabled
from apps.common.renderers import EnvelopeJSONRenderer, PassthroughCsvRenderer
from apps.common.responses import StandardResponse
from apps.common.throttling import ScopedUserRateThrottle
from apps.common.viewsets import TenantScopeMixin
from apps.reports.constants_tax import SLUG_GST_SUMMARY
from apps.reports.exporters.gst import gst_zip
from apps.reports.selectors.gst_report import gst_summary
from apps.reports.views.tax_params import gst_params


def jsonable(value: Any) -> Any:
    """Decimals as strings (NFR: "the client never re-adds"), dates ISO."""
    if isinstance(value, dict):
        return {str(k): jsonable(v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [jsonable(v) for v in value]
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, dt.datetime | dt.date):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    return value


class GstSummaryView(TenantScopeMixin, APIView):
    permission_classes = [
        IsAuthenticated,
        ModuleEnabled(ModuleCode.REPORTS),
        # §12 — every section is financial; staff get 403 for the whole report.
        HasPermission("reports.financial.read"),
    ]
    throttle_classes = [ScopedUserRateThrottle]
    renderer_classes = [EnvelopeJSONRenderer, PassthroughCsvRenderer]

    def get(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        tenant = self.get_tenant()
        params = gst_params(
            request, today=tenant_today(tenant), fy_start_month=fy_start_month(tenant)
        )
        if tenant.gst_type not in ("regular", "composition"):
            raise BusinessRuleViolation(
                "gst_not_registered",
                "Add your GSTIN in Business settings to use GST reports",
            )
        is_csv = request.query_params.get("format") == "csv"
        if is_csv:
            # BEFORE the report is computed (security review I-5).
            authorise_export(
                request,
                self,
                codename="reports.export",
                refusal="You do not have permission to export reports.",
            )
        payload = gst_summary(tenant=tenant, params=params)
        if not is_csv:
            return StandardResponse.ok(jsonable(payload["data"]), meta=jsonable(payload["meta"]))
        range_label = params.period or f"{params.date_from}_{params.date_to}"
        range_label = range_label.replace(":", "-")
        self._audit(request, tenant, params, payload["meta"]["document_count"])
        response = HttpResponse(
            gst_zip(payload, range_label=range_label), content_type="application/zip"
        )
        response["Content-Disposition"] = (
            f'attachment; filename="{SLUG_GST_SUMMARY}_{range_label}.zip"'
        )
        response["Cache-Control"] = "private, no-store"
        return response

    @staticmethod
    def _audit(request: Any, tenant: Any, params: Any, documents: int) -> None:
        """RPT-07 §16 — a statutory basis, so the export is on the record."""
        from apps.common.audit import write_audit
        from apps.common.context import Ctx

        write_audit(
            ctx=Ctx(
                tenant=tenant,
                actor=request.user,
                actor_type="user",
                request_id=getattr(request, "request_id", "") or "",
                ip=getattr(request, "client_ip", None),
                user_agent=request.META.get("HTTP_USER_AGENT"),
            ),
            action="export.requested",
            entity_type="reports_export",
            metadata={
                "resource": SLUG_GST_SUMMARY,
                "filters": {
                    "date_from": params.date_from.isoformat(),
                    "date_to": params.date_to.isoformat(),
                    "period": params.period,
                    "type": params.supply_type,
                    "rounding": params.rounding,
                },
                "row_count": documents,
                "sync": True,
            },
        )
