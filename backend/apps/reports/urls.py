"""URL routes for the reports app (canon §0.8), mounted under `reports/`.

IMP-02 adds the stored-export pair; the report projections land with RPT-*.
"""

from __future__ import annotations

from django.urls import path

from apps.reports.views.exports import ExportDetailView, ExportDownloadView

urlpatterns = [
    path("exports/<uuid:export_id>", ExportDetailView.as_view(), name="report-export-detail"),
    path(
        "exports/<uuid:export_id>/download",
        ExportDownloadView.as_view(),
        name="report-export-download",
    ),
]
