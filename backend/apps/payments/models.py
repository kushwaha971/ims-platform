"""Payments in and out, and what they settled (Part 21 §21.3.9, PAY-01 … PAY-05).

── Two tables, and which invariants live where ───────────────────────────────
`payments_payment` is the receipt: one number, one date, one party (or none for
a walk-in sale), one total, and the modes it arrived by. `payments_allocation`
is which open documents that money settled; whatever is left is the advance
(`unallocated_amount`, a cache the service keeps).

Three money rules, each enforced by the service AND by the database, because a
second writer (an import, a psql session, next year's aggregator webhook) must
not be able to break them either:

* `amount > 0` and `0 ≤ unallocated_amount ≤ amount` — plain CHECKs below.
* Σ `mode_breakup[].amount` = `amount` (PAY-02 BR-1) — a CHECK over the jsonb,
  through the immutable SQL function migration 0001 installs, because a CHECK
  cannot hold a subquery.
* Σ allocations ≤ `amount` (PAY-01 BR-2) — a DEFERRED constraint trigger on
  `payments_allocation`, because it spans rows: checked at COMMIT, so the
  service may write the payment and its allocations in any order inside the
  transaction, and a second transaction that over-allocates fails as a whole.

── The allocation target is polymorphic, not a foreign key ─────────────────
`(document_type, document_id)` names a `sales_document` today and a
`purchases_document` when PUR-02 registers its target
(`services/targets/`). A FK per type would be a column that is null on every
other row; Part 21 §21.9 names this polymorphism as the extension point.
"""

from __future__ import annotations

from typing import Any

from django.db import models
from django.db.models import Func
from django.db.models.lookups import Exact

from apps.common.constants import LedgerBucket, PaymentMode
from apps.common.db.fields import MoneyField, uuid7_pk
from apps.common.models import TenantModel
from apps.payments.constants import (
    DEPOSIT_MODULE_MAX,
    DEPOSIT_NOTE_MAX,
    DEPOSIT_PURPOSE_MAX,
    DEPOSIT_REASON_MAX,
    DEPOSIT_SUBJECT_TYPE_MAX,
    NOTE_MAX_LENGTH,
    REFERENCE_MAX_LENGTH,
    DepositStatus,
    PaymentDirection,
    PaymentStatus,
)


class Payment(TenantModel):
    """One receipt (`RCT/26-27/0017`) or voucher (`PAYOUT/26-27/0003`).

    Never deleted and never edited after it is recorded. The only change it
    ever takes is PAY-05's void: `status`, `voided_*`, `void_reason` and
    `unallocated_amount` (which drops to zero — the allocations are gone and a
    void payment is an advance for nobody).
    """

    id = uuid7_pk()
    number = models.CharField(max_length=32)
    direction = models.CharField(max_length=3, choices=PaymentDirection.choices)
    party = models.ForeignKey(
        "parties.Party",
        # Part 21 §21.5 — a party with payments is archived, never deleted.
        on_delete=models.RESTRICT,
        null=True,
        blank=True,
        related_name="payments",
    )
    payment_date = models.DateField()
    amount = MoneyField()
    #: `[{"mode": "upi", "amount": "700.00", "reference": "UTR…", "upi_app":
    #: "phonepe"}, {"mode": "cash", "amount": "300.00"}]` — keys whitelisted by
    #: the service (PAY-02 §19), amounts as strings (canon rule 3).
    mode_breakup = models.JSONField()
    primary_mode = models.CharField(max_length=12, choices=PaymentMode.choices)
    reference = models.CharField(max_length=REFERENCE_MAX_LENGTH, blank=True, default="")
    note = models.CharField(max_length=NOTE_MAX_LENGTH, blank=True, default="")
    status = models.CharField(
        max_length=10, choices=PaymentStatus.choices, default=PaymentStatus.RECORDED
    )
    voided_at = models.DateTimeField(null=True, blank=True)
    voided_by = models.ForeignKey(
        "platform.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    void_reason = models.CharField(max_length=160, null=True, blank=True)
    unallocated_amount = MoneyField(default=0)
    #: Where it was recorded from (`invoice`, `party`, `list`, `issue`, `walk_in`)
    #: and, for a payment taken at issue, the document — analytics and the
    #: receipt's "this is the bill's own receipt" line (PAY-04 FR-10).
    meta = models.JSONField(default=dict, blank=True)
    #: A4a (R5, ADR-043) — the ledger bucket this payment's one khata line posted in:
    #: the bucket of what it settles (`main` for the shop, `loan` for lending,
    #: `deposit` for a held deposit), `main` when it settled nothing. Written ONCE by
    #: `record_payment` and never changed by any service — what stays unallocated
    #: after a document void is still an advance in that bucket. A reconciliation
    #: test asserts it equals the payment's `payment_in`/`payment_out` line.
    bucket = models.CharField(
        max_length=8,
        choices=LedgerBucket.choices,
        default=LedgerBucket.MAIN,
        db_default=LedgerBucket.MAIN.value,
    )

    class Meta:
        db_table = "payments_payment"
        verbose_name = "payment"
        verbose_name_plural = "payments"
        constraints = [
            models.UniqueConstraint(fields=["tenant", "number"], name="uq_payment_number"),
            models.CheckConstraint(
                condition=models.Q(amount__gt=0), name="ck_payment_amount_positive"
            ),
            models.CheckConstraint(
                condition=models.Q(unallocated_amount__gte=0)
                & models.Q(unallocated_amount__lte=models.F("amount")),
                name="ck_payment_unallocated_within_amount",
            ),
            # PAY-05 BR-1 — a void always says why.
            models.CheckConstraint(
                condition=models.Q(status=PaymentStatus.RECORDED)
                | models.Q(status=PaymentStatus.VOID, void_reason__isnull=False),
                name="ck_payment_void_has_reason",
            ),
            # PUR-02 BR-5 — money out always has somebody it went to.
            models.CheckConstraint(
                condition=models.Q(direction=PaymentDirection.IN) | models.Q(party__isnull=False),
                name="ck_payment_out_has_party",
            ),
            # A4a (R5) — the ledger's CHECK, the ledger's three buckets.
            models.CheckConstraint(
                condition=models.Q(bucket__in=[choice.value for choice in LedgerBucket]),
                name="ck_payment_bucket",
            ),
            # ── A4b ── an adjustment moved no money, so it is never half of a split.
            models.CheckConstraint(
                condition=~models.Q(primary_mode=PaymentMode.ADJUSTMENT)
                | Exact(
                    Func(
                        models.F("mode_breakup"),
                        function="jsonb_array_length",
                        output_field=models.IntegerField(),
                    ),
                    1,
                ),
                name="ck_payment_adjustment_is_whole",
            ),
        ]
        indexes = [
            models.Index(
                fields=["tenant", "-payment_date", "-created_at"], name="ix_payment_tenant_date"
            ),
            models.Index(
                fields=["tenant", "party", "-payment_date"],
                condition=models.Q(party__isnull=False),
                name="ix_payment_tenant_party",
            ),
            models.Index(
                fields=["tenant", "direction", "status"], name="ix_payment_direction_status"
            ),
        ]

    def __str__(self) -> str:  # pragma: no cover - admin convenience
        return f"{self.number} {self.amount}"


class Allocation(TenantModel):
    """How much of one payment settled one document. Deleted, never flagged, by a void.

    PAY-05 BR-2: `payments_allocation` has no status. The audit row's `before`
    snapshot keeps what a void removed; the table holds only what is true now.
    """

    payment = models.ForeignKey(Payment, on_delete=models.RESTRICT, related_name="allocations")
    document_type = models.CharField(max_length=32)
    document_id = models.UUIDField()
    amount = MoneyField()

    class Meta:
        db_table = "payments_allocation"
        verbose_name = "payment allocation"
        verbose_name_plural = "payment allocations"
        constraints = [
            models.UniqueConstraint(
                fields=["payment", "document_type", "document_id"], name="uq_allocation_target"
            ),
            models.CheckConstraint(
                condition=models.Q(amount__gt=0), name="ck_allocation_amount_positive"
            ),
        ]
        indexes = [
            # "Which payments settled this invoice?" — the invoice page and a
            # document void (which releases them) both ask it.
            models.Index(
                fields=["tenant", "document_type", "document_id"], name="ix_allocation_document"
            ),
        ]

    def __str__(self) -> str:  # pragma: no cover - admin convenience
        return f"{self.document_type}:{self.document_id} {self.amount}"


# ── A4b ── held deposits (ADR-044, FRD 00 PLT-X02 §5, contracts §1.4) ────────


class HeldDeposit(TenantModel):
    """Money a party left with the business that is NOT the business's own.

    A library or room security deposit: received by a payment IN in the ledger's
    `deposit` bucket (so it never shows the party in advance, never enters FIFO
    and never counts as income), returned by a payment OUT, and applied to what
    the party owes only by an explicit act — two linked `adjustment` payments
    (`DepositApplication`). The four money columns are caches the service keeps;
    the evidence is the payments, their allocations and their ledger lines, and
    `recalc` of them must reproduce these figures (T-PLT-X02-7).

    Points at the vertical's own row by name (`subject_type`, `subject_id`),
    never by a foreign key (10-architecture §5 rule 3).
    """

    party = models.ForeignKey(
        "parties.Party", on_delete=models.RESTRICT, related_name="held_deposits"
    )
    module = models.CharField(max_length=DEPOSIT_MODULE_MAX)
    subject_type = models.CharField(max_length=DEPOSIT_SUBJECT_TYPE_MAX)
    subject_id = models.UUIDField()
    purpose = models.CharField(max_length=DEPOSIT_PURPOSE_MAX)
    expected_amount = MoneyField()
    received_amount = MoneyField(default=0)
    applied_amount = MoneyField(default=0)
    refunded_amount = MoneyField(default=0)
    held_amount = MoneyField(default=0)
    status = models.CharField(
        max_length=10, choices=DepositStatus.choices, default=DepositStatus.EXPECTED
    )
    note = models.CharField(max_length=DEPOSIT_NOTE_MAX, blank=True, default="")
    version = models.IntegerField(default=1)

    class Meta:
        db_table = "payments_held_deposit"
        verbose_name = "held deposit"
        verbose_name_plural = "held deposits"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(expected_amount__gt=0), name="ck_deposit_expected_positive"
            ),
            # BR-1 — the formula, and never below zero.
            models.CheckConstraint(
                condition=models.Q(
                    held_amount=models.F("received_amount")
                    - models.F("applied_amount")
                    - models.F("refunded_amount")
                ),
                name="ck_deposit_held_formula",
            ),
            models.CheckConstraint(
                condition=models.Q(held_amount__gte=0), name="ck_deposit_held_non_negative"
            ),
            # BR-3 — receive is capped at what was expected.
            models.CheckConstraint(
                condition=models.Q(received_amount__lte=models.F("expected_amount")),
                name="ck_deposit_received_within_expected",
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=[choice.value for choice in DepositStatus]),
                name="ck_deposit_status",
            ),
        ]
        indexes = [
            models.Index(fields=["tenant", "party", "status"], name="ix_deposit_party"),
            models.Index(
                fields=["tenant", "subject_type", "subject_id"], name="ix_deposit_subject"
            ),
            models.Index(
                fields=["tenant", "module"],
                name="ix_deposit_module_open",
                condition=~models.Q(status=DepositStatus.RELEASED),
            ),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"{self.purpose}: {self.held_amount} held"

    # What `record_payment` and `void_payment` read off any allocated document —
    # a deposit has no number or document date of its own, so a receipt row and
    # a refusal name it by its purpose ("Library deposit is no longer open").
    @property
    def number(self) -> str:
        return self.purpose

    @property
    def document_date(self) -> Any:
        return self.created_at.date() if self.created_at else None


class DepositApplication(TenantModel):
    """One application of a held deposit to what the party owes (PLT-X02 flow 3).

    Two payments, one act: `refund_payment` — the adjustment OUT that takes the
    money out of the deposit bucket — and `settle_payment` — the adjustment IN
    that settles the charges in the main bucket. Voiding either voids both and
    stamps `voided_at` (BR-7); the row stays, as the payments do.
    """

    deposit = models.ForeignKey(HeldDeposit, on_delete=models.RESTRICT, related_name="applications")
    amount = MoneyField()
    reason = models.CharField(max_length=DEPOSIT_REASON_MAX)
    refund_payment = models.OneToOneField(
        Payment, on_delete=models.RESTRICT, related_name="deposit_refund_application"
    )
    settle_payment = models.OneToOneField(
        Payment, on_delete=models.RESTRICT, related_name="deposit_settle_application"
    )
    voided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "payments_deposit_application"
        verbose_name = "deposit application"
        verbose_name_plural = "deposit applications"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gt=0), name="ck_deposit_application_positive"
            ),
        ]
        indexes = [
            models.Index(fields=["tenant", "deposit"], name="ix_deposit_application_deposit"),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"{self.amount} from {self.deposit_id}"
