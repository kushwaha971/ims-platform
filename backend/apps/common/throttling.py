"""Throttling (Part 20 §20.3.5, Part 22 §22.1 rate limits)."""

from __future__ import annotations

from typing import Any

from rest_framework.throttling import SimpleRateThrottle, UserRateThrottle


class ScopedUserRateThrottle(UserRateThrottle):
    """600 req/min per user by default; a view may declare `throttle_scope`."""

    scope = "user"

    def get_cache_key(self, request: Any, view: Any) -> str | None:
        scope = getattr(view, "throttle_scope", None)
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
