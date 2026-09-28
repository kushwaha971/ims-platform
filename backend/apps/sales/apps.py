"""AppConfig for the sales app (Part 20 §20.1.2)."""

from __future__ import annotations

from django.apps import AppConfig


class SalesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.sales"
    label = "sales"
    verbose_name = "Sales"

    def ready(self) -> None:
        from apps.sales import tasks  # noqa: F401  (registers job handlers)
        from apps.sales.services.guards import register_guards

        register_guards()

        # LED-10 FR-5 — the khata names an invoice by its number.
        from apps.ledger.constants import SourceType
        from apps.ledger.selectors.sources import register_source_resolver
        from apps.sales.selectors.ledger_sources import resolve_sales_documents

        register_source_resolver(SourceType.SALES_DOCUMENT, resolve_sales_documents)
