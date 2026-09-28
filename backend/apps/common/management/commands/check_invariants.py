"""`manage.py check_invariants` — the read-only drift report (Part 20 §20.11.5).

Compares the caches against their replays and *never writes a correction*: per
party, `balance` against the ledger sum (`ledger.selectors.drift`); per
`(item_id, location_id)`, the cached `on_hand` / `avg_cost` and every movement
row's derived pair against the replay (`inventory.selectors.drift`). Exit code
0 = clean, 1 = drift found, so the restore runbook, CI and an operator can bind
to it.

Until Sprint 12 this was the Sprint 0 shell: it printed "the ledger and stock
tables do not exist yet … 0 violations" and exited 0 — long after both tables
existed — so the restore runbook's "verify the data before letting users in"
step would have passed a corrupted restore. The replays are imported inside
`handle` because `common` depends on no other app at module level (rule D1);
this command is an operator surface, not something any app imports.
"""

from __future__ import annotations

import sys
from typing import Any

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Report cache-versus-ledger drift. Read-only. Exit 1 when drift is found."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument("--tenant", default=None, help="Restrict to one tenant id.")

    def handle(self, *args: Any, **opts: Any) -> None:
        from apps.inventory.selectors.drift import stock_drift
        from apps.ledger.selectors.drift import balance_drift

        tenant = opts.get("tenant") or None
        balances = balance_drift(tenant_id=tenant)
        stock = stock_drift(tenant_id=tenant)
        for row in balances:
            self.stdout.write(
                f"balance drift  party {row.party_id}  cached {row.cached}  ledger {row.replayed}"
            )
        for row in stock:
            self.stdout.write(
                f"stock drift    item {row.item_id} @ {row.location_id}  "
                f"on_hand {row.cached_on_hand}/{row.replay_on_hand}  "
                f"avg_cost {row.cached_avg_cost}/{row.replay_avg_cost}  bad_rows {row.bad_rows}"
            )
        total = len(balances) + len(stock)
        summary = f"check_invariants: {len(balances)} balance and {len(stock)} stock violation(s)."
        if total:
            self.stdout.write(self.style.WARNING(summary))
            sys.exit(1)
        self.stdout.write(self.style.SUCCESS(summary))
