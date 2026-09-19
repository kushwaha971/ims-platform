"""AppConfig for the purchases app (Part 20 §20.1.2)."""

from __future__ import annotations

from django.apps import AppConfig


class PurchasesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.purchases"
    label = "purchases"
    verbose_name = "Purchases"

    def ready(self) -> None:
        from apps.purchases import tasks  # noqa: F401  (registers job handlers)
