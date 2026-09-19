"""`manage.py check_invariants` — the read-only drift report (Part 20 §20.11.5).

Compares the caches against their replays and *never writes a correction*: per
`(item_id, location_id)` the cached `on_hand` against `SUM(qty)`, the cached
`avg_cost` against the replay's final average, and every movement row's derived
pair against the replay's value at that row; per party, `balance` against the
ledger sum. Rows whose `cost_state = 'stale'` are excluded and counted
separately, and a row stale for longer than fifteen minutes is itself a reported
violation (Part 21 §21.3.6 (7)).

Sprint 0 ships the command shell and the exit-code contract (0 = clean,
1 = drift found) so CI and the nightly job can bind to it now.
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
        violations: list[str] = []
        self.stdout.write(
            "check_invariants: the ledger and stock tables do not exist yet "
            "(LED-01 Sprint 2, INV-06 Sprint 5). 0 violations."
        )
        if violations:
            sys.exit(1)
