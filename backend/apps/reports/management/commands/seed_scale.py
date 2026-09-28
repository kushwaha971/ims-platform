"""`manage.py seed_scale` — a launch-scale merchant book for the performance run.

    python manage.py seed_scale --entries 100000 --parties 2000 --items 5000 --invoices 20000

Creates a NEW tenant (and its owner sign-in, printed at the end) and writes the
book through `apps.reports.services.scale_seed` — bulk inserts that keep every
invariant the posting services keep, so `check_invariants` passes on it (Part 12
§12.8 "balance-drift and stock-drift jobs clean on the seeded 100,000-row
dataset"). `--check` runs that proof straight after seeding.

Refused with DEBUG off unless `--force`, like `seed_demo_tenant`: a seed that
runs in production is a data incident.
"""

from __future__ import annotations

import json
from typing import Any

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Seed one tenant at launch scale (bulk, invariant-preserving). Refused in prod."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument("--entries", type=int, default=100_000, help="Ledger lines in total.")
        parser.add_argument("--parties", type=int, default=2_000)
        parser.add_argument("--items", type=int, default=5_000)
        parser.add_argument("--invoices", type=int, default=20_000)
        parser.add_argument("--days", type=int, default=365, help="History length.")
        parser.add_argument(
            "--heavy-party-entries",
            type=int,
            default=5_000,
            help="Manual lines on one customer, for the 5,000-entry statement budget.",
        )
        parser.add_argument("--seed", type=int, default=20260928)
        parser.add_argument("--email", default="scale@digikhaato.test")
        parser.add_argument("--password", default="Scale-Run-2026!")
        parser.add_argument("--check", action="store_true", help="Run check_invariants after.")
        parser.add_argument("--force", action="store_true")

    def handle(self, *args: Any, **opts: Any) -> None:
        if not settings.DEBUG and not opts["force"]:
            raise CommandError(
                "seed_scale refuses to run with DEBUG=0. Pass --force if you mean it."
            )
        if min(opts["parties"], opts["items"]) < 10 or opts["invoices"] < 0:
            raise CommandError("--parties and --items must be at least 10.")
        from apps.reports.services.scale_seed import seed_scale

        result = seed_scale(
            entries=opts["entries"],
            parties=opts["parties"],
            items=opts["items"],
            invoices=opts["invoices"],
            days=opts["days"],
            heavy_party_entries=opts["heavy_party_entries"],
            seed=opts["seed"],
            email=opts["email"],
            password=opts["password"],
            log=lambda line: self.stdout.write(f"  {line}"),
        )
        self.stdout.write(self.style.SUCCESS(json.dumps(result, indent=2)))
        if opts["check"]:
            call_command("check_invariants", tenant=result["tenant_id"], stdout=self.stdout)
