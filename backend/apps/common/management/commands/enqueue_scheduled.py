"""`manage.py enqueue_scheduled` — materialise due recurring jobs and exit.

The cron form of the S2 step (Part 20 §20.8.6.1). On a VPS without compose, cron
calls this rather than running the loop.
"""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand

from apps.common.jobs import SCHEDULES, advisory_lock, materialise_due_schedules


class Command(BaseCommand):
    help = "Insert one platform_job row per due schedule. Safe to run concurrently."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument("--period", choices=["hourly", "daily", "weekly", "all"], default="all")

    def handle(self, *args: Any, **opts: Any) -> None:
        wanted = opts["period"]
        if wanted != "all":
            selected = [s for s in SCHEDULES if s.period == wanted]
            if not selected:
                self.stdout.write(f"No schedules with period {wanted!r}.")
                return
        with advisory_lock(settings.UB_SCHEDULER_ENQUEUE_LOCK_ID, blocking=False) as held:
            if not held:
                self.stdout.write("Another runner holds the enqueue lock; nothing to do.")
                return
            created = materialise_due_schedules()
        self.stdout.write(f"Materialised {created} scheduled job(s).")
