"""Throttling (Part 20 §20.3.5, Part 22 §22.1 rate limits)."""

from __future__ import annotations

from typing import Any

from rest_framework.throttling import SimpleRateThrottle, UserRateThrottle


class ScopedUserRateThrottle(UserRateThrottle):
    """600 req/min per user by default; a view may declare `throttle_scope`.

    A view whose verbs cost different amounts builds its throttles itself with
    `ScopedUserRateThrottle(scope)` from `get_throttles()`. A throttle given its
    scope that way keeps it: the view's single `throttle_scope`, which is what
    applied a WRITE budget to every GET on `/parties`, is not consulted.

    ── A scope set on the INSTANCE is also kept ─────────────────────────────
    The ledger's export budget was built as `ScopedUserRateThrottle()` with
    `.scope = "export"` assigned afterwards. Only the constructor recorded the
    scope as fixed, so `get_cache_key` swapped it for the view's
    `throttle_scope` — `"user"` on the statement — and every statement export
    ran on 600/min instead of 10/hour (security review F-1). Now any scope the
    instance carries, however it got there, wins over the view's, and the rate
    is re-derived from it so a caller cannot leave the two disagreeing.
    """

    scope = "user"

    def __init__(self, scope: str | None = None) -> None:
        self.fixed_scope = scope
        if scope:
            self.scope = scope
        super().__init__()

    def _own_scope(self) -> str | None:
        """The scope this throttle was GIVEN, by constructor or by assignment."""
        return self.fixed_scope or self.__dict__.get("scope")

    def get_cache_key(self, request: Any, view: Any) -> str | None:
        scope = self._own_scope() or getattr(view, "throttle_scope", None)
        if scope:
            self.scope = scope
            self.rate = self.get_rate()
            self.num_requests, self.duration = self.parse_rate(self.rate)
        return super().get_cache_key(request, view)


class OtpRateThrottle(SimpleRateThrottle):
    """5 per mobile per 10 minutes (Part 22 §22.1)."""

    scope = "otp"

    def get_cache_key(self, request: Any, view: Any) -> str | None:
        mobile = (request.data or {}).get("mobile") if hasattr(request, "data") else None
        if not mobile:
            return None
        return self.cache_format % {"scope": self.scope, "ident": mobile}
