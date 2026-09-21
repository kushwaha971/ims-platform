"""`seed_all` — everything a fresh database needs before anyone can sign in.

This is the command the operator surface actually calls. `scripts/bootstrap.sh`,
the `Makefile` and Part 29 §29.4 all name `seed_all`; until now none of the three
worked, because the command did not exist and the three that do exist are named
differently. A live walk-through of the first-run path found it: registration
succeeded, then `POST /tenants` answered

    404  No partner is configured. Run `manage.py seed_plans`.

so a clean clone could create an account and then not create a business. The test
suite never saw it because fixtures build a partner directly.

The rule this command exists to enforce: **seeding is one command, it is
idempotent, and it seeds everything the first request needs.** A caller should
never have to know that reference data and plans are separate concerns, because
the moment they do, one of them gets forgotten in exactly this way.

Order matters. Plans and the default partner come first: `platform_tenant`
carries a non-null FK to both, so a tenant cannot be created before they exist.
Reference data — roles, tax rates, units, expense categories — is independent and
runs second so a failure there leaves a database that can still onboard.

Idempotent by delegation: each sub-command is itself idempotent, so re-running
this is a no-op, which `scripts/bootstrap.sh` verifies as part of its own
checklist.
"""

from __future__ import annotations

from typing import Any

from django.core.management import call_command
from django.core.management.base import BaseCommand

#: In dependency order. `platform_tenant.plan` and `.partner` are NOT NULL, so a
#: tenant cannot exist before `seed_plans` has run.
SEED_COMMANDS: tuple[str, ...] = (
    "seed_plans",
    "seed_reference_data",
)


class Command(BaseCommand):
    help = "Seed every table a fresh install needs. Idempotent; safe to re-run."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument(
            "--demo",
            action="store_true",
            help=(
                "Also create the demo tenant with example parties and entries. "
                "Refused outside DEBUG unless --force is passed to seed_demo_tenant."
            ),
        )

    def handle(self, *args: Any, **options: Any) -> None:
        verbosity = options.get("verbosity", 1)

        for name in SEED_COMMANDS:
            if verbosity:
                self.stdout.write(f"→ {name}")
            call_command(name, verbosity=verbosity)

        if options.get("demo"):
            if verbosity:
                self.stdout.write("→ seed_demo_tenant")
            call_command("seed_demo_tenant", verbosity=verbosity)

        if verbosity:
            self.stdout.write(self.style.SUCCESS("seed_all: done"))
