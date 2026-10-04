"""Due dates over the core calendar (LIB-05 FR-2, FR-3, BR-3, BR-4; task B08).

A due date is worked out, never typed, and never falls on a day the library is
shut: `next_open_day(issued_on + loan_days)` over the core calendar (ADR-055),
read with `module="library"` so the library's own weekly closed days and
holidays apply on top of the business-wide closures (EC-1).

`compute_due` is pure so the FRD's worked examples run without a database; the
two callers read the closed days of the whole horizon in ONE query, because a
busy counter issues a book every few seconds.

The endpoints that read or move loans' due dates (`/library/loans/due-on`,
`/shift-due`, `/due-date-preview`) need `library_loan`, which is B09's; they
land there with these functions behind them (G18).
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from apps.common.exceptions import BusinessRuleViolation
from apps.library.constants import RenewFrom
from apps.platform_app.services.calendar import SEARCH_HORIZON_DAYS, closed_days_between

MODULE = "library"


def _all_closed() -> BusinessRuleViolation:
    return BusinessRuleViolation(
        "library_calendar_all_closed",
        "Every day is marked closed. Open at least one day.",
        details={},
    )


def compute_due(raw: dt.date, closed: set[dt.date]) -> tuple[dt.date, dt.date | None]:
    """`(due_on, moved_from)`: `raw` when open, else the next open day, and the raw date it moved
    from (the counter prints "moved from Sun 11 Oct"). BR-3: no open day in the horizon is 409."""
    day = raw
    end = raw + dt.timedelta(days=SEARCH_HORIZON_DAYS)
    while day <= end:
        if day not in closed:
            return day, (None if day == raw else raw)
        day += dt.timedelta(days=1)
    raise _all_closed()


def _due(tenant: Any, raw: dt.date) -> tuple[dt.date, dt.date | None]:
    closed = closed_days_between(
        tenant, raw, raw + dt.timedelta(days=SEARCH_HORIZON_DAYS), module=MODULE
    )
    return compute_due(raw, closed)


def due_on_for_issue(
    tenant: Any, *, issued_on: dt.date, loan_days: int
) -> tuple[dt.date, dt.date | None]:
    """FR-2. `issued_on` is the tenant's business date (EC-5); issuing on a closed day is
    allowed and dated as issued (EC-2) — only the DUE date avoids closed days."""
    return _due(tenant, issued_on + dt.timedelta(days=loan_days))


def renewal_due_on(
    tenant: Any,
    *,
    renewal_day: dt.date,
    old_due_on: dt.date,
    loan_days: int,
    renew_from: str = RenewFrom.TODAY,
) -> tuple[dt.date, dt.date | None]:
    """FR-3, BR-4: from the renewal day (default) or the old due date, plus loan days, moved to
    the next open day. A renewal that would not make the due date LATER is refused — an earlier
    date takes days away, and an equal one gains nothing (design default)."""
    base = old_due_on if renew_from == RenewFrom.DUE_DATE else renewal_day
    due_on, moved_from = _due(tenant, base + dt.timedelta(days=loan_days))
    if due_on <= old_due_on:
        raise BusinessRuleViolation(
            "library_renewal_refused",
            "Renewing now would not give more time.",
            details={"reason": "no_gain", "overridable": False, "due_on": old_due_on.isoformat()},
        )
    return due_on, moved_from
