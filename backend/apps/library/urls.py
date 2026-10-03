"""URL routes for the library vertical, mounted at `/api/v1/library/`.

B03 settings, B05 the catalogue. Every route is behind
`ModuleEnabled("library")`, which refuses an unreleased module first (A1).
"""

from __future__ import annotations

from django.urls import path

from apps.library.views import LibraryNumberingView, LibrarySettingsView
from apps.library.views import catalogue as c

urlpatterns: list = [
    path("settings", LibrarySettingsView.as_view(), name="library-settings"),
    path("settings/numbering", LibraryNumberingView.as_view(), name="library-settings-numbering"),
    # ── B05 ── the catalogue (LIB-02 §6)
    path("titles", c.TitleListView.as_view(), name="library-titles"),
    path("titles/<uuid:title_id>", c.TitleDetailView.as_view(), name="library-title"),
    path("titles/<uuid:title_id>/copies", c.TitleCopiesView.as_view(), name="library-title-copies"),
    path(
        "titles/<uuid:title_id>/archive", c.TitleArchiveView.as_view(), name="library-title-archive"
    ),
    path(
        "titles/<uuid:title_id>/restore", c.TitleRestoreView.as_view(), name="library-title-restore"
    ),
    path("copies", c.CopyListView.as_view(), name="library-copies"),
    path("copies/<uuid:copy_id>", c.CopyDetailView.as_view(), name="library-copy"),
    path(
        "copies/<uuid:copy_id>/withdraw", c.CopyWithdrawView.as_view(), name="library-copy-withdraw"
    ),
    path("copies/<uuid:copy_id>/repair", c.CopyRepairView.as_view(), name="library-copy-repair"),
    path(
        "copies/<uuid:copy_id>/back-to-shelf",
        c.CopyBackToShelfView.as_view(),
        name="library-copy-back-to-shelf",
    ),
    path("lookup", c.LookupView.as_view(), name="library-lookup"),
    path("categories", c.CategoryListView.as_view(), name="library-categories"),
    path("categories/<uuid:category_id>", c.CategoryDetailView.as_view(), name="library-category"),
    path(
        "categories/<uuid:category_id>/merge",
        c.CategoryMergeView.as_view(),
        name="library-category-merge",
    ),
    path("locations", c.LocationListView.as_view(), name="library-locations"),
    path("locations/<uuid:location_id>", c.LocationDetailView.as_view(), name="library-location"),
]
