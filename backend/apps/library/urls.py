"""URL routes for the library vertical, mounted at `/api/v1/library/`.

B03 adds settings. Every route is behind `ModuleEnabled("library")`, which
refuses an unreleased module first (A1).
"""

from __future__ import annotations

from django.urls import path

from apps.library.views import LibraryNumberingView, LibrarySettingsView

urlpatterns: list = [
    path("settings", LibrarySettingsView.as_view(), name="library-settings"),
    path("settings/numbering", LibraryNumberingView.as_view(), name="library-settings-numbering"),
]
