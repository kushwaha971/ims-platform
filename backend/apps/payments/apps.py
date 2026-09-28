"""AppConfig for the payments app (Part 20 §20.1.2)."""

from __future__ import annotations

from django.apps import AppConfig


class PaymentsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.payments"
    label = "payments"
    verbose_name = "Payments"

    def ready(self) -> None:
        from apps.payments import tasks  # noqa: F401  (registers job handlers)

        # PAY-01 — what a payment IN can settle. PUR-02 registers the purchase
        # bill target (direction "out") beside it; see `services/targets/`.
        from apps.payments.services.targets import register_target
        from apps.payments.services.targets.sales import SalesInvoiceTarget

        register_target(SalesInvoiceTarget())

        # LED-10 FR-5 — the khata names a receipt by its number.
        from apps.ledger.constants import SourceType
        from apps.ledger.selectors.sources import register_source_resolver
        from apps.payments.selectors.payments import resolve_payments

        register_source_resolver(SourceType.PAYMENT, resolve_payments)
