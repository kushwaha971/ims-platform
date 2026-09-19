"""`manage.py seed_demo_tenant` — a full demo tenant for local development.

Part 32 §32.3.4 carries this (S0-40) into Sprint 1 together with
`create_superadmin`. The command exists from Sprint 0 with its refusal gate in
place, because that gate is the part that must never be forgotten: a demo seed
that runs in production is a data incident.
"""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Create a demo tenant with sample data. Refused in production without --force."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument("--force", action="store_true")

    def handle(self, *args: Any, **opts: Any) -> None:
        if not settings.DEBUG and not opts["force"]:
            raise CommandError(
                "seed_demo_tenant refuses to run with DEBUG=0. Pass --force if you mean it."
            )
        self.stdout.write("seed_demo_tenant: the demo dataset lands with PLT-02 (Sprint 1).")
