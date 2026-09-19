"""`manage.py recalc_stock` — replay `inventory_stock_movement` into the cache.

The replay is a pure function of the immutable columns (Part 21 §21.3.6 (6)):
start from `(on_hand, avg) = (0, 0)`, walk the movements of one
`(item_id, location_id)` in the canonical `(movement_date, sequence_no)` order,
apply the incremental step of §21.3.6 (2) to each, write each row's
`avg_cost_after` / `on_hand_after`, then write the final pair to
`inventory_item_stock` and set `cost_state = 'current'`.

Sprint 0 ships the command shell; `INV-06` (Sprint 5) adds the replay body.
"""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Recompute on-hand and weighted-average cost from stock movements."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument("--tenant", default=None, help="Restrict to one tenant id.")
        parser.add_argument("--item", default=None, help="Restrict to one item id.")
        parser.add_argument("--apply", action="store_true", help="Write the recomputed values.")

    def handle(self, *args: Any, **opts: Any) -> None:
        self.stdout.write(
            "recalc_stock: inventory_stock_movement does not exist yet (INV-06, Sprint 5). "
            "Nothing to replay."
        )
