"""Fixtures shared by the expenses suites."""

from __future__ import annotations

from typing import Any

import pytest

from apps.common.management.commands.seed_reference_data import seed_expense_categories
from apps.expenses.models import ExpenseCategory


@pytest.fixture
def categories(tenant: Any) -> dict[str, ExpenseCategory]:
    """The nine seeded categories, keyed by `system_code`, as onboarding writes them."""
    seed_expense_categories(tenant)
    return {c.system_code: c for c in ExpenseCategory.objects.for_tenant(tenant)}


@pytest.fixture
def owner(tenant: Any, api_as: Any) -> Any:
    client, _ = api_as(tenant)
    return client
