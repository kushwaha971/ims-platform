"""The nightly balance-integrity check, as one callable (Part 12 §12.5 "zero
balance drift"; Part 42 BE-03 — the correctness guarantee needs a scheduled job).

`check_balances()` is what the scheduler binds to (the `parties.recalc_balances`
and `platform.check_invariants` handlers); it reads only, never corrects, and
returns a small JSON-serialisable summary. A drift is a bug report: it is logged
at ERROR and left in place for an operator to read before
`manage.py recalc_balances --apply`.
"""

from __future__ import annotations

import logging
import time
from typing import Any

logger = logging.getLogger("ub.ledger")

#: How many drifted parties the summary lists — by id, never by name (PII).
SAMPLE = 20


def check_balances(*, tenant_id: Any = None) -> dict:
    """`{"check": "balances", "ok", "checked", "drifted", "split_mismatch", "sample", "ms"}`."""
    from apps.ledger.selectors.drift import balance_drift

    started = time.monotonic()
    checked, drifted = balance_drift(tenant_id=tenant_id)
    summary = {
        "check": "balances",
        "ok": not drifted,
        "checked": checked,
        "drifted": len(drifted),
        "split_mismatch": sum(1 for d in drifted if d.split_mismatch),
        "sample": [
            {
                "tenant_id": str(d.tenant_id),
                "party_id": str(d.party_id),
                "cached": str(d.cached_balance),
                "ledger": str(d.ledger_balance),
            }
            for d in drifted[:SAMPLE]
        ],
        "ms": round((time.monotonic() - started) * 1000),
    }
    if drifted:
        logger.error("ledger.balance_drift", extra={"drifted": len(drifted), "checked": checked})
    return summary
