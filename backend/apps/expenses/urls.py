"""Expense routes (canon §0.8).

`/cashbook` rather than FRD §14's `/reports/cashbook`: the projection lives in
this app for now (see `selectors/cashbook.py` on why it moves to `reports`
once payments exist), and a path under `reports/` served by another app's
urlconf would be a route nobody can find by reading `apps/reports/urls.py`.
"""

from __future__ import annotations

from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.expenses.views.expense import CashbookView, ExpenseCategoryViewSet, ExpenseViewSet

router = DefaultRouter(trailing_slash=False)
router.register("expenses", ExpenseViewSet, basename="expense")
router.register("expense-categories", ExpenseCategoryViewSet, basename="expense-category")

urlpatterns = [
    path("cashbook", CashbookView.as_view(), name="cashbook"),
    *router.urls,
]
