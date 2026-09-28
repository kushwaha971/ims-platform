"""`manage.py recalc_stock` — replay `inventory_stock_movement` into the cache.

Report-only by default, like `recalc_balances`: a drift is a bug report, and
quietly correcting it destroys the only evidence of how it happened. `--apply`
rewrites `inventory_item_stock` (on-hand, average, sequence high-water mark)
from the replay, under the row lock.

It cannot "fix" a movement row's own `on_hand_after` / `avg_cost_after`: the
trigger forbids every UPDATE on that table, deliberately. Under
CR-2026-09-24-INV-A those columns are written once, by the same costing step
the replay uses, so a bad row means the writer itself is wrong and is reported
as such — the code is what needs correcting, not the history.

`--check` (H3) is the CI / cron form: never writes, prints the same lines, and
exits 1 when anything drifted. The comparison — on-hand, average and the exact
carried stock value, per cache row and per movement row — is
`inventory.selectors.drift`, shared with the nightly job's
`apps.inventory.services.integrity.check_stock`.

Moved here from `common` when it gained a body: it reads inventory tables, and
`common` depends on nothing (rule D1).
"""

from __future__ import annotations

import sys
from typing import Any

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.inventory.models import ItemStock
from apps.inventory.selectors.drift import stock_drift


class Command(BaseCommand):
    help = "Recompute on-hand and weighted-average cost from stock movements. Report-only unless --apply."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument("--tenant", default=None, help="Restrict to one tenant id.")
        parser.add_argument("--item", default=None, help="Restrict to one item id.")
        parser.add_argument("--apply", action="store_true", help="Write the recomputed values.")
        parser.add_argument(
            "--check",
            action="store_true",
            help="Report only, never write, and exit 1 when anything drifted.",
        )

    def handle(self, *args: Any, **opts: Any) -> None:
        if opts["apply"] and opts["check"]:
            raise CommandError("--check never writes; it cannot be combined with --apply.")
        drift = stock_drift(tenant_id=opts["tenant"], item_id=opts["item"])
        for d in drift:
            self.stdout.write(
                f"drift  item {d.item_id}  cached {d.cached_on_hand} @ {d.cached_avg_cost} "
                f"= {d.cached_stock_value}  replay {d.replay_on_hand} @ {d.replay_avg_cost} "
                f"= {d.replay_stock_value}  bad rows {d.bad_rows}"
            )
            if opts["apply"] and d.stock_id is not None:
                with transaction.atomic():
                    ItemStock.objects.select_for_update().filter(pk=d.stock_id).update(
                        on_hand=d.replay_on_hand,
                        avg_cost=d.replay_avg_cost,
                        stock_value=d.replay_stock_value,
                        last_sequence_no=d.replay_last_sequence_no,
                    )
        verb = "corrected" if opts["apply"] else "found"
        message = f"recalc_stock: {len(drift)} drifted {verb}."
        self.stdout.write(self.style.SUCCESS(message) if not drift else self.style.WARNING(message))
        if opts["check"] and drift:
            sys.exit(1)
