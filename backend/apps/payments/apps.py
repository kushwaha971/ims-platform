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

        # PAY-01 — what a payment IN can settle, and PUR-02 — what a payment OUT
        # can settle: supplier bills and nothing else (CR-2026-09-28-INT-A).
        # See `services/targets/`.
        from apps.payments.services.targets import register_target
        from apps.payments.services.targets.purchases import PurchaseBillTarget
        from apps.payments.services.targets.sales import SalesInvoiceTarget

        register_target(SalesInvoiceTarget())
        register_target(PurchaseBillTarget())

        # PUR-02 BR-4 — voiding a bill leaves its supplier payments as advances.
        from apps.payments.services.void import release_purchase_bill
        from apps.purchases.services.payment_seam import register_void_listener

        register_void_listener(release_purchase_bill)

        # LED-10 FR-5 — the khata names a receipt by its number.
        from apps.ledger.constants import SourceType
        from apps.ledger.selectors.sources import register_source_resolver
        from apps.payments.selectors.payments import resolve_payments

        register_source_resolver(SourceType.PAYMENT, resolve_payments)
