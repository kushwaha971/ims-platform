"""Vocabularies of the attendance engine (contracts §2.3, FRD 00 ATT-01…05).

Every `varchar` vocabulary here is also a CHECK in `models.py`, so a second
writer (an import, a psql session) cannot store a status no code can read.
"""

from __future__ import annotations

import datetime as dt

from django.db import models

MODULE_MAX = 32
NAME_MAX = 80
SUBJECT_TYPE_MAX = 48
CONTEXT_TYPE_MAX = 48
REASON_MIN = 3
REASON_MAX = 160

#: ATT-01 §6: `generate_sessions` refuses an `until` more than 26 weeks ahead.
MAX_UNTIL_DAYS = 182
#: ATT-01 user flow 1 and the weekly job: sessions exist for the 56 days from today
#: (today included), i.e. 8 whole weeks.
GENERATE_AHEAD_DAYS = 56
#: ATT-02 §6: a check-in or check-out more than 5 minutes in the future is refused.
FUTURE_SKEW = dt.timedelta(minutes=5)
#: The edit window of a mark taken without a group (C10).
DEFAULT_EDIT_WINDOW_HOURS = 24

#: BR-5 timetable change / closed day: the reasons the engine writes itself.
REASON_TIMETABLE_CHANGED = "Timetable changed"
REASON_CLOSED = "Closed"


class MarkKind(models.TextChoices):
    VISIT = "visit"
    PRESENCE = "presence"


class MarkStatus(models.TextChoices):
    PRESENT = "present"
    ABSENT = "absent"
    LATE = "late"
    EXCUSED = "excused"
    VISIT = "visit"


#: ATT-04 BR-2: only these consume an entitlement use.
CONSUMING = frozenset({MarkStatus.PRESENT.value, MarkStatus.LATE.value, MarkStatus.VISIT.value})
#: The statuses a session mark may carry (everything but `visit`).
SESSION_STATUSES = frozenset(MarkStatus.values) - {MarkStatus.VISIT.value}


class DefaultMark(models.TextChoices):
    PRESENT = "present"
    ABSENT = "absent"


class Method(models.TextChoices):
    DESK = "desk"
    ROLL_CALL = "roll_call"
    QR = "qr"


class SessionStatus(models.TextChoices):
    SCHEDULED = "scheduled"
    HELD = "held"
    CANCELLED = "cancelled"


class Decision(models.TextChoices):
    ALLOW = "allow"
    WARN = "warn"
    BLOCK = "block"


#: What `check_in` reports; a block that was overridden is its own word.
BLOCK_OVERRIDDEN = "block_overridden"

#: ATT-05 register cells.
CELL_PRESENT = "P"
CELL_ABSENT = "A"
CELL_LATE = "L"
CELL_EXCUSED = "E"
CELL_NOT_ENROLLED = "-"
CELL_CLOSED = "closed"
CELL_OF_STATUS = {
    MarkStatus.PRESENT.value: CELL_PRESENT,
    MarkStatus.ABSENT.value: CELL_ABSENT,
    MarkStatus.LATE.value: CELL_LATE,
    MarkStatus.EXCUSED.value: CELL_EXCUSED,
}

#: R56: the catalogue key of the module-off breakdown row.
OFF_GUARD_LABEL = "attendance.off.openVisits"
