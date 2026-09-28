"""Request helpers for the expenses suites (fixtures live in `conftest.py`)."""

from __future__ import annotations

import uuid
from typing import Any

from django.urls import reverse

EXPENSES = "v1:expense-list"
CATEGORIES = "v1:expense-category-list"
CASHBOOK = "v1:cashbook"


def expense_url(expense_id: Any, suffix: str = "") -> str:
    base = reverse("v1:expense-detail", args=[expense_id])
    return f"{base}/{suffix}" if suffix else base


def record(client: Any, category: Any, *, key: str | None = None, **extra: Any) -> Any:
    """POST a ₹500 cash expense dated 1 Apr 2026; `extra` overrides any field."""
    body = {
        "amount": "500.00",
        "expense_date": "2026-04-01",
        "category_id": str(category.id),
        "mode": "cash",
        **extra,
    }
    return client.post(
        reverse(EXPENSES),
        body,
        format="json",
        HTTP_IDEMPOTENCY_KEY=key or str(uuid.uuid4()),
    )
