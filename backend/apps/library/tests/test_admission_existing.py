"""QA F1 and F2 — admitting a student who already studies here, and taking any amount.

F1: a reading room moving its paper register in had two bad choices — "Collect now"
put a fake receipt and fake cash in today's drawer, "Collect now off" put a fake due on
a student who had paid. An existing student now comes in with the dates they really
have, the deposit they really handed over and any dues they really owe, and nothing
happens to today's cash.

F2: "Collect now" was all or nothing. A part payment now leaves the rest owed, and more
than the fees stays as the student's advance.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.common.dates import tenant_today
from apps.library.models import LibraryMembership
from apps.library.services import members
from apps.parties.models import Party
from apps.payments.models import Payment
from apps.reports.selectors.day_book import money_position

from .test_members import _enrol, _type

pytestmark = pytest.mark.django_db
D = Decimal


def _cash_in_hand(tenant: Any) -> Decimal:
    return money_position(tenant=tenant, before=tenant_today(tenant) + dt.timedelta(days=1))[
        "cash"
    ]


def test_an_existing_student_paid_till_a_date_has_no_due_no_receipt_and_no_cash(
    api_as: Any, library_on: Any
) -> None:
    """Joined 1 Aug, paid till 31 Oct → plan till 31 Oct, no due, no receipt, cash unchanged."""
    client, _ = api_as(library_on, role="staff")
    before = _cash_in_hand(library_on)
    response = _enrol(
        client,
        library_on,
        existing_student=True,
        starts_on="2026-08-01",
        valid_until="2026-10-31",
    )
    assert response.status_code == 201, response.content
    body = response.json()
    assert body["data"]["valid_until"] == "2026-10-31"
    assert body["data"]["starts_on"] == "2026-08-01"
    assert body["data"]["dues_amount"] == "0.00"
    assert body["meta"]["charges"] == [] and body["meta"]["payments"] == []
    assert not Payment.objects.filter(tenant=library_on).exists()
    assert _cash_in_hand(library_on) == before


def test_an_existing_student_whose_paid_till_has_passed_is_shown_as_lapsed(
    library_on: Any,
) -> None:
    """Paid till 5 Oct → on 12 Oct the student's plan has run out (the status the badge
    and the reminders read), with no due invented for it."""
    m = LibraryMembership(status="active", valid_until=dt.date(2026, 10, 5))
    assert members.effective_status(m, dt.date(2026, 10, 12)) == "expired"


def test_a_deposit_already_held_is_security_held_without_cash_today(
    api_as: Any, library_on: Any
) -> None:
    client, _ = api_as(library_on, role="staff")
    before = _cash_in_hand(library_on)
    response = _enrol(
        client,
        library_on,
        existing_student=True,
        starts_on="2026-08-01",
        valid_until="2026-10-31",
        deposit_held="500.00",
    )
    assert response.status_code == 201, response.content
    party = Party.objects.get(name="Asha Kulkarni")
    assert party.deposit_held == D("500.00")
    # R37's opening deposit: an adjustment, so neither the drawer nor today's
    # collections show the paper-era money.
    assert _cash_in_hand(library_on) == before
    assert response.json()["data"]["blocks"] == []


def test_old_dues_come_in_owed_and_dated(api_as: Any, library_on: Any) -> None:
    client, _ = api_as(library_on, role="staff")
    response = _enrol(
        client,
        library_on,
        existing_student=True,
        starts_on="2026-06-01",
        valid_until="2026-09-30",
        old_dues={"amount": "300.00", "on": "2026-09-01"},
    )
    assert response.status_code == 201, response.content
    charges = response.json()["meta"]["charges"]
    assert [(c["amount"], c["charge_date"]) for c in charges] == [("300.00", "2026-09-01")]
    assert response.json()["data"]["dues_amount"] == "300.00"


def test_an_existing_student_cannot_also_be_charged_today(api_as: Any, library_on: Any) -> None:
    client, _ = api_as(library_on, role="staff")
    response = _enrol(
        client,
        library_on,
        existing_student=True,
        collect_fees={"mode_breakup": [{"mode": "cash", "amount": "200.00"}]},
    )
    assert response.status_code == 400
    assert "collect_fees" in response.json()["error"]["details"]


def test_joined_can_be_corrected_later(api_as: Any, library_on: Any) -> None:
    """Editing a member is the owner's or an admin's (12 Oct 2026)."""
    client, _ = api_as(library_on)
    made = _enrol(
        client, library_on, existing_student=True, starts_on="2026-08-01", valid_until="2026-10-31"
    ).json()["data"]
    member_url = reverse("v1:library-member", args=[made["membership_id"]])
    moved = client.patch(
        member_url,
        {"starts_on": "2026-07-15", "version": made["version"]},
        format="json",
    )
    assert moved.status_code == 200, moved.content
    assert moved.json()["data"]["starts_on"] == "2026-07-15"
    refused = client.patch(
        member_url,
        {"starts_on": "2026-11-15", "version": moved.json()["data"]["version"]},
        format="json",
    )
    assert refused.status_code == 400
    assert "starts_on" in refused.json()["error"]["details"]


# ── F2 — any amount at admission ────────────────────────────────────────────


def test_part_of_the_fees_leaves_the_rest_due(api_as: Any, library_on: Any) -> None:
    """₹500 of ₹1,700 → ₹1,200 due, a ₹500 receipt."""
    client, _ = api_as(library_on, role="staff")
    kind = _type(library_on, admission_fee=D("200.00"), fee_amount=D("1500.00"))
    response = _enrol(
        client,
        library_on,
        kind=kind,
        collect_fees={"mode_breakup": [{"mode": "upi", "upi_app": "phonepe", "amount": "500.00"}]},
    )
    assert response.status_code == 201, response.content
    assert response.json()["data"]["dues_amount"] == "1200.00"
    assert Payment.objects.get(tenant=library_on).amount == D("500.00")


def test_more_than_the_fees_is_kept_as_advance(api_as: Any, library_on: Any) -> None:
    """₹3,700 against ₹1,700 → no due, and ₹2,000 kept as the student's advance."""
    client, _ = api_as(library_on, role="staff")
    kind = _type(library_on, admission_fee=D("200.00"), fee_amount=D("1500.00"))
    response = _enrol(
        client,
        library_on,
        kind=kind,
        collect_fees={
            "mode_breakup": [
                {"mode": "cash", "amount": "1700.00"},
                {"mode": "bank", "amount": "2000.00"},
            ]
        },
    )
    assert response.status_code == 201, response.content
    assert response.json()["data"]["dues_amount"] == "0.00"
    party = Party.objects.get(name="Asha Kulkarni")
    # Paid more than owed: the library owes the student ₹2,000 of advance.
    assert party.library_balance == D("-2000.00")
