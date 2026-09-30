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

        # A2 (ADR-042, ADR-043, contracts §1.2) — a payment posts its one khata line in the
        # bucket of what it settles: `main` for the shop, `loan` for lending, `deposit` for
        # a held deposit. The only core source registered in all three.
        from apps.common.constants import Direction, LedgerBucket
        from apps.ledger.constants import EntryType
        from apps.ledger.services.postings import register_posting_source

        register_posting_source(
            SourceType.PAYMENT,
            module="payments",
            entry_types={
                EntryType.PAYMENT_IN: Direction.CREDIT,
                EntryType.PAYMENT_OUT: Direction.DEBIT,
            },
            buckets=frozenset(LedgerBucket.values),
        )

        # ── A4b ── held deposits (ADR-044, contracts §1.4): payments' own two
        # targets, and PLT-X10's refusal to switch off a module whose deposits
        # still hold money — for every module that writes the deposit bucket.
        from apps.parties.services.balance import BUCKET_WRITER_MODULES
        from apps.payments.services.deposits import open_deposit_counter, register_deposit_targets
        from apps.platform_app.services.guards import register_module_off_guard

        register_deposit_targets()
        for module in sorted(BUCKET_WRITER_MODULES[LedgerBucket.DEPOSIT.value]):
            register_module_off_guard(
                module, open_deposit_counter(module), label_id="payments.off.depositsOpen"
            )

        # PLT-X04 BR-5 / PLT-X02 EC-7: a party whose deposit still holds money is
        # not archived (A6's archive guards). Keyed `payments`, where the deposit
        # panel lives: a merchant who cannot reach payments cannot return it either.
        from apps.parties.services.archive import register_archive_guard
        from apps.payments.services.deposits import deposits_archive_guard

        register_archive_guard("payments", deposits_archive_guard)
        # …and payments itself stays on while any deposit holds money, or the
        # guard above would stop being asked (A6 BR-3 skips an unreachable module).
        from apps.payments.services.deposits import held_deposit_counter

        register_module_off_guard(
            "payments", held_deposit_counter(), label_id="payments.off.depositsHeld"
        )
