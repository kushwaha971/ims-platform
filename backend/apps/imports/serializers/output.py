"""The job on the wire (IMP-01 §14 `GET /imports/{id}`).

Plain dicts, the inventory app's convention for read shapes: every value is
already a string, a number or a list, so there is no money to lose to a JSON
float on the way out.
"""

from __future__ import annotations

from typing import Any

from apps.imports import registry
from apps.imports.constants import ImportStatus
from apps.imports.models import ImportJob


def _actor(user: Any) -> dict | None:
    if user is None:
        return None
    return {
        "id": str(user.id),
        "name": getattr(user, "full_name", "") or getattr(user, "email", ""),
    }


def job_row(job: ImportJob) -> dict:
    """The history row (FR-10): no errors, no preview."""
    attachment = job.file_attachment
    result = job.result or {}
    return {
        "id": str(job.id),
        "kind": job.kind,
        "status": job.status,
        "total_rows": job.total_rows,
        "valid_rows": job.valid_rows,
        "error_rows": job.error_rows,
        "file": {
            "name": attachment.original_name if attachment else "",
            "size_bytes": attachment.size_bytes if attachment else 0,
        },
        "summary": result.get("summary"),
        "error": result.get("error"),
        "created_at": job.created_at.isoformat(),
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
        "created_by": _actor(job.created_by),
    }


def job_detail(job: ImportJob, *, can_commit: bool) -> dict:
    """Everything the wizard draws, in one read (FR-8)."""
    spec = registry.get(job.kind)
    result = job.result or {}
    data = job_row(job)
    data.update(
        {
            "errors": job.errors or [],
            "errors_total": result.get("errors_total", len(job.errors or [])),
            "errors_truncated": bool(result.get("errors_truncated")),
            "warnings": result.get("warnings", []),
            "warning_counts": result.get("warning_counts", {}),
            "preview_rows": result.get("preview_rows", []),
            "columns": result.get("columns") or (list(spec.column_names) if spec else []),
            "totals": result.get("totals", {}),
            "progress": result.get("progress"),
            "has_error_file": bool(result.get("error_file"))
            and job.status != ImportStatus.CANCELLED,
            "can_commit": can_commit,
            "summary_fields": list(spec.summary_fields) if spec else [],
            "records_route": spec.records_route if spec else "/",
            "started_at": job.started_at.isoformat() if job.started_at else None,
        }
    )
    return data
