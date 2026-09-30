"""The party ledger (Part 21 §21.3.4).

One table, and the most important invariant in the product: a line written here
is never updated and never deleted. `parties_party.balance` is a cache of the
sum of these rows, and `manage.py recalc_balances` is what proves it.
"""

from __future__ import annotations

from django.db import models

from apps.common.constants import Direction, LedgerBucket, PaymentMode, UpiApp
from apps.common.db.fields import MoneyField, uuid7_pk
from apps.common.models import ImmutableModel, TenantModel
from apps.ledger.constants import (
    NOTE_MAX_LENGTH,
    REASON_MAX_LENGTH,
    REFERENCE_MAX_LENGTH,
    EntryStatus,
    EntryType,
    ReminderChannel,
    ReminderKind,
    ReminderStatus,
    SourceType,
)


class LedgerEntry(TenantModel, ImmutableModel):
    """One line of one party's khata. Append-only (canon §0.11 rule 1).

    ── Why this model inherits `ImmutableModel` AND ships a trigger ───────────
    `ImmutableModel` stops `.save()` and `.delete()`, which catches the bug a
    developer writes. It cannot catch `QuerySet.update()`, `QuerySet.delete()`
    or raw SQL, because neither calls the model method — its own docstring says
    so. Migration 0002 installs the `forbid_update_delete` trigger Part 21 §21.1
    rule 2 mandates, so the guarantee holds against everything that can reach
    the table, including a psql session at three in the morning.

    ── Why `status` and `reversed_by` are the only mutable columns ────────────
    A correction (LED-03) does not edit the line it corrects. It writes a
    reversal row, points the two at each other, and marks the original
    `reversed`. Those two writes on the original are the entire set of changes
    the product ever makes to a posted line, which is why they are the entire
    set the trigger permits.

    **Adding a column here needs a trigger migration too.** The trigger names
    the frozen columns one by one, so a column it does not name is one an
    UPDATE may change — 0002's docstring claims the opposite, and 0004 (which
    froze `upi_app`) records why that claim is wrong. Re-create
    `forbid_update_delete()` with the new column in the same migration that
    adds it, and add a test that `QuerySet.update()` of it raises.

    ── Why there is no `updated_at` ──────────────────────────────────────────
    `TimeStampedModel` gives every table one, and Part 21 §21.1 rule 7 asks for
    it. On a row that cannot be updated it would be a column that is always
    equal to `created_at` — except on the two permitted status writes, where it
    would record the moment of a reversal and thereby look like an edit to the
    original line. The column is declared (the base class owns it) and never
    read; `reversed_by.created_at` is where "when was this undone" actually
    lives, and it is a row rather than a timestamp because a reversal has a
    reason and an author.
    """

    MUTABLE_FIELDS = ("status", "reversed_by")

    id = uuid7_pk()
    party = models.ForeignKey(
        "parties.Party",
        # Part 21 §21.5: a party with entries is ARCHIVED, never deleted.
        # RESTRICT is the database refusing to let the ledger be destroyed by a
        # cascade somebody added to a different table three sprints from now.
        on_delete=models.RESTRICT,
        related_name="ledger_entries",
    )
    direction = models.CharField(max_length=6, choices=Direction.choices)
    amount = MoneyField()
    #: BR-5. The BUSINESS date — what the merchant says happened — as opposed to
    #: `created_at`, which is when they wrote it down. Statements, aging and the
    #: day book all read this one; `created_at` only breaks ties within a day.
    entry_date = models.DateField()
    entry_type = models.CharField(max_length=24, choices=EntryType.choices)
    #: No `choices` since A2 (R8): a source registered by an engine or a vertical
    #: (`dues_due`, `library_charge`) is valid because `register_posting_source`
    #: says so, not because it is a `SourceType` member.
    source_type = models.CharField(max_length=32, default=SourceType.MANUAL)
    source_id = models.UUIDField(null=True, blank=True)
    note = models.CharField(max_length=NOTE_MAX_LENGTH, blank=True, default="")
    #: BR-7 — stored on the entry, and NOT mirrored into a `payments_payment`
    #: row. A manual "You got" is a ledger-only event: the merchant is saying
    #: money arrived, not recording a payment against a document. EXP-03's
    #: cashbook reads these entries by `payment_mode` beside real payments.
    payment_mode = models.CharField(
        max_length=16, choices=PaymentMode.choices, null=True, blank=True
    )
    #: Which UPI app the money came through — "PhonePe kiya" — so a merchant
    #: checking a disputed payment knows which app's history to open. Only ever
    #: set when `payment_mode` is `upi` (`ck_ledger_entry_upi_app_needs_upi`);
    #: the service nulls it silently for every other mode, as it does the mode
    #: itself on a debit. Optional even for UPI: "UPI, not sure which" is true.
    upi_app = models.CharField(max_length=16, choices=UpiApp.choices, null=True, blank=True)
    reference = models.CharField(max_length=REFERENCE_MAX_LENGTH, blank=True, default="")
    status = models.CharField(
        max_length=10, choices=EntryStatus.choices, default=EntryStatus.POSTED
    )
    #: Set on the ORIGINAL when it is reversed.
    reversed_by = models.ForeignKey(
        "self", on_delete=models.RESTRICT, null=True, blank=True, related_name="+"
    )
    #: Set on the REVERSAL row, pointing back at what it undoes.
    reverses = models.ForeignKey(
        "self", on_delete=models.RESTRICT, null=True, blank=True, related_name="+"
    )
    #: Set on the REPLACEMENT row of a correction (LED-03).
    supersedes = models.ForeignKey(
        "self", on_delete=models.RESTRICT, null=True, blank=True, related_name="+"
    )
    reason = models.CharField(max_length=REASON_MAX_LENGTH, null=True, blank=True)
    #: Part 21 §21.3.4 offers this as an optional statement cache. It is NOT
    #: written by LED-01 and the column is deliberately left null.
    #:
    #: A running balance is a property of an ORDER, not of a row: insert a
    #: backdated entry — which FR-3 alternate B exists to allow — and every
    #: cached figure after it in the statement is wrong, silently, for ever.
    #: LED-04 computes it with a SQL window function over the statement's own
    #: ordering, which is the only place the number is true. The column stays
    #: for a future materialised statement that owns its own invalidation.
    running_balance_after = MoneyField(null=True, blank=True)
    #: ADR-043 — which kind of money this line is: `main` (the trade khata),
    #: `loan` (lending) or `deposit` (held and returnable). Frozen like every
    #: other column by the trigger migration 0006 re-created. `main` for every row
    #: written before it existed and for every writer that does not say — LED-01,
    #: the opening, the write-off, a correction — which is true of all of them.
    bucket = models.CharField(
        max_length=8,
        choices=LedgerBucket.choices,
        default=LedgerBucket.MAIN,
        db_default=LedgerBucket.MAIN.value,
    )

    class Meta:
        db_table = "ledger_entry"
        verbose_name = "ledger entry"
        verbose_name_plural = "ledger entries"
        constraints = [
            # Part 21 §21.3.4's CHECK, and the reason the amount column carries
            # no sign: direction is a column, so a negative amount would be a
            # second way to say the same thing and the two ways would disagree.
            models.CheckConstraint(
                condition=models.Q(amount__gt=0), name="ck_ledger_entry_amount_positive"
            ),
            # §21.3.4: "reversal rows must have reverses_id NOT NULL". Stated
            # both ways round, because a row that points at what it reverses
            # while calling itself a `manual_gave` is the same defect seen from
            # the other side.
            models.CheckConstraint(
                condition=(
                    models.Q(entry_type=EntryType.REVERSAL, reverses__isnull=False)
                    | ~models.Q(entry_type=EntryType.REVERSAL)
                ),
                name="ck_ledger_entry_reversal_has_source",
            ),
            # A credit carries how the money arrived; a debit has nothing to
            # carry, because nothing arrived. §10's cross-field rule, enforced
            # where it cannot be skipped — the service nulls the field silently
            # rather than erroring (the client keeps it in form state when the
            # direction is switched), and this constraint is what makes that
            # silence safe.
            models.CheckConstraint(
                condition=(
                    models.Q(direction=Direction.CREDIT)
                    | models.Q(direction=Direction.DEBIT, payment_mode__isnull=True)
                ),
                name="ck_ledger_entry_debit_has_no_mode",
            ),
            # The app belongs to the mode that has one. With the rule above this
            # also keeps it off every debit, whose mode is always null. The
            # service drops a stray app silently (the client keeps it in form
            # state when the mode is switched); this is what makes that safe
            # for every writer that does not go through the service.
            models.CheckConstraint(
                condition=(models.Q(upi_app__isnull=True) | models.Q(payment_mode=PaymentMode.UPI)),
                name="ck_ledger_entry_upi_app_needs_upi",
            ),
            # ADR-043 — three buckets and no fourth without a migration (a fourth
            # is this CHECK plus a trigger re-creation, contracts §1.2).
            models.CheckConstraint(
                condition=models.Q(bucket__in=[choice.value for choice in LedgerBucket]),
                name="ck_ledger_entry_bucket",
            ),
            # LED-02 BR-2 — at most one POSTED opening per party. `post_opening_
            # balance()` checks it under a row lock, which is correct for every
            # caller that goes through it; this is correct for the ones that do
            # not, including the batched import FR-6 describes.
            #
            # Partial on `status='posted'` because BR-5 makes a correction a
            # reversal plus a replacement: both rows are `entry_type='opening'`
            # and both stay for ever, so a total unique index would make
            # correcting an opening impossible. Only one is ever standing.
            models.UniqueConstraint(
                fields=["party"],
                condition=models.Q(entry_type=EntryType.OPENING, status=EntryStatus.POSTED),
                name="uq_ledger_one_opening_per_party",
            ),
        ]
        indexes = [
            # §21.3.4's first index, and the one the khata timeline reads:
            # every entry for one party, newest first. The cursor paginator
            # orders by exactly this tuple, so the scan is an index walk from
            # the cursor position rather than a sort of the party's history —
            # which matters on the party a shop has traded with daily for three
            # years.
            models.Index(
                fields=["tenant", "party", "-entry_date", "-created_at"],
                name="ix_ledger_party_date",
            ),
            # The reverse lookup: "which ledger lines did this invoice post?"
            # Nothing posts from a document yet; the index is here with the
            # column pair it serves, because adding it later means an index
            # build on a table that by then has a tenant's whole history in it.
            models.Index(fields=["tenant", "source_type", "source_id"], name="ix_ledger_source"),
            # The day book and the aging report: every party, by business date.
            models.Index(fields=["tenant", "entry_date"], name="ix_ledger_tenant_date"),
            # A2 — a party's loan and deposit lines, for the lending and deposit
            # reads. Partial on `bucket <> 'main'`, so it holds only those rows and
            # costs today's tenants nothing.
            models.Index(
                fields=["tenant", "party", "bucket"],
                condition=~models.Q(bucket=LedgerBucket.MAIN),
                name="ix_ledger_party_bucket",
            ),
        ]

    def __str__(self) -> str:  # pragma: no cover - admin convenience
        return f"{self.direction} {self.amount} on {self.entry_date}"


class Reminder(TenantModel):
    """One nudge to one party about money owed (Part 21 §21.3.4, LED-06/07).

    A manual reminder is written when the merchant opens WhatsApp, their SMS
    app or the dialler from the reminder sheet; an automated one is written by
    the 09:00 job for a collection date of tomorrow (D-1) or today (D0).

    Mutable, unlike `LedgerEntry`: `status`, `sent_at`, `snapshot_balance` and
    `message_log_id` move as the reminder goes out. A reminder is a record of
    an ACTION, not of money, and the money it quoted is frozen in
    `snapshot_balance` at the moment it went (BR-1) rather than recomputed.

    `channel` is `varchar(16)` where §21.3.4 says 12: its own first value,
    `whatsapp_manual`, is fifteen characters (CR-LOG).
    """

    party = models.ForeignKey("parties.Party", on_delete=models.RESTRICT, related_name="reminders")
    due_on = models.DateField()
    channel = models.CharField(max_length=16, choices=ReminderChannel.choices)
    kind = models.CharField(
        max_length=12, choices=ReminderKind.choices, default=ReminderKind.MANUAL
    )
    status = models.CharField(
        max_length=12, choices=ReminderStatus.choices, default=ReminderStatus.SCHEDULED
    )
    #: The `notifications_message_log` row, when a message exists. A plain UUID
    #: rather than a FK: Part 20 §20.1.4 does not let `ledger` import
    #: `notifications`, and a call leaves no message row at all.
    message_log_id = models.UUIDField(null=True, blank=True)
    snapshot_balance = MoneyField(null=True, blank=True)
    note = models.CharField(max_length=255, blank=True, default="")
    scheduled_for = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    # ── A7 ── PLT-X06 / contracts §1.6: what the reminder is ABOUT, and to whom.
    #
    # `module` is `''` for today's party reminders (the khata balance). A
    # module's reminder names one record through `(source_type, source_id)` —
    # an instalment, a library loan, a hold — polymorphically, because core
    # never imports the vertical that owns the table. `subject_label` is the
    # line printed in the list and the text ("Instalment 4 of LN-0042").
    # `recipient_party` is who was contacted when it was not the party (a
    # guardian, a guarantor, R9); rows sent as one message share
    # `message_group_id` (R10).
    module = models.CharField(max_length=32, blank=True, default="", db_default="")
    source_type = models.CharField(max_length=48, null=True, blank=True)
    source_id = models.UUIDField(null=True, blank=True)
    subject_label = models.CharField(max_length=120, blank=True, default="", db_default="")
    recipient_party = models.ForeignKey(
        "parties.Party",
        on_delete=models.RESTRICT,
        null=True,
        blank=True,
        related_name="reminders_received",
    )
    message_group_id = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = "ledger_reminder"
        verbose_name = "reminder"
        verbose_name_plural = "reminders"
        constraints = [
            # §21.3.4 / LED-07 FR-7 — one automated reminder per kind per date.
            # This is what makes the scheduler's double run harmless: the second
            # INSERT … ON CONFLICT DO NOTHING writes nothing.
            #
            # A7 widened it to `(party, due_on, kind, source_id)` NULLS NOT
            # DISTINCT over the module kinds too: two loans due the same day
            # are two reminders, a rerun is still one, and today's party rows
            # (`source_id` NULL) stay unique because NULLs compare equal here.
            models.UniqueConstraint(
                fields=["party", "due_on", "kind", "source_id"],
                condition=models.Q(kind__in=["auto_d1", "auto_d0", "due", "notice"]),
                nulls_distinct=False,
                name="uq_reminder_auto_per_day",
            ),
            models.CheckConstraint(
                condition=models.Q(source_type__isnull=True, source_id__isnull=True)
                | models.Q(source_type__isnull=False, source_id__isnull=False),
                name="ck_reminder_source_complete",
            ),
            models.CheckConstraint(
                condition=~models.Q(kind="notice") | models.Q(snapshot_balance__isnull=True),
                name="ck_reminder_notice_has_no_amount",
            ),
        ]
        indexes = [
            models.Index(fields=["tenant", "status", "due_on"], name="ix_reminder_status_due"),
            # The party page's history strip, newest first (LED-06 FR-6).
            models.Index(fields=["party", "-created_at"], name="ix_reminder_party_recent"),
            # A7 — "was this loan reminded?" from the module's own screens.
            models.Index(
                fields=["tenant", "source_type", "source_id"],
                condition=models.Q(source_type__isnull=False),
                name="ix_reminder_source",
            ),
            # A7 — the daily-cap count (BR-3), module rows only.
            models.Index(
                fields=["tenant", "module", "source_id", "sent_at"],
                condition=~models.Q(module=""),
                name="ix_reminder_module_sent",
            ),
        ]

    def __str__(self) -> str:  # pragma: no cover - admin convenience
        return f"{self.kind}:{self.channel}:{self.status}"
