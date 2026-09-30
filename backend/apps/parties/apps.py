"""AppConfig for the parties app (Part 20 §20.1.2)."""

from __future__ import annotations

from django.apps import AppConfig


class PartiesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.parties"
    label = "parties"
    verbose_name = "Parties"

    def ready(self) -> None:
        from apps.parties import tasks  # noqa: F401  (registers job handlers)

        # ── A6 ── BR-6: a guardian of an active party cannot be archived.
        from apps.parties.services.archive import register_archive_guard
        from apps.parties.services.relations import guardian_archive_guard

        register_archive_guard("parties", guardian_archive_guard)
