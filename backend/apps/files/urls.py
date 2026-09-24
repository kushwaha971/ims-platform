"""URL routes for the files app (canon §0.8)."""

from __future__ import annotations

from django.urls import path

from apps.files.views.attachments import AttachmentContentView

urlpatterns = [
    path("files/<uuid:attachment_id>", AttachmentContentView.as_view(), name="file-content"),
]
