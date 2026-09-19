"""`manage.py recalc_balances` — replay the ledger into `parties_party.balance`.

Part 21 §21.1 rule 3 makes the balance a cache: `Σ amount WHERE direction='debit'
AND status='posted' − Σ amount WHERE direction='credit' AND status='posted'`.
This command is its full replay and the companion of the nightly
`parties.recalc_balances` job (Part 20 §20.8.4).

Sprint 0 ships the command shell: the flags, the chunking, the `--apply` gate and
the report format are fixed now so the sprint that builds `ledger_entry`
(`LED-01`, Sprint 2) adds the replay body and nothing else. Running it today
reports that there is nothing to replay, which is true.
"""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand


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
        self.stdout.write(
            "recalc_balances: ledger_entry does not exist yet (LED-01, Sprint 2). "
            "Nothing to replay."
        )
