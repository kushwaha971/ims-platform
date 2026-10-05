"""The lending tables (FRD lending LEN-02, -04, -06, -07, -08).

The loan keeps no balance of its own (FRD §0.3): money is payments, obligations
are ledger lines in the `loan` bucket, and the dues engine says when money is
expected. These tables hold what only lending knows — the terms as agreed, who
collects where, and what a visit found.
"""

from __future__ import annotations

from django.db import models
from django.db.models import F, Q
from django.db.models.functions import Lower

from apps.common.db.fields import MoneyField
from apps.common.models import TenantModel
from apps.lending.constants import (
    LABEL_MAX,
    NAME_MAX,
    NOTE_MAX,
    REASON_MAX,
    DeductionKind,
    Frequency,
    LoanStatus,
    PlanType,
    RateUnit,
    VisitOutcome,
)


def _in(field: str, choices: type[models.TextChoices]) -> Q:
    return Q(**{f"{field}__in": choices.values})


class LendingRoute(TenantModel):
    """A collection round ("Market lane", "Station road"), walked by one agent."""

    name = models.CharField(max_length=NAME_MAX)
    agent = models.ForeignKey(
        "platform.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    is_active = models.BooleanField(default=True)
    sort_order = models.SmallIntegerField(default=0)
    version = models.IntegerField(default=1)

    class Meta:
        db_table = "lending_route"
        constraints = [
            models.UniqueConstraint(F("tenant"), Lower("name"), name="uq_lending_route_name"),
        ]


class LendingBorrower(TenantModel):
    """The lending role of a party (ADR-046): one row per borrower."""

    party = models.OneToOneField("parties.Party", on_delete=models.RESTRICT, related_name="+")
    borrower_number = models.CharField(max_length=24)
    guarantor = models.ForeignKey(
        "parties.Party", on_delete=models.RESTRICT, null=True, blank=True, related_name="+"
    )
    route = models.ForeignKey(
        LendingRoute, on_delete=models.RESTRICT, null=True, blank=True, related_name="borrowers"
    )
    area = models.CharField(max_length=NAME_MAX, default="", blank=True)
    notes = models.TextField(default="", blank=True)
    version = models.IntegerField(default=1)

    class Meta:
        db_table = "lending_borrower"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "borrower_number"], name="uq_lending_borrower_number"
            ),
        ]


class LendingLoan(TenantModel):
    """One loan: the terms as agreed, frozen at save (LEN-04 BR-1), and its links
    to the disbursal payment and the dues schedule."""

    number = models.CharField(max_length=32)
    borrower = models.ForeignKey(LendingBorrower, on_delete=models.RESTRICT, related_name="loans")
    party = models.ForeignKey("parties.Party", on_delete=models.RESTRICT, related_name="+")
    route = models.ForeignKey(
        LendingRoute, on_delete=models.RESTRICT, null=True, blank=True, related_name="loans"
    )
    route_seq = models.IntegerField(default=0)
    plan_type = models.CharField(max_length=16)
    principal = MoneyField()
    rate = models.DecimalField(max_digits=9, decimal_places=4, default=0)
    rate_unit = models.CharField(max_length=10, default=RateUnit.PER_MONTH)
    frequency = models.CharField(max_length=12)
    instalment_count = models.IntegerField()
    per_instalment_amount = MoneyField(null=True, blank=True)
    collection_weekdays = models.SmallIntegerField(default=63)
    rounding_rule = models.CharField(max_length=10, default="paise")
    disbursed_on = models.DateField()
    first_due_on = models.DateField()
    maturity_on = models.DateField()
    instalment_amount = MoneyField()
    total_interest = MoneyField()
    total_payable = MoneyField()
    deductions_total = MoneyField(default=0)
    cash_handed_over = MoneyField()
    effective_annual_rate = models.DecimalField(max_digits=7, decimal_places=2)
    #: What the disbursal payment has paid out (the target's `amount_paid`).
    disbursed_amount = MoneyField(default=0)
    disbursal_payment_id = models.UUIDField(null=True, blank=True)
    schedule_id = models.UUIDField(null=True, blank=True)
    status = models.CharField(max_length=12, default=LoanStatus.ACTIVE)
    close_reason = models.CharField(max_length=12, default="", blank=True)
    closed_on = models.DateField(null=True, blank=True)
    notes = models.TextField(max_length=NOTE_MAX, default="", blank=True)
    version = models.IntegerField(default=1)

    class Meta:
        db_table = "lending_loan"
        constraints = [
            models.UniqueConstraint(fields=["tenant", "number"], name="uq_lending_loan_number"),
            models.CheckConstraint(condition=_in("plan_type", PlanType), name="ck_lending_plan"),
            models.CheckConstraint(
                condition=_in("frequency", Frequency), name="ck_lending_frequency"
            ),
            models.CheckConstraint(condition=_in("status", LoanStatus), name="ck_lending_status"),
            models.CheckConstraint(condition=Q(principal__gt=0), name="ck_lending_principal"),
        ]
        indexes = [
            models.Index(
                fields=["tenant", "status", "route", "route_seq"], name="ix_lending_route"
            ),
            models.Index(fields=["tenant", "party"], name="ix_lending_loan_party"),
        ]

    @property
    def document_date(self) -> object:
        """The payments protocol's `(document_date, number, id)` order key."""
        return self.disbursed_on


class LendingLoanDeduction(TenantModel):
    loan = models.ForeignKey(LendingLoan, on_delete=models.RESTRICT, related_name="deductions")
    kind = models.CharField(max_length=20)
    label = models.CharField(max_length=LABEL_MAX)
    amount = MoneyField()

    class Meta:
        db_table = "lending_loan_deduction"
        constraints = [
            models.CheckConstraint(
                condition=_in("kind", DeductionKind), name="ck_lending_ded_kind"
            ),
            models.CheckConstraint(condition=Q(amount__gt=0), name="ck_lending_ded_amount"),
        ]


class LendingCollection(TenantModel):
    """One collection: the payment and what only lending knows about it."""

    loan = models.ForeignKey(LendingLoan, on_delete=models.RESTRICT, related_name="collections")
    payment_id = models.UUIDField()
    amount = MoneyField()
    collected_on = models.DateField()
    route = models.ForeignKey(
        LendingRoute, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    collected_by = models.ForeignKey(
        "platform.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    voided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "lending_collection"
        indexes = [
            models.Index(fields=["tenant", "collected_on"], name="ix_lending_coll_day"),
            models.Index(fields=["loan", "collected_on"], name="ix_lending_coll_loan"),
        ]


class LendingVisit(TenantModel):
    """A stop with no money: "not paid", "not at home", "promised Friday"."""

    loan = models.ForeignKey(LendingLoan, on_delete=models.RESTRICT, related_name="visits")
    on_date = models.DateField()
    outcome = models.CharField(max_length=10)
    reason = models.CharField(max_length=REASON_MAX, default="", blank=True)
    promised_on = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "lending_visit"
        constraints = [
            models.CheckConstraint(condition=_in("outcome", VisitOutcome), name="ck_lending_visit"),
        ]
        indexes = [models.Index(fields=["tenant", "on_date"], name="ix_lending_visit_day")]
