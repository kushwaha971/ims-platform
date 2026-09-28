"""Job handlers owned by the inventory app (Part 26 §26.17).

A handler takes `(job, ctx)`, returns a small JSON-serialisable dict, is
idempotent, and calls services rather than reimplementing them.
"""

from __future__ import annotations

import logging
from typing import Any

from apps.common.jobs import job_handler

logger = logging.getLogger("ub.inventory")


@job_handler("inventory.low_stock_notify", timeout_seconds=60)
def low_stock_notify(job: Any, ctx: Any) -> dict:
    """INV-07 FR-3 — hand one crossing to the registered sinks.

    Idempotent twice over: the enqueue is deduplicated on `low_stock:<alert id>`,
    and `deliver_alert` returns early once `notified_at` is set (BR-3).
    """
    from apps.inventory.services.low_stock import deliver_alert

    return deliver_alert(job.payload.get("alert_id"))


@job_handler("inventory.scan_low_stock", requires_tenant=False, timeout_seconds=600)
def scan_low_stock(job: Any, ctx: Any) -> dict:
    """INV-07 FR-5 — the nightly belt-and-braces evaluation (01:00 IST).

    Idempotent because the crossing is stored: a second run finds every item at
    the level the first run left it, and writes nothing.
    """
    from apps.inventory.services.low_stock import scan_low_stock as scan

    return scan()


@job_handler("inventory.recalc_stock", requires_tenant=False, timeout_seconds=1800)
def recalc_stock(job: Any, ctx: Any) -> dict:
    """The nightly drift report (03:10 IST). Report-only: it never corrects.

    A drift is a bug report — something wrote a cache without the movement that
    justifies it — and quietly fixing the number destroys the evidence. The
    operator runs `manage.py recalc_stock --apply` after reading it.
    """
    from apps.inventory.services.integrity import check_stock

    return check_stock()
