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

        # DEC-019 — an expense on credit is owed by the Shop, in the `shop` bucket.
        from apps.common.constants import Direction, LedgerBucket
        from apps.ledger.constants import EntryType
        from apps.ledger.services.postings import register_posting_source

        register_posting_source(
            SourceType.EXPENSE,
            module="expenses",
            entry_types={EntryType.EXPENSE: Direction.CREDIT},
            buckets=frozenset({LedgerBucket.SHOP.value}),
        )

        # Library P0 — a vertical's profit view reads spend through the seam, never this app.
        from apps.common.seams.spend import register_spend_reader
        from apps.expenses.selectors.expense import spend_by_category

        register_spend_reader(spend_by_category)
