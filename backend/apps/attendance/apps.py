"""AppConfig for the attendance engine (ADR-041, contracts §2.3)."""

from __future__ import annotations

from django.apps import AppConfig


class AttendanceConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.attendance"
    label = "attendance"
    verbose_name = "Attendance"

    def ready(self) -> None:
        # Job handlers register on import; the two schedules and the module-off
        # counters (R56) are registered here so every consuming module that
        # lists the engine in ENGINES_USED_BY gets its guard from day one.
        from apps.attendance import tasks  # noqa: F401
        from apps.attendance.services.guards import register_off_guards
        from apps.attendance.tasks import register_schedules

        register_schedules()
        register_off_guards()
