"""B08 — due dates over the core calendar (LIB-05 FR-2, FR-3, BR-3, BR-4; T-LIB-05-2, -3, -5)."""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation
from apps.library.services.due_dates import compute_due, due_on_for_issue, renewal_due_on
from apps.platform_app.models import ClosedDay
from apps.platform_app.services.calendar import set_closed_weekdays

pytestmark = pytest.mark.django_db
SUNDAY = 6


@pytest.fixture
def calendar(library_on: Any) -> Any:
    """The FRD's calendar: the library shut on Sundays, Diwali 8–10 Nov 2026."""
    set_closed_weekdays(ctx=Ctx.system(library_on), value=[], modules={"library": [SUNDAY]})
    for day in (8, 9, 10):
        ClosedDay.objects.create(
            tenant=library_on, date=dt.date(2026, 11, day), reason="Diwali", module="library"
        )
    return library_on


@pytest.mark.parametrize(
    "issued, loan_days, due, moved_from",
    [
        (dt.date(2026, 9, 26), 14, dt.date(2026, 10, 10), None),
        (dt.date(2026, 9, 28), 13, dt.date(2026, 10, 12), dt.date(2026, 10, 11)),
        (dt.date(2026, 10, 26), 14, dt.date(2026, 11, 11), dt.date(2026, 11, 9)),
    ],
)
def test_the_worked_issue_examples(
    calendar: Any, issued: dt.date, loan_days: int, due: dt.date, moved_from: Any
) -> None:
    """T-LIB-05-2, examples 1–3 — a due date on a Sunday or in Diwali is a book the member
    cannot return on time through no fault of their own."""
    assert due_on_for_issue(calendar, issued_on=issued, loan_days=loan_days) == (due, moved_from)


def test_the_worked_renewal_examples(calendar: Any) -> None:
    """Examples 4 and 5 — from the renewal day, or from the old due date (D15)."""
    common = {"renewal_day": dt.date(2026, 10, 8), "old_due_on": dt.date(2026, 10, 10)}
    assert renewal_due_on(calendar, loan_days=14, **common)[0] == dt.date(2026, 10, 22)
    assert renewal_due_on(calendar, loan_days=14, renew_from="due_date", **common)[0] == dt.date(
        2026, 10, 24
    )


def test_a_renewal_that_gains_nothing_is_refused(calendar: Any) -> None:
    """BR-4 — renewing on day 1 of a 14-day loan with 3-day magazine rules would take days
    away; an equal date gains nothing. Both are 409 `no_gain`."""
    with pytest.raises(BusinessRuleViolation) as caught:
        renewal_due_on(
            calendar,
            renewal_day=dt.date(2026, 10, 1),
            old_due_on=dt.date(2026, 10, 10),
            loan_days=3,
        )
    assert caught.value.code == "library_renewal_refused"
    assert caught.value.details["reason"] == "no_gain"


def test_a_business_wide_closure_shuts_the_library_too(library_on: Any) -> None:
    """EC-1 — the shop's own holiday (module null) is the library's holiday."""
    ClosedDay.objects.create(tenant=library_on, date=dt.date(2026, 10, 10), reason="Dussehra")
    assert due_on_for_issue(library_on, issued_on=dt.date(2026, 9, 26), loan_days=14)[0] == (
        dt.date(2026, 10, 11)
    )


def test_the_library_override_beats_the_business_weekdays(library_on: Any) -> None:
    """Weekday precedence both ways: the shop shuts Sundays, the library opens them — and the
    library shuts Saturdays though the shop does not."""
    set_closed_weekdays(ctx=Ctx.system(library_on), value=[SUNDAY], modules={"library": [5]})
    # Sat 10 Oct is the raw date: closed for the library only → Sun 11 Oct, open for it.
    assert due_on_for_issue(library_on, issued_on=dt.date(2026, 9, 26), loan_days=14)[0] == (
        dt.date(2026, 10, 11)
    )


def test_one_due_date_is_one_query(calendar: Any) -> None:
    """A busy counter issues a book every few seconds; a calendar read per day would be 366."""
    with CaptureQueriesContext(connection) as queries:
        due_on_for_issue(calendar, issued_on=dt.date(2026, 10, 26), loan_days=14)
    assert len(queries) == 1


def test_a_calendar_with_no_open_day_is_409_not_500() -> None:
    """BR-3, T-LIB-05-5 — reachable only by writing closures directly; it must not crash the
    counter."""
    start = dt.date(2026, 1, 1)
    every_day = {start + dt.timedelta(days=n) for n in range(400)}
    with pytest.raises(BusinessRuleViolation) as caught:
        compute_due(start, every_day)
    assert caught.value.code == "library_calendar_all_closed"
