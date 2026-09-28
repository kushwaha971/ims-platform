"""`GET /files/{id}` — the one way a stored file leaves the server (PLT-07 §19).

There is no public media URL: `MEDIA_URL` is served only under `DEBUG`, and
nothing links to it. A file is streamed here after its id has been matched
inside the caller's tenant, so a logo is readable by every member of the
business it belongs to and by nobody else.

`Cache-Control: private, max-age=86400` (WLB-01 §20). An attachment is
immutable — a new logo is a new row with a new id — so a day's cache can never
show a stale image; `private` keeps it out of shared caches.
"""

from __future__ import annotations

from typing import Any

from django.core.files.storage import default_storage
from django.http import FileResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.common.exceptions import NoActiveTenant, NotFound
from apps.common.tenancy import get_effective_tenant
from apps.files.selectors.attachments import attachment_of_tenant


class AttachmentContentView(APIView):
    """Any active member of the owning tenant may read; 404 for anyone else."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Any, attachment_id: Any) -> Any:
        tenant = get_effective_tenant(request)
        if tenant is None:
            raise NoActiveTenant()
        attachment = attachment_of_tenant(tenant=tenant, attachment_id=attachment_id)
        if attachment is None or not default_storage.exists(attachment.storage_key):
            raise NotFound()
        response = FileResponse(
            default_storage.open(attachment.storage_key, "rb"),
            content_type=attachment.content_type,
        )
        response["Cache-Control"] = "private, max-age=86400"
        response["X-Content-Type-Options"] = "nosniff"
        response["Content-Disposition"] = "inline"
        return response
