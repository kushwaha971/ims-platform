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

Since A2 (ADR-043) it replays all THREE party caches — `balance` (the `main` and
`loan` buckets), `loan_balance` and `deposit_held` — through
`ledger.selectors.drift`, so a party whose balance agrees but whose loan or
deposit figure does not is still reported, and `--apply` writes all three.

── Why this command lives in `ledger` and not in `parties` ──────────────────
It was in `common` while there was nothing to replay, which was fine for a shell
and wrong the moment it had a body: `common` depends on nothing (rule D1) and
this reads two apps' tables. `parties` cannot hold it either — Part 20 §20.1.4
has `ledger` depending on `parties` and not the reverse. The ledger is the side
that may know about both, and replaying the ledger into a cache is ledger work.

── `--check` (H3) ─────────────────────────────────────────────────────────────
The CI / cron form: never writes, prints the same drift lines, and exits 1 when
anything drifted (0 when clean), so a pipeline can gate on it. The comparison
is `ledger.selectors.drift`, shared with the nightly job's
`apps.ledger.services.integrity.check_balances`.
"""

from __future__ import annotations

import sys
from typing import Any

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.common.money import ZERO
from apps.ledger.selectors.drift import drift_of, iter_balances
from apps.parties.models import Party


class Command(BaseCommand):
    help = (
        "Recompute party balances from ledger_entry. Report-only unless --apply; "
        "--check exits 1 on drift."
    )

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument("--tenant", default=None, help="Restrict to one tenant id.")
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Write the recomputed values. Without it the command only reports drift.",
        )
        parser.add_argument(
            "--check",
            action="store_true",
            help="Report only, never write, and exit 1 when any party drifted.",
        )
        parser.add_argument("--chunk", type=int, default=1000)

    def handle(self, *args: Any, **opts: Any) -> None:
        if opts["apply"] and opts["check"]:
            raise CommandError("--check never writes; it cannot be combined with --apply.")
        apply = opts["apply"]
        checked = drifted = 0
        for party, computed in iter_balances(tenant_id=opts["tenant"], chunk=opts["chunk"]):
            checked += 1
            drift = drift_of(party, computed)
            if drift is None:
                continue
            drifted += 1
            line = (
                f"drift  {party.id}  {party.name[:40]:<40}  "
                f"cached {party.balance}  ledger {computed.balance}"
            )
            if "loan_balance" in drift.figures:
                line += f"  loan cached {party.loan_balance} ledger {computed.loan_balance}"
            if "deposit_held" in drift.figures:
                line += f"  deposit cached {party.deposit_held} ledger {computed.deposit_held}"
            self.stdout.write(line)
            if not apply:
                continue
            with transaction.atomic():
                # Re-read under a lock: the report above ran outside one, and a
                # party that took an entry between the read and this write would
                # otherwise be "corrected" to a figure that is already stale.
                locked = Party.all_objects.select_for_update().get(pk=party.pk)
                locked.balance = computed.balance
                locked.receivable_total = max(computed.balance, ZERO)
                locked.payable_total = max(-computed.balance, ZERO)
                locked.loan_balance = computed.loan_balance
                locked.deposit_held = computed.deposit_held
                locked.save(
                    update_fields=[
                        "balance",
                        "receivable_total",
                        "payable_total",
                        "loan_balance",
                        "deposit_held",
                        "updated_at",
                    ]
                )

        verb = "corrected" if apply else "found"
        message = f"recalc_balances: {checked} parties checked, {drifted} {verb}."
        self.stdout.write(
            self.style.SUCCESS(message) if not drifted else self.style.WARNING(message)
        )
        if opts["check"] and drifted:
            sys.exit(1)
