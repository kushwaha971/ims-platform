"""`GET /public/d/{token}` — the shared invoice, without a login (SAL-03 FR-5, §19).

What it leaves out is the point: the payload is an allow-list of what prints
(`serializers.public`), the mobile masked to its last digits, no ids, no cost,
no created-by. 404 for an unknown, expired and revoked token alike, so a token
cannot be probed.

── Hardening (Part 27 §27.12, Sprint 12) ─────────────────────────────────────
* Budgets are DURABLE: 60/min per IP and 600/day per token, counted in
  `platform_rate_limit`. This was DRF's cache-backed `ScopedRateThrottle`, whose
  LocMem counter is per gunicorn worker (so 60/min was really 60 × workers)
  and had no per-token budget at all.
* The headers are on EVERY response of this route — the 404 and the 429 too,
  not only the 200 — because a crawler that reached a dead link must still be
  told not to index it, and a browser must still not send the token onward in
  a `Referer`. `Referrer-Policy: no-referrer` (stricter than §27.12's
  `same-origin`, as the Sprint 12 checklist asks): the URL IS the credential.
"""

from __future__ import annotations

from typing import Any

from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from apps.common.responses import StandardResponse
from apps.common.throttling import durable_throttle
from apps.sales.serializers.public import public_document_payload
from apps.sales.services.share import public_document

#: Headers every public-link response carries, success or failure.
PUBLIC_HEADERS: dict[str, str] = {
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    # JSON only: nothing on this response may load, run or frame anything.
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
}


def _token_key(request: Any, view: Any) -> str | None:
    token = (getattr(view, "kwargs", None) or {}).get("token")
    return f"token:{token[:128]}" if token else None


class PublicDocumentView(APIView):
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

    def get(self, request: Any, token: str) -> Any:
        document = public_document(token)
        return StandardResponse.ok(public_document_payload(document))
