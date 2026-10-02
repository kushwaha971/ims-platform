"""The module-off counter (R56, 10-architecture §9, contracts §2.3).

A consuming module (gym) may not be switched off while it has visits **of
earlier days** left open; today's open visits never block — the desk is
working, and the nightly job closes them. Voided marks never count (BR-6).

The counter is a FROZEN DATACLASS with `__call__`, not a `functools.partial`
or a closure: the guard registry dedupes by `==`, and a partial compares by
identity, so a second `ready()` would register a second counter and the
refusal would say "6 visits" when there are three.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from apps.attendance.constants import OFF_GUARD_LABEL


@dataclass(frozen=True)
class OpenVisitsOfEarlierDays:
    module: str

    def __call__(self, tenant: Any) -> int:
        from apps.attendance.selectors import open_visits_before
        from apps.common.dates import tenant_today

        return open_visits_before(tenant, module=self.module, day=tenant_today(tenant)).count()


def register_off_guards() -> None:
    """One counter per module that lists `attendance` in `ENGINES_USED_BY`."""
    from apps.platform_app.services import tenant_settings
    from apps.platform_app.services.guards import register_module_off_guard

    for module, engines in sorted(tenant_settings.ENGINES_USED_BY.items()):
        if "attendance" in engines:
            register_module_off_guard(
                module, OpenVisitsOfEarlierDays(module=module), label_id=OFF_GUARD_LABEL
            )
