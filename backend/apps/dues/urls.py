"""Dues engine routes, under `/api/v1/dues/` (GET only, ADR-041)."""

from __future__ import annotations

from django.urls import path

from apps.dues.views import DueListView, ScheduleDetailView

urlpatterns = [
    path("dues", DueListView.as_view(), name="dues-due-list"),
    path("schedules/<uuid:pk>", ScheduleDetailView.as_view(), name="dues-schedule-detail"),
]
