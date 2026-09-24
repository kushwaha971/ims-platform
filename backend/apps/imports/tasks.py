"""Job handlers owned by the imports app (Part 26 §26.17).

Two phases, two jobs (BR-2 "validate then commit, never validate-and-commit").
Both are idempotent by construction — each re-reads the job's status and does
nothing unless the job is in the state that job exists to move it out of — so
the scheduler's retry after a crash can never run an import twice.
"""

from __future__ import annotations

from typing import Any

from apps.common.jobs import job_handler
from apps.imports.constants import JOB_COMMIT, JOB_VALIDATE


@job_handler(JOB_VALIDATE, max_attempts=3, timeout_seconds=600)
def validate_import(job: Any, ctx: Any) -> dict:
    from apps.imports.services.engine import run_validation

    return run_validation(job.payload["job_id"])


# Every failure the handler can SEE is recorded on the import job itself
# (`failed`, the reason, and an Import-again), and is retried by the merchant,
# never blind. The second attempt is for the failure it cannot see: a runner
# killed mid-commit, whose transaction the database has already rolled back —
# the reaper re-queues it and it runs once more from nothing. The timeout is
# FR-12's thirty minutes; 10,000 rows with opening balances take minutes.
@job_handler(JOB_COMMIT, max_attempts=2, timeout_seconds=1800)
def commit_import(job: Any, ctx: Any) -> dict:
    from apps.imports.services.engine import run_commit

    return run_commit(job.payload["job_id"], job.payload.get("actor_id"))
