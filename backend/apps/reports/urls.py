"""URL routes for the reports app (canon §0.8), mounted under `reports/`.

IMP-02 adds the stored-export pair; the report projections land with RPT-*.
"""

from __future__ import annotations

from django.urls import path

from apps.reports.views.exports import ExportDetailView, ExportDownloadView
from apps.reports.views.gst import GstSummaryView
from apps.reports.views.registers import PurchaseRegisterView, SalesRegisterView

urlpatterns = [
    # RPT-03 / RPT-04 / RPT-07 (Track W4-B).
    path("sales-register", SalesRegisterView.as_view(), name="report-sales-register"),
    path("purchase-register", PurchaseRegisterView.as_view(), name="report-purchase-register"),
    path("gst-summary", GstSummaryView.as_view(), name="report-gst-summary"),
    path("exports/<uuid:export_id>", ExportDetailView.as_view(), name="report-export-detail"),
    path(
        "exports/<uuid:export_id>/download",
        ExportDownloadView.as_view(),
        name="report-export-download",
    ),
]
