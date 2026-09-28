"""AppConfig for the inventory app (Part 20 §20.1.2)."""

from __future__ import annotations

from django.apps import AppConfig


class InventoryConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.inventory"
    label = "inventory"
    verbose_name = "Inventory"

    def ready(self) -> None:
        from apps.inventory import tasks  # noqa: F401  (registers job handlers)
        from apps.inventory.services.guards import register_guards

        # PLT-06 FR-4 — "Stock" cannot be switched off while any item has stock.
        register_guards()
