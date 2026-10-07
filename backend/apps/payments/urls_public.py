"""The payer's page behind a UPI pay link — mounted under `/public/`, no login."""

from __future__ import annotations

from django.urls import path

from apps.payments.views.pay_link import PublicPayLinkView

urlpatterns = [
    path("pay/<str:token>", PublicPayLinkView.as_view(), name="public-pay-link"),
]
