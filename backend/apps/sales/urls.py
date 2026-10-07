"""Sales routes (canon §0.8) — mounted under `/sales/`."""

from __future__ import annotations

from rest_framework.routers import DefaultRouter

from apps.sales.views.challans import DeliveryChallanViewSet
from apps.sales.views.credit_notes import CreditNoteViewSet
from apps.sales.views.estimates import EstimateViewSet
from apps.sales.views.invoices import InvoiceViewSet
from apps.sales.views.orders import SalesOrderViewSet

router = DefaultRouter(trailing_slash=False)
router.register("invoices", InvoiceViewSet, basename="sales-invoice")
router.register("estimates", EstimateViewSet, basename="sales-estimate")
router.register("orders", SalesOrderViewSet, basename="sales-order")
router.register("delivery-challans", DeliveryChallanViewSet, basename="sales-challan")
router.register("credit-notes", CreditNoteViewSet, basename="sales-credit-note")

urlpatterns = [*router.urls]
