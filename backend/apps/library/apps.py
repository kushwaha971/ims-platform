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

        B01 registers nothing. Still to come here: B03 the three number kinds
        (`library_member`, `library_accession`, `library_charge`), the module
        enable hook that seeds settings and the calendar reader; B10 the two
        posting sources, their resolvers, the allocation target and the
        open-charges off-guard. `ready()` must never import a model at module
        level.
        """
