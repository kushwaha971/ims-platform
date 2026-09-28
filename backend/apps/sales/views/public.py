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

from django.core.files.storage import default_storage
from django.http import FileResponse
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from apps.common.exceptions import NotFound
from apps.common.responses import StandardResponse
from apps.common.throttling import durable_throttle
from apps.sales.serializers.public import public_document_payload
from apps.sales.services.share import public_document, public_logo

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


class _PublicLinkView(APIView):
    """What every route under a share token shares: no session, the durable
    budgets, and the headers on every response."""

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


class PublicDocumentView(_PublicLinkView):
    def get(self, request: Any, token: str) -> Any:
        document = public_document(token)
        return StandardResponse.ok(public_document_payload(document, token=token))


class PublicDocumentLogoView(_PublicLinkView):
    """`GET /public/d/{token}/logo` — the shop's logo on the customer's page.

    The letterhead's one image, and the customer has no session for
    `/files/{id}`. Scoped by the SAME token check as the document (unknown,
    expired and revoked all 404), so the logo is readable exactly as long as
    the bill is, and nothing else of the tenant's files is reachable.
    """

    def get(self, request: Any, token: str) -> Any:
        attachment = public_logo(public_document(token))
        if attachment is None or not default_storage.exists(attachment.storage_key):
            raise NotFound("This link has expired.")
        response = FileResponse(
            default_storage.open(attachment.storage_key, "rb"),
            content_type=attachment.content_type,
        )
        response["Content-Disposition"] = "inline"
        return response
