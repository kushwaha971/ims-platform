"""The Fees board (approved designs, 12 Oct 2026): Not paid, then Paid this month.

The desk works from it: who still owes, with what Take fee will settle first,
and what came in this month. Its figures must agree with a student's own dues.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.urls import reverse

from apps.library.tests.test_members import _cash, _enrol
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db
BOARD = "v1:library-fees-board"


def test_an_empty_library_has_nothing_on_the_board(api_as: Any, library_on: Any) -> None:
    owner, _ = api_as(library_on, role="owner")
    body = owner.get(reverse(BOARD)).json()["data"]
    assert body["students"] == 0
    assert (body["to_collect"], body["collected_this_month"]) == ("0.00", "0.00")
    assert body["not_paid"] == [] and body["paid"] == []


def test_unpaid_and_paid_students_land_in_their_halves(api_as: Any, library_on: Any) -> None:
    """Asha paid at admission; Imran did not. Imran's row says what he owes in
    all and names his OLDEST open charge, which Take fee settles first."""
    owner, _ = api_as(library_on, role="owner")
    paid = _enrol(owner, library_on, key="asha", collect_fees=_cash("200.00"))
    assert paid.status_code == 201, paid.content
    imran = PartyFactory(tenant=library_on, name="Imran Khan")
    unpaid = _enrol(owner, library_on, imran, key="imran").json()
    body = owner.get(reverse(BOARD)).json()["data"]
    assert body["students"] == 2
    assert [r["name"] for r in body["not_paid"]] == ["Imran Khan"]
    row = body["not_paid"][0]
    assert row["owes"] == unpaid["data"]["dues_amount"] == body["to_collect"] == "200.00"
    first_charge = unpaid["meta"]["charges"][0]
    assert row["charge"]["id"] == first_charge["id"]
    assert [r["name"] for r in body["paid"]] == ["Asha Kulkarni"]
    assert body["paid"][0]["amount"] == body["collected_this_month"] == "200.00"
    assert body["paid"][0]["mode"] == "cash"
