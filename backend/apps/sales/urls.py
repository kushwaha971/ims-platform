"""Sales routes (canon §0.8) — mounted under `/sales/`."""

from __future__ import annotations

from rest_framework.routers import DefaultRouter

from apps.sales.views.invoices import InvoiceViewSet

router = DefaultRouter(trailing_slash=False)
router.register("invoices", InvoiceViewSet, basename="sales-invoice")

urlpatterns = [*router.urls]
