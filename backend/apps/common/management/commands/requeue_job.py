"""`manage.py requeue_job <id>` — the operator's dead-letter escape hatch.

Part 20 §20.8.8: a dead-lettered job is never retried automatically. An operator
requeues it here, which resets `status`, `attempts` and `error` and writes an
audit row.
"""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.common.constants import JobStatus


class Command(BaseCommand):
    help = "Requeue a dead-lettered job."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument("job_id")
        parser.add_argument("--yes", action="store_true", help="Skip the dry run.")

    @transaction.atomic
    def handle(self, *args: Any, **opts: Any) -> None:
        from apps.common.audit import AuditAction, write_audit
        from apps.common.context import Ctx
        from apps.platform_app.models import Job

        try:
            job = Job.objects.select_for_update().get(pk=opts["job_id"])
        except (Job.DoesNotExist, ValueError, TypeError) as exc:
            raise CommandError(f"No job {opts['job_id']!r}.") from exc

        if not opts["yes"]:
            self.stdout.write(
                f"Would requeue {job.job_type} ({job.status}, {job.attempts} attempts). "
                f"Re-run with --yes."
            )
            return

        Job.objects.filter(pk=job.pk).update(
            status=JobStatus.QUEUED,
            attempts=0,
            error=None,
            locked_at=None,
            locked_by=None,
            finished_at=None,
        )
        if job.tenant_id:
            write_audit(
                ctx=Ctx.system(job.tenant),
                action=AuditAction.JOB_REQUEUED,
                entity_type="platform_job",
                entity_id=job.id,
                before={"status": job.status, "attempts": job.attempts},
                after={"status": JobStatus.QUEUED.value, "attempts": 0},
            )
        self.stdout.write(f"Requeued {job.job_type}.")
