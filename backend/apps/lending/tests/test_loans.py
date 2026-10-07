"""LEN-04 — a loan saved writes the money model of FRD §0.3, exactly."""

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


@pytest.fixture
def office(api_as: Any, lending_on: Any) -> dict:
    owner, _ = api_as(lending_on, role="owner")
    return {"client": owner, "tenant": lending_on}


def _terms(today: dt.date, **over: Any) -> dict:
    data = {
        "plan_type": "fixed_daily",
        "principal": "10000.00",
        "frequency": "daily",
        "instalment_count": 100,
        "per_instalment_amount": "100.00",
        "disbursed_on": today.isoformat(),
        "first_due_on": (today + dt.timedelta(days=1)).isoformat(),
        "deductions": [{"kind": "processing_fee", "label": "File charge", "amount": "500.00"}],
    }
    data.update(over)
    return data


def _create(office: dict, key: str = "k1", **over: Any) -> Any:
    today = tenant_today(office["tenant"])
    body = {
        **_terms(today, **over),
        "party": {"name": "Geeta Devi", "mobile": "9820011223"},
        "payment_mode": "cash",
        "notes": "Husband is guarantor",
    }
    return office["client"].post(
        reverse("v1:lending-loans"), body, format="json", HTTP_IDEMPOTENCY_KEY=key
    )


def test_the_preview_writes_nothing_and_shows_the_cost(office: dict) -> None:
    today = tenant_today(office["tenant"])
    got = office["client"].post(reverse("v1:lending-loan-preview"), _terms(today), format="json")
    assert got.status_code == 200, got.json()
    data = got.json()["data"]
    assert data["cash_handed_over"] == "9500.00" and data["total_payable"] == "10000.00"
    assert len(data["schedule"]) == 100
    assert D(data["effective_annual_rate"]) > 0
    assert LendingLoan.objects.count() == 0


def test_a_loan_owes_the_principal_from_the_day_it_is_given(office: dict) -> None:
    """FRD §0.3: cash handed over (a payment out) + deductions (a charge) =
    the principal, on the borrower's LOAN balance, from day 0."""
    made = _create(office)
    assert made.status_code == 201, made.json()
    loan = made.json()["data"]
    assert loan["number"] == "LN-0001" and loan["status"] == "active"
    assert loan["cash_handed_over"] == "9500.00"
    assert len(loan["schedule"]) == 100 and loan["remaining"] == "10000.00"
    party = Party.objects.get(pk=loan["borrower"]["party_id"])
    assert party.loan_balance == D("10000.00")
    assert loan["notes"] == "Husband is guarantor"


def test_terms_that_do_not_repay_the_principal_are_refused(office: dict) -> None:
    refused = _create(office, per_instalment_amount="50.00")
    assert refused.status_code == 400
    assert "per_instalment_amount" in refused.json()["error"]["details"]


def test_the_loan_list_and_page(office: dict) -> None:
    loan = _create(office).json()["data"]
    listed = office["client"].get(reverse("v1:lending-loans")).json()["data"]
    assert [row["number"] for row in listed] == ["LN-0001"]
    page = office["client"].get(reverse("v1:lending-loan", args=[loan["id"]])).json()["data"]
    assert page["deductions"][0]["label"] == "File charge"


def test_staff_cannot_give_a_loan(office: dict, api_as: Any) -> None:
    staff, _ = api_as(office["tenant"], role="staff")
    today = tenant_today(office["tenant"])
    refused = staff.post(
        reverse("v1:lending-loans"),
        {**_terms(today), "party": {"name": "X"}},
        format="json",
        HTTP_IDEMPOTENCY_KEY="s",
    )
    assert refused.status_code == 403


@pytest.mark.parametrize(
    "field, value",
    [
        ("collection_weekdays", [0, 1, 2]),
        ("collection_weekdays", "mon"),
        ("collection_weekdays", 0),
        ("collection_weekdays", 128),
        ("per_instalment_amount", "a lot"),
    ],
)
def test_malformed_terms_are_a_field_error_not_a_server_error(
    office: dict, field: str, value: Any
) -> None:
    """L02 QA: `collection_weekdays` sent as a list (a client that thinks in
    day names) reached `int(list)` and answered 500; and a malformed
    `per_instalment_amount` was parsed AFTER the errors were raised, so its
    error was silently dropped. Both must be a 400 on the field."""
    today = tenant_today(office["tenant"])
    got = office["client"].post(
        reverse("v1:lending-loan-preview"), _terms(today, **{field: value}), format="json"
    )
    assert got.status_code == 400, got.content
    assert field in got.json()["error"]["details"]


def test_the_loan_page_carries_the_lenders_letterhead_for_its_papers(office: dict) -> None:
    """Lending P0 — the receipt, statement and closure letter are headed by the LENDER's
    own name, address and phone, which only the loan page's payload can give them."""
    tenant = office["tenant"]
    tenant.address = {"line1": "12 Station Road", "city": "Indore", "pincode": "452001"}
    tenant.phone = "+919820011223"
    tenant.save(update_fields=["address", "phone"])
    loan = _create(office).json()["data"]
    page = office["client"].get(reverse("v1:lending-loan", args=[loan["id"]])).json()["data"]
    assert page["lender"] == {
        "name": tenant.name,
        "legal_name": tenant.legal_name or "",
        "address": ["12 Station Road", "Indore, 452001"],
        "phone": "+919820011223",
        "gstin": tenant.gstin or "",
    }
