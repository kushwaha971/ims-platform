"""AppConfig for the dues engine (ADR-041, contracts §2.1)."""

from __future__ import annotations

from django.apps import AppConfig


class DuesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.dues"
    label = "dues"
    verbose_name = "Dues"

    def ready(self) -> None:
        # Contracts §1.2: the engine's three ledger sources, all registered now so a
        # wrong shape is a start-up error from day one (DUE-01 note). `dues_due` posts
        # a charge in main; a component posts interest or a charge in the loan
        # bucket (expectation mode); an adjustment posts either way, in either.
        from apps.common.constants import Direction, LedgerBucket
        from apps.dues.constants import SOURCE_ADJUSTMENT, SOURCE_COMPONENT, SOURCE_DUE
        from apps.ledger.constants import EntryType
        from apps.ledger.services.postings import register_posting_source

        main, loan = LedgerBucket.MAIN.value, LedgerBucket.LOAN.value
        register_posting_source(
            SOURCE_DUE,
            module="dues",
            entry_types={EntryType.CHARGE: Direction.DEBIT},
            buckets=frozenset({main}),
        )
        register_posting_source(
            SOURCE_COMPONENT,
            module="dues",
            entry_types={EntryType.INTEREST: Direction.DEBIT, EntryType.CHARGE: Direction.DEBIT},
            buckets=frozenset({loan}),
        )
        register_posting_source(
            SOURCE_ADJUSTMENT,
            module="dues",
            entry_types={
                EntryType.CHARGE: Direction.DEBIT,
                EntryType.ADJUSTMENT_CREDIT: Direction.CREDIT,
            },
            buckets=frozenset({main, loan}),
        )
