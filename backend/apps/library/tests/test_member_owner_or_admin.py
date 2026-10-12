"""Editing a student's record and blocking or unblocking them is the owner's or an admin's.

Owner, 12 Oct 2026. On top of each route's codename, the member PATCH (for any
key but placement), suspend, reactivate, close and re-join check the actor's
ROLE — so a custom role ticked every library member codename is refused like
staff. Moving a student between seats and shifts is the desk's daily work on
the seat board and stays with `library.member.write`; so do renewing and
changing plan, which is taking a fee at the counter.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.library.models import LibraryMembership, LibraryMembershipType
from tests.factories.parties import PartyFactory
from tests.factories.platform import MembershipFactory, RoleFactory, UserFactory
from tests.fixtures import build_access_token

pytestmark = pytest.mark.django_db
D = Decimal

EVERY_MEMBER_CODENAME = ["library.member.read", "library.member.write", "library.member.close"]


def _url(name: str, membership_id: Any) -> str:
    return reverse(f"v1:library-member-{name}", args=[membership_id])


def _detail(membership_id: Any) -> str:
    return reverse("v1:library-member", args=[membership_id])


@pytest.fixture
def setup(api_as: Any, library_on: Any) -> dict:
    owner, _ = api_as(library_on, role="owner")
    kind = LibraryMembershipType.objects.create(
        tenant=library_on, name="Monthly", validity_months=1, fee_amount=D("0.00")
    )
    seats = owner.post(
        reverse("v1:library-seat-row"), {"prefix": "A", "from": 1, "to": 3}, format="json"
    ).json()["data"]
    shift = owner.post(
        reverse("v1:library-shifts"),
        {"name": "Morning", "starts_at": "06:00", "ends_at": "12:00"},
        format="json",
    ).json()["data"]

    def admit(key: str) -> dict:
        made = owner.post(
            reverse("v1:library-members"),
            {
                "membership_type_id": str(kind.id),
                "party_id": str(PartyFactory(tenant=library_on).id),
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY=key,
        )
        assert made.status_code == 201, made.content
        return made.json()["data"]

    return {
        "tenant": library_on,
        "owner": owner,
        "kind": kind,
        "seats": {s["label"]: s["id"] for s in seats},
        "shift": shift["id"],
        "admit": admit,
    }


def _client(setup: dict, api_as: Any, who: str) -> APIClient:
    tenant = setup["tenant"]
    if who == "custom":
        role = RoleFactory(
            tenant=tenant,
            code="head_librarian",
            name="Head librarian",
            is_system=False,
            permissions=EVERY_MEMBER_CODENAME,
        )
        member = MembershipFactory(user=UserFactory(), tenant=tenant, role=role)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {build_access_token(member)}")
        return client
    client, member = api_as(tenant, role=who)
    if who == "staff":
        # Granted `close` as well, so the refusal is the ROLE's and not the codename's.
        member.permissions_override = {"allow": ["library.member.close"], "deny": []}
        member.save(update_fields=["permissions_override"])
    return client


def _version(membership_id: Any) -> int:
    return LibraryMembership.objects.get(pk=membership_id).version


# ── Refused below admin ────────────────────────────────────────────────────


@pytest.mark.parametrize("who", ["staff", "custom"])
@pytest.mark.parametrize(
    "change",
    [
        {"member_number": "L-900"},
        {"group_label": "Class 12"},
        {"valid_until": "2027-03-31"},
        {"notes": "Quiet"},
        {"guardian": {"name": "Suresh", "mobile": "9876500001"}},
        # Mixed with a placement key, it is still an edit of the person: refused whole.
        {"seat_id": None, "notes": "Moved"},
    ],
)
def test_a_non_manager_cannot_edit_a_member(
    setup: dict, api_as: Any, who: str, change: dict
) -> None:
    """Prevents staff, or a custom role ticked every member codename, from
    editing a student's record through `PATCH /library/members/{id}`."""
    m = setup["admit"]("e1")
    before = _version(m["membership_id"])
    response = _client(setup, api_as, who).patch(
        _detail(m["membership_id"]), {**change, "version": before}, format="json"
    )
    assert response.status_code == 403, response.content
    assert _version(m["membership_id"]) == before


@pytest.mark.parametrize("who", ["staff", "custom"])
def test_a_non_manager_cannot_suspend_reactivate_close_or_rejoin(
    setup: dict, api_as: Any, who: str
) -> None:
    """Prevents a role holding `library.member.close` from blocking, unblocking,
    closing or re-admitting a student."""
    client = _client(setup, api_as, who)
    owner = setup["owner"]
    active = setup["admit"]("a1")["membership_id"]
    suspended = setup["admit"]("a2")["membership_id"]
    closed = setup["admit"]("a3")["membership_id"]
    owner.post(_url("suspend", suspended), {"reason": "Too noisy"}, format="json")
    owner.post(
        _url("close", closed), {"reason": "Left town"}, format="json", HTTP_IDEMPOTENCY_KEY="c0"
    )

    assert (
        client.post(_url("suspend", active), {"reason": "Too noisy"}, format="json").status_code
        == 403
    )
    assert client.post(_url("reactivate", suspended), {}, format="json").status_code == 403
    closing = client.post(
        _url("close", active), {"reason": "Too noisy"}, format="json", HTTP_IDEMPOTENCY_KEY="c1"
    )
    assert closing.status_code == 403
    rejoin = client.post(
        _url("rejoin", closed),
        {"membership_type_id": str(setup["kind"].id)},
        format="json",
        HTTP_IDEMPOTENCY_KEY="r1",
    )
    assert rejoin.status_code == 403
    statuses = [LibraryMembership.objects.get(pk=i).status for i in (active, suspended, closed)]
    assert statuses == ["active", "suspended", "closed"]


# ── Allowed for the owner and an admin ─────────────────────────────────────


@pytest.mark.parametrize("who", ["owner", "admin"])
def test_the_owner_and_an_admin_edit_and_block(setup: dict, api_as: Any, who: str) -> None:
    client, _ = api_as(setup["tenant"], role=who)
    m = setup["admit"]("e1")["membership_id"]
    edited = client.patch(
        _detail(m),
        {
            "member_number": "L-900",
            "group_label": "Class 12",
            "notes": "Quiet",
            "valid_until": "2027-03-31",
            "version": _version(m),
        },
        format="json",
    )
    assert edited.status_code == 200, edited.content
    data = edited.json()["data"]
    assert (data["member_number"], data["group_label"], data["notes"], data["valid_until"]) == (
        "L-900",
        "Class 12",
        "Quiet",
        "2027-03-31",
    )
    assert (
        client.post(_url("suspend", m), {"reason": "Too noisy"}, format="json").status_code == 200
    )
    assert client.post(_url("reactivate", m), {}, format="json").status_code == 200
    closed = client.post(
        _url("close", m), {"reason": "Too noisy"}, format="json", HTTP_IDEMPOTENCY_KEY="c"
    )
    assert closed.status_code == 200, closed.content
    rejoined = client.post(
        _url("rejoin", m),
        {"membership_type_id": str(setup["kind"].id)},
        format="json",
        HTTP_IDEMPOTENCY_KEY="r",
    )
    assert rejoined.status_code == 200, rejoined.content


# ── What the desk keeps ────────────────────────────────────────────────────


@pytest.mark.parametrize("who", ["staff", "custom"])
def test_the_desk_still_seats_moves_and_frees_a_student(setup: dict, api_as: Any, who: str) -> None:
    """The seat board is daily desk work and a PATCH of placement keys only must
    keep working for whoever holds `library.member.write`."""
    client = _client(setup, api_as, who)
    m = setup["admit"]("e1")["membership_id"]
    seated = client.patch(
        _detail(m),
        {
            "seat_id": setup["seats"]["A2"],
            "shift_id": setup["shift"],
            "locker_label": "L4",
            "version": _version(m),
        },
        format="json",
    )
    assert seated.status_code == 200, seated.content
    assert seated.json()["data"]["seat"]["label"] == "A2"
    freed = client.patch(_detail(m), {"seat_id": None, "version": _version(m)}, format="json")
    assert freed.status_code == 200 and freed.json()["data"]["seat"] is None


def test_staff_still_renew_at_the_counter(setup: dict, api_as: Any) -> None:
    """Renewing is taking a month's fee, not editing the person: the codename decides."""
    client = _client(setup, api_as, "staff")
    m = setup["admit"]("e1")["membership_id"]
    renewed = client.post(_url("renew", m), {}, format="json", HTTP_IDEMPOTENCY_KEY="n1")
    assert renewed.status_code == 200, renewed.content
