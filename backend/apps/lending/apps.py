"""AppConfig for the lending vertical (FRD lending.md; ADR-041)."""

from __future__ import annotations

from django.apps import AppConfig


class LendingConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.lending"
    label = "lending"
    verbose_name = "Lending & collections"

    def ready(self) -> None:
        """Registrations with the core and the dues engine, all deferred imports."""
        from apps.common.constants import Direction, LedgerBucket
        from apps.dues.registry import register_subject
        from apps.ledger.constants import EntryType
        from apps.ledger.selectors.sources import register_source_resolver
        from apps.ledger.services.postings import register_posting_source
        from apps.lending.constants import (
            MODULE,
            NUMBER_BORROWER,
            NUMBER_LOAN,
            SOURCE_DEDUCTION,
            SUBJECT_LOAN,
        )
        from apps.lending.services import loans, messages
        from apps.parties.services.roles import register_party_role
        from apps.payments.services.targets import register_target
        from apps.platform_app.services.calendar import register_calendar_reader
        from apps.platform_app.services.sequences import register_number_kind

        register_number_kind(
            NUMBER_LOAN,
            module=MODULE,
            mode="perpetual",
            default_prefix="LN-",
            padding=4,
            label_id="lending.numbering.loan",
        )
        register_number_kind(
            NUMBER_BORROWER,
            module=MODULE,
            mode="perpetual",
            default_prefix="B-",
            padding=4,
            label_id="lending.numbering.borrower",
        )
        register_calendar_reader(MODULE)
        # FRD §0.3 — a deduction at disbursal is a `charge` in the loan bucket.
        register_posting_source(
            SOURCE_DEDUCTION,
            module=MODULE,
            entry_types={EntryType.CHARGE: Direction.DEBIT},
            buckets=frozenset({LedgerBucket.LOAN.value}),
        )
        register_source_resolver(SOURCE_DEDUCTION, loans.resolve_deductions)
        # LEN-10 — a write-off is one credit off the borrower's loan balance.
        from apps.lending.services.closing import SOURCE_WRITE_OFF

        register_posting_source(
            SOURCE_WRITE_OFF,
            module=MODULE,
            entry_types={EntryType.ADJUSTMENT_CREDIT: Direction.CREDIT},
            buckets=frozenset({LedgerBucket.LOAN.value}),
        )
        register_target(loans.LendingLoanTarget())
        register_subject(
            SUBJECT_LOAN,
            module=MODULE,
            label=loans.loan_labels,
            on_due_changed=loans.on_due_changed,
            reminder_template_key="lending_instalment_due",
        )
        register_party_role(
            "lending_borrower",
            module=MODULE,
            label_id="lending.role.borrower",
            party_ids=loans.borrower_party_ids,
        )
        # LEN-12 — the policy, the reminder sources and the fixed texts.
        messages.register()

        # docs/platform/14 §4.2 — Lending & collections as an app.
        from apps.platform_app.apps_registry import AppSpec, register_app

        register_app(
            AppSpec(
                code="lending",
                label_id="nav.workspace.lending",
                anchor="lending",
                capabilities=frozenset({"lending", "parties", "ledger", "payments", "dues"}),
                entry_permission="lending.today.read",
                home_path="/lending",
                order=20,
            )
        )

        # docs/platform/14 step 5 — the setup checklist on this app's home.
        from apps.platform_app.apps_registry import register_app_setup
        from apps.lending.selectors.setup import lending_setup

        register_app_setup("lending", lending_setup)
