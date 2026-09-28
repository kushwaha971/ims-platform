"""Job handlers owned by the reports app (Part 26 §26.17).

A handler is registered with `@job_handler`, takes `(job, ctx)`, returns a
small JSON-serialisable dict or None, is idempotent, and calls services
rather than reimplementing them.

IMP-02 adds the two that give a big export somewhere to live:
`reports.build_export` writes the file the request was too big to stream, and
`reports.expire_exports` (already named in `SCHEDULES` at 03:15 IST) deletes
files older than seven days and flips their rows to `expired`.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import logging
import os
import tempfile
from typing import Any

from django.core.files.base import File
from django.core.files.storage import default_storage
from django.utils import timezone

from apps.common.jobs import job_handler

logger = logging.getLogger("ub.reports")


@job_handler("reports.build_export", max_attempts=3, timeout_seconds=900)
def build_export(job: Any, ctx: Any) -> dict:
    """FR-7 — replay the list's queryset into a file, then mark the row ready.

    Idempotent: a row already `ready` (a retried job) is left alone. The file
    is written to a temporary name and only saved to storage once complete
    (EC-10), so a disk that fills half way leaves no partial file behind.
    """
    from apps.common.exports import EXPORT_TTL_DAYS, csv_lines, replay_export_queryset
    from apps.common.storage import tenant_media_path
    from apps.files.constants import AttachmentKind
    from apps.files.models import Attachment
    from apps.reports.models import Export, ExportStatus

    export = Export.objects.select_related("tenant", "created_by").get(pk=job.payload["export_id"])
    if export.status not in (ExportStatus.QUEUED, ExportStatus.RUNNING):
        return {"skipped": export.status}
    Export.objects.filter(pk=export.pk).update(
        status=ExportStatus.RUNNING, updated_at=timezone.now()
    )
    try:
        if (export.params or {}).get("report"):
            # RPT-08 — a report registers an exporter instead of a list view
            # (`apps.reports.exporting`); its rows are replayed from the params
            # and grants stored with the row, exactly as the request would have.
            from apps.reports.exporting import replay

            columns, source = replay(export)
        else:
            queryset, columns = replay_export_queryset(export)
            source = queryset.iterator(chunk_size=2000)
        digest = hashlib.sha256()
        rows = 0
        with tempfile.NamedTemporaryFile("wb", delete=False, suffix=".csv") as handle:
            temp_path = handle.name
            for index, line in enumerate(csv_lines(columns, source)):
                data = line.encode("utf-8")
                digest.update(data)
                handle.write(data)
                rows = index  # the header is line 0
        size = os.path.getsize(temp_path)
        key = tenant_media_path(export.tenant_id, "exports", f"{export.id}.csv")
        with open(temp_path, "rb") as source:
            stored = default_storage.save(key, File(source))
        os.unlink(temp_path)
        attachment = Attachment.objects.create(
            tenant=export.tenant,
            created_by=export.created_by,
            owner_type="reports_export",
            owner_id=export.id,
            kind=AttachmentKind.EXPORT_FILE,
            storage_key=stored,
            original_name=(export.params or {}).get("filename")
            or f"yourkhata-{export.resource}.csv",
            content_type="text/csv",
            size_bytes=size,
            sha256=digest.hexdigest(),
        )
        export.status = ExportStatus.READY
        export.file_attachment = attachment
        export.row_count = rows
        export.size_bytes = size
        export.expires_at = timezone.now() + dt.timedelta(days=EXPORT_TTL_DAYS)
        export.save(
            update_fields=[
                "status",
                "file_attachment",
                "row_count",
                "size_bytes",
                "expires_at",
                "updated_at",
            ]
        )
    except Exception as exc:
        logger.exception("reports.export_failed", extra={"export_id": str(export.id)})
        export.status = ExportStatus.FAILED
        export.params = {**export.params, "error": f"{type(exc).__name__}"}
        export.save(update_fields=["status", "params", "updated_at"])
        _notify(export, ready=False)
        return {"failed": type(exc).__name__}
    _notify(export, ready=True)
    return {"rows": rows, "size_bytes": size}


def _notify(export: Any, *, ready: bool) -> None:
    """FR-14 — the notification covers the merchant who navigated away. Best effort."""
    try:
        from apps.notifications.services.notify import notify

        notify(
            export.tenant,
            "export_ready" if ready else "export_failed",
            user=export.created_by,
            params={"count": export.row_count or 0, "export_id": str(export.id)},
        )
    except Exception:
        logger.warning("reports.export_notify_failed", extra={"export_id": str(export.id)})


@job_handler("reports.expire_exports", requires_tenant=False, timeout_seconds=600)
def expire_exports(job: Any, ctx: Any) -> dict:
    """BR-6 — delete the file, keep the row as history with `status='expired'`."""
    from apps.reports.models import Export, ExportStatus

    now = timezone.now()
    expired = 0
    for export in Export.objects.filter(
        status=ExportStatus.READY, expires_at__lt=now
    ).select_related("file_attachment"):
        attachment = export.file_attachment
        if attachment is not None:
            try:
                default_storage.delete(attachment.storage_key)
            except OSError:  # pragma: no cover - already gone
                pass
            type(attachment).all_objects.filter(pk=attachment.pk).update(
                deleted_at=now, updated_at=now
            )
        Export.objects.filter(pk=export.pk).update(status=ExportStatus.EXPIRED, updated_at=now)
        expired += 1
    return {"expired": expired}
