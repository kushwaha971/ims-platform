"""Vocabularies of the library module (FRD library §5, task B02).

Each class's values are exactly one `CHECK ... IN (...)` list of the FRD's
tables, in the FRD's order, so the model that stores it (B03, B05, B06, B07,
B10) builds its CHECK from `values` and a second writer — an import, a psql
session — cannot store a state no code can handle. `test_vocabulary.py`
compares them with the FRD lists and with their column widths.
"""

from __future__ import annotations

from django.db import models


class MaterialType(models.TextChoices):
    """`library_title.material_type` and `library_loan_rule.material_type`."""

    BOOK = "book"
    REFERENCE = "reference"
    MAGAZINE = "magazine"
    TEXTBOOK = "textbook"
    AUDIO_VISUAL = "audio_visual"
    OTHER = "other"


class CopyStatus(models.TextChoices):
    """`library_copy.status`; written only by `services.copy_status.move_copy` (B05)."""

    AVAILABLE = "available"
    ON_LOAN = "on_loan"
    ON_HOLD_SHELF = "on_hold_shelf"
    IN_REPAIR = "in_repair"
    LOST = "lost"
    MISSING = "missing"
    WITHDRAWN = "withdrawn"


class CopySource(models.TextChoices):
    BOUGHT = "bought"
    GIFTED = "gifted"
    TRANSFERRED = "transferred"
    OTHER = "other"


class CopyCondition(models.TextChoices):
    GOOD = "good"
    FAIR = "fair"
    POOR = "poor"


class WithdrawReason(models.TextChoices):
    """`library_copy.withdrawn_reason`."""

    WORN_OUT = "worn_out"
    LOST = "lost"
    MISSING = "missing"
    TRANSFERRED = "transferred"
    DAMAGED = "damaged"
    OTHER = "other"


class CopyEventReason(models.TextChoices):
    """`library_copy_event.reason_code`."""

    CREATED = "created"
    ISSUED = "issued"
    RETURNED = "returned"
    SET_ASIDE = "set_aside"
    WITHDRAWN = "withdrawn"
    REPAIR = "repair"
    BACK_TO_SHELF = "back_to_shelf"
    LOST = "lost"
    FOUND = "found"
    MISSING = "missing"
    CANCELLED_ISSUE = "cancelled_issue"
    IMPORTED = "imported"
    EDITED_NUMBER = "edited_number"


class ChargeKind(models.TextChoices):
    """`library_charge.kind`."""

    ADMISSION_FEE = "admission_fee"
    MEMBERSHIP_FEE = "membership_fee"
    RENEWAL_FEE = "renewal_fee"
    OVERDUE_FINE = "overdue_fine"
    LOST_BOOK = "lost_book"
    DAMAGE = "damage"
    PROCESSING = "processing"
    OTHER = "other"


class ChargeStatus(models.TextChoices):
    """`library_charge.status`: derived from the amounts, never toggled."""

    OPEN = "open"
    PART_PAID = "part_paid"
    PAID = "paid"
    WAIVED = "waived"
    REFUNDED = "refunded"
    REVERSED = "reversed"


class WaiverKind(models.TextChoices):
    """`library_waiver.kind`."""

    WAIVER = "waiver"
    FOUND = "found"
    REPLACED = "replaced"
    FOUND_REFUND = "found_refund"


class MembershipStatus(models.TextChoices):
    """`library_membership.status`. *Expired* is derived from `valid_until`, never stored."""

    ACTIVE = "active"
    SUSPENDED = "suspended"
    CLOSED = "closed"


class PeriodKind(models.TextChoices):
    """`library_membership_period.kind`."""

    ENROL = "enrol"
    RENEW = "renew"
    REJOIN = "rejoin"
    TYPE_CHANGE = "type_change"
    SUSPEND = "suspend"
    REACTIVATE = "reactivate"
    CLOSE = "close"


class FineRounding(models.TextChoices):
    """`library_settings.fine_rounding` (D19)."""

    RUPEE = "rupee"
    PAISE = "paise"


class OverdueIssueRule(models.TextChoices):
    """`library_settings.overdue_issue_rule` (D14)."""

    BLOCK = "block"
    WARN = "warn"
    OFF = "off"


class RenewFrom(models.TextChoices):
    """`library_settings.renew_from` (D15)."""

    TODAY = "today"
    DUE_DATE = "due_date"


class RenewOverdue(models.TextChoices):
    """`library_settings.renew_overdue` (D15)."""

    CHARGE_FINE = "charge_fine"
    BLOCK = "block"


class LostFoundPaid(models.TextChoices):
    """`library_settings.lost_found_paid` (D6)."""

    REFUND = "refund"
    KEEP = "keep"
