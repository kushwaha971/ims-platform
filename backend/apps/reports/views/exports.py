"""`/reports/exports/{id}` and its download (IMP-02 FR-8, FR-14).

The path is §22.11's `GET /reports/exports/{id}`, which PLT-08 and PLT-10
already name, rather than CCR-20's proposed `/exports/{id}` — one object, one
address, until CCR-20 is decided.

A download is authenticated and tenant-scoped (BR-7: an export is not a
share): another tenant's id is 404, never 403, and the codename that let the
member request the file is re-checked on the way out (EC-7) — a role
downgraded in the meantime cannot collect it.
"""

from __future__ import annotations

from typing import Any

from django.core.files.storage import default_storage
from django.http import FileResponse
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.common.exceptions import BusinessRuleViolation, NoActiveTenant, NotFound, PermissionDenied
from apps.common.exports import request_has
from apps.common.responses import StandardResponse
from apps.common.tenancy import get_effective_tenant
from apps.reports.models import Export, ExportStatus


def _export_for(request: Any, export_id: Any) -> Export:
    tenant = get_effective_tenant(request)
    if tenant is None:
        raise NoActiveTenant()
    export = (
        Export.objects.select_related("file_attachment").filter(tenant=tenant, pk=export_id).first()
    )
    if export is None:
        raise NotFound("No such export.")
    codename = (export.params or {}).get("codename") or "reports.export"
    if not request_has(request, codename):
        raise PermissionDenied("You do not have permission to download this export.")
    return export


def export_dict(export: Export) -> dict:
    expired = (
        export.status == ExportStatus.READY
        and export.expires_at
        and export.expires_at < timezone.now()
    )
    return {
        "id": str(export.id),
        "resource": export.resource,
        "report_name": export.report_name,
        "format": export.format,
        "status": ExportStatus.EXPIRED.value if expired else export.status,
        "row_count": export.row_count,
        "size_bytes": export.size_bytes,
        "created_at": export.created_at.isoformat(),
        "expires_at": export.expires_at.isoformat() if export.expires_at else None,
        "download_path": (
            f"/reports/exports/{export.id}/download"
            if export.status == ExportStatus.READY and not expired
            else None
        ),
        "error": (export.params or {}).get("error"),
    }


class ExportDetailView(APIView):
    """FR-14 — what the client polls every few seconds while a file is prepared."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Any, export_id: Any) -> Any:
        return StandardResponse.ok(export_dict(_export_for(request, export_id)))


class ExportDownloadView(APIView):
    """FR-8 — stream the stored file; 404 `export_expired` after seven days."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Any, export_id: Any) -> Any:
        export = _export_for(request, export_id)
        attachment = export.file_attachment
        expired = export.status == ExportStatus.EXPIRED or (
            export.expires_at is not None and export.expires_at < timezone.now()
        )
        if expired:
            raise BusinessRuleViolation(
                "export_expired", "This file has expired — generate it again."
            )
        if (
            export.status != ExportStatus.READY
            or attachment is None
            or not default_storage.exists(attachment.storage_key)
        ):
            raise NotFound("This file is not ready yet.")
        downloads = int((export.params or {}).get("downloads") or 0) + 1
        Export.objects.filter(pk=export.pk).update(params={**export.params, "downloads": downloads})
        response = FileResponse(
            default_storage.open(attachment.storage_key, "rb"),
            content_type="text/csv; charset=utf-8",
            as_attachment=True,
            # RPT-08 FR-8 — a report's file keeps the name it would have had
            # synchronously (`day-book_2026-04-01_2026-09-30.csv`); a list's
            # keeps IMP-02's.
            filename=(export.params or {}).get("filename")
            or f"digikhaato-{export.resource or 'export'}-{export.created_at:%Y%m%d-%H%M}.csv",
        )
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response
