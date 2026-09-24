"""The unauthenticated share route (SAL-03 FR-5) — mounted under `/public/`."""

from __future__ import annotations

from django.urls import path

from apps.sales.views.public import PublicDocumentView

urlpatterns = [
    path("d/<str:token>", PublicDocumentView.as_view(), name="public-document"),
]
