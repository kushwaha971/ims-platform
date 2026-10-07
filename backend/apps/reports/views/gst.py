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


class GstReturnJsonView(TenantScopeMixin, APIView):
    """`GET /reports/gst-returns/{gstr1|gstr3b}?period=YYYY-MM` — the file the GST
    portal's offline tool loads, for one closed month (Shop item 2, RPT-12).

    The same period parameters as the summary (`period`, or `date_from`/`date_to`
    covering exactly one month), the same permissions plus `reports.export`, and
    the same selectors, so the file is the screen. A GSTR-1 the portal would
    refuse is a 409 `gstr1_blocked` naming each document; a month still running
    is a 409 `period_not_closed`. Every file is audited with its SHA-256, the
    answer months later to "which file did we upload".
    """

    permission_classes = [
        IsAuthenticated,
        ModuleEnabled(ModuleCode.REPORTS),
        HasPermission("reports.financial.read"),
    ]
    throttle_classes = [ScopedUserRateThrottle]
    renderer_classes = [EnvelopeJSONRenderer]

    def get(self, request: Any, return_type: str = "", *args: Any, **kwargs: Any) -> Any:
        import hashlib
        import json

        from rest_framework.exceptions import NotFound

        from apps.reports.selectors import gst_json

        if return_type not in gst_json.RETURNS:
            raise NotFound("Choose gstr1 or gstr3b.")
        tenant = self.get_tenant()
        today = tenant_today(tenant)
        params = gst_params(request, today=today, fy_start_month=fy_start_month(tenant))
        if tenant.gst_type not in ("regular", "composition"):
            raise BusinessRuleViolation(
                "gst_not_registered",
                "Add your GSTIN in Business settings to use GST reports",
            )
        fp = gst_json.return_month(params.date_from, params.date_to, today=today)
        window = {"tenant": tenant, "date_from": params.date_from, "date_to": params.date_to}
        if return_type == "gstr1":
            gst_json.refuse_if_blocked(gst_json.gstr1_issues(**window))
        else:
            gst_json.refuse_if_blocked(gst_json.business_issues(tenant))
        # After every refusal that costs nothing, before the book is walked (I-5).
        authorise_export(
            request,
            self,
            codename="reports.export",
            refusal="You do not have permission to export reports.",
        )
        build = gst_json.gstr1 if return_type == "gstr1" else gst_json.gstr3b
        body = build(**window, fp=fp)
        # Compact, UTF-8, no BOM: what the offline tool imports (RPT-12 NFR).
        content = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        digest = hashlib.sha256(content).hexdigest()
        self._audit(request, tenant, return_type, fp, body, digest)
        response = HttpResponse(content, content_type="application/json; charset=utf-8")
        name = f"{return_type.upper()}_{tenant.gstin}_{fp}.json"
        response["Content-Disposition"] = f'attachment; filename="{name}"'
        response["X-File-Sha256"] = digest
        response["Cache-Control"] = "private, no-store"
        return response

    @staticmethod
    def _audit(
        request: Any, tenant: Any, return_type: str, fp: str, body: dict, digest: str
    ) -> None:
        from apps.common.audit import AuditAction, write_audit
        from apps.common.context import Ctx
        from apps.reports.selectors.gst_json import section_counts

        write_audit(
            ctx=Ctx(
                tenant=tenant,
                actor=request.user,
                actor_type="user",
                request_id=getattr(request, "request_id", "") or "",
                ip=getattr(request, "client_ip", None),
                user_agent=request.META.get("HTTP_USER_AGENT"),
            ),
            action=AuditAction.GST_RETURN_JSON_EXPORTED,
            entity_type="reports_export",
            metadata={
                "return": return_type,
                "fp": fp,
                "gstin": tenant.gstin,
                "version": body.get("version"),
                "section_counts": section_counts(body) if return_type == "gstr1" else {},
                "file_hash": digest,
            },
        )
