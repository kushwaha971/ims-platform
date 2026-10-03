"""`manage.py library_recount [--tenant <id>]` — re-derive the title caches (LIB-02 BR-6).

`copies_total` and `copies_available` move one copy at a time in
`services.copy_status`; this recomputes both from the copies in one set-based
UPDATE, which is a different route to the same numbers. On a correct database
it changes nothing — the replay test proves that, and an operator runs it after
a manual repair.
"""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Recompute library_title.copies_total and copies_available from the copies."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument("--tenant", help="Only this tenant's titles (its id).")

    def handle(self, *args: Any, **options: Any) -> None:
        from apps.library.services.copy_status import recount_titles
        from apps.platform_app.models import Tenant

        tenant = None
        if options.get("tenant"):
            tenant = Tenant.objects.filter(pk=options["tenant"]).first()
            if tenant is None:
                raise CommandError(f"No tenant {options['tenant']}.")
        changed = recount_titles(tenant=tenant)
        self.stdout.write(f"library_recount: {changed} title(s) corrected.")
