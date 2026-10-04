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


class TitleStatus(models.TextChoices):
    """`library_title.status` (LIB-02 §5): a title is archived, never deleted."""

    ACTIVE = "active"
    ARCHIVED = "archived"


# ── B05 ── catalogue column widths (LIB-02 §5) ──────────────────────────────
TITLE_MAX = 300
PUBLISHER_MAX = 160
EDITION_MAX = 40
LANGUAGE_MAX = 40
CALL_NUMBER_MAX = 40
CATEGORY_NAME_MAX = 60
LOCATION_CODE_MAX = 24
LOCATION_NAME_MAX = 80
LOCATION_TEXT_MAX = 80
BARCODE_MAX = 40
SOURCE_NOTE_MAX = 160
VOLUME_LABEL_MAX = 24
NOTE_MAX = 160
SOURCE_TYPE_MAX = 48
#: LIB-02 §9 (and `services.codes.NUMBER_MAX`, which is pure and cannot import this).
ACCESSION_MAX = 24
#: B04/G13: the stored natural sort key.
ACCESSION_SORT_MAX = 160
#: LIB-02 §9: copies per request (EC-1).
MAX_COPIES_PER_REQUEST = 200
YEAR_MIN = 1500
YEAR_MAX = 2100

# ── B06 ── membership types, loan rules and the membership schema (LIB-04 §5, LIB-05 §5)
TYPE_NAME_MAX = 60
TYPE_CODE_MAX = 16
MEMBER_NUMBER_MAX = 24
MEMBER_NUMBER_SORT_MAX = 160
GROUP_LABEL_MAX = 40
REASON_MAX = 160
#: The type's columns (LIB-04 §5): (minimum, maximum) of each bounded integer.
TYPE_BOUNDS = {
    "max_copies": (0, 50),
    "loan_days": (1, 365),
    "max_renewals": (0, 20),
    "grace_days": (0, 30),
    "max_holds": (0, 20),
    "validity_months": (1, 120),
}

# ── B10 ── charges and waivers (LIB-07 §5)
CHARGE_NUMBER_MAX = 32
CHARGE_DESCRIPTION_MAX = 160
#: R30: an allocation target's label is at most 120 characters.
TARGET_LABEL_MAX = 120
SOURCE_CHARGE = "library_charge"
SOURCE_WAIVER = "library_waiver"
CHARGE_STATUS_AUDIT = "library.charge.status_changed"
OFF_GUARD_CHARGES = "library.off.chargesOpen"
#: FR-8: the kinds a person may raise by hand.
MANUAL_CHARGE_KINDS = ("processing", "other")
WAIVER_REASON_MIN = 3


# ── B09 ── loans (LIB-06 §5)
class LoanStatus(models.TextChoices):
    OPEN = "open"
    RETURNED = "returned"
    LOST = "lost"
    CANCELLED = "cancelled"


class LoanEventKind(models.TextChoices):
    ISSUED = "issued"
    RENEWED = "renewed"
    DUE_CHANGED = "due_changed"
    RETURNED = "returned"
    LOST = "lost"
    FOUND = "found"
    CANCELLED = "cancelled"
    OVERRIDDEN = "overridden"
    IMPORTED = "imported"


# ── B11 ── holds (LIB-08 §5)
class HoldStatus(models.TextChoices):
    WAITING = "waiting"
    READY = "ready"
    COLLECTED = "collected"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


LIVE_HOLD_STATUSES = (HoldStatus.WAITING.value, HoldStatus.READY.value)
#: FR-7: a pickup date may be pushed at most this far ahead.
HOLD_EXTEND_MAX_DAYS = 30
