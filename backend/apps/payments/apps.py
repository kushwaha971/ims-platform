"""AppConfig for the payments app (Part 20 §20.1.2)."""

from __future__ import annotations

from django.apps import AppConfig


class PaymentsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.payments"
    label = "payments"
    verbose_name = "Payments"

    def ready(self) -> None:
        from apps.payments import tasks  # noqa: F401  (registers job handlers)
