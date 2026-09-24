"""Job handlers owned by the notifications app (Part 26 §26.17).

A handler is registered with `@job_handler`, takes `(job, ctx)`, returns a
small JSON-serialisable dict or None, is idempotent, and calls services
rather than reimplementing them.
"""

from __future__ import annotations

from typing import Any

from apps.common.jobs import job_handler


@job_handler("platform.purge_notifications", requires_tenant=False, max_attempts=3)
def purge_notifications(job: Any, ctx: Any) -> dict:
    """NTF-01 FR-10 — the weekly sweep `SCHEDULES` already names; 180 days and gone.

    A second run in the same week deletes nothing, because the first deleted
    everything past the cutoff — which is the double-run proof Part 12 §12.8
    asks of every recurring job.
    """
    from apps.notifications.services.notify import purge_old

    return {"deleted": purge_old()}
