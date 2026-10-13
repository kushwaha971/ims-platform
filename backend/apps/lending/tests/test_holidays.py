"""QA F8 — a holiday on a collection day moves the instalment, and the end date with it.

Before: a daily loan skipped the closed days it knew about when it was GIVEN, but a
holiday added afterwards moved nothing (the instalments are stored dues, and the
calendar never rewrites them), and weekly and monthly loans ignored holidays
altogether — so a borrower was "late" on a day the business was shut.

Now lending re-dates what holds no money yet whenever the calendar changes: a daily
loan's later instalments shift one collection day and the end date follows; a weekly
or monthly instalment that lands on a holiday moves to the next open day. A due that
holds money, or is already past, is never moved — the calendar's own rule (BR-4) for
history, kept.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.urls import reverse

from apps.common.dates import tenant_today
from apps.dues.models import DuesDue
from apps.lending.models import LendingLoan

pytestmark = pytest.mark.django_db


@pytest.fixture
def office(api_as: Any, lending_on: Any) -> dict:
    owner, _ = api_as(lending_on, role="owner")
    return {"client": owner, "tenant": lending_on}


def _loan(office: dict, key: str, **over: Any) -> dict:
    today = tenant_today(office["tenant"])
    body = {
        "plan_type": "fixed_daily",
        "principal": "1000.00",
        "frequency": "daily",
        "instalment_count": 10,
        "per_instalment_amount": "100.00",
        "disbursed_on": today.isoformat(),
        "first_due_on": (today + dt.timedelta(days=1)).isoformat(),
        "party": {"name": "Geeta Devi", "mobile": "9820011223"},
        "payment_mode": "cash",
        **over,
    }
    made = office["client"].post(
        reverse("v1:lending-loans"), body, format="json", HTTP_IDEMPOTENCY_KEY=key
    )
    assert made.status_code == 201, made.json()
    return made.json()["data"]


def _dates(loan_id: str) -> list[dt.date]:
    loan = LendingLoan.objects.get(pk=loan_id)
    return list(
        DuesDue.objects.filter(schedule_id=loan.schedule_id)
        .exclude(status__in=["cancelled", "skipped"])
        .order_by("seq")
        .values_list("due_on", flat=True)
    )


def _close(office: dict, day: dt.date, module: str | None = None) -> Any:
    body: dict = {"from": day.isoformat(), "reason": "Diwali"}
    if module:
        body["module"] = module
    made = office["client"].post(reverse("v1:calendar-closed-days"), body, format="json")
    assert made.status_code == 201, made.json()
    return made.json()["data"]


def test_a_holiday_moves_that_instalment_and_every_later_one_and_the_end(office: dict) -> None:
    """AC2, daily: the 3rd collection day becomes a holiday — the 3rd instalment moves to
    the next collection day, the rest follow one day on, and the end date moves."""
    loan = _loan(office, "a")
    before = _dates(loan["id"])
    holiday = before[2]
    _close(office, holiday)
    after = _dates(loan["id"])
    assert holiday not in after
    assert after[:2] == before[:2]
    assert after[2:-1] == before[3:]
    assert after[-1] > before[-1]
    assert LendingLoan.objects.get(pk=loan["id"]).maturity_on == after[-1]


def test_lifting_the_holiday_moves_them_back(office: dict) -> None:
    loan = _loan(office, "b")
    before = _dates(loan["id"])
    closure = _close(office, before[2])
    closure_id = closure["rows"][0]["id"] if "rows" in closure else closure[0]["id"]
    gone = office["client"].delete(reverse("v1:calendar-closed-day", args=[closure_id]))
    assert gone.status_code in (200, 204), gone.content
    assert _dates(loan["id"]) == before
    assert LendingLoan.objects.get(pk=loan["id"]).maturity_on == before[-1]


def test_a_weekly_instalment_on_a_holiday_moves_to_the_next_open_day(office: dict) -> None:
    """Weekly: only that week's instalment moves (a day on); the weekday of the rest
    is the agreement and stays."""
    today = tenant_today(office["tenant"])
    loan = _loan(
        office,
        "c",
        frequency="weekly",
        instalment_count=4,
        per_instalment_amount="250.00",
        first_due_on=(today + dt.timedelta(days=7)).isoformat(),
    )
    before = _dates(loan["id"])
    _close(office, before[1])
    after = _dates(loan["id"])
    assert after[0] == before[0] and after[2:] == before[2:]
    assert after[1] == before[1] + dt.timedelta(days=1)


def test_a_weekly_loan_given_after_the_holiday_is_known_avoids_it(office: dict) -> None:
    today = tenant_today(office["tenant"])
    second = today + dt.timedelta(days=14)
    _close(office, second)
    loan = _loan(
        office,
        "d",
        frequency="weekly",
        instalment_count=4,
        per_instalment_amount="250.00",
        first_due_on=(today + dt.timedelta(days=7)).isoformat(),
    )
    assert second not in _dates(loan["id"])
    assert second + dt.timedelta(days=1) in _dates(loan["id"])


def test_an_instalment_that_holds_money_is_never_moved(office: dict) -> None:
    """Collected in advance: that instalment is settled history, whatever the calendar."""
    loan = _loan(office, "e")
    before = _dates(loan["id"])
    office["client"].post(
        reverse("v1:lending-collections", args=[loan["id"]]),
        {"amount": "300.00", "mode": "cash"},
        format="json",
        HTTP_IDEMPOTENCY_KEY="adv",
    )
    _close(office, before[2])  # the 3rd, already paid
    assert _dates(loan["id"])[:3] == before[:3]


def test_a_library_only_closure_moves_no_loan(office: dict) -> None:
    from apps.platform_app.services.entitlements import effective_modules

    if "library" not in effective_modules(office["tenant"]):
        pytest.skip("the library is not on for this tenant")
    loan = _loan(office, "f")
    before = _dates(loan["id"])
    _close(office, before[2], module="library")
    assert _dates(loan["id"]) == before
