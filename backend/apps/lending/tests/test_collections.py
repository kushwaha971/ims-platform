"""LEN-06/-08 — collections of any amount, lump sums after a gap, visits, today's round.

The owner (4 Oct 2026): money comes daily or monthly, sometimes a borrower
skips days and pays all together; every payment has a mode and a note.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.common.dates import tenant_today
from apps.lending.models import LendingLoan
from apps.parties.models import Party

pytestmark = pytest.mark.django_db
D = Decimal
EVERY_DAY = 127


@pytest.fixture
def book(api_as: Any, lending_on: Any) -> dict:
    owner, _ = api_as(lending_on, role="owner")
    today = tenant_today(lending_on)
    route = owner.post(reverse("v1:lending-routes"), {"name": "Market"}, format="json").json()[
        "data"
    ]
    made = owner.post(
        reverse("v1:lending-loans"),
        {
            "plan_type": "fixed_daily",
            "principal": "4500.00",
            "frequency": "daily",
            "instalment_count": 10,
            "per_instalment_amount": "500.00",
            "collection_weekdays": EVERY_DAY,
            "disbursed_on": (today - dt.timedelta(days=4)).isoformat(),
            "first_due_on": (today - dt.timedelta(days=3)).isoformat(),
            "party": {"name": "Geeta Devi", "mobile": "9820011223"},
            "route_id": route["id"],
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY="loan",
    )
    assert made.status_code == 201, made.json()
    return {"client": owner, "tenant": lending_on, "loan": made.json()["data"], "route": route}


def _url(name: str, loan: dict) -> str:
    return reverse(f"v1:lending-{name}", args=[loan["id"]])


def test_three_missed_days_show_as_arrears_on_todays_round(book: dict) -> None:
    loan = book["loan"]
    assert loan["arrears"] == "1500.00" and loan["due_today"] == "500.00"
    assert loan["days_past_due"] == 3
    day = book["client"].get(reverse("v1:lending-today")).json()
    stop = day["data"][0]
    assert stop["name"] == "Geeta Devi" and stop["arrears"] == "1500.00"
    assert day["meta"]["stops"] == 1 and day["meta"]["collected"] == "0.00"


def test_a_lump_sum_after_a_gap_clears_the_oldest_first_and_pays_ahead(book: dict) -> None:
    """₹2,500 = 3 missed days + today + 1 day ahead, said before it is recorded."""
    loan = book["loan"]
    preview = (
        book["client"]
        .post(_url("collection-preview", loan), {"amount": "2500.00"}, format="json")
        .json()["data"]
    )
    assert [c["when"] for c in preview["clears"]] == ["missed"] * 3 + ["today", "ahead"]
    assert preview["remaining_after"] == "2500.00"
    got = book["client"].post(
        _url("collections", loan),
        {"amount": "2500.00", "mode": "upi", "reference": "UTR123", "note": "Was at the village"},
        format="json",
        HTTP_IDEMPOTENCY_KEY="c1",
    )
    assert got.status_code == 201, got.json()
    figures = got.json()["data"]["figures"]
    assert figures["arrears"] == "0.00" and figures["due_today"] == "0.00"
    assert figures["remaining"] == "2500.00"
    # FRD §0.3: the loan BALANCE is principal outstanding plus interest POSTED
    # (four instalments' ₹50 so far) less what was paid — 4,500 + 200 − 2,500.
    # "Remaining" above also counts the interest of instalments not yet due.
    party = Party.objects.get(pk=loan["borrower"]["party_id"])
    assert party.loan_balance == D("2200.00")
    listed = book["client"].get(_url("collections", loan)).json()["data"]
    assert listed[0]["mode"] == "upi" and listed[0]["note"] == "Was at the village"
    assert listed[0]["reference"] == "UTR123"


def test_a_part_payment_is_taken_and_the_rest_stays_due(book: dict) -> None:
    got = (
        book["client"]
        .post(
            _url("collections", book["loan"]),
            {"amount": "300.00"},
            format="json",
            HTTP_IDEMPOTENCY_KEY="p",
        )
        .json()["data"]
    )
    assert got["figures"]["arrears"] == "1200.00"


def test_more_than_is_owed_is_refused_and_paying_it_all_closes_the_loan(book: dict) -> None:
    loan = book["loan"]
    over = book["client"].post(
        _url("collections", loan), {"amount": "5000.01"}, format="json", HTTP_IDEMPOTENCY_KEY="o"
    )
    assert over.status_code == 409 and over.json()["error"]["code"] == "collection_over_payoff"
    paid = (
        book["client"]
        .post(
            _url("collections", loan),
            {"amount": "5000.00"},
            format="json",
            HTTP_IDEMPOTENCY_KEY="all",
        )
        .json()["data"]
    )
    assert paid["loan_status"] == "closed"
    # Paid before the last date: closed now, as an early closure.
    assert LendingLoan.objects.get(pk=loan["id"]).close_reason == "early"


def test_voiding_a_collection_puts_the_instalments_back(book: dict) -> None:
    loan = book["loan"]
    paid = (
        book["client"]
        .post(
            _url("collections", loan),
            {"amount": "5000.00"},
            format="json",
            HTTP_IDEMPOTENCY_KEY="all",
        )
        .json()["data"]
    )
    voided = book["client"].post(
        reverse("v1:lending-collection-void", args=[paid["collection_id"]]),
        {"reason": "Entered twice"},
        format="json",
    )
    assert voided.status_code == 200, voided.json()
    assert voided.json()["data"]["loan_status"] == "active"
    page = book["client"].get(_url("loan", loan)).json()["data"]
    assert page["arrears"] == "1500.00"


def test_not_paid_is_a_visit_with_a_reason_and_counts_the_stop_done(book: dict) -> None:
    done = book["client"].post(
        _url("visits", book["loan"]),
        {"outcome": "promised", "reason": "Shop closed", "promised_on": "2026-12-01"},
        format="json",
    )
    assert done.status_code == 201
    day = book["client"].get(reverse("v1:lending-today")).json()
    assert day["data"][0]["visit"]["outcome"] == "promised" and day["meta"]["done"] == 1


def test_a_route_with_running_loans_cannot_be_stopped(book: dict) -> None:
    route = book["route"]
    refused = book["client"].patch(
        reverse("v1:lending-route", args=[route["id"]]),
        {"is_active": False, "version": route["version"]},
        format="json",
    )
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "route_has_loans"


def test_staff_record_collections_but_cannot_void_them(book: dict, api_as: Any) -> None:
    staff, _ = api_as(book["tenant"], role="staff")
    got = staff.post(
        _url("collections", book["loan"]),
        {"amount": "500.00"},
        format="json",
        HTTP_IDEMPOTENCY_KEY="s",
    )
    assert got.status_code == 201
    refused = staff.post(
        reverse("v1:lending-collection-void", args=[got.json()["data"]["collection_id"]]),
        {"reason": "oops"},
        format="json",
    )
    assert refused.status_code == 403


def test_the_money_given_cannot_be_voided_while_the_loan_runs(book: dict) -> None:
    """FRD §0.7 `loan_disbursal_locked`: undoing the cash handed over would leave
    a running loan owed by nobody; a loan is cancelled instead (LEN-10)."""
    loan = LendingLoan.objects.get(pk=book["loan"]["id"])
    refused = book["client"].post(
        reverse("v1:payment-void", args=[loan.disbursal_payment_id]),
        {"reason": "Wrong amount"},
        format="json",
    )
    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "loan_disbursal_locked"
