"""Purchases routes (canon §0.8) — mounted under `/purchases/`."""

from __future__ import annotations

from rest_framework.routers import DefaultRouter

from apps.purchases.views.bills import PurchaseBillViewSet
from apps.purchases.views.orders import PurchaseOrderViewSet

router = DefaultRouter(trailing_slash=False)
router.register("bills", PurchaseBillViewSet, basename="purchase-bill")
router.register("orders", PurchaseOrderViewSet, basename="purchase-order")

urlpatterns = [*router.urls]
