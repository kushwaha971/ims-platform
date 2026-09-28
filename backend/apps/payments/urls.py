"""URL routes for the payments app (canon §0.8).

PAY-01's payment endpoints land next wave; SAL-03 needs the local QR now.
"""

from __future__ import annotations

from django.urls import path

from apps.payments.views.qr import QrSvgView

urlpatterns: list = [
    path("payments/qr.svg", QrSvgView.as_view(), name="payments-qr-svg"),
]
