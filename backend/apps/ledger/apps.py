"""AppConfig for the ledger app (Part 20 §20.1.2)."""

from __future__ import annotations

from django.apps import AppConfig


class LedgerConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.ledger"
    label = "ledger"
    verbose_name = "Ledger"

    def ready(self) -> None:
        from apps.ledger import tasks  # noqa: F401  (registers job handlers)
