"""URL routes for the lending vertical, mounted at `/api/v1/lending/`.

Every route is behind `ModuleEnabled("lending")`, which refuses an unreleased
module first (A1).
"""

from __future__ import annotations

from django.urls import path

from apps.lending.views import collections as co
from apps.lending.views import loans as ln

urlpatterns: list = [
    path("loans/preview", ln.LoanPreviewView.as_view(), name="lending-loan-preview"),
    path("loans", ln.LoanListView.as_view(), name="lending-loans"),
    path("loans/<uuid:loan_id>", ln.LoanDetailView.as_view(), name="lending-loan"),
    path("borrowers", ln.BorrowerListView.as_view(), name="lending-borrowers"),
    path("today", co.TodayView.as_view(), name="lending-today"),
    path(
        "loans/<uuid:loan_id>/collections/preview",
        co.CollectionPreviewView.as_view(),
        name="lending-collection-preview",
    ),
    path(
        "loans/<uuid:loan_id>/collections", co.CollectionView.as_view(), name="lending-collections"
    ),
    path("loans/<uuid:loan_id>/visits", co.VisitView.as_view(), name="lending-visits"),
    path(
        "collections/<uuid:collection_id>/void",
        co.CollectionVoidView.as_view(),
        name="lending-collection-void",
    ),
    path("routes", co.RouteListView.as_view(), name="lending-routes"),
    path("routes/<uuid:route_id>", co.RouteDetailView.as_view(), name="lending-route"),
    path("routes/<uuid:route_id>/stops", co.RouteStopsView.as_view(), name="lending-route-stops"),
]
