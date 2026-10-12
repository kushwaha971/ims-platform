"""`meta.has_any` on the expenses list (approved designs, 12 Oct 2026): an
empty book hides its search, filters and ₹0 total; a filter that found nothing
keeps them."""

from __future__ import annotations

from typing import Any

import pytest
from django.urls import reverse

from apps.expenses.tests.helpers import EXPENSES, record

pytestmark = pytest.mark.django_db


def test_no_expenses_says_so(owner: Any) -> None:
    assert owner.get(reverse(EXPENSES)).json()["meta"]["has_any"] is False


def test_a_filter_that_finds_nothing_still_says_expenses_exist(
    owner: Any, categories: dict
) -> None:
    assert record(owner, next(iter(categories.values()))).status_code == 201
    body = owner.get(reverse(EXPENSES), {"q": "nobody-wrote-this"}).json()
    assert body["data"] == [] and body["meta"]["has_any"] is True
