"""AppConfig for the payments app (Part 20 §20.1.2)."""

from __future__ import annotations

from django.apps import AppConfig


class PaymentsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.payments"
    label = "payments"
    verbose_name = "Payments"

    def ready(self) -> None:
        # The sales and purchase-bill targets, PUR-02's bill void listener and
        # SAL-04's refund release are registered by their owners' `ready()`
        # (A14, ADR-056): core `payments` imports no Shop & billing app. What
        # stays here is payments' own: its job handlers and, for LED-10 FR-5,
        # the resolver that lets the khata name a receipt by its number.
        from apps.ledger.constants import SourceType
        from apps.ledger.selectors.sources import register_source_resolver
        from apps.payments import tasks  # noqa: F401  (registers job handlers)
        from apps.payments.selectors.payments import resolve_payments

        register_source_resolver(SourceType.PAYMENT, resolve_payments)
