"""Vocabularies of the dues engine (contracts §2.1, FRD 00 DUE-01 §5).

Every `varchar` vocabulary here is also a CHECK in `models.py`, so a second
writer (an import, a psql session) cannot store a mode no code can run.
"""

from __future__ import annotations

from django.db import models

#: `dues_schedule.subject_type` (and the registry key).
SUBJECT_TYPE_MAX = 48
MODULE_MAX = 32
PLAN_NAME_MAX = 80
HEAD_LABEL_MAX = 60
PERIOD_LABEL_MAX = 40
REASON_MAX = 160
#: ADR-048 Q9 / BR-4: the materialisation window of an open-ended schedule.
WINDOW_MONTHS = 24


class Mode(models.TextChoices):
    CHARGE = "charge"
    EXPECTATION = "expectation"


class Posting(models.TextChoices):
    DOCUMENT = "document"
    LEDGER = "ledger"
    NONE = "none"


class AmountRule(models.TextChoices):
    FIXED = "fixed"
    TOTAL_SPLIT = "total_split"
    SUPPLIED = "supplied"


class JoinPolicy(models.TextChoices):
    FULL = "full"
    BY_DAYS = "by_days"
    HALF_RULE = "half_rule"
    NEXT_PERIOD = "next_period"
    ALIGN_TO_JOIN = "align_to_join"


class LeavePolicy(models.TextChoices):
    NO_REFUND = "no_refund"
    BY_DAYS = "by_days"
    BY_SESSIONS = "by_sessions"
    CUSTOM = "custom"


class PenaltyKind(models.TextChoices):
    NONE = "none"
    FLAT_ONCE = "flat_once"
    PERCENT_ONCE = "percent_once"
    PER_DAY = "per_day"
    SIMPLE_INTEREST = "simple_interest"


class AllocationOrder(models.TextChoices):
    OLDEST_FIRST = "oldest_first"
    FEES_FIRST = "fees_first"
    FEES_LAST = "fees_last"


class ClosedDayRule(models.TextChoices):
    MOVE = "move"
    SKIP = "skip"
    IGNORE = "ignore"


class ScheduleStatus(models.TextChoices):
    ACTIVE = "active"
    PAUSED = "paused"
    ENDED = "ended"
    CANCELLED = "cancelled"


#: `uq_dues_schedule_live_subject` and the window index read these.
LIVE_SCHEDULE_STATUSES = (ScheduleStatus.ACTIVE.value, ScheduleStatus.PAUSED.value)


class DueStatus(models.TextChoices):
    SCHEDULED = "scheduled"
    DUE = "due"
    OVERDUE = "overdue"
    PAID = "paid"
    SKIPPED = "skipped"
    CANCELLED = "cancelled"


OPEN_DUE_STATUSES = (DueStatus.DUE.value, DueStatus.OVERDUE.value)


class Component(models.TextChoices):
    PRINCIPAL = "principal"
    INTEREST = "interest"
    FEE = "fee"
    CHARGE = "charge"


class AdjustmentKind(models.TextChoices):
    PENALTY = "penalty"
    WAIVER = "waiver"
    DISCOUNT = "discount"
    PRORATION = "proration"


class PauseEffect(models.TextChoices):
    SHIFT = "shift"
    SKIP = "skip"


#: Ledger source types (contracts §1.2), ≤ 32 characters.
SOURCE_DUE = "dues_due"
SOURCE_COMPONENT = "dues_component"
SOURCE_ADJUSTMENT = "dues_adjustment"
