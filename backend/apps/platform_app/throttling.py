"""DRF throttles whose counters live in PostgreSQL (Part 27 §27.11, normative).

DRF's own throttles count in the cache, and the cache here is `LocMemCache`
(ADR-012: no Redis). A LocMem counter is per gunicorn WORKER, so "10 exports an
hour" was really 10 × workers, and every restart handed the budget back. Part
27 §27.11 is explicit that the security-relevant budgets — login, OTP, public
links, exports — must be durable. This class is the DRF face of
`platform_app.services.throttle.consume`, the same fixed-window counter the
sign-in and reset budgets already use.

`common` may not import this module (rule D1), so it is registered with
`apps.common.throttling.register_durable_throttle` in `PlatformConfig.ready()`
and reached through `durable_throttle(scope)`. The generic 600/min per-user
ceiling stays in LocMem, deliberately: exceeding it is a performance concern,
not a security one, and a durable write on every request would cost more than
it protects (§27.11 records the same trade-off).
"""

from __future__ import annotations

import re
from typing import Any, Callable

from rest_framework.settings import api_settings
from rest_framework.throttling import BaseThrottle

from apps.platform_app.services import throttle

_UNITS = {"s": 1, "sec": 1, "m": 60, "min": 60, "h": 3600, "hour": 3600, "d": 86400, "day": 86400}
_RATE = re.compile(r"^\s*(\d+)\s*/\s*(\d*)\s*([a-z]+)\s*$")


def parse_rate(rate: str) -> tuple[int, int]:
    """`"10/hour"` → (10, 3600); `"5/10min"` → (5, 600).

    DRF's parser reads only the first letter of the period, so its `"5/10min"`
    is five a MINUTE — the multiplier is silently dropped. This one honours it.
    """
    match = _RATE.match(rate or "")
    if not match or match.group(3) not in _UNITS:
        raise ValueError(f"unparseable throttle rate {rate!r}")
    count, multiplier, unit = match.groups()
    return int(count), int(multiplier or 1) * _UNITS[unit]


KeyFn = Callable[[Any, Any], "str | None"]


def by_user(request: Any, view: Any) -> str | None:
    user = getattr(request, "user", None)
    if user is not None and getattr(user, "is_authenticated", False):
        return f"user:{user.pk}"
    return None


class DurableRateThrottle(BaseThrottle):
    """`DurableRateThrottle("export")` — the scope's rate from `DEFAULT_THROTTLE_RATES`.

    `key` decides whose budget a request spends: the signed-in user (default),
    the client IP (`"ip"`), or any callable returning an identifier (the public
    share link spends a per-TOKEN budget as well as a per-IP one). An identifier
    is hashed before it is stored (`throttle.digest`), so the table is not a
    list of IPs or tokens. A request with no identifier is not throttled here —
    an anonymous caller on a user-keyed scope is the permission layer's problem.
    """

    def __init__(self, scope: str, *, key: str | KeyFn = "user") -> None:
        self.scope = scope
        self.key = key
        self._wait: int | None = None

    def _identifier(self, request: Any, view: Any) -> str | None:
        if callable(self.key):
            return self.key(request, view)
        if self.key == "ip":
            ident = self.get_ident(request)
            return f"ip:{ident}" if ident else None
        return by_user(request, view)

    def allow_request(self, request: Any, view: Any) -> bool:
        rate = api_settings.DEFAULT_THROTTLE_RATES.get(self.scope)
        if not rate:
            return True
        identifier = self._identifier(request, view)
        if identifier is None:
            return True
        limit, window = parse_rate(rate)
        decision = throttle.consume(
            scope=f"drf:{self.scope}", identifier=identifier, limit=limit, window_seconds=window
        )
        self._wait = None if decision.allowed else decision.retry_after
        return decision.allowed

    def wait(self) -> int | None:
        return self._wait


def durable_factory(scope: str, **kwargs: Any) -> DurableRateThrottle:
    """What `PlatformConfig.ready()` hands to `common.throttling`."""
    return DurableRateThrottle(scope, **kwargs)
