"""AppConfig for the imports app (Part 20 §20.1.2)."""

from __future__ import annotations

from django.apps import AppConfig


class ImportsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.imports"
    label = "imports"
    verbose_name = "Imports"

    def ready(self) -> None:
        from apps.imports import tasks  # noqa: F401  (registers job handlers)
