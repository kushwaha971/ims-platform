"""`platform_job` — the background-work queue (Part 21 §21.3.1, Part 20 §20.8.2).

ADR-012 admits no broker: asynchronous work is rows in this table, claimed by
`manage.py run_scheduler`.
"""

from __future__ import annotations

from django.db import models

from apps.common.constants import JobStatus
from apps.common.db.fields import uuid7_pk
from apps.common.models import TimeStampedModel


class Job(TimeStampedModel):
    """The twenty-one columns of Part 21 §21.3.1."""

    id = uuid7_pk()
    tenant = models.ForeignKey(
        "platform.Tenant", on_delete=models.RESTRICT, null=True, blank=True, related_name="jobs"
    )
    job_type = models.CharField(max_length=64)
    payload = models.JSONField(default=dict)
    status = models.CharField(max_length=12, choices=JobStatus.choices, default=JobStatus.QUEUED)
    priority = models.SmallIntegerField(default=100)
    run_after = models.DateTimeField()
    attempts = models.SmallIntegerField(default=0)
    max_attempts = models.SmallIntegerField(default=5)
    locked_at = models.DateTimeField(null=True, blank=True)
    locked_by = models.CharField(max_length=64, null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    result = models.JSONField(null=True, blank=True)
    error = models.TextField(null=True, blank=True)
    idempotency_token = models.CharField(max_length=128, null=True, blank=True)
    scheduled_key = models.CharField(max_length=96, null=True, blank=True)
    created_by = models.ForeignKey(
        "platform.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )

    class Meta:
        db_table = "platform_job"
        verbose_name = "job"
        verbose_name_plural = "jobs"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(attempts__gte=0)
                & models.Q(attempts__lte=models.F("max_attempts") + 1),
                name="ck_job_attempts",
            ),
            # Deduplication: one live job per token (Part 20 §20.8.9).
            models.UniqueConstraint(
                fields=["tenant", "job_type", "idempotency_token"],
                condition=models.Q(idempotency_token__isnull=False)
                & models.Q(status__in=["queued", "running", "succeeded"]),
                name="uq_job_idem",
            ),
            # Recurring jobs: one row per job type per period, ever. This is the
            # whole of the distributed-cron implementation — the second runner's
            # INSERT simply fails.
            models.UniqueConstraint(
                fields=["scheduled_key"],
                condition=models.Q(scheduled_key__isnull=False),
                name="uq_job_scheduled",
            ),
        ]
        indexes = [
            # The claim query's index. Partial, because only queued rows are claimed.
            models.Index(
                fields=["priority", "run_after", "created_at"],
                condition=models.Q(status="queued"),
                name="ix_job_claim",
            ),
            # Visibility-timeout sweep.
            models.Index(
                fields=["locked_at"], condition=models.Q(status="running"), name="ix_job_stuck"
            ),
            # Operator dashboards (Part 30 §30.6).
            models.Index(fields=["tenant", "-created_at"], name="ix_job_tenant_recent"),
            models.Index(fields=["status", "-created_at"], name="ix_job_status_recent"),
        ]

    def __str__(self) -> str:
        return f"{self.job_type}:{self.status}"
