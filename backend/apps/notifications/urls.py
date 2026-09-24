"""URL routes for the notifications app (canon §0.8, Part 22 §22.12)."""

from __future__ import annotations

from django.urls import path

from apps.notifications.views.notification import (
    NotificationListView,
    NotificationReadAllView,
    NotificationReadView,
    UnreadCountView,
)

urlpatterns = [
    path("notifications", NotificationListView.as_view(), name="notification-list"),
    path("notifications/unread-count", UnreadCountView.as_view(), name="notification-unread-count"),
    path("notifications/read-all", NotificationReadAllView.as_view(), name="notification-read-all"),
    path("notifications/<uuid:pk>/read", NotificationReadView.as_view(), name="notification-read"),
]
