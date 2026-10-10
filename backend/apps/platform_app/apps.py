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
        from apps.common.throttling import register_durable_throttle
        from apps.platform_app import signals, tasks  # noqa: F401
        from apps.platform_app.throttling import durable_factory

        register_durable_throttle(durable_factory)

        # docs/platform/14 §4.2 — the Shop is an app like the others, registered
        # here because its capabilities are the core ones, not a vertical's.
        from apps.platform_app.apps_registry import AppSpec, register_app

        register_app(AppSpec(
            code="shop",
            label_id="nav.workspace.shop",
            anchor="sales",
            capabilities=frozenset(
                {
                    "parties",
                    "ledger",
                    "inventory",
                    "sales",
                    "purchases",
                    "payments",
                    "expenses",
                    "reports",
                    "import_export",
                }
                ),  # fmt: skip
                entry_permission="parties.party.read",
                home_path="/dashboard",
                order=90,
            ),
        )

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

    # DEC-014: the code is Message Central's to send. `console` means it is
    # only printed in this server's log.
    provider = getattr(settings, "UB_OTP_PROVIDER", "console") or "console"
    if settings.DEBUG or provider != "console":
        return []
    if getattr(settings, "UB_ALLOW_CONSOLE_SMS", False):
        return []
    return [
        Error(
            "The OTP provider is the console and DEBUG is off: no sign-in code would "
            "be delivered to any merchant.",
            hint="Set FAST2SMS_API_KEY and UB_OTP_PROVIDER=fast2sms, or set "
            "UB_ALLOW_CONSOLE_SMS=1 for a single-user local deployment.",
            id="platform.E001",
        )
    ]
