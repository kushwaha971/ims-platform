"""Membership types, loan rules, memberships and their periods (LIB-04 §5, LIB-05 §5; task B06).

B06 owns the type and the rule tables and their services. It also creates the
SCHEMA of `library_membership` and `library_membership_period` (G17): B10's
`library_charge` must point at a membership, and B07, which owns membership
services, runs after B10. `library_membership_period.fee_charge` arrives with B10,
which owns `library_charge`.

A loan rule overrides a type per material type (`membership_type` null = every
type). Two rows with the same `(membership_type, material_type)` — including two
"every type" rows — would make resolution depend on row order, so the unique key
is `NULLS NOT DISTINCT` (PostgreSQL 16).
"""

from __future__ import annotations

from decimal import Decimal

from django.db import models
from django.db.models import F, Q
from django.db.models.functions import Lower, Upper

from apps.common.db.fields import MoneyField
from apps.common.models import ImmutableModel, TenantModel
from apps.library.constants import (
    GROUP_LABEL_MAX,
    MEMBER_NUMBER_MAX,
    MEMBER_NUMBER_SORT_MAX,
    REASON_MAX,
    TYPE_BOUNDS,
    TYPE_CODE_MAX,
    TYPE_NAME_MAX,
    MaterialType,
    MembershipStatus,
    PeriodKind,
)


def _in(field: str, choices: type[models.TextChoices]) -> Q:
    return Q(**{f"{field}__in": choices.values})


def _range(field: str, *, nullable: bool = False) -> Q:
    low, high = TYPE_BOUNDS[field]
    bounded = Q(**{f"{field}__gte": low, f"{field}__lte": high})
    return Q(**{f"{field}__isnull": True}) | bounded if nullable else bounded


def _non_negative(field: str, *, nullable: bool = False) -> Q:
    q = Q(**{f"{field}__gte": 0})
    return Q(**{f"{field}__isnull": True}) | q if nullable else q


class LibraryMembershipType(TenantModel):
    """The circulation defaults of a kind of member (FR-1). Deactivated, never deleted."""

    name = models.CharField(max_length=TYPE_NAME_MAX)
    code = models.CharField(max_length=TYPE_CODE_MAX, default="", blank=True)
    max_copies = models.SmallIntegerField(default=2)
    loan_days = models.SmallIntegerField(default=14)
    max_renewals = models.SmallIntegerField(default=2)
    fine_per_day = MoneyField(default=Decimal("2.00"))
    fine_cap = MoneyField(null=True, blank=True)
    grace_days = models.SmallIntegerField(default=0)
    max_holds = models.SmallIntegerField(default=2)
    validity_months = models.SmallIntegerField(null=True, blank=True)
    fee_amount = MoneyField(default=Decimal("0.00"))
    admission_fee = MoneyField(default=Decimal("0.00"))
    deposit_amount = MoneyField(default=Decimal("0.00"))
    deposit_required_to_borrow = models.BooleanField(default=True)
    dues_block_amount = MoneyField(null=True, blank=True)
    allows_reference_loan = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    sort_order = models.SmallIntegerField(default=0)
    version = models.IntegerField(default=1)

    class Meta:
        db_table = "library_membership_type"
        constraints = [
            models.UniqueConstraint(F("tenant"), Lower("name"), name="uq_library_type_name"),
            models.CheckConstraint(
                condition=_range("max_copies")
                & _range("loan_days")
                & _range("max_renewals")
                & _range("grace_days")
                & _range("max_holds")
                & _range("validity_months", nullable=True),
                name="ck_library_type_bounds",
            ),
            models.CheckConstraint(
                condition=_non_negative("fine_per_day")
                & _non_negative("fine_cap", nullable=True)
                & _non_negative("fee_amount")
                & _non_negative("admission_fee")
                & _non_negative("deposit_amount")
                & _non_negative("dues_block_amount", nullable=True),
                name="ck_library_type_money",
            ),
        ]

    def __str__(self) -> str:  # pragma: no cover - admin/debug only
        return self.name


class LibraryLoanRule(TenantModel):
    """A per-material-type override of a type's columns (LIB-05 FR-1); a null column inherits."""

    membership_type = models.ForeignKey(
        LibraryMembershipType,
        on_delete=models.RESTRICT,
        null=True,
        blank=True,
        related_name="loan_rules",
    )
    material_type = models.CharField(max_length=16)
    loanable = models.BooleanField(default=True)
    loan_days = models.SmallIntegerField(null=True, blank=True)
    max_renewals = models.SmallIntegerField(null=True, blank=True)
    fine_per_day = MoneyField(null=True, blank=True)
    fine_cap = MoneyField(null=True, blank=True)
    grace_days = models.SmallIntegerField(null=True, blank=True)

    class Meta:
        db_table = "library_loan_rule"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "membership_type", "material_type"],
                name="uq_library_loan_rule",
                nulls_distinct=False,
            ),
            models.CheckConstraint(
                condition=_in("material_type", MaterialType),
                name="ck_library_loan_rule_material",
            ),
            models.CheckConstraint(
                condition=_range("loan_days", nullable=True)
                & _range("max_renewals", nullable=True)
                & _range("grace_days", nullable=True)
                & _non_negative("fine_per_day", nullable=True)
                & _non_negative("fine_cap", nullable=True),
                name="ck_library_loan_rule_bounds",
            ),
        ]


class LibraryMembership(TenantModel):
    """The library role of a party (ADR-046). Schema only in B06 (G17); B07 writes it."""

    party = models.OneToOneField("parties.Party", on_delete=models.RESTRICT, related_name="+")
    member_number = models.CharField(max_length=MEMBER_NUMBER_MAX)
    member_number_sort = models.CharField(max_length=MEMBER_NUMBER_SORT_MAX, db_collation="C")
    membership_type = models.ForeignKey(
        LibraryMembershipType, on_delete=models.RESTRICT, related_name="memberships"
    )
    starts_on = models.DateField()
    valid_until = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=10, default=MembershipStatus.ACTIVE)
    suspended_until = models.DateField(null=True, blank=True)
    suspension_reason = models.CharField(max_length=REASON_MAX, default="", blank=True)
    group_label = models.CharField(max_length=GROUP_LABEL_MAX, default="", blank=True)
    card_issued_on = models.DateField(null=True, blank=True)
    closed_on = models.DateField(null=True, blank=True)
    closed_reason = models.CharField(max_length=REASON_MAX, default="", blank=True)
    notes = models.TextField(default="", blank=True)
    version = models.IntegerField(default=1)

    class Meta:
        db_table = "library_membership"
        constraints = [
            models.UniqueConstraint(
                F("tenant"), Upper("member_number"), name="uq_library_member_number"
            ),
            models.CheckConstraint(
                condition=Q(valid_until__isnull=True) | Q(valid_until__gte=F("starts_on")),
                name="ck_library_membership_validity",
            ),
            models.CheckConstraint(
                condition=_in("status", MembershipStatus), name="ck_library_membership_status"
            ),
            models.CheckConstraint(
                condition=Q(status=MembershipStatus.CLOSED, closed_on__isnull=False)
                | (~Q(status=MembershipStatus.CLOSED) & Q(closed_on__isnull=True)),
                name="ck_library_membership_closed",
            ),
        ]
        indexes = [
            models.Index(
                fields=["tenant", "status", "valid_until"], name="ix_library_membership_status"
            ),
            models.Index(fields=["tenant", "group_label"], name="ix_library_membership_group"),
            models.Index(fields=["tenant", "membership_type"], name="ix_library_membership_type"),
            models.Index(
                fields=["tenant", "member_number_sort"], name="ix_library_membership_sort"
            ),
        ]


class LibraryMembershipPeriod(TenantModel, ImmutableModel):
    """Every enrol, renewal, re-join, type change, suspension and close (FR-5…FR-9)."""

    membership = models.ForeignKey(
        LibraryMembership, on_delete=models.RESTRICT, related_name="periods"
    )
    kind = models.CharField(max_length=12)
    membership_type = models.ForeignKey(
        LibraryMembershipType, on_delete=models.RESTRICT, related_name="+"
    )
    starts_on = models.DateField()
    valid_until = models.DateField(null=True, blank=True)
    reason = models.CharField(max_length=REASON_MAX, default="", blank=True)
    on_date = models.DateField()

    class Meta:
        db_table = "library_membership_period"
        constraints = [
            models.CheckConstraint(
                condition=_in("kind", PeriodKind), name="ck_library_membership_period_kind"
            ),
        ]
        indexes = [
            models.Index(fields=["membership", "created_at"], name="ix_library_membership_period")
        ]
