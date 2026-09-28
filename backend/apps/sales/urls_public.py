"""The unauthenticated share route (SAL-03 FR-5) — mounted under `/public/`."""

from __future__ import annotations

from django.urls import path

from apps.sales.views.public import PublicDocumentLogoView, PublicDocumentView

urlpatterns = [
    path("d/<str:token>", PublicDocumentView.as_view(), name="public-document"),
    path("d/<str:token>/logo", PublicDocumentLogoView.as_view(), name="public-document-logo"),
]
