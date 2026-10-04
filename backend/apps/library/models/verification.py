"""Stock verification — scan the shelves, close, read what is missing (LIB-10 §5; task B13).

A scan RECORDS and never acts (FR-3): it does not close a loan, move a copy or
charge anybody, so a scan row is immutable apart from its void. The counts on
the verification are a cache written at close and recomputable from the scans
(T-LIB-10-2); the result kept on a scan is what the librarian saw at the moment
of scanning, and close re-classifies.
"""

from __future__ import annotations

from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.db.models import Q

from apps.common.db.fields import MoneyField
from apps.common.models import ImmutableModel, TenantModel
from apps.library.constants import (
    ACCESSION_MAX,
    REASON_MAX,
    SCAN_CODE_MAX,
    VERIFICATION_NAME_MAX,
    ScanResult,
    VerificationScope,
    VerificationStatus,
)


def _in(field: str, choices: type[models.TextChoices]) -> Q:
    return Q(**{f"{field}__in": choices.values})


class LibraryVerification(TenantModel):
    name = models.CharField(max_length=VERIFICATION_NAME_MAX)
    scope_kind = models.CharField(max_length=12)
    location_ids = ArrayField(models.UUIDField(), default=list, blank=True)
    category_ids = ArrayField(models.UUIDField(), default=list, blank=True)
    range_from = models.CharField(max_length=ACCESSION_MAX, default="", blank=True)
    range_to = models.CharField(max_length=ACCESSION_MAX, default="", blank=True)
    started_on = models.DateField()
    closed_on = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=8, default=VerificationStatus.OPEN)
    reopened = models.BooleanField(default=False)
    reopen_reason = models.CharField(max_length=REASON_MAX, default="", blank=True)
    expected_count = models.IntegerField(default=0)
    found_count = models.IntegerField(default=0)
    wrong_location_count = models.IntegerField(default=0)
    on_loan_count = models.IntegerField(default=0)
    missing_count = models.IntegerField(default=0)
    unknown_count = models.IntegerField(default=0)
    flagged_count = models.IntegerField(default=0)
    outside_scope_count = models.IntegerField(default=0)
    missing_value = MoneyField(default=0)
    notes = models.TextField(default="", blank=True)
    version = models.IntegerField(default=1)

    class Meta:
        db_table = "library_verification"
        constraints = [
            models.CheckConstraint(
                condition=_in("scope_kind", VerificationScope),
                name="ck_library_verification_scope",
            ),
            models.CheckConstraint(
                condition=_in("status", VerificationStatus),
                name="ck_library_verification_status",
            ),
            models.CheckConstraint(
                condition=Q(status=VerificationStatus.OPEN) | Q(closed_on__isnull=False),
                name="ck_library_verification_closed_on",
            ),
        ]
        indexes = [models.Index(fields=["tenant", "status"], name="ix_library_verification_status")]


class LibraryVerificationScan(TenantModel, ImmutableModel):
    MUTABLE_FIELDS = ("voided_at", "voided_by", "result")

    verification = models.ForeignKey(
        LibraryVerification, on_delete=models.RESTRICT, related_name="scans"
    )
    code_entered = models.CharField(max_length=SCAN_CODE_MAX)
    copy = models.ForeignKey(
        "library.LibraryCopy", on_delete=models.RESTRICT, null=True, blank=True, related_name="+"
    )
    location = models.ForeignKey(
        "library.LibraryLocation",
        on_delete=models.RESTRICT,
        null=True,
        blank=True,
        related_name="+",
    )
    result = models.CharField(max_length=24)
    scanned_at = models.DateTimeField()
    voided_at = models.DateTimeField(null=True, blank=True)
    voided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    class Meta:
        db_table = "library_verification_scan"
        constraints = [
            models.CheckConstraint(
                condition=_in("result", ScanResult), name="ck_library_verification_scan_result"
            ),
        ]
        indexes = [
            models.Index(
                fields=["verification", "copy"],
                condition=Q(voided_at__isnull=True),
                name="ix_library_scan_copy",
            ),
            models.Index(fields=["verification", "scanned_at"], name="ix_library_scan_time"),
        ]
