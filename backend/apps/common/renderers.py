"""Renderers (Part 20 §20.2.2).

`EnvelopeJSONRenderer` is the last line of defence for Part 22 §22.1: a response
body that somehow escaped `StandardResponse` is still wrapped, so no endpoint can
ship a bare object. A body that already carries `data` or `error` is left alone.
"""

from __future__ import annotations

from typing import Any

from rest_framework.renderers import JSONRenderer


class EnvelopeJSONRenderer(JSONRenderer):
    media_type = "application/json"

    def render(
        self, data: Any, accepted_media_type: str | None = None, renderer_context: Any = None
    ) -> bytes:
        if isinstance(data, dict) and ("data" in data or "error" in data):
            return super().render(data, accepted_media_type, renderer_context)
        if data is None:
            return super().render(data, accepted_media_type, renderer_context)
        return super().render({"data": data}, accepted_media_type, renderer_context)
