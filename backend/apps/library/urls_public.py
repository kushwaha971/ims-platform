"""The library's no-login route — mounted under `/public/`."""

from __future__ import annotations

from django.urls import path

from apps.library.views.self_checkin import SelfCheckInView

urlpatterns = [
    path("in/<str:token>", SelfCheckInView.as_view(), name="public-self-checkin"),
]
