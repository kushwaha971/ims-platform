"""AppConfig for the notifications app (Part 20 §20.1.2)."""

from __future__ import annotations

from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.notifications"
    label = "notifications"
    verbose_name = "Notifications"

    def ready(self) -> None:
        from apps.notifications import sinks, tasks  # noqa: F401  (registers job handlers)

        # INV-07 — low-stock crossings reach the inbox. Deferred: inventory is
        # below notifications in the matrix and exposes a registry instead.
        sinks.register()
