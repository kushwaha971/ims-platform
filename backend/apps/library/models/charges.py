"""Library charges and waivers (LIB-07 §5; task B10).

Every rupee a member owes the library is one `library_charge` posting one
`charge` line to the ledger; every rupee forgiven is one `library_waiver`
posting one `adjustment_credit`. The charge is never edited: `amount_paid`
moves only through the allocation target, `waived_amount` and
`refunded_amount` only through the waiver service, and `status` is derived
from the four figures by one function (BR-4).

G20: the FRD's `amount_due = amount − amount_paid − waived_amount` leaves a
REVERSED charge with `amount_due > 0` for ever, so "open" is
`amount_due > 0 AND reversed_at IS NULL` — `LibraryCharge.objects.open()` —
and the FIFO index carries the same predicate.

`loan` was added by B09, which owns `library_loan` (G19).
"""

from __future__ import annotations

from django.db import models
from django.db.models import F, Q

from apps.common.db.fields import MoneyField
from apps.common.models import TenantModel
from apps.library.constants import (
    CHARGE_DESCRIPTION_MAX,
    CHARGE_NUMBER_MAX,
    REASON_MAX,
    ChargeKind,
    ChargeStatus,
    WaiverKind,
)


def _in(field: str, choices: type[models.TextChoices]) -> Q:
    return Q(**{f"{field}__in": choices.values})


OPEN = Q(amount_due__gt=0, reversed_at__isnull=True)


class ChargeQuerySet(models.QuerySet):
    def open(self) -> "ChargeQuerySet":
        """Owing something and not reversed (G20)."""
        return self.filter(OPEN)


class LibraryCharge(TenantModel):
    membership = models.ForeignKey(
        "library.LibraryMembership", on_delete=models.RESTRICT, related_name="charges"
    )
    party = models.ForeignKey("parties.Party", on_delete=models.RESTRICT, related_name="+")
    number = models.CharField(max_length=CHARGE_NUMBER_MAX)
    kind = models.CharField(max_length=16)
    amount = MoneyField()
    charge_date = models.DateField()
    copy = models.ForeignKey(
        "library.LibraryCopy", on_delete=models.RESTRICT, null=True, blank=True, related_name="+"
    )
    #: B09 — the loan a circulation charge (a fine, B10b's lost or damage) belongs to.
    loan = models.ForeignKey(
        "library.LibraryLoan",
        on_delete=models.RESTRICT,
        null=True,
        blank=True,
        related_name="charges",
    )
    description = models.CharField(max_length=CHARGE_DESCRIPTION_MAX)
    fine_days = models.SmallIntegerField(null=True, blank=True)
    fine_rate = MoneyField(null=True, blank=True)
    amount_paid = MoneyField(default=0)
    waived_amount = MoneyField(default=0)
    refunded_amount = MoneyField(default=0)
    amount_due = MoneyField()
    status = models.CharField(max_length=10, default=ChargeStatus.OPEN)
    ledger_entry_id = models.UUIDField()
    reversed_at = models.DateTimeField(null=True, blank=True)
    reversed_reason = models.CharField(max_length=REASON_MAX, default="", blank=True)

    objects = ChargeQuerySet.as_manager()

    class Meta:
        db_table = "library_charge"
        constraints = [
            models.UniqueConstraint(fields=["tenant", "number"], name="uq_library_charge_number"),
            models.CheckConstraint(
                condition=_in("kind", ChargeKind), name="ck_library_charge_kind"
            ),
            models.CheckConstraint(
                condition=_in("status", ChargeStatus), name="ck_library_charge_status"
            ),
            models.CheckConstraint(condition=Q(amount__gt=0), name="ck_library_charge_amount"),
            models.CheckConstraint(
                condition=Q(amount_due=F("amount") - F("amount_paid") - F("waived_amount")),
                name="ck_library_charge_due",
            ),
            models.CheckConstraint(
                condition=Q(
                    amount_due__gte=0,
                    amount_paid__gte=0,
                    waived_amount__gte=0,
                    refunded_amount__lte=F("amount_paid"),
                ),
                name="ck_library_charge_money",
            ),
        ]
        indexes = [
            models.Index(
                fields=["tenant", "party", "charge_date", "number", "id"],
                condition=OPEN,
                name="ix_library_charge_fifo",
            ),
            models.Index(
                fields=["tenant", "membership", "status"], name="ix_library_charge_member"
            ),
            models.Index(fields=["tenant", "kind", "charge_date"], name="ix_library_charge_kind"),
            models.Index(fields=["loan"], name="ix_library_charge_loan"),
        ]

    @property
    def document_date(self) -> object:
        """The allocation protocol's merge key reads `document_date` (`record.py:294`)."""
        return self.charge_date


class LibraryWaiver(TenantModel):
    """A reduction of one charge (FR-3); append-only except `reversed_at` (BR-11)."""

    charge = models.ForeignKey(LibraryCharge, on_delete=models.RESTRICT, related_name="waivers")
    party = models.ForeignKey("parties.Party", on_delete=models.RESTRICT, related_name="+")
    kind = models.CharField(max_length=12)
    amount = MoneyField()
    reason = models.CharField(max_length=REASON_MAX, default="", blank=True)
    on_date = models.DateField()
    ledger_entry_id = models.UUIDField()
    refund_payment_id = models.UUIDField(null=True, blank=True)
    reversed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "library_waiver"
        constraints = [
            models.CheckConstraint(
                condition=_in("kind", WaiverKind), name="ck_library_waiver_kind"
            ),
            models.CheckConstraint(condition=Q(amount__gt=0), name="ck_library_waiver_amount"),
        ]
        indexes = [
            models.Index(fields=["charge"], name="ix_library_waiver_charge"),
            models.Index(fields=["tenant", "kind", "on_date"], name="ix_library_waiver_kind"),
        ]
