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

        # PAY-01 — a payment IN settles sales invoices. Sales owns the target
        # and registers it itself (A14, ADR-056); the import of the payments
        # registry is deferred, rule D5's pattern, so the matrix still has
        # sales below payments at module level.
        from apps.payments.services.targets import register_target
        from apps.payments.services.void_seam import register_payment_void_listener
        from apps.sales.services.payment_target import SalesInvoiceTarget
        from apps.sales.services.refund_seam import on_payment_voided

        register_target(SalesInvoiceTarget())
        # SAL-04 FR-10 — voiding a refund voucher gives the note its credit back.
        register_payment_void_listener("sales.credit_note_refund", on_payment_voided)

        # A2 (ADR-042, contracts §1.2) — what a sales document posts to the khata, in the
        # `main` bucket only. The matrix this replaces was a literal in the ledger.
        from apps.common.constants import Direction
        from apps.ledger.constants import EntryType
        from apps.ledger.services.postings import register_posting_source

        register_posting_source(
            SourceType.SALES_DOCUMENT,
            module="sales",
            entry_types={
                EntryType.INVOICE: Direction.DEBIT,
                EntryType.CREDIT_NOTE: Direction.CREDIT,
            },
        )

        # ── A5 ── ADR-045, contracts §1.5 — sales is the document port's issuer: a module gets
        # a tax invoice through `apps.common.seams.documents` without importing sales.
        from apps.common.seams.documents import register_issuer
        from apps.sales.services.port_issuer import SalesIssuer

        register_issuer(SalesIssuer())
