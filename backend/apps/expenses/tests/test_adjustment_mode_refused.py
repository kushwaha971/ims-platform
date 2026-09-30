"""R24 — the expenses validator refuses `adjustment` (A4b, contracts §1.4).

An expense "paid by adjustment" is a cost the cashbook would never show leaving
the drawer — R4 excludes that mode from it — so the books would say money was
spent that the cash count never missed.
"""

from __future__ import annotations

from typing import Any

import pytest

from apps.expenses.models import Expense
from apps.expenses.tests.helpers import record

pytestmark = pytest.mark.django_db


def test_an_expense_paid_by_adjustment_is_refused(owner: Any, categories: dict) -> None:
    category = next(iter(categories.values()))
    response = record(owner, category, mode="adjustment")
    assert response.status_code == 400, response.json()
    assert "mode" in response.json()["error"]["details"]
    assert not Expense.objects.exists()
