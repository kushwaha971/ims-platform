"""`GET /payments/qr.svg?data=` — a QR as SVG, drawn locally (SAL-03 §14, PAY-03, ADR-021).

No third-party QR service ever sees a VPA or an amount (§19). Only a UPI URL
is accepted — this endpoint draws payment codes, not arbitrary text.
"""

from __future__ import annotations

from typing import Any

from django.http import HttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.common.exceptions import ValidationFailed
from apps.common.qr import encode, to_svg


class QrSvgView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Any) -> HttpResponse:
        data = (request.query_params.get("data") or "").strip()
        if not data.startswith("upi://pay?") or len(data) > 400:
            raise ValidationFailed({"data": ["Pass a UPI payment URL."]})
        try:
            svg = to_svg(encode(data))
        except ValueError as exc:
            raise ValidationFailed({"data": [str(exc)]}) from exc
        response = HttpResponse(svg, content_type="image/svg+xml")
        response["Cache-Control"] = "private, max-age=300"
        return response
