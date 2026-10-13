"""QA F6 — the seat map across the whole day, and who is on a seat in every shift.

Before: the map was drawn per shift and a tile's colour was the fee of whoever sat
there, so a seat held overnight (18:00-10:00) read "Unpaid" in the 06:00-12:00 view
with no hint that the student belonged to another shift; a tapped seat listed only
the student of the current view; and the counts did not say how full each shift is.

The sharing rule is unchanged (`seats.overlaps`): two students share a desk when
their shifts do not overlap. Each test names the gap it closes.
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from django.urls import reverse

from .test_seats import _admit, room  # noqa: F401 — the fixture

pytestmark = pytest.mark.django_db
D = Decimal
URL = "v1:library-seat-map"


def _map(room: dict, shift: str | None = None) -> dict:  # noqa: F811
    params = {"shift": room["shifts"][shift]} if shift else {}
    body = room["client"].get(reverse(URL), params).json()
    return {"seats": {s["label"]: s for s in body["data"]}, "meta": body["meta"]}


def test_a_seat_with_a_morning_and_an_evening_student_is_full_with_both_names(
    room: dict,  # noqa: F811
) -> None:
    """AC1: Morning + Evening on A1 — the whole day is taken (Full day can no longer
    have it either), and both students are listed with their shift times."""
    _admit(room, "Asha", "A1", "Morning", "a")
    _admit(room, "Imran", "A1", "Evening", "b")
    a1 = _map(room)["seats"]["A1"]
    assert a1["day_state"] == "full"
    assert sorted(a1["taken_shift_ids"]) == sorted(room["shifts"].values())
    people = [(h["name"], h["shift"]["name"], h["shift"]["starts_at"]) for h in a1["holders"]]
    assert people == [("Asha", "Morning", "06:00"), ("Imran", "Evening", "12:00")]


def test_a_seat_taken_in_one_shift_is_part_taken_across_the_day(room: dict) -> None:  # noqa: F811
    """AC2, whole day: Evening only on A3 — part taken, and the shifts it can no longer
    be given in are Evening and Full day (which overlaps it); Morning is still free."""
    _admit(room, "Imran", "A3", "Evening", "b")
    a3 = _map(room)["seats"]["A3"]
    assert a3["day_state"] == "partial"
    assert sorted(a3["taken_shift_ids"]) == sorted(
        [room["shifts"]["Evening"], room["shifts"]["Full day"]]
    )
    assert _map(room)["seats"]["A4"]["day_state"] == "free"


def test_in_one_shift_a_seat_held_by_an_overlapping_shift_says_so(room: dict) -> None:  # noqa: F811
    """AC2, one shift: in the Morning view a Full-day student's seat is "taken by
    another shift", never painted as though a morning student owed the fee — while a
    morning student's own seat is simply taken."""
    _admit(room, "Rahul", "A2", "Full day", "c")
    _admit(room, "Asha", "A1", "Morning", "a")
    morning = _map(room, "Morning")["seats"]
    assert morning["A2"]["view_state"] == "other_shift"
    assert morning["A2"]["holders"][0]["other_shift"] is True
    assert morning["A1"]["view_state"] == "taken"
    assert morning["A1"]["holders"][0]["other_shift"] is False


def test_an_evening_seat_is_free_in_the_morning_but_its_student_is_still_listed(
    room: dict,  # noqa: F811
) -> None:
    """Morning and Evening do not overlap, so A3 can still be given for the morning —
    free in that view. Tapping it must still show who has it in the evening."""
    _admit(room, "Imran", "A3", "Evening", "b")
    a3 = _map(room, "Morning")["seats"]["A3"]
    assert a3["view_state"] == "free"
    assert [(h["name"], h["in_view"]) for h in a3["holders"]] == [("Imran", False)]


def test_every_student_on_a_seat_comes_with_times_plan_fee_and_mobile(
    room: dict,  # noqa: F811
) -> None:
    """AC3: the panel's facts — shift name and times, plan till, fee state, mobile."""
    _admit(room, "Asha", "A1", "Morning", "a")
    holder = _map(room, "Evening")["seats"]["A1"]["holders"][0]
    assert holder["shift"] == {
        "id": room["shifts"]["Morning"],
        "name": "Morning",
        "starts_at": "06:00",
        "ends_at": "12:00",
    }
    assert holder["valid_until"] and holder["fee_state"] in {"paid", "unpaid", "due_soon"}
    assert "mobile" in holder


def test_the_counts_say_how_full_each_shift_is_by_the_same_rule(room: dict) -> None:  # noqa: F811
    """ "Morning 2/24 · Evening 1/24 · Full day 2/24" — from the same overlap rule the
    tiles use, so the counts can never disagree with the colours."""
    _admit(room, "Asha", "A1", "Morning", "a")
    _admit(room, "Imran", "A1", "Evening", "b")
    _admit(room, "Rahul", "A2", "Full day", "c")
    counts = {c["name"]: (c["taken"], c["total"]) for c in _map(room)["meta"]["shift_counts"]}
    assert counts == {"Morning": (2, 24), "Evening": (2, 24), "Full day": (2, 24)}
