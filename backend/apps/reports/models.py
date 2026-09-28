"""Models for the reports app.

Read-only projections over other apps' selectors — plus `reports_export`, the
one table this app writes: a file somebody asked for that was too big to stream
in the request (Part 21 §21.3.11, IMP-02 FR-6/FR-7).
"""

from __future__ import annotations

from django.db import models

from apps.common.models import TenantModel


class ExportStatus(models.TextChoices):
    """§17.8.0's export vocabulary, verbatim."""

    QUEUED = "queued", "Queued"
    RUNNING = "running", "Running"
    READY = "ready", "Ready"
    FAILED = "failed", "Failed"
    EXPIRED = "expired", "Expired"


class Export(TenantModel):
    """One queued export (§21.3.11 plus CR-098's accepted columns).

    `params` holds what the scheduler needs to rebuild the file — the list's
    filters, the columns the requester was allowed, the view that owns the
    list and the codename a download re-checks — and, on failure, the error.
    The row survives its file's expiry as history (BR-6).
    """

    report_name = models.CharField(max_length=64)
    #: CR-098 — the list resource for `report_name = 'list:{resource}'`.
    resource = models.CharField(max_length=32, null=True, blank=True)
    params = models.JSONField(default=dict, blank=True)
    format = models.CharField(max_length=8, default="csv")
    status = models.CharField(
        max_length=16, choices=ExportStatus.choices, default=ExportStatus.QUEUED
    )
    file_attachment = models.ForeignKey(
        "files.Attachment", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    row_count = models.IntegerField(null=True, blank=True)
    #: CR-098.
    size_bytes = models.BigIntegerField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "reports_export"
        verbose_name = "export"
        verbose_name_plural = "exports"
        indexes = [
            models.Index(fields=["tenant", "-created_at"], name="ix_export_tenant_created"),
            models.Index(fields=["status", "expires_at"], name="ix_export_status_expires"),
        ]

    def __str__(self) -> str:
        return f"{self.report_name}:{self.id}:{self.status}"
