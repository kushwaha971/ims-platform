"""AppConfig for the purchases app (Part 20 §20.1.2)."""

from __future__ import annotations

from django.apps import AppConfig


class PurchasesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.purchases"
    label = "purchases"
    verbose_name = "Purchases"

    def ready(self) -> None:
        from apps.purchases import tasks  # noqa: F401  (registers job handlers)
        from apps.purchases.services.guards import register_guards

        register_guards()

        # LED-10 FR-5 — the khata names a purchase bill by its number.
        from apps.ledger.constants import SourceType
        from apps.ledger.selectors.sources import register_source_resolver
        from apps.purchases.selectors.ledger_sources import resolve_purchase_documents

        register_source_resolver(SourceType.PURCHASE_DOCUMENT, resolve_purchase_documents)
