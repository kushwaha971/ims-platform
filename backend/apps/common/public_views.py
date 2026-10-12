"""What every unauthenticated link route shares: the invoice share page (`/public/d/…`,
SAL-03 FR-5) and the UPI pay page (`/public/pay/…`, Shop P0).

Moved here from `apps.sales.views.public` so the pay page, which belongs to the
payments app, takes the same hardening without importing a document app:

* Budgets are DURABLE: 60/min per IP and 600/day per token, counted in
  `platform_rate_limit` (a LocMem counter is per gunicorn worker).
* The headers are on EVERY response — the 404 and the 429 too — because a crawler
  that reached a dead link must still be told not to index it, and a browser must
  still not send the token onward in a `Referer`: the URL IS the credential.
"""

from __future__ import annotations

from typing import Any

from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from apps.common.throttling import durable_throttle

#: Headers every public-link response carries, success or failure.
PUBLIC_HEADERS: dict[str, str] = {
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    # JSON only: nothing on this response may load, run or frame anything.
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
}


def _token_key(request: Any, view: Any) -> str | None:
    token = (getattr(view, "kwargs", None) or {}).get("token")
    return f"token:{token[:128]}" if token else None


class PublicLinkView(APIView):
    """No session, the durable budgets, and the headers on every response."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get_throttles(self) -> list[Any]:
        return [
            durable_throttle("public_link", key="ip"),
            durable_throttle("public_link_token", key=_token_key),
        ]

    def finalize_response(self, request: Any, response: Any, *args: Any, **kwargs: Any) -> Any:
        response = super().finalize_response(request, response, *args, **kwargs)
        for name, value in PUBLIC_HEADERS.items():
            response[name] = value
        return response
