"""QA B26 — the fee badge says what the money and the dates say.

A student admitted on a ₹0 plan with nothing collected read "Paid" and "Nothing
due": "Paid" with no payment behind it. The badge is now worked out from the
plan's fee, the charges still open and what was paid towards them, and the dates
— No fee, Part paid, Fee unpaid, Due soon, Overdue, On hold, Left, Paid.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.common.dates import tenant_today
from tests.factories.parties import PartyFactory

from .test_members import _cash, _enrol, _type

pytestmark = pytest.mark.django_db
D = Decimal


def _state(client: Any, response: Any) -> str:
    assert response.status_code == 201, response.content
    membership_id = response.json()["data"]["membership_id"]
    detail = client.get(reverse("v1:library-member", args=[membership_id])).json()["data"]
    return detail["fee_state"]


def test_a_student_on_a_free_plan_reads_no_fee_not_paid(api_as: Any, library_on: Any) -> None:
    """The QA steps: "Standard" at ₹0, nothing collected → "No fee", never "Paid"."""
    client, _ = api_as(library_on, role="owner")
    free = _type(library_on, fee_amount=D("0"), admission_fee=D("0"), deposit_amount=D("0"))
    assert _state(client, _enrol(client, library_on, kind=free)) == "no_fee"


def test_a_fee_paid_in_part_reads_part_paid(api_as: Any, library_on: Any) -> None:
    """₹200 fees, ₹100 taken at admission: "Part paid", not "Fee unpaid"."""
    client, _ = api_as(library_on, role="owner")
    kind = _type(
        library_on, fee_amount=D("150.00"), admission_fee=D("50.00"), deposit_amount=D("0")
    )
    response = _enrol(client, library_on, kind=kind, collect_fees=_cash("100.00"))
    assert _state(client, response) == "part_paid"


def test_a_fee_nothing_paid_reads_unpaid_and_a_fee_paid_in_full_reads_paid(
    api_as: Any, library_on: Any
) -> None:
    client, _ = api_as(library_on, role="owner")
    kind = _type(
        library_on, fee_amount=D("150.00"), admission_fee=D("50.00"), deposit_amount=D("0")
    )
    assert _state(client, _enrol(client, library_on, kind=kind, key="a")) == "unpaid"
    paid = _enrol(
        client,
        library_on,
        kind=kind,
        key="b",
        party=PartyFactory(tenant=library_on, name="Ravi", mobile="+919876500001"),
        collect_fees=_cash("200.00"),
    )
    assert _state(client, paid) == "paid"


def test_a_suspended_student_reads_on_hold(api_as: Any, library_on: Any) -> None:
    """Suspended students used to fall through to "Paid"."""
    from apps.library.models import LibraryMembership

    client, _ = api_as(library_on, role="owner")
    free = _type(library_on, fee_amount=D("0"), admission_fee=D("0"), deposit_amount=D("0"))
    response = _enrol(client, library_on, kind=free)
    membership_id = response.json()["data"]["membership_id"]
    LibraryMembership.objects.filter(pk=membership_id).update(
        status="suspended", suspended_until=tenant_today(library_on) + dt.timedelta(days=5)
    )
    detail = client.get(reverse("v1:library-member", args=[membership_id])).json()["data"]
    assert detail["fee_state"] == "on_hold"
