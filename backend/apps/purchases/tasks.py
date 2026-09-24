"""Job handlers owned by the purchases app (Part 26 §26.17).

A handler is registered with `@job_handler`, takes `(job, ctx)`, returns a
small JSON-serialisable dict or None, is idempotent, and calls services
rather than reimplementing them.
"""

from __future__ import annotations

from typing import Any

from apps.common.jobs import job_handler


@job_handler("purchases.refresh_overdue", requires_tenant=False, timeout_seconds=600)
def refresh_overdue(job: Any, ctx: Any) -> dict:
    """PUR-01 FR-10 — the nightly `overdue` derivation (00:15 IST, `SCHEDULES`)."""
    from apps.purchases.services.overdue import refresh_overdue as refresh

    return refresh()
