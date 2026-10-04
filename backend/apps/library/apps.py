"""AppConfig for the library vertical (FRD library.md, LIB-01; ADR-041)."""

from __future__ import annotations

from django.apps import AppConfig


class LibraryConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.library"
    label = "library"
    verbose_name = "Library"

    def ready(self) -> None:
        """Registrations with the core, added by the task that owns each one.

        B03: the three number kinds (contracts §1.7), the enable hook that
        seeds the settings row (R15), and the calendar reader (A9b), without
        which `validate_module` refuses `module="library"` and the library's
        weekday override is never listed. No module-off counter yet (G7): each
        table's task registers its own, and held deposits are already counted
        by payments (`payments.off.depositsOpen`).

        B06 added the "Standard" membership type to the seed; B10 the two
        posting sources, their resolvers, the allocation target and the
        open-charges off-guard. `ready()` imports no model at module level.
        """
        from apps.library.services.settings import seed_library
        from apps.platform_app.services.calendar import register_calendar_reader
        from apps.platform_app.services.guards import register_module_enable_hook
        from apps.platform_app.services.sequences import register_number_kind

        register_number_kind(
            "library_member",
            module="library",
            mode="perpetual",
            default_prefix="M-",
            padding=4,
            label_id="library.numbering.member",
        )
        register_number_kind(
            "library_accession",
            module="library",
            mode="perpetual",
            default_prefix="",
            padding=0,
            label_id="library.numbering.accession",
        )
        register_number_kind(
            "library_charge",
            module="library",
            mode="fy",
            default_prefix="FIN",
            padding=4,
            label_id="library.numbering.charge",
        )
        register_module_enable_hook("library", seed_library)
        register_calendar_reader("library")

        # ── B10 ── charges post `charge`, waivers `adjustment_credit`, both in
        # main (contracts §1.2); the khata names them; payments can settle a
        # charge (FIFO beside invoices, R6); open charges block switching off.
        from apps.common.constants import Direction, LedgerBucket
        from apps.ledger.constants import EntryType
        from apps.ledger.selectors.sources import register_source_resolver
        from apps.ledger.services.postings import register_posting_source
        from apps.library.constants import OFF_GUARD_CHARGES, SOURCE_CHARGE, SOURCE_WAIVER
        from apps.library.services.charges import (
            LibraryChargeTarget,
            OpenChargesCounter,
            resolve_charges,
            resolve_waivers,
        )
        from apps.payments.services.targets import register_target
        from apps.platform_app.services.guards import register_module_off_guard

        main = frozenset({LedgerBucket.MAIN.value})
        register_posting_source(
            SOURCE_CHARGE,
            module="library",
            entry_types={EntryType.CHARGE: Direction.DEBIT},
            buckets=main,
        )
        register_posting_source(
            SOURCE_WAIVER,
            module="library",
            entry_types={EntryType.ADJUSTMENT_CREDIT: Direction.CREDIT},
            buckets=main,
        )
        register_source_resolver(SOURCE_CHARGE, resolve_charges)
        register_source_resolver(SOURCE_WAIVER, resolve_waivers)
        register_target(LibraryChargeTarget())
        register_module_off_guard("library", OpenChargesCounter(), label_id=OFF_GUARD_CHARGES)

        # ── B07 ── members are a party role, an open membership blocks archiving
        # the party, and payments counts the library's held deposits already.
        from apps.library.services.members import archive_guard, member_party_ids
        from apps.parties.services.archive import register_archive_guard
        from apps.parties.services.roles import register_party_role

        register_party_role(
            "library_member",
            module="library",
            label_id="library.role.member",
            party_ids=member_party_ids,
        )
        register_archive_guard("library", archive_guard)

        # ── B11 ── the daily hold expiry (LIB-08 BR-4), handlers and schedule together.
        from apps.common.jobs import Schedule, register_schedule
        from apps.library import tasks  # noqa: F401  (registers the job handlers)

        register_schedule(Schedule(tasks.EXPIRE, period="daily", at_hour_ist=6, minute=15))

        # ── B12 ── reminder sources, policy, templates and the two bell types
        # (LIB-09), and the morning "became overdue today" notice.
        from apps.library.services import reminders

        reminders.register()
        register_schedule(Schedule(tasks.OVERDUE_TODAY, period="daily", at_hour_ist=9, minute=0))
