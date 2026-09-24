"""`GET /public/d/{token}` — the shared invoice, without a login (SAL-03 FR-5, §19).

What it leaves out is the point: no internal ids beyond the document's, the
mobile masked to its last digits, no cost snapshot, no created-by. 404 for an
unknown and an expired token alike, so a token cannot be probed.
"""

from __future__ import annotations

from typing import Any

from rest_framework.permissions import AllowAny
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.common.responses import StandardResponse
from apps.sales.serializers.document import DocumentReadSerializer, mask_mobile
from apps.sales.services.share import public_document


class PublicDocumentView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_link"  # 60/min per IP (§19)

    def get(self, request: Any, token: str) -> Any:
        document = public_document(token)
        data = dict(DocumentReadSerializer(document).data)
        for private in ("created_by", "party"):
            data.pop(private, None)
        data["walk_in_mobile"] = mask_mobile(data.get("walk_in_mobile"))
        snapshot = dict(data.get("party_snapshot") or {})
        snapshot["mobile"] = mask_mobile(snapshot.get("mobile"))
        data["party_snapshot"] = snapshot
        data["kind_label"] = document.kind
        tenant = document.tenant
        branding = dict(tenant.branding or {})
        data["tenant_branding"] = {
            "app_name": branding.get("app_name"),
            "primary_hex": branding.get("primary_hex"),
            "doc_header": branding.get("doc_header"),
            "doc_footer": branding.get("doc_footer"),
        }
        response = StandardResponse.ok(data)
        response["Cache-Control"] = "private, no-store"
        response["X-Robots-Tag"] = "noindex, nofollow"
        return response
