"""Overdue, decided when it is read (WP-06 Finding 2).

The stored `overdue` status is set by a nightly job at 00:15, so a bill that
fell due yesterday, or one entered today with a due date already past, carries
`issued` / `recorded` until the next morning. Every figure and list that says
"overdue" asks this instead: a stored `overdue`, or an open bill whose due date
is before today. The dashboard's figure and the list it opens share it, which
is the only way the two agree on the day.
"""

from __future__ import annotations

import datetime as dt

from django.db.models import Q

OVERDUE = "overdue"


def overdue_q(*, today: dt.date, open_statuses: tuple[str, ...]) -> Q:
    """A stored `overdue`, or an open bill (one of `open_statuses`) due before `today`."""
    return Q(status=OVERDUE) | Q(status__in=open_statuses, due_on__lt=today)


def status_tab_q(
    statuses: tuple[str, ...],
    *,
    today: dt.date | None = None,
    open_statuses: tuple[str, ...] = (),
) -> Q:
    """A list tab as a filter. A tab whose statuses are exactly `("overdue",)`
    is decided on the day when the caller supplies `today` and its open
    statuses; every other tab is its statuses, unchanged (an open bill past due
    is already in Unpaid and All by its own status)."""
    if today is not None and open_statuses and tuple(statuses) == (OVERDUE,):
        return overdue_q(today=today, open_statuses=open_statuses)
    return Q(status__in=statuses)
