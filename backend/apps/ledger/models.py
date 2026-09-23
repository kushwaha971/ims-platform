"""The party ledger (Part 21 §21.3.4).

One table, and the most important invariant in the product: a line written here
is never updated and never deleted. `parties_party.balance` is a cache of the
sum of these rows, and `manage.py recalc_balances` is what proves it.
"""

from __future__ import annotations

from django.db import models

from apps.common.constants import Direction, PaymentMode
from apps.common.db.fields import MoneyField, uuid7_pk
from apps.common.models import ImmutableModel, TenantModel
from apps.ledger.constants import (
    NOTE_MAX_LENGTH,
    REASON_MAX_LENGTH,
    REFERENCE_MAX_LENGTH,
    EntryStatus,
    EntryType,
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
    source_type = models.CharField(
        max_length=32, choices=SourceType.choices, default=SourceType.MANUAL
    )
    source_id = models.UUIDField(null=True, blank=True)
    note = models.CharField(max_length=NOTE_MAX_LENGTH, blank=True, default="")
    #: BR-7 — stored on the entry, and NOT mirrored into a `payments_payment`
    #: row. A manual "You got" is a ledger-only event: the merchant is saying
    #: money arrived, not recording a payment against a document. EXP-03's
    #: cashbook reads these entries by `payment_mode` beside real payments.
    payment_mode = models.CharField(
        max_length=16, choices=PaymentMode.choices, null=True, blank=True
    )
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
            models.Index(
                fields=["tenant", "source_type", "source_id"], name="ix_ledger_source"
            ),
            # The day book and the aging report: every party, by business date.
            models.Index(fields=["tenant", "entry_date"], name="ix_ledger_tenant_date"),
        ]

    def __str__(self) -> str:  # pragma: no cover - admin convenience
        return f"{self.direction} {self.amount} on {self.entry_date}"
