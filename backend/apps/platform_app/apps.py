"""AppConfig for the platform app (Part 20 §20.1.2).

The package lives at `apps/platform_app/` on disk with `label = "platform"` so it
does not shadow the stdlib `platform` module. This is the only place in the
product where the on-disk package name differs from the app label, and it must be
done exactly this way.
"""

from __future__ import annotations

from django.apps import AppConfig
from django.core.checks import Error, Tags, register


class PlatformConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"  # unused; every model sets a UUID pk
    name = "apps.platform_app"
    label = "platform"  # ← table prefix and app_label in migrations
    verbose_name = "Platform"

    def ready(self) -> None:
        from apps.platform_app import signals, tasks  # noqa: F401

        register(Tags.security, deploy=True)(check_console_sms_backend)


def check_console_sms_backend(app_configs: object = None, **kwargs: object) -> list:
    """`PLT-01` EC-6 — the console SMS backend must not reach production silently.

    A deployment whose OTPs go to a log file and not to a phone is a deployment
    where nobody but the operator can log in. That is a legitimate configuration
    for the single-user local deployment the specification is written for, so it
    is permitted — but only when the operator has said so with
    `UB_ALLOW_CONSOLE_SMS`. Raised by `manage.py check --deploy`.

    **DEC-010:** with `UB_AUTH_OTP_ENABLED=0` there is no OTP, so there is
    nothing this check can protect. An SMS backend that delivers nothing is only
    a defect when something is trying to be delivered, and complaining about it
    would train the operator to ignore `check --deploy`. The check therefore
    passes silently whenever OTP is off, whatever `UB_SMS_BACKEND` says.
    """
    from django.conf import settings

    if not getattr(settings, "UB_AUTH_OTP_ENABLED", False):
        return []

    backend = getattr(settings, "UB_SMS_BACKEND", "") or ""
    if settings.DEBUG or not backend.endswith("ConsoleSmsBackend"):
        return []
    if getattr(settings, "UB_ALLOW_CONSOLE_SMS", False):
        return []
    return [
        Error(
            "UB_SMS_BACKEND is the console backend and DEBUG is off: no OTP would "
            "be delivered to any merchant.",
            hint="Configure a real SMS provider, or set UB_ALLOW_CONSOLE_SMS=1 "
            "for a single-user local deployment.",
            id="platform.E001",
        )
    ]
