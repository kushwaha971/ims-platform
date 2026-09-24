"""`manage.py run_scheduler` — the job runner (ADR-012, Part 20 §20.8.6).

The concurrency model is Part 20 §20.8.6.1, normative and stated only there:

* **S1** Job claiming is `FOR UPDATE SKIP LOCKED` and nothing else. Any number of
  runners may run simultaneously; each claims a disjoint batch; a long job blocks
  nothing. There is no lock around the tick and no lock around execution.
* **S2** One advisory lock, around the periodic-enqueue step only. A runner that
  does not get it skips that step and proceeds straight to claiming — it never
  returns early and never waits.
* **S3** Periodic work fans out as child jobs, never as a loop inside one handler.
* **S4** A job that never ran is an alert (`platform.check_expected_runs`).
"""

from __future__ import annotations

import logging
import signal
import threading
import time
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand

from apps.common.jobs import (
    advisory_lock,
    claim_jobs,
    materialise_due_schedules,
    new_worker_id,
    reap_stuck_jobs,
    run_job,
)

logger = logging.getLogger("ub.jobs")


class Command(BaseCommand):
    help = "Claim and execute platform_job rows. The whole background system (ADR-012)."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument(
            "--interval",
            type=int,
            default=None,
            help="Seconds to sleep when the queue is empty. 0 = drain once and exit.",
        )
        parser.add_argument("--batch", type=int, default=None)
        parser.add_argument(
            "--job-types",
            nargs="*",
            default=None,
            help="Restrict this runner to some job types (queue partitioning).",
        )
        parser.add_argument(
            "--max-runtime",
            type=int,
            default=0,
            help="Exit after N seconds. Used by cron to bound a run.",
        )
        parser.add_argument(
            "--loop",
            action="store_true",
            help=(
                "Run continuously, sleeping --interval between empty ticks. This is "
                "the default when --interval is not 0; the flag exists so the compose "
                "scheduler service can state its intent explicitly."
            ),
        )

    def handle(self, *args: Any, **opts: Any) -> None:
        interval = opts["interval"]
        if interval is None:
            interval = settings.UB_SCHEDULER_INTERVAL
        if opts["loop"] and interval == 0:
            # --loop and --interval 0 contradict each other; --loop wins, because
            # a long-lived service asked for it.
            interval = settings.UB_SCHEDULER_INTERVAL or 15
        batch = opts["batch"] or settings.UB_SCHEDULER_BATCH
        worker = new_worker_id()
        stop = _install_signal_handlers()
        deadline = time.monotonic() + opts["max_runtime"] if opts["max_runtime"] else None

        logger.info("scheduler.started", extra={"worker": worker, "interval": interval})

        while not stop.is_set():
            reap_stuck_jobs(worker)  # visibility timeout (§20.8.8)

            # S2: the ONLY serialised step. Non-blocking, released in the same tick.
            with advisory_lock(settings.UB_SCHEDULER_ENQUEUE_LOCK_ID, blocking=False) as held:
                if held:
                    created = materialise_due_schedules()
                    if created:
                        logger.info("scheduler.materialised", extra={"materialised": created})

            jobs = claim_jobs(batch=batch, worker=worker, job_types=opts["job_types"])
            for job in jobs:
                run_job(job, worker=worker)

            if deadline and time.monotonic() > deadline:
                break
            if not jobs:
                if interval == 0:
                    break  # cron mode: drain once and exit
                stop.wait(interval)

        logger.info("scheduler.stopped", extra={"worker": worker})


def _install_signal_handlers() -> threading.Event:
    """SIGTERM/SIGINT → finish the current job, then exit."""
    stop = threading.Event()

    def _handler(signum: int, frame: Any) -> None:
        logger.info("scheduler.signal", extra={"signal": signum})
        stop.set()

    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            signal.signal(sig, _handler)
        except ValueError:  # pragma: no cover - not the main thread (tests)
            pass
    return stop
