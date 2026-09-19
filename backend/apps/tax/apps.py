"""AppConfig for the tax app (Part 20 §20.1.2)."""

from __future__ import annotations

from django.apps import AppConfig


class TaxConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.tax"
    label = "tax"
    verbose_name = "Tax"

    def ready(self) -> None:
        from apps.tax import tasks  # noqa: F401  (registers job handlers)
