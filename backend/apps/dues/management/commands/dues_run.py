"""`manage.py dues_run --tenant <id> --date <YYYY-MM-DD>` (FRD 00 DUE-02 §6, C-15).

Runs the day INLINE rather than enqueueing it: `uq_job_idem` keeps a succeeded
`dues:<tenant>:<date>` job from ever being enqueued again, and the operator who
reaches for this command is recovering a day. The run is idempotent, so running
a day that already succeeded writes nothing. Prints the RunReport as JSON.
"""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Run the dues engine's daily run for one tenant and date (idempotent)."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument("--tenant", required=True, help="Tenant id (uuid)")
        parser.add_argument("--date", help="The tenant-local date to run; default today there")

    def handle(self, *args: Any, **options: Any) -> None:
        from apps.common.dates import tenant_today
        from apps.common.tenancy import TenantContext
        from apps.dues.services.run import run_for_tenant
        from apps.platform_app.models import Tenant

        tenant = Tenant.objects.filter(pk=options["tenant"]).first()
        if tenant is None:
            raise CommandError(f"No tenant {options['tenant']!r}.")
        try:
            today = (
                dt.date.fromisoformat(options["date"])
                if options.get("date")
                else tenant_today(tenant)
            )
        except ValueError as exc:
            raise CommandError(f"--date must be YYYY-MM-DD: {exc}") from None
        with TenantContext(tenant):
            report = run_for_tenant(tenant=tenant, today=today)
        self.stdout.write(json.dumps(report, indent=2))
        if report["errors"]:
            raise CommandError(f"{len(report['errors'])} schedule(s) failed; see the report above.")
