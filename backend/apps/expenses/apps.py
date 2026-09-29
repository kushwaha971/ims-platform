"""AppConfig for the expenses app (Part 20 §20.1.2)."""

from __future__ import annotations

from django.apps import AppConfig


class ExpensesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.expenses"
    label = "expenses"
    verbose_name = "Expenses"

    def ready(self) -> None:
        from apps.expenses import tasks  # noqa: F401  (registers job handlers)

        # LED-10 FR-5 — the khata names an unpaid expense by its number.
        from apps.expenses.selectors.ledger_sources import resolve_expenses
        from apps.ledger.constants import SourceType
        from apps.ledger.selectors.sources import register_source_resolver

        register_source_resolver(SourceType.EXPENSE, resolve_expenses)

        # A2 (ADR-042, contracts §1.2) — an unpaid party expense posts one credit, `main`.
        from apps.common.constants import Direction
        from apps.ledger.constants import EntryType
        from apps.ledger.services.postings import register_posting_source

        register_posting_source(
            SourceType.EXPENSE, module="expenses", entry_types={EntryType.EXPENSE: Direction.CREDIT}
        )
