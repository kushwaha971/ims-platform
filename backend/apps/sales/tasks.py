"""Job handlers owned by the sales app (Part 26 §26.17)."""

from __future__ import annotations

from typing import Any

from apps.common.jobs import job_handler


@job_handler("sales.refresh_overdue", requires_tenant=False, timeout_seconds=600)
def refresh_overdue(job: Any, ctx: Any) -> dict:
    """SAL-08 BR-2 — the nightly `overdue` derivation (00:15 IST, `SCHEDULES`)."""
    from apps.sales.services.overdue import refresh_overdue as refresh

    return refresh()
