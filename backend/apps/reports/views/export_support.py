"""The HTTP half of RPT-08: turn a registered report exporter into a response.

`report_csv` is what a report view returns for `?format=csv` once it has
validated its own params and called `authorise_export` (cross-site refusal,
`reports.export`, the ten-an-hour budget — in that order, before a row is
read: security review I-5). It then counts, and either streams the file
(≤ 5,000 rows, FR-2) or queues it as a `reports_export` row plus a
`platform_job` and answers 202 (FR-3) — the same threshold, the same job type
and the same poll endpoint IMP-02's list exports use, so the client's
`ListExportButton` handles a report's export with no new code.

── Zero rows is a file, not a refusal (RPT-08 EC-2) ─────────────────────────
IMP-02 refuses an empty LIST export ("clear a filter"), because an empty list
file is almost always a mistake. A report's empty period is an answer — "no
payments on Sunday" — and an accountant exporting every day of a month wants
the Sunday file too, so a report produces the header row alone.
"""

from __future__ import annotations

from typing import Any

from django.db import transaction
from django.http import StreamingHttpResponse

from apps.common import exports as common_exports
from apps.common.exceptions import BusinessRuleViolation
from apps.common.exports import JOB_BUILD_EXPORT, audit_export_request, csv_lines
from apps.common.responses import StandardResponse
from apps.reports.exporting import Exporter


def report_csv(request: Any, *, exporter: Exporter, tenant: Any, params: dict) -> Any:
    """Stream or queue the report's file. The caller has ALREADY authorised."""
    # Read from the module at call time, so the thresholds stay one setting
    # (and a test can lower them) rather than a copy taken at import.
    sync_max = common_exports.SYNC_MAX_ROWS
    maximum = common_exports.MAX_EXPORT_ROWS
    count = exporter.count(tenant, params)
    if count > maximum:
        raise BusinessRuleViolation(
            "export_too_large",
            "Narrow the date range — at most 1,00,000 rows per file.",
            details={"count": count, "maximum": maximum},
        )
    filename = exporter.filename(params)
    audit_export_request(request, tenant, exporter.slug, params, count, sync=count <= sync_max)
    if count > sync_max:
        export = _queue(
            request, exporter=exporter, tenant=tenant, params=params, count=count, filename=filename
        )
        return StandardResponse.accepted(
            {
                "export_id": str(export.id),
                "status": export.status,
                "report": exporter.slug,
                "row_count": count,
            },
            message="Preparing your file.",
        )
    columns = exporter.columns(params)
    response = StreamingHttpResponse(
        (line.encode("utf-8") for line in csv_lines(columns, exporter.rows(tenant, params))),
        content_type="text/csv; charset=utf-8",
    )
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    response["X-Row-Count"] = str(count)
    response["Cache-Control"] = "private, no-store"
    return response


def _queue(
    request: Any, *, exporter: Exporter, tenant: Any, params: dict, count: int, filename: str
) -> Any:
    """One `reports_export` row and its job, in one transaction (FR-3)."""
    from apps.common.jobs import enqueue
    from apps.reports.models import Export, ExportStatus

    with transaction.atomic():
        export = Export.objects.create(
            tenant=tenant,
            created_by=request.user,
            report_name=f"report:{exporter.slug}",
            resource=exporter.slug,
            format="csv",
            status=ExportStatus.QUEUED,
            row_count=count,
            params={
                "report": exporter.slug,
                "query": params,
                "codename": exporter.codename,
                "filename": filename,
            },
        )
        enqueue(
            job_type=JOB_BUILD_EXPORT,
            payload={"export_id": str(export.id)},
            tenant=tenant,
            created_by=request.user,
            idempotency_token=f"{JOB_BUILD_EXPORT}:{export.id}",
            request_id=getattr(request, "request_id", None),
        )
    return export


#: RPT-08 FR-1 as this product ships it: JSON on screen, CSV to take away.
#: XLSX is not offered (owner, Sep 2026 — no spreadsheet writer, and a CSV
#: opens in Excel); PDF is the browser's print (FR-12).
REPORT_FORMATS = ("json", "csv")


class ReportFormatMixin:
    """`?format=` refused with the report's own words, not DRF's bare 404.

    DRF resolves `format` against the view's renderers before the handler
    runs, so `?format=pdf` would otherwise answer 404 — which a merchant reads
    as "the report is gone". FR-12 and §10 give the sentences.
    """

    @property
    def renderer_classes(self) -> list:  # type: ignore[override]
        from apps.common.renderers import EnvelopeJSONRenderer, PassthroughCsvRenderer

        return [EnvelopeJSONRenderer, PassthroughCsvRenderer]

    def perform_content_negotiation(self, request: Any, force: bool = False) -> Any:
        from apps.common.exceptions import ValidationFailed

        # `force=True` is DRF choosing a renderer for the error raised below;
        # it falls back to the first renderer by itself, so only refuse once.
        wanted = None if force else request.query_params.get("format")
        if wanted == "pdf":
            raise ValidationFailed(
                {"format": ["Reports are printed from your browser — use the Print button."]}
            )
        if wanted not in (None, "", *REPORT_FORMATS):
            raise ValidationFailed({"format": ["Choose json or csv."]})
        return super().perform_content_negotiation(request, force)  # type: ignore[misc]


def granted_permissions(tenant: Any) -> frozenset[str]:
    """The reader's effective codenames — the resolver the permission classes use."""
    from apps.common.permissions_registry import permissions_for

    membership = getattr(tenant, "_ub_membership", None) if tenant is not None else None
    return permissions_for(membership) if membership is not None else frozenset()


def positive_int(request: Any, name: str, *, default: int, cap: int) -> int:
    """`?page=two` is a typo in an address bar, and a typo is a 400, not a 500."""
    from apps.common.exceptions import ValidationFailed

    raw = request.query_params.get(name)
    if raw in (None, ""):
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ValidationFailed({name: ["Give a whole number."]}) from None
    if not 1 <= value <= cap:
        raise ValidationFailed({name: [f"Give a number from 1 to {cap}."]})
    return value
