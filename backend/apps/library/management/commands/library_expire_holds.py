"""`manage.py library_expire_holds --tenant <id> [--date YYYY-MM-DD]` (LIB-08 BR-4, T-LIB-08 e2e).

Runs a day's hold expiry INLINE for one tenant: the job's idempotency keeps a
succeeded day from being enqueued again, and the operator reaching for this is
recovering one. Idempotent: a second run for the date expires nothing more.
"""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Expire uncollected library holds for one tenant and date (idempotent)."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument("--tenant", required=True, help="Tenant id (uuid)")
        parser.add_argument("--date", help="The tenant-local date; default today there")

    def handle(self, *args: Any, **options: Any) -> None:
        from apps.common.dates import tenant_today
        from apps.common.tenancy import TenantContext
        from apps.library.services.holds import expire_holds
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
            report = expire_holds(tenant=tenant, today=today)
        self.stdout.write(json.dumps(report))
