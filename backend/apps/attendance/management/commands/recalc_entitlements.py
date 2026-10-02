"""`manage.py recalc_entitlements` — replay entitlement uses into `used` (ATT-04 §6).

The `recalc_balances` pattern (ADR-031): report-only by default, `--check`
exits 1 on any drift (for CI and cron), `--apply` writes the replayed figure.
A drift is a bug report — something moved `used` without the use row that
justifies it — so the default prints and changes nothing.
"""

from __future__ import annotations

import sys
from typing import Any

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.attendance.services.integrity import apply_drift, entitlement_drift, marks_out_of_range


class Command(BaseCommand):
    help = (
        "Recompute attendance entitlement `used` from its use rows. Report-only unless "
        "--apply; --check exits 1 on drift."
    )

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument("--tenant", default=None, help="Restrict to one tenant id.")
        parser.add_argument("--apply", action="store_true", help="Write the replayed values.")
        parser.add_argument(
            "--check", action="store_true", help="Never write; exit 1 when anything drifted."
        )

    def handle(self, *args: Any, **opts: Any) -> None:
        if opts["apply"] and opts["check"]:
            raise CommandError("--check never writes; it cannot be combined with --apply.")
        drifts = entitlement_drift(tenant_id=opts["tenant"])
        marks = marks_out_of_range(tenant_id=opts["tenant"])
        for drift in drifts:
            self.stdout.write(
                f"entitlement {drift.entitlement_id} (tenant {drift.tenant_id}): "
                f"used {drift.cached}, replayed {drift.replayed}"
            )
        for mark_id, balance in marks:
            self.stdout.write(f"mark {mark_id}: holds {balance} uses (must be 0 or 1)")
        if opts["apply"] and drifts:
            with transaction.atomic():
                apply_drift(drifts)
            self.stdout.write(f"Rewrote {len(drifts)} entitlement(s).")
        if not drifts and not marks:
            self.stdout.write("Entitlements match their uses.")
        elif opts["check"]:
            sys.exit(1)
