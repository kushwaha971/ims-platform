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

from django.db import models

from apps.common.constants import LedgerBucket, PaymentMode
from apps.common.db.fields import MoneyField, uuid7_pk
from apps.common.models import TenantModel
from apps.payments.constants import (
    NOTE_MAX_LENGTH,
    REFERENCE_MAX_LENGTH,
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
