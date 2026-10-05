"""W02 — a study library's shifts, seats and seat map (owner, 4 Oct 2026)."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.library.models import LibraryMembershipType, LibrarySeat, LibraryShift
from apps.library.services.seats import overlaps
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db
D = Decimal


def _t(text: str) -> dt.time:
    return dt.time.fromisoformat(text)


def _shift(name: str, start: str, end: str) -> LibraryShift:
    return LibraryShift(name=name, starts_at=_t(start), ends_at=_t(end))


@pytest.mark.parametrize(
    "a, b, expected",
    [
        (("06:00", "12:00"), ("12:00", "18:00"), False),  # back to back is not a clash
        (("06:00", "12:00"), ("11:00", "14:00"), True),
        (("06:00", "23:00"), ("18:00", "22:00"), True),  # full day holds the evening too
        (("22:00", "06:00"), ("05:00", "08:00"), True),  # overnight runs past midnight
        (("22:00", "06:00"), ("06:00", "12:00"), False),
        (("22:00", "06:00"), ("12:00", "18:00"), False),
    ],
)
def test_two_shifts_clash_only_when_they_share_a_minute(a: tuple, b: tuple, expected: bool) -> None:
    """The economics of a reading room: one desk, three non-overlapping shifts,
    three fees. A clash check that called Morning and Evening a clash would halve
    the business; one that missed an overnight shift would seat two people."""
    assert overlaps(_shift("a", *a), _shift("b", *b)) is expected
    assert overlaps(_shift("b", *b), _shift("a", *a)) is expected


def test_no_shift_means_all_day() -> None:
    assert overlaps(None, _shift("m", "06:00", "12:00")) is True


@pytest.fixture
def room(api_as: Any, library_on: Any) -> dict:
    owner, _ = api_as(library_on, role="owner")
    kind = LibraryMembershipType.objects.create(
        tenant=library_on, name="Monthly", validity_months=1, fee_amount=D("900.00")
    )
    shifts = {}
    for name, start, end in (
        ("Morning", "06:00", "12:00"),
        ("Evening", "12:00", "18:00"),
        ("Full day", "06:00", "22:00"),
    ):
        made = owner.post(
            reverse("v1:library-shifts"),
            {"name": name, "starts_at": start, "ends_at": end},
            format="json",
        )
        assert made.status_code == 201, made.json()
        shifts[name] = made.json()["data"]["id"]
    row = owner.post(
        reverse("v1:library-seat-row"),
        {"prefix": "A", "from": 1, "to": 24, "zone": "AC hall"},
        format="json",
    )
    assert row.status_code == 201, row.json()
    seats = {s["label"]: s["id"] for s in row.json()["data"]}
    return {"client": owner, "tenant": library_on, "kind": kind, "shifts": shifts, "seats": seats}


def _admit(room: dict, name: str, seat: str | None, shift: str | None, key: str) -> Any:
    body: dict = {
        "membership_type_id": str(room["kind"].id),
        "party_id": str(PartyFactory(tenant=room["tenant"], name=name).id),
    }
    if seat:
        body["seat_id"] = room["seats"][seat]
    if shift:
        body["shift_id"] = room["shifts"][shift]
    return room["client"].post(
        reverse("v1:library-members"), body, format="json", HTTP_IDEMPOTENCY_KEY=key
    )


def test_a_row_of_seats_is_made_in_one_request_and_skips_labels_taken(room: dict) -> None:
    """Setting up sixty desks one form at a time is how a library gives up on
    the setup. Adding A1–A30 to a room that has A1–A24 adds six."""
    more = room["client"].post(
        reverse("v1:library-seat-row"), {"prefix": "A", "from": 1, "to": 30}, format="json"
    )
    assert more.json()["meta"]["created"] == 6
    labels = [s["label"] for s in room["client"].get(reverse("v1:library-seats")).json()["data"]]
    assert labels[:3] == ["A1", "A2", "A3"] and labels[9] == "A10"  # natural order, not A1, A10
    assert len(labels) == 30


def test_two_students_share_a_desk_in_different_shifts(room: dict) -> None:
    morning = _admit(room, "Asha", "A12", "Morning", "a")
    evening = _admit(room, "Imran", "A12", "Evening", "b")
    assert morning.status_code == 201 and evening.status_code == 201
    data = morning.json()["data"]
    assert data["seat"]["label"] == "A12" and data["shift"]["name"] == "Morning"
    assert data["fee_state"] == "unpaid"  # the first month's ₹900 is charged, not collected


def test_a_desk_held_in_an_overlapping_shift_is_refused_with_who_holds_it(room: dict) -> None:
    """The counter needs to say WHO sits there, so the librarian can pick another
    desk or move the other student, not just "conflict"."""
    _admit(room, "Asha", "A12", "Morning", "a")
    refused = _admit(room, "Rahul", "A12", "Full day", "b")
    assert refused.status_code == 409
    error = refused.json()["error"]
    assert error["code"] == "library_seat_taken"
    assert error["details"]["holder"]["name"] == "Asha"
    assert error["details"]["holder"]["shift"] == "Morning"
    assert LibrarySeat.objects.get(label="A12").label == "A12"


def test_freeing_a_seat_lets_the_next_student_take_it(room: dict) -> None:
    first = _admit(room, "Asha", "A3", "Morning", "a").json()["data"]
    freed = room["client"].patch(
        reverse("v1:library-member", args=[first["membership_id"]]),
        {"seat_id": None, "version": first["version"]},
        format="json",
    )
    assert freed.status_code == 200 and freed.json()["data"]["seat"] is None
    assert _admit(room, "Rahul", "A3", "Morning", "b").status_code == 201


def test_moving_a_student_to_a_clashing_shift_is_refused(room: dict) -> None:
    _admit(room, "Asha", "A5", "Morning", "a")
    imran = _admit(room, "Imran", "A5", "Evening", "b").json()["data"]
    moved = room["client"].patch(
        reverse("v1:library-member", args=[imran["membership_id"]]),
        {"shift_id": room["shifts"]["Full day"], "version": imran["version"]},
        format="json",
    )
    assert moved.status_code == 409
    assert moved.json()["error"]["code"] == "library_seat_taken"


def test_retiming_a_shift_cannot_seat_two_students_at_once(room: dict) -> None:
    """Morning ending at 14:00 instead of 12:00 would put Asha and Imran on A7
    together between 12 and 2. The shift edit is refused, naming the desk."""
    _admit(room, "Asha", "A7", "Morning", "a")
    _admit(room, "Imran", "A7", "Evening", "b")
    shift = LibraryShift.objects.get(name="Morning")
    moved = room["client"].patch(
        reverse("v1:library-shift", args=[shift.id]),
        {"ends_at": "14:00", "version": shift.version},
        format="json",
    )
    assert moved.status_code == 409
    assert moved.json()["error"]["details"]["seat"] == "A7"


def test_a_seat_in_use_cannot_be_taken_out_of_use(room: dict) -> None:
    _admit(room, "Asha", "A9", "Morning", "a")
    seat = LibrarySeat.objects.get(label="A9")
    refused = room["client"].patch(
        reverse("v1:library-seat", args=[seat.id]),
        {"is_active": False, "version": seat.version},
        format="json",
    )
    assert refused.status_code == 409


def test_the_seat_map_shows_who_sits_where_in_a_shift(room: dict) -> None:
    _admit(room, "Asha", "A1", "Morning", "a")
    _admit(room, "Imran", "A1", "Evening", "b")
    _admit(room, "Rahul", "A2", "Full day", "c")
    url = reverse("v1:library-seat-map")
    morning = room["client"].get(url, {"shift": room["shifts"]["Morning"]}).json()
    by_label = {s["label"]: s for s in morning["data"]}
    assert [o["name"] for o in by_label["A1"]["occupants"]] == ["Asha"]
    assert [o["name"] for o in by_label["A2"]["occupants"]] == ["Rahul"]  # full day includes it
    assert by_label["A3"]["occupants"] == []
    assert morning["meta"]["counts"]["occupied"] == 2
    assert morning["meta"]["counts"]["free"] == 22
    whole = room["client"].get(url).json()
    assert [o["name"] for o in {s["label"]: s for s in whole["data"]}["A1"]["occupants"]] == [
        "Asha",
        "Imran",
    ]


def test_the_students_list_filters_by_shift_and_finds_the_unseated(room: dict) -> None:
    _admit(room, "Asha", "A1", "Morning", "a")
    _admit(room, "Imran", "A2", "Evening", "b")
    _admit(room, "Pooja", None, None, "c")
    url = reverse("v1:library-members")
    names = lambda params: [
        r["name"] for r in room["client"].get(url, params).json()["data"]
    ]  # noqa: E731
    assert names({"shift": room["shifts"]["Evening"]}) == ["Imran"]
    assert names({"unseated": "true"}) == ["Pooja"]
    assert names({"ordering": "seat"})[:2] == ["Asha", "Imran"]


def test_a_shift_cannot_start_and_end_together_or_be_named_twice(room: dict) -> None:
    url = reverse("v1:library-shifts")
    same = room["client"].post(
        url, {"name": "Odd", "starts_at": "06:00", "ends_at": "06:00"}, format="json"
    )
    assert same.status_code == 400
    twice = room["client"].post(
        url, {"name": "morning", "starts_at": "07:00", "ends_at": "09:00"}, format="json"
    )
    assert twice.status_code == 400 and "name" in twice.json()["error"]["details"]


def test_staff_can_read_the_seat_map_but_not_add_seats(room: dict, api_as: Any) -> None:
    staff, _ = api_as(room["tenant"], role="staff")
    assert staff.get(reverse("v1:library-seat-map")).status_code == 200
    refused = staff.post(reverse("v1:library-seats"), {"label": "Z1"}, format="json")
    assert refused.status_code == 403


def test_shifts_list_in_the_order_a_day_is_read(room: dict) -> None:
    """Found by looking: ordering by start time alone listed "Full day" (06:00)
    before "Morning" (06:00), and the seat map opens on the first shift."""
    names = [s["name"] for s in room["client"].get(reverse("v1:library-shifts")).json()["data"]]
    assert names == ["Morning", "Evening", "Full day"]
