"""The nightly stock-integrity check, as one callable (Part 12 §12.5 "zero stock
drift"; Part 21 §21.3.6 (7); Part 42 BE-03).

`check_stock()` is what the `inventory.recalc_stock` job handler returns and
what `platform.check_invariants` binds to. It reads only, never corrects, and
returns a small JSON-serialisable summary: per `(item, location)` the cached
on-hand, average and exact stock value against a from-scratch replay, and every
movement row's running figures against the replay's value at that row. A drift
is a bug report — logged at ERROR and left in place for an operator to read
before `manage.py recalc_stock --apply`.
"""

from __future__ import annotations

import logging
import time
from typing import Any

logger = logging.getLogger("ub.inventory")

#: How many drifted pairs the summary lists.
SAMPLE = 20


def check_stock(*, tenant_id: Any = None, item_id: Any = None) -> dict:
    """`{"check": "stock", "ok", "checked", "drifted", "bad_rows", "sample", "ms"}`."""
    from apps.inventory.selectors.drift import stock_drift_counted

    started = time.monotonic()
    checked, drifted = stock_drift_counted(tenant_id=tenant_id, item_id=item_id)
    summary = {
        "check": "stock",
        "ok": not drifted,
        "checked": checked,
        "drifted": len(drifted),
        "bad_rows": sum(d.bad_rows for d in drifted),
        "sample": [
            {
                "item_id": str(d.item_id),
                "location_id": str(d.location_id),
                "cached": [
                    str(d.cached_on_hand),
                    str(d.cached_avg_cost),
                    str(d.cached_stock_value),
                ],
                "replay": [
                    str(d.replay_on_hand),
                    str(d.replay_avg_cost),
                    str(d.replay_stock_value),
                ],
                "bad_rows": d.bad_rows,
            }
            for d in drifted[:SAMPLE]
        ],
        "ms": round((time.monotonic() - started) * 1000),
    }
    if drifted:
        logger.error("inventory.stock_drift", extra={"drifted": len(drifted), "checked": checked})
    return summary
