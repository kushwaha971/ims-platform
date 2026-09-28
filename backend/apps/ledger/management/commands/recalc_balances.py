"""`manage.py recalc_balances` — replay the ledger into `parties_party.balance`.

Part 21 §21.1 rule 3 makes the balance a cache, and a cache nobody can rebuild
is a number nobody can trust. This command is its full replay and the companion
of the nightly `parties.recalc_balances` job (Part 20 §20.8.4).

Report-only by default. `--apply` is the gate, and it is a gate rather than a
default because a drift report is a BUG REPORT: a party whose cache disagrees
with its ledger means something wrote the balance without the entry that
justifies it, and quietly correcting the number destroys the only evidence of
how it happened. The default run prints the drift and changes nothing, so an
operator reads it before they decide.

The formula is `ledger.selectors.entry.SIGNED_AMOUNT`, imported rather than
restated. A replay written from the same prose as the thing it checks is not a
check; it is a second chance to make the same mistake.

── Why this command lives in `ledger` and not in `parties` ──────────────────
It was in `common` while there was nothing to replay, which was fine for a shell
and wrong the moment it had a body: `common` depends on nothing (rule D1) and
this reads two apps' tables. `parties` cannot hold it either — Part 20 §20.1.4
has `ledger` depending on `parties` and not the reverse. The ledger is the side
that may know about both, and replaying the ledger into a cache is ledger work.
"""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.common.money import ZERO
from apps.ledger.selectors.drift import iter_balance_drift
from apps.parties.models import Party


class Command(BaseCommand):
    help = "Recompute party balances from ledger_entry. Report-only unless --apply."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument("--tenant", default=None, help="Restrict to one tenant id.")
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Write the recomputed values. Without it the command only reports drift.",
        )
        parser.add_argument("--chunk", type=int, default=1000)

    def handle(self, *args: Any, **opts: Any) -> None:
        # The replay is `ledger.selectors.drift` — one correlated subquery, shared
        # with the nightly `parties.recalc_balances` job so the two cannot disagree.
        checked = drifted = 0
        for party, moved in iter_balance_drift(tenant_id=opts["tenant"], chunk=int(opts["chunk"])):
            checked += 1
            computed = party.computed or ZERO
            if not moved:
                continue
            drifted += 1
            self.stdout.write(
                f"drift  {party.id}  {party.name[:40]:<40}  "
                f"cached {party.balance}  ledger {computed}"
            )
            if not opts["apply"]:
                continue
            with transaction.atomic():
                # Re-read under a lock: the report above ran outside one, and a
                # party that took an entry between the read and this write would
                # otherwise be "corrected" to a figure that is already stale.
                locked = Party.all_objects.select_for_update().get(pk=party.pk)
                locked.balance = computed
                locked.receivable_total = max(computed, ZERO)
                locked.payable_total = max(-computed, ZERO)
                locked.save(
                    update_fields=[
                        "balance",
                        "receivable_total",
                        "payable_total",
                        "updated_at",
                    ]
                )

        verb = "corrected" if opts["apply"] else "found"
        self.stdout.write(
            self.style.SUCCESS(f"recalc_balances: {checked} parties checked, {drifted} {verb}.")
            if not drifted
            else self.style.WARNING(
                f"recalc_balances: {checked} parties checked, {drifted} {verb}."
            )
        )
