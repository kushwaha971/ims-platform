"""`manage.py scheduler_health` — the scheduler container's health check.

Exit 0 when a runner has claimed or completed something recently, or when the
queue has simply been empty; exit 1 when there is due work that nothing has
touched inside `--max-age` seconds. A scheduler process that is alive but wedged
is the failure this catches, and a liveness probe on the process alone would not.
"""

from __future__ import annotations

import datetime as dt
import sys
from typing import Any

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.common.constants import JobStatus


class Command(BaseCommand):
    help = "Exit 1 when due jobs have been sitting unclaimed for longer than --max-age."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument("--max-age", type=int, default=300, help="Seconds.")

    def handle(self, *args: Any, **opts: Any) -> None:
        from apps.platform_app.models import Job

        cutoff = timezone.now() - dt.timedelta(seconds=opts["max_age"])
        stale = Job.objects.filter(status=JobStatus.QUEUED, run_after__lt=cutoff).count()
        if stale:
            self.stderr.write(f"{stale} job(s) due for more than {opts['max_age']}s and unclaimed")
            sys.exit(1)
        self.stdout.write("ok")
