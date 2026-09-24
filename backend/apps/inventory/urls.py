"""Inventory routes (canon §0.8, Part 22 §22.6)."""

from __future__ import annotations

from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.inventory.views.items import (
    CategoryViewSet,
    ItemViewSet,
    LowStockView,
    StockAdjustmentViewSet,
    StockSummaryView,
    UnitViewSet,
)

router = DefaultRouter(trailing_slash=False)
router.register("items", ItemViewSet, basename="item")
router.register("categories", CategoryViewSet, basename="category")
router.register("units", UnitViewSet, basename="unit")
router.register("stock-adjustments", StockAdjustmentViewSet, basename="stock-adjustment")

urlpatterns = [
    path("stock/summary", StockSummaryView.as_view(), name="stock-summary"),
    path("stock/low", LowStockView.as_view(), name="stock-low"),
    *router.urls,
]
