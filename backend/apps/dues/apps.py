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

        # DEC-019 — a charge-mode due is trade money owed to the business beside its bills
        # (it is issued through the Shop's document port and paid with them), so it is the
        # `shop` bucket's; a loan's components stay in `loan`.
        main, loan = LedgerBucket.SHOP.value, LedgerBucket.LOAN.value
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

        # ── DUE-02 ── the daily run, the `dues_due` origin, the khata's labels.
        from apps.common.jobs import Schedule, register_schedule
        from apps.common.seams.documents import register_origin
        from apps.dues import tasks  # noqa: F401  (registers job handlers)
        from apps.dues.origins import DuesDueOrigin, resolve_components, resolve_dues
        from apps.ledger.selectors.sources import register_source_resolver
        from apps.notifications.constants import NotificationCategory, NotificationSeverity
        from apps.notifications.services.notify import NotificationType, register_notification_type

        # Contracts §2.1, verbatim; the handlers above land in the same commit
        # because `materialise_due_schedules` raises for a schedule with none.
        register_schedule(Schedule(tasks.RUN, period="daily", at_hour_ist=0, minute=30))
        # C-2 / Q-D1: one origin type for every consuming vertical, module "dues".
        register_origin(SOURCE_DUE, module="dues", listener=DuesDueOrigin())
        register_source_resolver(SOURCE_DUE, resolve_dues)
        register_source_resolver(SOURCE_COMPONENT, resolve_components)
        # BR-2, C-19: the engine has no page, so the row opens the inbox; owners
        # only, once per day (`group_key` carries the date). The client has no
        # words for it yet and shows this English title (C-22).
        register_notification_type(
            "dues.run_failed",
            NotificationType(
                code="dues.run_failed",
                category=NotificationCategory.SYSTEM,
                severity=NotificationSeverity.DANGER,
                required_permission="platform.tenant.manage",
                title_en="{failed} recurring charges could not be added on {date}",
                body_en="Everything else was added. These will be tried again tonight.",
                group_window=24 * 60,
            ),
        )

        # ── DUE-03 ── what a payment can settle: `dues_due` (main, auto) and
        # `dues_instalment` (loan, explicit). Document-mode dues settle through
        # their invoice and are not targets (EC-3).
        from apps.dues.services.payment_target import register_dues_targets

        register_dues_targets()
