"""AppConfig for the reports app (Part 20 §20.1.2)."""

from __future__ import annotations

from django.apps import AppConfig


class ReportsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.reports"
    label = "reports"
    verbose_name = "Reports"

    def ready(self) -> None:
        from apps.reports import signals, tasks  # noqa: F401  (registers job handlers)

        signals.connect()
