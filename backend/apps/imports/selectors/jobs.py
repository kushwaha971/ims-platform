"""Reading import jobs (Part 26 R7: selectors never write)."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from django.db.models import QuerySet

from apps.imports.models import ImportJob


def jobs_for(
    *, tenant: Any, kinds: Iterable[str], kind: str | None = None, status: str | None = None
) -> QuerySet:
    """FR-10's history, newest first, limited to the kinds the member may read."""
    queryset = (
        ImportJob.objects.filter(tenant=tenant, kind__in=list(kinds))
        .select_related("file_attachment", "created_by")
        .order_by("-created_at", "-id")
    )
    if kind:
        queryset = queryset.filter(kind=kind)
    if status:
        queryset = queryset.filter(status=status)
    return queryset


def job_for(*, tenant: Any, job_id: Any) -> ImportJob | None:
    """Scoped by tenant, so another tenant's id is simply not found (§19)."""
    try:
        return (
            ImportJob.objects.select_related("file_attachment", "created_by", "tenant")
            .filter(tenant=tenant, pk=job_id)
            .first()
        )
    except (ValueError, TypeError):
        return None
