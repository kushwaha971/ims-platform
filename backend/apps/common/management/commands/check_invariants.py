"""`manage.py check_invariants` — the read-only drift report (Part 20 §20.11.5).

Compares the caches against their replays and *never writes a correction*: per
`(item_id, location_id)` the cached `on_hand`, `avg_cost` and exact
`stock_value` against a from-scratch replay, and every movement row's running
figures against the replay's value at that row; per party, `balance` (and its
receivable / payable split) against the ledger sum.

Exit code: 0 = clean, 1 = drift found — CI and the nightly job bind to it. The
two checks are the callables the scheduler also uses,
`apps.inventory.services.integrity.check_stock` and
`apps.ledger.services.integrity.check_balances`. Imported inside `handle`,
because `common` depends on nothing at module level (rule D1).
"""

from __future__ import annotations

import json
import sys
from typing import Any

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Report cache-versus-ledger drift. Read-only. Exit 1 when drift is found."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument("--tenant", default=None, help="Restrict to one tenant id.")
        parser.add_argument("--json", action="store_true", help="Print the summaries as JSON.")

    def handle(self, *args: Any, **opts: Any) -> None:
        from apps.inventory.services.integrity import check_stock
        from apps.ledger.services.integrity import check_balances

        summaries = [
            check_balances(tenant_id=opts["tenant"]),
            check_stock(tenant_id=opts["tenant"]),
        ]
        if opts["json"]:
            self.stdout.write(json.dumps(summaries, indent=2))
        else:
            for s in summaries:
                line = (
                    f"check_invariants: {s['check']}: {s['checked']} checked, "
                    f"{s['drifted']} drifted ({s['ms']} ms)."
                )
                self.stdout.write(self.style.SUCCESS(line) if s["ok"] else self.style.WARNING(line))
        if not all(s["ok"] for s in summaries):
            sys.exit(1)
