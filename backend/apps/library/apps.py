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

        Still to come: B06 the "Standard" membership type in the seed; B10 the
        two posting sources, their resolvers, the allocation target and the
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
