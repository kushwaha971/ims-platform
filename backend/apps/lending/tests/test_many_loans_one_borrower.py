"""One borrower, several loans (owner, 12 Oct 2026).

"What happens when one borrower takes multiple loans from the same lender?"
A borrower and a loan are separate things here — `LendingLoan.borrower` is a
foreign key and every collection, schedule and figure is per loan — but until
this file NOTHING tested it: every fixture in the module made a fresh person
for every loan, and one test even asserted that "the one loan is all the khata
carries". These tests give Ramesh three loans with different amounts, dates
and terms, and check that money paid on one never moves another.

Tier 1: these are a lender's books.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.common.dates import tenant_today
from apps.lending.models import LendingBorrower, LendingCollection, LendingLoan
from apps.parties.models import Party

pytestmark = pytest.mark.django_db
D = Decimal
EVERY_DAY = 127


def _loan(client: Any, today: dt.date, key: str, **over: Any) -> dict:
    body = {
        "plan_type": "fixed_daily",
        "principal": "4500.00",
        "frequency": "daily",
        "instalment_count": 10,
        "per_instalment_amount": "500.00",
        "collection_weekdays": EVERY_DAY,
        "disbursed_on": (today - dt.timedelta(days=4)).isoformat(),
        "first_due_on": (today - dt.timedelta(days=3)).isoformat(),
    }
    body.update(over)
    made = client.post(reverse("v1:lending-loans"), body, format="json", HTTP_IDEMPOTENCY_KEY=key)
    assert made.status_code == 201, made.json()
    return made.json()["data"]


def _url(name: str, loan: dict) -> str:
    return reverse(f"v1:lending-{name}", args=[loan["id"]])


def _fresh(client: Any, loan: dict) -> dict:
    return client.get(reverse("v1:lending-loan", args=[loan["id"]])).json()["data"]


@pytest.fixture
def ramesh(api_as: Any, lending_on: Any) -> dict:
    """Ramesh Kumar with three loans: ₹4,500 daily, ₹9,000 daily, ₹1,800 just given."""
    client, _ = api_as(lending_on, role="owner")
    today = tenant_today(lending_on)
    first = _loan(client, today, "l1", party={"name": "Ramesh Kumar", "mobile": "9820011223"})
    borrower_id = first["borrower"]["id"]
    second = _loan(
        client,
        today,
        "l2",
        borrower_id=borrower_id,
        principal="9000.00",
        per_instalment_amount="1000.00",
        disbursed_on=(today - dt.timedelta(days=2)).isoformat(),
        first_due_on=(today - dt.timedelta(days=1)).isoformat(),
    )
    third = _loan(
        client,
        today,
        "l3",
        borrower_id=borrower_id,
        principal="1800.00",
        per_instalment_amount="200.00",
        disbursed_on=today.isoformat(),
        first_due_on=(today + dt.timedelta(days=1)).isoformat(),
    )
    return {
        "client": client,
        "tenant": lending_on,
        "today": today,
        "borrower_id": borrower_id,
        "loans": [first, second, third],
    }


def test_a_second_and_a_third_loan_go_to_the_same_person(ramesh: dict) -> None:
    """Nothing refuses another loan to somebody who already has one, and no
    second person is made for it."""
    first, second, third = ramesh["loans"]
    assert {loan["borrower"]["id"] for loan in ramesh["loans"]} == {ramesh["borrower_id"]}
    assert len({loan["number"] for loan in ramesh["loans"]}) == 3
    assert LendingBorrower.objects.filter(tenant=ramesh["tenant"]).count() == 1
    assert Party.objects.filter(tenant=ramesh["tenant"], name="Ramesh Kumar").count() == 1
    assert (first["principal"], second["principal"], third["principal"]) == (
        "4500.00",
        "9000.00",
        "1800.00",
    )


def test_each_loan_keeps_its_own_terms_and_schedule(ramesh: dict) -> None:
    """Different amounts, dates and instalments: three schedules, not one."""
    rows = list(LendingLoan.objects.filter(tenant=ramesh["tenant"]).order_by("number"))
    assert len({row.schedule_id for row in rows}) == 3
    first, second, third = ramesh["loans"]
    assert first["arrears"] == "1500.00" and first["due_today"] == "500.00"
    assert second["arrears"] == "1000.00" and second["due_today"] == "1000.00"
    assert third["arrears"] == "0.00" and third["due_today"] == "0.00"


def test_money_paid_on_one_loan_does_not_move_the_others(ramesh: dict) -> None:
    """The defect this prevents: a payment merged into the person, so two loans
    both look part-paid and neither is right."""
    client = ramesh["client"]
    first, second, third = ramesh["loans"]
    paid = client.post(
        _url("collections", first),
        {"amount": "2000.00", "mode": "cash"},
        format="json",
        HTTP_IDEMPOTENCY_KEY="c1",
    )
    assert paid.status_code == 201, paid.json()
    assert paid.json()["data"]["figures"]["arrears"] == "0.00"
    for untouched, before in ((second, second), (third, third)):
        now = _fresh(client, untouched)
        assert (now["arrears"], now["due_today"], now["remaining"], now["collected"]) == (
            before["arrears"],
            before["due_today"],
            before["remaining"],
            before["collected"],
        )
    assert LendingCollection.objects.get(tenant=ramesh["tenant"]).loan_id == LendingLoan.objects.get(
        number=first["number"], tenant=ramesh["tenant"]
    ).id


def test_more_than_one_loan_owes_is_refused_not_spilled_onto_another(ramesh: dict) -> None:
    """₹6,000 against a loan with ₹5,000 left is a mistake to be asked about,
    not ₹1,000 quietly put on the person's other loan."""
    client = ramesh["client"]
    first, second, _third = ramesh["loans"]
    over = client.post(
        _url("collections", first),
        {"amount": "6000.00"},
        format="json",
        HTTP_IDEMPOTENCY_KEY="over",
    )
    assert over.status_code in (400, 409), over.json()
    assert _fresh(client, second)["collected"] == "0.00"
    assert not LendingCollection.objects.filter(tenant=ramesh["tenant"]).exists()


def test_closing_one_loan_leaves_the_others_running(ramesh: dict) -> None:
    client = ramesh["client"]
    first, second, third = ramesh["loans"]
    done = client.post(
        _url("collections", first),
        {"amount": first["remaining"]},
        format="json",
        HTTP_IDEMPOTENCY_KEY="payoff",
    )
    assert done.status_code == 201, done.json()
    assert _fresh(client, first)["status"] == "closed"
    assert _fresh(client, second)["status"] == "active"
    assert _fresh(client, third)["status"] == "active"
    still = client.get(
        reverse("v1:lending-loans"), {"borrower": ramesh["borrower_id"], "status": "all"}
    ).json()
    assert sorted(row["status"] for row in still["data"]) == ["active", "active", "closed"]


def test_the_days_round_has_one_stop_per_loan_each_collected_separately(ramesh: dict) -> None:
    """Two loans to collect today are two rows, told apart by their loan
    number, each with its own amount — never one merged figure."""
    day = ramesh["client"].get(reverse("v1:lending-today")).json()
    mine = [stop for stop in day["data"] if stop["name"] == "Ramesh Kumar"]
    first, second, _third = ramesh["loans"]
    assert sorted(stop["number"] for stop in mine) == sorted([first["number"], second["number"]])
    by_number = {stop["number"]: stop for stop in mine}
    assert by_number[first["number"]]["arrears"] == "1500.00"
    assert by_number[second["number"]]["arrears"] == "1000.00"


def test_the_borrower_shows_their_loans_added_up(ramesh: dict) -> None:
    """The person, not just the loans: how many, how much was given, how much
    has come back, how much is left and how much of it is late. The Borrowers
    list used to show a name and a phone number."""
    client = ramesh["client"]
    first, second, third = ramesh["loans"]
    client.post(
        _url("collections", first),
        {"amount": "2000.00"},
        format="json",
        HTTP_IDEMPOTENCY_KEY="c1",
    )
    one = client.get(reverse("v1:lending-borrower", args=[ramesh["borrower_id"]])).json()["data"]
    summary = one["summary"]
    assert (summary["loans"], summary["running"]) == (3, 3)
    assert summary["given"] == "15300.00"
    assert summary["collected"] == "2000.00"
    left = sum(D(_fresh(client, loan)["remaining"]) for loan in (first, second, third))
    late = sum(D(_fresh(client, loan)["arrears"]) for loan in (first, second, third))
    # The total can never disagree with the loans added up by hand.
    assert D(summary["left"]) == left
    assert D(summary["late"]) == late == D("1000.00")

    listed = client.get(reverse("v1:lending-borrowers")).json()["data"]
    assert listed[0]["summary"] == summary


def test_a_finished_loan_stops_counting_as_money_left(ramesh: dict) -> None:
    client = ramesh["client"]
    first, _second, _third = ramesh["loans"]
    client.post(
        _url("collections", first),
        {"amount": first["remaining"]},
        format="json",
        HTTP_IDEMPOTENCY_KEY="payoff",
    )
    summary = client.get(reverse("v1:lending-borrower", args=[ramesh["borrower_id"]])).json()[
        "data"
    ]["summary"]
    assert (summary["loans"], summary["running"]) == (3, 2)
    assert summary["collected"] == first["remaining"]


def test_another_business_cannot_read_this_borrower(
    ramesh: dict, api_as: Any, other_tenant: Any
) -> None:
    """Tenant boundary: a borrower's id from one lender means nothing to another."""
    stranger, _ = api_as(other_tenant, role="owner")
    response = stranger.get(reverse("v1:lending-borrower", args=[ramesh["borrower_id"]]))
    assert response.status_code in (403, 404)
