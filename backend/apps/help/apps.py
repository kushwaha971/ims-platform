"""AppConfig for the help app (Part 20 §20.1.2)."""

from __future__ import annotations

from django.apps import AppConfig


class HelpConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.help"
    label = "help"
    verbose_name = "Help"

    def ready(self) -> None:
        from apps.help import tasks  # noqa: F401  (registers job handlers)
