"""Purchases routes (canon §0.8) — mounted under `/purchases/`."""

from __future__ import annotations

from rest_framework.routers import DefaultRouter

from apps.purchases.views.bills import PurchaseBillViewSet

router = DefaultRouter(trailing_slash=False)
router.register("bills", PurchaseBillViewSet, basename="purchase-bill")

urlpatterns = [*router.urls]
