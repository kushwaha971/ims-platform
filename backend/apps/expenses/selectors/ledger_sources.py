"""LED-10 FR-5 — how a khata line names the expense it came from.

Registered with `ledger.selectors.sources` in `ExpensesConfig.ready()`: the
ledger may not import expenses (Part 20 §20.1.4), so expenses tells it.
"""

from __future__ import annotations

from apps.expenses.models import Expense


def resolve_expenses(ids: set[str]) -> dict[str, dict]:
    rows = Expense.objects.filter(pk__in=ids).values_list("id", "number", "status")
    return {
        str(pk): {"number": number, "status": status, "kind": "expense"}
        for pk, number, status in rows
    }
