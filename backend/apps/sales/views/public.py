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

from apps.common.exceptions import NotFound
from apps.common.public_views import PUBLIC_HEADERS, PublicLinkView  # noqa: F401
from apps.common.responses import StandardResponse
from apps.sales.serializers.public import public_document_payload
from apps.sales.services.share import public_document, public_logo

# The shared base moved to `apps.common.public_views` (Shop P0's pay page uses it too).
_PublicLinkView = PublicLinkView


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
