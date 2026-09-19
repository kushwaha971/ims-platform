"""AppConfig for the files app (Part 20 §20.1.2)."""

from __future__ import annotations

from django.apps import AppConfig


class FilesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.files"
    label = "files"
    verbose_name = "Files"

    def ready(self) -> None:
        from apps.files import tasks  # noqa: F401  (registers job handlers)
