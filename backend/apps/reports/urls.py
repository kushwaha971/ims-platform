"""URL routes for the reports app (canon §0.8), mounted under `reports/`.

IMP-02 adds the stored-export pair; the report projections land with RPT-*:
RPT-01's dashboard and RPT-02's day book here (Track W4-A), the registers and
the GST summary beside them (Track W4-B).
"""

from __future__ import annotations

from django.urls import path

from apps.reports.views.aging import PayablesAgingView, ReceivablesAgingView
from apps.reports.views.dashboard import DashboardView
from apps.reports.views.day_book import DayBookView
from apps.reports.views.exports import ExportDetailView, ExportDownloadView
from apps.reports.views.stock import StockSummaryReportView
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
    # RPT-01 / RPT-02 / RPT-05 / RPT-06 (W4-A).
    path("dashboard", DashboardView.as_view(), name="report-dashboard"),
    path("day-book", DayBookView.as_view(), name="report-day-book"),
    path("receivables-aging", ReceivablesAgingView.as_view(), name="report-receivables-aging"),
    path("payables-aging", PayablesAgingView.as_view(), name="report-payables-aging"),
    path("stock-summary", StockSummaryReportView.as_view(), name="report-stock-summary"),
]
