"""The reports routes that sit at the API root rather than under `reports/` (A10).

`GET /api/v1/reports` is a collection (contracts §1.9), spelt like every other
collection here (`/parties`, `/items`) — without a trailing slash, which the
`reports/` include cannot produce for its own empty path.
"""

from __future__ import annotations

from django.urls import path

from apps.reports.views.module_reports import ReportListView

urlpatterns = [
    path("reports", ReportListView.as_view(), name="report-list"),
]
