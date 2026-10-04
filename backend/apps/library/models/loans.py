"""Loans and their events (LIB-06 §5; task B09).

One OPEN loan per copy is the database's rule, not the counter's
(`uq_library_loan_open_copy`): two desks issuing one book serialise on the copy
row and the second insert is refused whatever code path wrote it (BR-6).

`rule_snapshot` is typed columns, not JSON: the resolved rule at issue, so a rule
changed after the issue never rewrites this loan's fine (LIB-05 EC-4).

The hold an issue collected is `library_hold.loan` (B11); the FRD's `library_loan.hold_id`
would close a foreign-key cycle the tenant deletion order cannot resolve.
"""

from __future__ import annotations

from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.db.models import F, Q

from apps.common.db.fields import MoneyField
from apps.common.models import ImmutableModel, TenantModel
from apps.library.constants import REASON_MAX, LoanEventKind, LoanStatus


def _in(field: str, choices: type[models.TextChoices]) -> Q:
    return Q(**{f"{field}__in": choices.values})


class LibraryLoan(TenantModel):
    copy = models.ForeignKey("library.LibraryCopy", on_delete=models.RESTRICT, related_name="loans")
    membership = models.ForeignKey(
        "library.LibraryMembership", on_delete=models.RESTRICT, related_name="loans"
    )
    party = models.ForeignKey("parties.Party", on_delete=models.RESTRICT, related_name="+")
    issued_on = models.DateField()
    issued_at = models.DateTimeField()
    due_on = models.DateField()
    returned_on = models.DateField(null=True, blank=True)
    returned_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=10, default=LoanStatus.OPEN)
    renew_count = models.SmallIntegerField(default=0)
    # rule_snapshot (LIB-06 §5)
    loan_days = models.SmallIntegerField()
    fine_per_day = MoneyField()
    fine_cap = MoneyField(null=True, blank=True)
    grace_days = models.SmallIntegerField()
    max_renewals = models.SmallIntegerField()
    override_reason = models.CharField(max_length=REASON_MAX, default="", blank=True)
    lost_on = models.DateField(null=True, blank=True)
    version = models.IntegerField(default=1)

    class Meta:
        db_table = "library_loan"
        constraints = [
            models.UniqueConstraint(
                fields=["copy"],
                condition=Q(status=LoanStatus.OPEN),
                name="uq_library_loan_open_copy",
            ),
            models.CheckConstraint(
                condition=_in("status", LoanStatus), name="ck_library_loan_status"
            ),
            models.CheckConstraint(
                condition=Q(due_on__gte=F("issued_on")), name="ck_library_loan_due"
            ),
            models.CheckConstraint(
                condition=Q(returned_on__isnull=True) | Q(returned_on__gte=F("issued_on")),
                name="ck_library_loan_returned_after_issue",
            ),
            models.CheckConstraint(
                condition=~Q(status=LoanStatus.RETURNED) | Q(returned_on__isnull=False),
                name="ck_library_loan_returned",
            ),
            models.CheckConstraint(
                condition=~Q(status=LoanStatus.OPEN) | Q(returned_on__isnull=True),
                name="ck_library_loan_open",
            ),
            models.CheckConstraint(
                condition=Q(renew_count__gte=0, grace_days__gte=0, max_renewals__gte=0)
                & Q(fine_per_day__gte=0)
                & (Q(fine_cap__isnull=True) | Q(fine_cap__gte=0)),
                name="ck_library_loan_snapshot",
            ),
        ]
        indexes = [
            models.Index(fields=["tenant", "status", "due_on"], name="ix_library_loan_overdue"),
            models.Index(fields=["tenant", "membership", "status"], name="ix_library_loan_member"),
            models.Index(fields=["tenant", "issued_on"], name="ix_library_loan_issued"),
            models.Index(
                fields=["tenant", "returned_on"],
                condition=Q(status=LoanStatus.RETURNED),
                name="ix_library_loan_returned",
            ),
            models.Index(fields=["copy", "-issued_on"], name="ix_library_loan_copy"),
        ]


class LibraryLoanEvent(TenantModel, ImmutableModel):
    loan = models.ForeignKey(LibraryLoan, on_delete=models.RESTRICT, related_name="events")
    kind = models.CharField(max_length=16)
    from_due = models.DateField(null=True, blank=True)
    to_due = models.DateField(null=True, blank=True)
    on_date = models.DateField()
    reason = models.CharField(max_length=REASON_MAX, default="", blank=True)
    charge = models.ForeignKey(
        "library.LibraryCharge", on_delete=models.RESTRICT, null=True, blank=True, related_name="+"
    )
    blocks_overridden = ArrayField(models.CharField(max_length=32), default=list, blank=True)

    class Meta:
        db_table = "library_loan_event"
        constraints = [
            models.CheckConstraint(
                condition=_in("kind", LoanEventKind), name="ck_library_loan_event_kind"
            ),
        ]
        indexes = [models.Index(fields=["loan", "created_at"], name="ix_library_loan_event_loan")]
