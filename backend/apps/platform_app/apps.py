"""AppConfig for the platform app (Part 20 §20.1.2).

The package lives at `apps/platform_app/` on disk with `label = "platform"` so it
does not shadow the stdlib `platform` module. This is the only place in the
product where the on-disk package name differs from the app label, and it must be
done exactly this way.
"""

from __future__ import annotations

from django.apps import AppConfig


class PlatformConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"  # unused; every model sets a UUID pk
    name = "apps.platform_app"
    label = "platform"  # ← table prefix and app_label in migrations
    verbose_name = "Platform"

    def ready(self) -> None:
        from apps.platform_app import signals, tasks  # noqa: F401
