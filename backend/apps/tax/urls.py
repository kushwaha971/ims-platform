"""Tax routes (canon §0.8, Part 22 §22.12)."""

from __future__ import annotations

from django.urls import path

from apps.tax.views.rates import HsnSearchView, TaxRateListView

urlpatterns = [
    path("taxes/rates", TaxRateListView.as_view(), name="tax-rates"),
    path("taxes/hsn", HsnSearchView.as_view(), name="tax-hsn"),
]
