"""Renderers (Part 20 §20.2.2).

`EnvelopeJSONRenderer` is the last line of defence for Part 22 §22.1: a response
body that somehow escaped `StandardResponse` is still wrapped, so no endpoint can
ship a bare object. A body that already carries `data` or `error` is left alone.
"""

from __future__ import annotations

from typing import Any

from rest_framework.renderers import BaseRenderer, JSONRenderer


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


class PassthroughCsvRenderer(BaseRenderer):
    """Makes `?format=csv` a legal request, and renders nothing itself.

    DRF reserves `format` as its own content-negotiation parameter, so
    `?format=csv` is resolved against the view's renderers BEFORE the handler
    runs — and with no renderer declaring that format, negotiation answers
    **404 Not Found**. LED-04 §14 specifies `format=json|csv` per §22.11's
    convention, and the first request to the CSV export came back as a 404 with
    the app's own error envelope, which reads exactly like a missing party.

    So this exists to satisfy negotiation. The handler returns a
    `StreamingHttpResponse` directly — a five-thousand-row export streams rather
    than assembling itself in memory, which no renderer can do, because a
    renderer is handed a finished object. `render()` therefore passes bytes
    through unchanged and is never called on the streaming path.
    """

    media_type = "text/csv"
    format = "csv"
    charset = "utf-8"

    def render(
        self, data: Any, accepted_media_type: str | None = None, renderer_context: Any = None
    ) -> Any:
        """Bytes pass through; an ERROR envelope is rendered as JSON.

        Negotiation has already picked this renderer by the time the handler
        refuses — a 403 for a role that may not export, a 429 on the export
        budget, a 400 for a bad date — so the exception handler's envelope
        arrives here. Passed through, a `dict` became an HTTP body of its keys
        (`error`) labelled `text/csv`: the client could not read the code, and
        a browser following the download link saved a file called the export's
        name containing the word "error". Rendered as JSON with a JSON content
        type, the refusal says what it is, like every other error in the API.
        """
        if isinstance(data, (dict, list)):
            response = (renderer_context or {}).get("response")
            if response is not None:
                response["Content-Type"] = EnvelopeJSONRenderer.media_type
            return EnvelopeJSONRenderer().render(
                data, EnvelopeJSONRenderer.media_type, renderer_context
            )
        return data
