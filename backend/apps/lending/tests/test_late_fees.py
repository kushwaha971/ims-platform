"""LEN-09 — late fees only when agreed, never automatic, never above the rule; waivers by the owner.

The defects these prevent: a late fee on a loan whose borrower never agreed to one; a fee
above what the rule allows, or charged twice; a fee that is interest on a fee; a waiver
by someone the owner never trusted with one; and a fee or waiver that moves the
instalment but not the borrower's khata (or the reverse).
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.common.dates import tenant_today
from apps.parties.models import Party

pytestmark = pytest.mark.django_db
EVERY_DAY = 127


def make_loan(client: Any, tenant: Any, key: str, **terms: Any) -> dict:
    today = tenant_today(tenant)
    made = client.post(
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
            "party": {"name": f"Geeta {key}", "mobile": "9820011223"},
            **terms,
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY=key,
    )
    assert made.status_code == 201, made.json()
    return made.json()["data"]


@pytest.fixture
def office(api_as: Any, lending_on: Any) -> dict:
    owner, _ = api_as(lending_on, role="owner")
    return {"client": owner, "tenant": lending_on}


def first_due(loan: dict) -> str:
    return loan["schedule"][0]["id"]


def fee(client: Any, loan: dict, amount: str, key: str = "f1") -> Any:
    return client.post(
        reverse("v1:lending-late-fees", args=[loan["id"]]),
        {"due_id": first_due(loan), "amount": amount, "reason": "Late fee as agreed"},
        format="json",
        HTTP_IDEMPOTENCY_KEY=key,
    )


def test_no_late_fee_without_a_rule_in_the_terms(office: dict) -> None:
    loan = make_loan(office["client"], office["tenant"], "plain")
    refused = fee(office["client"], loan, "10.00")
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "late_fee_not_in_terms"


def test_a_per_day_fee_is_suggested_capped_and_moves_the_khata(office: dict) -> None:
    loan = make_loan(
        office["client"],
        office["tenant"],
        "perday",
        late_fee_kind="per_day",
        late_fee_value="10.00",
        late_fee_cap="25.00",
        late_fee_grace_days=1,
    )
    assert loan["late_fee"] == {
        "kind": "per_day",
        "value": "10.00",
        "cap": "25.00",
        "grace_days": 1,
    }
    url = reverse("v1:lending-loan-due", args=[loan["id"], first_due(loan)])
    figures = office["client"].get(url).json()["data"]
    # Due 3 days ago, 1 day of grace: 2 days late × ₹10.
    assert figures["late_fee"]["days_late"] == 2 and figures["late_fee"]["suggested"] == "20.00"
    party = Party.objects.get(pk=loan["borrower"]["party_id"])
    before = party.loan_balance

    assert fee(office["client"], loan, "21.00", "over").status_code == 400
    added = fee(office["client"], loan, "20.00")
    assert added.status_code == 201, added.json()
    after = added.json()["data"]["loan"]
    assert after["schedule"][0]["late_fee"] == "20.00"
    assert Decimal(after["arrears"]) == Decimal(loan["arrears"]) + 20
    party.refresh_from_db()
    # A charge on the borrower's LOAN (DEC-019): lending's own figure, never the khata's.
    assert party.loan_balance == before + 20
    assert party.balance == Decimal("0.00")

    again = fee(office["client"], loan, "1.00", "again")
    assert again.status_code == 409 and again.json()["error"]["code"] == "penalty_cap_reached"


def test_simple_interest_never_counts_a_fee_and_rounds_once(office: dict) -> None:
    from apps.dues.models import DuesDue
    from apps.lending.models import LendingLoan
    from apps.lending.services.late_fees import rule_amount

    loan = make_loan(
        office["client"],
        office["tenant"],
        "si",
        late_fee_kind="simple_interest",
        late_fee_value="24",
        late_fee_cap="500.00",
    )
    row = LendingLoan.objects.get(pk=loan["id"])
    due = DuesDue.objects.get(pk=first_due(loan))
    today = tenant_today(office["tenant"])
    # ₹500 unpaid for 3 days at 24% a year: 500 × 0.24 × 3 / 365 = 0.986… → 0.99.
    assert rule_amount(row, due, today) == (Decimal("0.99"), 3)
    assert fee(office["client"], loan, "0.99").status_code == 201
    due.refresh_from_db()
    # The fee is not in the base: tomorrow's figure is the principal and interest's alone.
    assert rule_amount(row, due, today + dt.timedelta(days=1))[0] == Decimal("1.32")


def test_the_owner_waives_with_a_reason_and_staff_cannot(office: dict, api_as: Any) -> None:
    loan = make_loan(
        office["client"],
        office["tenant"],
        "waive",
        late_fee_kind="flat_once",
        late_fee_value="100.00",
    )
    assert fee(office["client"], loan, "100.00").status_code == 201
    url = reverse("v1:lending-waivers", args=[loan["id"]])
    body = {"due_id": first_due(loan), "component": "fee", "amount": "100.00", "reason": "x"}
    assert office["client"].post(url, body, format="json").status_code == 400  # reason
    staff, _ = api_as(office["tenant"], role="staff")
    body["reason"] = "First time, paid the same week"
    assert staff.post(url, body, format="json").status_code == 403
    waived = office["client"].post(url, body, format="json", HTTP_IDEMPOTENCY_KEY="w1")
    assert waived.status_code == 201, waived.json()
    after = waived.json()["data"]["loan"]
    assert after["schedule"][0]["waived"] == "100.00"
    assert after["arrears"] == loan["arrears"]  # the fee is gone again
    too_much = office["client"].post(
        url,
        {**body, "component": "interest", "amount": "5000.00"},
        format="json",
    )
    assert too_much.status_code == 400
    interest = office["client"].post(
        url, {**body, "component": "interest", "amount": "10.00"}, format="json"
    )
    assert interest.status_code == 201, interest.json()
    assert Decimal(interest.json()["data"]["loan"]["arrears"]) == Decimal(loan["arrears"]) - 10
