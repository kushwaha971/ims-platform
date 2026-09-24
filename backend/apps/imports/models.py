"""`imports_job` — one uploaded CSV and what became of it (Part 21 §21.3.11, IMP-01).

The table is §21.3.11's columns and nothing else. CCR-17's `options jsonb`,
CR-036's `column_map` and CR-096's mode flags are all deferred behind Part 43
§43.4.6 C5, which asks whether a job carries ONE configuration blob or two and
says "both blocked until decided" — so neither exists here. Nothing in the MVP
importers needs one: there is no column-mapping step and no upsert mode.

`created_by` is the uploader (TenantModel's column), which is also who the
commit runs as (FR-11) — so the audit rows a scheduler writes still name a
person rather than "system".
"""

from __future__ import annotations

from django.db import models

from apps.common.models import TenantModel
from apps.imports.constants import ImportStatus


class ImportJob(TenantModel):
    """`kind` is an open registry value (IMP-01 §15), not a closed enum.

    A kind deregistered by a later release still renders in the history (EC-12);
    only its commit is refused.
    """

    kind = models.CharField(max_length=32)
    file_attachment = models.ForeignKey(
        "files.Attachment",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    status = models.CharField(
        max_length=16, choices=ImportStatus.choices, default=ImportStatus.UPLOADED
    )
    total_rows = models.IntegerField(default=0)
    valid_rows = models.IntegerField(default=0)
    error_rows = models.IntegerField(default=0)
    #: The first 500 row errors, each `{row, column, value, code, message}`.
    errors = models.JSONField(default=list, blank=True)
    #: `progress`, `warnings`, `preview_rows`, `columns`, `summary` and — on
    #: failure — `error`. A bag rather than columns because every kind's summary
    #: differs and the history must keep rendering a kind that no longer exists.
    result = models.JSONField(default=dict, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "imports_job"
        verbose_name = "import job"
        verbose_name_plural = "import jobs"
        indexes = [
            models.Index(fields=["tenant", "-created_at"], name="ix_import_job_tenant_created"),
        ]

    def __str__(self) -> str:
        return f"{self.kind}:{self.id}:{self.status}"
