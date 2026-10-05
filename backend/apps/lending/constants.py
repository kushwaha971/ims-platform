"""Vocabularies of the lending module (FRD lending §0)."""

from __future__ import annotations

from django.db import models

MODULE = "lending"
SUBJECT_LOAN = "lending_loan"
SOURCE_DEDUCTION = "lending_deduction"
TARGET_LOAN = "lending_loan"
NUMBER_LOAN = "lending_loan"
NUMBER_BORROWER = "lending_borrower"
NOTE_MAX = 500
LABEL_MAX = 60
NAME_MAX = 60
REASON_MAX = 160


class PlanType(models.TextChoices):
    FLAT = "flat"
    REDUCING = "reducing"
    INTEREST_ONLY = "interest_only"
    FIXED_DAILY = "fixed_daily"
    FLEXIBLE = "flexible"


class Frequency(models.TextChoices):
    DAILY = "daily"
    WEEKLY = "weekly"
    FORTNIGHTLY = "fortnightly"
    MONTHLY = "monthly"


class RateUnit(models.TextChoices):
    PER_MONTH = "per_month"
    PER_YEAR = "per_year"


class LoanStatus(models.TextChoices):
    ACTIVE = "active"
    CLOSED = "closed"
    WRITTEN_OFF = "written_off"
    CANCELLED = "cancelled"


class DeductionKind(models.TextChoices):
    PROCESSING_FEE = "processing_fee"
    UPFRONT_INTEREST = "upfront_interest"
    DOCUMENTATION = "documentation"
    OTHER = "other"


class VisitOutcome(models.TextChoices):
    NOT_PAID = "not_paid"
    NOT_HOME = "not_home"
    PROMISED = "promised"
