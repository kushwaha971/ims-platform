"""The MVP WhatsApp adapter: a `wa.me` deep link (ADR-015)."""

from __future__ import annotations

from urllib.parse import quote


class WaMeBackend:
    """Builds the share URL the client opens. Sends nothing itself."""

    name = "wa_me"

    def build_share_url(self, *, to: str, body: str) -> str:
        # `safe=''` (LED-06 BR-2): the default keeps `/`, and nothing in a
        # message body may survive unencoded into a query string.
        digits = "".join(ch for ch in to if ch.isdigit())
        return f"https://wa.me/{digits}?text={quote(body, safe='')}"
