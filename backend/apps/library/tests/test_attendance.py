"""W05 — a reading room's attendance on the attendance engine (owner, 4 Oct 2026)."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.common.dates import tenant_today
from apps.library.models import LibraryMembership, LibraryMembershipType
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db
D = Decimal
URL = "v1:library-attendance"


@pytest.fixture
def room(api_as: Any, library_on: Any) -> dict:
    owner, _ = api_as(library_on, role="owner")
    kind = LibraryMembershipType.objects.create(
        tenant=library_on, name="Monthly", validity_months=1, fee_amount=D("900.00")
    )

    def admit(name: str, key: str, collect: bool = True) -> dict:
        body: dict = {
            "membership_type_id": str(kind.id),
            "party_id": str(PartyFactory(tenant=library_on, name=name).id),
        }
        if collect:
            body["collect_fees"] = {"mode_breakup": [{"mode": "cash", "amount": "900.00"}]}
        made = owner.post(
            reverse("v1:library-members"), body, format="json", HTTP_IDEMPOTENCY_KEY=key
        )
        assert made.status_code == 201, made.json()
        return made.json()["data"]

    return {"client": owner, "tenant": library_on, "admit": admit}


def _in(room: dict, member: dict, **extra: Any) -> Any:
    return room["client"].post(
        reverse(URL), {"membership_id": member["membership_id"], **extra}, format="json"
    )


def test_a_paid_student_checks_in_and_out_and_the_day_register_says_so(room: dict) -> None:
    asha = room["admit"]("Asha", "a")
    room["admit"]("Rahul", "b")
    came = _in(room, asha)
    assert came.status_code == 201 and came.json()["data"]["decision"] == "allow"
    day = room["client"].get(reverse(URL)).json()
    assert day["meta"]["students"] == 2 and day["meta"]["present"] == 1
    assert day["meta"]["in_now"] == 1
    row = next(r for r in day["data"] if r["name"] == "Asha")
    out = room["client"].post(reverse("v1:library-attendance-out", args=[row["mark_id"]]))
    assert out.status_code == 200
    day = room["client"].get(reverse(URL)).json()
    assert day["meta"]["in_now"] == 0 and day["meta"]["present"] == 1


def test_a_second_check_in_the_same_day_is_refused(room: dict) -> None:
    """One visit a day: a double tap at the desk must not count two days."""
    asha = room["admit"]("Asha", "a")
    assert _in(room, asha).status_code == 201
    again = _in(room, asha)
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "attendance_duplicate"


def test_an_unpaid_or_overdue_student_is_let_in_with_a_warning(room: dict) -> None:
    """A reading room asks a late student for the fee; it does not turn them
    away at the door. The desk is told why, with the figure."""
    unpaid = room["admit"]("Imran", "a", collect=False)
    came = _in(room, unpaid).json()["data"]
    assert came["decision"] == "warn" and came["reason"] == "Fee unpaid: ₹900.00."
    late = room["admit"]("Pooja", "b")
    today = tenant_today(room["tenant"])
    LibraryMembership.objects.filter(pk=late["membership_id"]).update(
        starts_on=today - dt.timedelta(days=33), valid_until=today - dt.timedelta(days=3)
    )
    came = _in(room, late).json()["data"]
    assert came["decision"] == "warn" and came["reason"] == "Fee overdue by 3 days."


def test_a_student_on_hold_is_blocked_unless_an_owner_overrides(room: dict, api_as: Any) -> None:
    neha = room["admit"]("Neha", "a")
    LibraryMembership.objects.filter(pk=neha["membership_id"]).update(status="suspended")
    staff, _ = api_as(room["tenant"], role="staff")
    refused = staff.post(reverse(URL), {"membership_id": neha["membership_id"]}, format="json")
    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "attendance_blocked"
    overridden = _in(room, neha, override_reason="Paid at the gate, will update")
    assert overridden.status_code == 201
    assert overridden.json()["data"]["decision"] == "block_overridden"


def test_the_student_page_lists_the_days_they_came(room: dict) -> None:
    asha = room["admit"]("Asha", "a")
    _in(room, asha)
    month = tenant_today(room["tenant"]).strftime("%Y-%m")
    days = (
        room["client"]
        .get(
            reverse("v1:library-member-attendance", args=[asha["membership_id"]]), {"month": month}
        )
        .json()["data"]
    )
    assert days == [tenant_today(room["tenant"]).isoformat()]


def test_a_future_day_has_no_register(room: dict) -> None:
    tomorrow = tenant_today(room["tenant"]) + dt.timedelta(days=1)
    assert room["client"].get(reverse(URL), {"date": tomorrow.isoformat()}).status_code == 400
