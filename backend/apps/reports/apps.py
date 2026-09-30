"""AppConfig for the reports app (Part 20 §20.1.2)."""

from __future__ import annotations

from django.apps import AppConfig


class ReportsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.reports"
    label = "reports"
    verbose_name = "Reports"

    def ready(self) -> None:
        from apps.reports import signals, tasks  # noqa: F401  (registers job handlers)

        signals.connect()

        # EXP-03's payments source (see `selectors/cash_sources.py`).
        from apps.expenses.selectors.cashbook import register_cashbook_source
        from apps.reports.selectors.cash_sources import PaymentCashSource

        register_cashbook_source(PaymentCashSource())

        # ── A4b ── "Deposits held" (FRD 00 PLT-X02 §11), through A10's registry.
        # Registered here because `payments` may not import `reports`; the rows
        # are a payments selector (rule D4: reports reads selectors, no services).
        from apps.payments.selectors.deposits import deposits_held_csv, deposits_held_report
        from apps.reports.registry import register_report

        register_report(
            "payments.deposits_held",
            module="payments",
            permission="reports.financial.read",
            label_id="payments.reports.depositsHeld",
            selector=deposits_held_report,
            csv=deposits_held_csv,
        )
