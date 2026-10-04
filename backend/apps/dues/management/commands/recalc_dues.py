"""`manage.py recalc_dues` — replay every due's settled caches from their evidence (DUE-03 BR-5).

The `recalc_balances` pattern: report-only by default, because a drift is a bug report and
correcting the number quietly destroys the evidence of how it happened; `--apply` writes the
recomputed figures; `--check` never writes and exits 1 when anything drifted, for CI and cron.
The comparison is `apps.dues.selectors.integrity.due_drift`, which the replay fuzz shares.
"""

from __future__ import annotations

import sys
from decimal import Decimal
from typing import Any

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.dues.models import DuesDue, DuesDueComponent
from apps.dues.selectors.integrity import due_drift


class Command(BaseCommand):
    help = (
        "Recompute dues' settled caches from dues_settlement and their invoices. "
        "Report-only unless --apply; --check exits 1 on drift."
    )

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument("--tenant", default=None, help="Restrict to one tenant id.")
        parser.add_argument("--apply", action="store_true", help="Write the recomputed values.")
        parser.add_argument(
            "--check", action="store_true", help="Never write; exit 1 when anything drifted."
        )
        parser.add_argument("--chunk", type=int, default=1000)

    def handle(self, *args: Any, **opts: Any) -> None:
        if opts["apply"] and opts["check"]:
            raise CommandError("--check never writes; it cannot be combined with --apply.")
        drifts = list(due_drift(tenant_id=opts["tenant"], chunk=opts["chunk"]))
        for drift in drifts:
            self.stdout.write(
                f"due {drift['due_id']} {drift['field']}: "
                f"cached {drift['cached']} computed {drift['computed']}"
            )
        if opts["apply"] and drifts:
            with transaction.atomic():
                for drift in drifts:
                    value = Decimal(drift["computed"])
                    if drift["field"] == "settled_amount":
                        DuesDue.objects.filter(pk=drift["due_id"]).update(settled_amount=value)
                    else:
                        component = drift["field"].split(".")[1]
                        DuesDueComponent.objects.filter(
                            due_id=drift["due_id"], component=component
                        ).update(settled=value)
        self.stdout.write(f"{len(drifts)} drifted")
        if opts["check"] and drifts:
            sys.exit(1)
