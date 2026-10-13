"""QA F8 and B45 — bringing a running loan in from paper, and collections on a past day.

F8: a lender moving their register in had two wrong choices. A back-dated loan was
fine until the instalments already collected had to go in: the only way was today's
collection, so a month of paper-era money landed in today's cash and today's round.
Now an existing loan comes in with "already collected: N instalments (or ₹X)" as
history — an adjustment, which no cash report counts — and the late days are
measured from the first instalment that is really unpaid.

B45: a collection made yesterday could only be recorded as today's cash. It can now
be dated the day it happened, never in the future and never before the loan.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.common.dates import tenant_today
from apps.lending.models import LendingCollection
from apps.payments.models import Payment
from apps.reports.selectors.day_book import money_position

pytestmark = pytest.mark.django_db
D = Decimal


@pytest.fixture
def office(api_as: Any, lending_on: Any) -> dict:
    owner, _ = api_as(lending_on, role="owner")
    return {"client": owner, "tenant": lending_on}


def _cash(tenant: Any) -> Decimal:
    return money_position(tenant=tenant, before=tenant_today(tenant) + dt.timedelta(days=1))["cash"]


def _given(today: dt.date) -> dt.date:
    """Eighty days ago — about 68 collection days, so 60 paid leaves some really late
    (seventy days holds almost exactly 60, which would prove nothing)."""
    return today - dt.timedelta(days=80)


def _loan(office: dict, key: str, **over: Any) -> Any:
    today = tenant_today(office["tenant"])
    given = _given(today)
    body = {
        "plan_type": "fixed_daily",
        "principal": "10000.00",
        "frequency": "daily",
        "instalment_count": 100,
        "per_instalment_amount": "100.00",
        "disbursed_on": given.isoformat(),
        "first_due_on": (given + dt.timedelta(days=1)).isoformat(),
        "party": {"name": "Geeta Devi", "mobile": "9820011223"},
        "payment_mode": "cash",
        **over,
    }
    return office["client"].post(
        reverse("v1:lending-loans"), body, format="json", HTTP_IDEMPOTENCY_KEY=key
    )


def _nth_collection_day(first: dt.date, n: int) -> dt.date:
    """The n-th (1-based) Monday-to-Saturday day from `first`: the default collection days."""
    day, seen = first, 0
    while True:
        if day.weekday() != 6:
            seen += 1
            if seen == n:
                return day
        day += dt.timedelta(days=1)


def test_a_loan_with_60_of_100_paid_comes_in_with_the_right_late_days(office: dict) -> None:
    """AC1: given 80 days ago, 60 of 100 instalments already paid on paper. The late days
    run from the 61st instalment's date — the first really unpaid — not from the first."""
    today = tenant_today(office["tenant"])
    made = _loan(office, "a", existing={"instalments_collected": 60})
    assert made.status_code == 201, made.json()
    loan = made.json()["data"]
    assert loan["collected"] == "6000.00"
    assert loan["remaining"] == "4000.00"
    first_unpaid = _nth_collection_day(_given(today) + dt.timedelta(days=1), 61)
    assert first_unpaid < today  # the case the criterion is about: some really late
    assert loan["days_past_due"] == (today - first_unpaid).days > 0


def test_neither_the_loan_nor_its_paper_collections_touch_todays_cash(office: dict) -> None:
    """The money left the drawer months ago and came back on paper: today's cash, today's
    round and the collections a receipt is printed for all stay as they were."""
    before = _cash(office["tenant"])
    made = _loan(office, "b", existing={"instalments_collected": 60})
    loan_id = made.json()["data"]["id"]
    assert _cash(office["tenant"]) == before
    assert all(p.primary_mode == "adjustment" for p in Payment.objects.all())
    round_ = office["client"].get(reverse("v1:lending-today")).json()["meta"]
    assert D(round_["collected"]) == D("0")
    history = LendingCollection.objects.get(loan_id=loan_id)
    assert history.is_opening and history.amount == D("6000.00")


def test_the_history_reads_as_collected_before_with_no_receipt(office: dict) -> None:
    made = _loan(office, "c", existing={"collected_amount": "6050.00"})
    assert made.status_code == 201, made.json()
    loan = made.json()["data"]
    assert loan["collected"] == "6050.00"
    rows = office["client"].get(reverse("v1:lending-collections", args=[loan["id"]])).json()
    [row] = rows["data"]
    assert row["opening"] is True and row["receipt_number"] == ""


def test_already_collected_cannot_be_the_whole_loan_or_more(office: dict) -> None:
    refused = _loan(office, "d", existing={"instalments_collected": 100})
    assert refused.status_code == 400
    assert "existing" in refused.json()["error"]["details"]
    refused = _loan(office, "e", existing={"instalments_collected": 0})
    assert refused.status_code == 400
    refused = _loan(office, "g", existing={"collected_amount": "-1"})
    assert refused.status_code == 400


def test_a_running_loan_with_nothing_collected_yet_still_moves_no_cash(office: dict) -> None:
    """QA F10: a loan from the old register given last week, first instalment not yet
    due — `collected_amount: 0` — comes in with no collection and no cash today."""
    before = _cash(office["tenant"])
    made = _loan(office, "h", existing={"collected_amount": "0"})
    assert made.status_code == 201, made.json()
    assert made.json()["data"]["collected"] == "0.00"
    assert not LendingCollection.objects.filter(loan_id=made.json()["data"]["id"]).exists()
    assert _cash(office["tenant"]) == before


def test_a_new_loan_is_unchanged_its_cash_leaves_the_drawer(office: dict) -> None:
    """Not an existing loan: the disbursal is real cash out, as it always was."""
    before = _cash(office["tenant"])
    made = _loan(
        office,
        "f",
        disbursed_on=tenant_today(office["tenant"]).isoformat(),
        first_due_on=(tenant_today(office["tenant"]) + dt.timedelta(days=1)).isoformat(),
    )
    assert made.status_code == 201, made.json()
    assert _cash(office["tenant"]) == before - D("10000.00")


# ── B45 — a collection on the day it happened ──────────────────────────────


def test_a_collection_can_be_dated_yesterday(office: dict) -> None:
    today = tenant_today(office["tenant"])
    loan = _loan(office, "g").json()["data"]
    yesterday = today - dt.timedelta(days=1)
    got = office["client"].post(
        reverse("v1:lending-collections", args=[loan["id"]]),
        {"amount": "100.00", "mode": "cash", "collected_on": yesterday.isoformat()},
        format="json",
        HTTP_IDEMPOTENCY_KEY="col-1",
    )
    assert got.status_code in (200, 201), got.json()
    row = LendingCollection.objects.get(loan_id=loan["id"])
    assert row.collected_on == yesterday
    assert Payment.objects.get(pk=row.payment_id).payment_date == yesterday
    round_ = office["client"].get(reverse("v1:lending-today")).json()["meta"]
    assert D(round_["collected"]) == D("0")  # yesterday's, not today's


def test_a_collection_cannot_be_dated_tomorrow_or_before_the_loan(office: dict) -> None:
    today = tenant_today(office["tenant"])
    loan = _loan(office, "h").json()["data"]
    for day in (today + dt.timedelta(days=1), _given(today) - dt.timedelta(days=1)):
        refused = office["client"].post(
            reverse("v1:lending-collections", args=[loan["id"]]),
            {"amount": "100.00", "mode": "cash", "collected_on": day.isoformat()},
            format="json",
            HTTP_IDEMPOTENCY_KEY=f"col-{day}",
        )
        assert refused.status_code == 400, refused.json()
        assert "collected_on" in refused.json()["error"]["details"]
