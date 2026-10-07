"""LEN-10 — write-off and cancel: a loan that will not be repaid leaves the books cleanly.

The defects these prevent: a write-off of a figure the owner never saw (a collection
landed in between); a written-off loan still reminding the borrower or still owing in
their khata; a write-off by anyone but the owner; a cancel that erases money already
collected; and a cancel that leaves the disbursal or the file charge in the khata.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.common.dates import tenant_today
from apps.dues.models import DuesDue
from apps.parties.models import Party
from apps.payments.models import Payment

pytestmark = pytest.mark.django_db
EVERY_DAY = 127


@pytest.fixture
def office(api_as: Any, lending_on: Any) -> dict:
    owner, _ = api_as(lending_on, role="owner")
    return {"client": owner, "tenant": lending_on}


def make_loan(office: dict, key: str, days_ago: int = 3) -> dict:
    today = tenant_today(office["tenant"])
    made = office["client"].post(
        reverse("v1:lending-loans"),
        {
            "plan_type": "fixed_daily",
            "principal": "4500.00",
            "frequency": "daily",
            "instalment_count": 10,
            "per_instalment_amount": "500.00",
            "collection_weekdays": EVERY_DAY,
            "disbursed_on": (today - dt.timedelta(days=days_ago + 1)).isoformat(),
            "first_due_on": (today - dt.timedelta(days=days_ago)).isoformat(),
            "deductions": [{"kind": "processing_fee", "label": "File charge", "amount": "200.00"}],
            "party": {
                "name": f"Geeta {key}",
                "mobile": f"98200{sum(map(ord, key)) * 7 % 100000:05d}",
            },
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY=key,
    )
    assert made.status_code == 201, made.json()
    return made.json()["data"]


def collect(office: dict, loan: dict, amount: str, key: str) -> None:
    got = office["client"].post(
        reverse("v1:lending-collections", args=[loan["id"]]),
        {"amount": amount, "mode": "cash"},
        format="json",
        HTTP_IDEMPOTENCY_KEY=key,
    )
    assert got.status_code == 201, got.json()


def party_of(loan: dict) -> Party:
    return Party.objects.get(pk=loan["borrower"]["party_id"])


def test_a_write_off_clears_what_the_khata_carries_and_stops_the_schedule(office: dict) -> None:
    loan = make_loan(office, "wo")
    collect(office, loan, "500.00", "c1")
    page = office["client"].get(reverse("v1:lending-loan", args=[loan["id"]])).json()["data"]
    figure = page["write_off_amount"]
    party = party_of(loan)
    assert Decimal(figure) == party.loan_balance  # the one loan is all the khata carries
    url = reverse("v1:lending-write-off", args=[loan["id"]])
    body = {"amount": "1.00", "reason_code": "cannot_trace", "reason": "Moved away, no address"}
    stale = office["client"].post(url, body, format="json")
    assert stale.status_code == 409 and stale.json()["error"]["details"]["balance"] == figure
    done = office["client"].post(url, {**body, "amount": figure}, format="json")
    assert done.status_code == 200, done.json()
    after = done.json()["data"]["loan"]
    assert after["status"] == "written_off" and after["status_reason"].startswith("cannot_trace")
    party.refresh_from_db()
    assert party.loan_balance == Decimal("0.00")
    assert (
        not DuesDue.objects.filter(schedule_id=after_schedule(loan))
        .exclude(status__in=["paid", "cancelled"])
        .exists()
    )
    reminders = office["client"].get(reverse("v1:lending-reminders")).json()["data"]
    assert all(row["loan_id"] != loan["id"] for row in reminders)


def after_schedule(loan: dict) -> Any:
    from apps.lending.models import LendingLoan

    return LendingLoan.objects.get(pk=loan["id"]).schedule_id


def test_only_the_owner_writes_off(office: dict, api_as: Any) -> None:
    loan = make_loan(office, "admin")
    admin, _ = api_as(office["tenant"], role="admin")
    page = office["client"].get(reverse("v1:lending-loan", args=[loan["id"]])).json()["data"]
    refused = admin.post(
        reverse("v1:lending-write-off", args=[loan["id"]]),
        {"amount": page["write_off_amount"], "reason_code": "death", "reason": "Passed away"},
        format="json",
    )
    assert refused.status_code == 403


def test_cancel_undoes_the_loan_in_the_books_and_refuses_once_money_came(office: dict) -> None:
    loan = make_loan(office, "cx")
    party = party_of(loan)
    assert party.loan_balance > 0
    url = reverse("v1:lending-cancel", args=[loan["id"]])
    assert office["client"].post(url, {"reason": "x"}, format="json").status_code == 400
    done = office["client"].post(url, {"reason": "Entered for the wrong person"}, format="json")
    assert done.status_code == 200, done.json()
    assert done.json()["data"]["loan"]["status"] == "cancelled"
    party.refresh_from_db()
    assert party.loan_balance == Decimal("0.00") and party.balance == Decimal("0.00")
    from apps.lending.models import LendingLoan

    disbursal = Payment.objects.get(pk=LendingLoan.objects.get(pk=loan["id"]).disbursal_payment_id)
    assert disbursal.status == "void"

    paid = make_loan(office, "cx2")
    collect(office, paid, "500.00", "c2")
    refused = office["client"].post(
        reverse("v1:lending-cancel", args=[paid["id"]]), {"reason": "Mistake"}, format="json"
    )
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "loan_has_collections"
