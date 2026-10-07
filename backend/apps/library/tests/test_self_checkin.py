"""Library P0 — QR self check-in: a student checks in from the door's QR with their phone.

The defects these prevent: a poster that checks somebody in on a number alone (cards are
seen across a desk); a page that says WHICH half was wrong (an oracle for valid student
numbers); a second visit the same day; a student who left walking in unchallenged; a
poster edited to point at another library; and a page that names the product.
"""

from __future__ import annotations

from decimal import Decimal as D
from typing import Any

import pytest
from django.urls import reverse

from apps.attendance.models import Mark
from apps.library.models import LibraryMembership, LibraryMembershipType
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def room(api_as: Any, library_on: Any) -> dict:
    owner, _ = api_as(library_on, role="owner")
    kind = LibraryMembershipType.objects.create(
        tenant=library_on, name="Monthly", validity_months=1, fee_amount=D("900.00")
    )

    def admit(name: str, key: str, mobile: str) -> dict:
        made = owner.post(
            reverse("v1:library-members"),
            {
                "membership_type_id": str(kind.id),
                "party_id": str(PartyFactory(tenant=library_on, name=name, mobile=mobile).id),
                "collect_fees": {"mode_breakup": [{"mode": "upi", "amount": "900.00"}]},
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY=key,
        )
        assert made.status_code == 201, made.json()
        return made.json()["data"]

    poster = owner.get(reverse("v1:library-checkin-poster")).json()["data"]
    return {"client": owner, "tenant": library_on, "admit": admit, "poster": poster}


def token_of(room: dict) -> str:
    return room["poster"]["url"].split("/in/", 1)[1]


def number_of(member: dict) -> str:
    return LibraryMembership.objects.get(pk=member["membership_id"]).member_number


def post(client: Any, token: str, **body: Any) -> Any:
    return client.post(f"/api/v1/public/in/{token}", body, format="json")


def test_the_number_and_four_digits_check_a_student_in_once_a_day(room: dict, client: Any) -> None:
    rahul = room["admit"]("Rahul Sharma", "r", "+919876500011")
    token = token_of(room)
    assert room["poster"]["qr"]["size"] > 20 and room["poster"]["library"] == room["tenant"].name
    page = client.get(f"/api/v1/public/in/{token}")
    assert page.status_code == 200 and page.json()["data"] == {"library": room["tenant"].name}
    assert "YourKhata" not in str(page.json())

    done = post(client, token, member_number=number_of(rahul).lower(), mobile_last4="0011")
    assert done.status_code == 200, done.json()
    body = done.json()["data"]
    assert (body["first_name"], body["already"]) == ("Rahul", False)
    mark = Mark.objects.get(
        party_id=LibraryMembership.objects.get(pk=rahul["membership_id"]).party_id
    )
    assert mark.method == "qr"
    again = post(client, token, member_number=number_of(rahul), mobile_last4="0011")
    assert again.status_code == 200 and again.json()["data"]["already"] is True
    assert Mark.objects.count() == 1


def test_a_wrong_half_says_only_not_found(room: dict, client: Any) -> None:
    rahul = room["admit"]("Rahul Sharma", "r", "+919876500011")
    token = token_of(room)
    wrong_digits = post(client, token, member_number=number_of(rahul), mobile_last4="9999")
    wrong_number = post(client, token, member_number="NOPE-1", mobile_last4="0011")
    for refused in (wrong_digits, wrong_number):
        assert refused.status_code == 404
        assert refused.json()["error"]["code"] == "checkin_not_found"
    assert wrong_digits.json()["error"]["message"] == wrong_number.json()["error"]["message"]
    assert post(client, token, member_number="x", mobile_last4="12").status_code == 400
    assert not Mark.objects.exists()


def test_a_student_on_hold_is_sent_to_the_desk(room: dict, client: Any) -> None:
    rahul = room["admit"]("Rahul Sharma", "r", "+919876500011")
    LibraryMembership.objects.filter(pk=rahul["membership_id"]).update(status="suspended")
    refused = post(client, token_of(room), member_number=number_of(rahul), mobile_last4="0011")
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "checkin_see_desk"


def test_an_edited_poster_is_dead(room: dict, client: Any) -> None:
    token = token_of(room)
    forged = token[:-3] + ("aaa" if not token.endswith("aaa") else "bbb")
    assert client.get(f"/api/v1/public/in/{forged}").status_code == 404
    assert client.get("/api/v1/public/in/nonsense").status_code == 404
