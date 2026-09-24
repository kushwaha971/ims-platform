"""URL routes for the imports app (canon §0.8, IMP-01 §14).

Explicit paths rather than a router: `templates/{kind}.csv` and
`{id}/errors.csv` carry a file extension, and a router's lookup pattern would
have to be loosened to reach them. `<uuid:…>` keeps `templates` from ever
being read as a job id.
"""

from __future__ import annotations

from django.urls import path

from apps.imports.views.job import (
    ImportCancelView,
    ImportCommitView,
    ImportErrorFileView,
    ImportJobDetailView,
    ImportJobListView,
    ImportTemplateView,
)

urlpatterns = [
    path("imports", ImportJobListView.as_view(), name="import-list"),
    path("imports/templates/<slug:kind>.csv", ImportTemplateView.as_view(), name="import-template"),
    path("imports/<uuid:job_id>", ImportJobDetailView.as_view(), name="import-detail"),
    path("imports/<uuid:job_id>/commit", ImportCommitView.as_view(), name="import-commit"),
    path("imports/<uuid:job_id>/cancel", ImportCancelView.as_view(), name="import-cancel"),
    path("imports/<uuid:job_id>/errors.csv", ImportErrorFileView.as_view(), name="import-errors"),
]
