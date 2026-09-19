"""AppConfig for the expenses app (Part 20 §20.1.2)."""

from __future__ import annotations

from django.apps import AppConfig


class ExpensesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.expenses"
    label = "expenses"
    verbose_name = "Expenses"

    def ready(self) -> None:
        from apps.expenses import tasks  # noqa: F401  (registers job handlers)
