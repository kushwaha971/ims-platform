""" "Collect from Geeta": one amount split across a person's loans (review L5).

The approved design (12 Oct 2026) puts one button on a borrower's page that
takes one cash handover, shows how it splits across that person's running
loans BEFORE saving, and records one ordinary collection per loan. These tests
hold the rule (what is due now first, the oldest instalment first, then ahead),
that the split saved is the split shown, and that every loan keeps its own
figures. Tier 1: these are a lender's books.

Ramesh, from `test_many_loans_one_borrower`: L1 has ₹1,500 late and ₹500 today
(₹5,000 left), L2 ₹1,000 late and ₹1,000 today (₹10,000 left), L3 nothing due
yet (₹2,000 left).
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.lending.models import LendingCollection
from apps.lending.tests.test_many_loans_one_borrower import _fresh, ramesh  # noqa: F401

pytestmark = pytest.mark.django_db


def _preview(r: dict, amount: str) -> Any:
    return r["client"].post(
        reverse("v1:lending-borrower-collection-preview", args=[r["borrower_id"]]),
        {"amount": amount},
        format="json",
    )


def _save(r: dict, body: dict, key: str = "split-1") -> Any:
    return r["client"].post(
        reverse("v1:lending-borrower-collections", args=[r["borrower_id"]]),
        body,
        format="json",
        HTTP_IDEMPOTENCY_KEY=key,
    )


def _shares(split: dict) -> dict[str, str]:
    return {row["number"]: row["amount"] for row in split["loans"]}


def test_what_is_due_now_is_paid_first_oldest_instalment_first(ramesh: dict) -> None:
    """₹2,500 clears L1's late and today's (its oldest is oldest), then starts on
    L2's; L3, with nothing due, gets nothing. Nothing is recorded by a preview."""
    one, two, three = (loan["number"] for loan in ramesh["loans"])
    split = _preview(ramesh, "2500").json()["data"]
    assert _shares(split) == {one: "2000.00", two: "500.00", three: "0.00"}
    assert split["left_after"] == "14500.00"
    assert LendingCollection.objects.count() == 0


def test_money_beyond_what_is_due_now_goes_ahead_in_the_same_order(ramesh: dict) -> None:
    """₹6,000: ₹4,000 settles everything due now on both loans, and the ₹2,000
    over goes ahead on the loan whose oldest instalment is oldest."""
    one, two, three = (loan["number"] for loan in ramesh["loans"])
    split = _preview(ramesh, "6000").json()["data"]
    assert _shares(split) == {one: "4000.00", two: "2000.00", three: "0.00"}


def test_saving_records_one_collection_per_loan_exactly_as_shown(ramesh: dict) -> None:
    """The split shown is the split saved, as ordinary per-loan collections: each
    loan moves by its own share and the third does not move at all."""
    first, second, third = ramesh["loans"]
    split = _preview(ramesh, "2500").json()["data"]
    saved = _save(
        ramesh,
        {"amount": "2500", "split": split["loans"], "mode": "upi", "reference": "UTR123"},
    )
    assert saved.status_code == 201, saved.json()
    body = saved.json()["data"]
    assert [(c["number"], c["amount"]) for c in body["collections"]] == [
        (first["number"], "2000.00"),
        (second["number"], "500.00"),
    ]
    rows = LendingCollection.objects.order_by("amount")
    assert [(r.loan.number, r.amount) for r in rows] == [
        (second["number"], Decimal("500.00")),
        (first["number"], Decimal("2000.00")),
    ]
    assert _fresh(ramesh["client"], first)["arrears"] == "0.00"
    assert _fresh(ramesh["client"], first)["due_today"] == "0.00"
    assert _fresh(ramesh["client"], second)["arrears"] == "500.00"
    assert _fresh(ramesh["client"], third)["remaining"] == third["remaining"]


def test_a_split_that_changed_since_it_was_shown_is_refused(ramesh: dict) -> None:
    """Another phone collected on L1 between the preview and the save: the old
    split would now pay L1 ahead instead of L2's late money. Nothing is recorded,
    and the answer carries the new split to show."""
    first = ramesh["loans"][0]
    shown = _preview(ramesh, "2500").json()["data"]
    ramesh["client"].post(
        reverse("v1:lending-collections", args=[first["id"]]),
        {"amount": "500"},
        format="json",
        HTTP_IDEMPOTENCY_KEY="other-phone",
    )
    refused = _save(ramesh, {"amount": "2500", "split": shown["loans"]})
    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "balance_changed"
    assert LendingCollection.objects.count() == 1
    fresh = refused.json()["error"]["details"]["split"]
    assert _shares(fresh)[first["number"]] == "1500.00"


def test_more_than_everything_left_on_all_loans_is_refused(ramesh: dict) -> None:
    """₹17,000 left across three loans; ₹17,000.01 is refused, never spilled."""
    assert _preview(ramesh, "17000").status_code == 200
    over = _preview(ramesh, "17000.01")
    assert over.status_code == 409
    assert over.json()["error"]["code"] == "collection_over_payoff"
    assert over.json()["error"]["details"]["payoff"] == "17000.00"


def test_a_replayed_save_records_the_split_once(ramesh: dict) -> None:
    """A double tap on a slow network sends the same key twice."""
    split = _preview(ramesh, "2500").json()["data"]
    body = {"amount": "2500", "split": split["loans"]}
    assert _save(ramesh, body, "same").status_code == 201
    assert _save(ramesh, body, "same").status_code == 201
    assert LendingCollection.objects.count() == 2


def test_no_split_and_an_unknown_borrower_are_refused(ramesh: dict) -> None:
    assert _save(ramesh, {"amount": "2500"}).status_code == 400
    missing = ramesh["client"].post(
        reverse("v1:lending-borrower-collection-preview", args=[uuid.uuid4()]),
        {"amount": "100"},
        format="json",
    )
    assert missing.status_code == 404


def test_the_round_and_the_loan_list_say_whether_any_loan_exists(
    api_as: Any, lending_on: Any
) -> None:
    """Day one shows "Give your first loan", not "Nothing to collect today", and
    a list hides its search only when there is no loan at all — not when a
    filter found none."""
    client, _ = api_as(lending_on, role="owner")
    assert client.get(reverse("v1:lending-today")).json()["meta"]["has_loans"] is False
    assert client.get(reverse("v1:lending-loans")).json()["meta"]["has_loans"] is False


def test_with_loans_an_empty_filter_still_says_loans_exist(ramesh: dict) -> None:
    client = ramesh["client"]
    assert client.get(reverse("v1:lending-today")).json()["meta"]["has_loans"] is True
    closed = client.get(reverse("v1:lending-loans"), {"status": "closed"}).json()
    assert closed["data"] == [] and closed["meta"]["has_loans"] is True


def test_the_checklist_starts_with_giving_a_loan(api_as: Any, lending_on: Any) -> None:
    """Approved design: a lender's first act is a loan; routes come after."""
    from apps.lending.selectors.setup import lending_setup

    assert [s.key for s in lending_setup(lending_on)] == ["loan", "routes", "team"]


def test_the_book_total_equals_its_borrowers_added_up(ramesh: dict) -> None:
    """The line above the Borrowers table is one database sum; it must agree
    with the per-person figures, before and after money comes in."""
    client = ramesh["client"]

    def both() -> tuple[dict, dict]:
        body = client.get(reverse("v1:lending-borrowers")).json()
        person = body["data"][0]["summary"]
        return body["meta"]["totals"], {"left": person["left"], "late": person["late"]}

    totals, person = both()
    assert totals == person == {"left": "17000.00", "late": "2500.00"}
    split = _preview(ramesh, "2500").json()["data"]
    _save(ramesh, {"amount": "2500", "split": split["loans"]})
    totals, person = both()
    assert totals == person == {"left": "14500.00", "late": "500.00"}
