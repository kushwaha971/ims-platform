"""Attendance engine routes, under `/api/v1/attendance/` (GET only, ADR-041)."""

from __future__ import annotations

from django.urls import path

from apps.attendance import views

urlpatterns = [
    path("groups", views.GroupListView.as_view(), name="attendance-group-list"),
    path("sessions", views.SessionListView.as_view(), name="attendance-session-list"),
    path("open-visits", views.OpenVisitListView.as_view(), name="attendance-open-visits"),
    path("marks", views.MarkListView.as_view(), name="attendance-mark-list"),
    path("register", views.RegisterView.as_view(), name="attendance-register"),
    path("percent", views.PercentView.as_view(), name="attendance-percent"),
    path("not-visited", views.NotVisitedView.as_view(), name="attendance-not-visited"),
    path("visits-by-hour", views.VisitsByHourView.as_view(), name="attendance-visits-by-hour"),
]
