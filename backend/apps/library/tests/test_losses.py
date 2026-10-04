"""B10b — lost, found, replaced and damaged books (LIB-07 FR-4…FR-7, BR-6…BR-10; T-LIB-07-7)."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.library.models import LibraryCharge, LibraryCopy, LibraryLoan
from apps.parties.models import Party

pytestmark = pytest.mark.django_db
D = Decimal

# `desk` (conftest): an owner, a member allowed two books, three copies priced ₹250.
from apps.library.tests.counter import _issue, _return  # noqa: E402


def _lend(desk: dict, index: int = 0, days_late: int = 0) -> str:  # noqa: F811
    body = _issue(desk["client"], desk["member"], desk["copies"][index], f"i{index}").json()["data"]
    if days_late:
        today = tenant_today(desk["tenant"])
        LibraryLoan.objects.filter(pk=body["id"]).update(
            issued_on=today - dt.timedelta(days=days_late + 14),
            due_on=today - dt.timedelta(days=days_late),
        )
    return body["id"]


def _lost(desk: dict, loan_id: str, **body: Any) -> Any:
    return desk["client"].post(reverse("v1:library-loan-lost", args=[loan_id]), body, format="json")


def _copy(desk: dict, index: int = 0) -> LibraryCopy:
    return LibraryCopy.objects.get(accession_number=desk["copies"][index])


def _party(desk: dict) -> Party:
    return Party.objects.get(pk=LibraryLoan.objects.first().party_id)


# ── lost (FR-4, BR-6; example 7) ────────────────────────────────────────────


def test_a_lost_book_charges_the_fine_to_that_day_then_the_book(desk: dict) -> None:
    """Example 7 — a week late: ₹14 fine, then ₹250 × 1 + ₹0 processing, as two charges."""
    loan_id = _lend(desk, days_late=7)
    response = _lost(desk, loan_id)
    assert response.status_code == 200, response.content
    kinds = {c["kind"]: c["amount"] for c in response.json()["meta"]["charges"]}
    assert kinds == {"overdue_fine": "14.00", "lost_book": "250.00"}
    assert (LibraryLoan.objects.get(pk=loan_id).status, _copy(desk).status) == ("lost", "lost")


def test_a_lost_book_counts_toward_the_limit_until_paid(desk: dict) -> None:
    """BR-7, D18 — two books allowed: one out and one lost-and-unpaid is two."""
    _lost(desk, _lend(desk, 0))
    _lend(desk, 1)
    refused = _issue(desk["client"], desk["member"], desk["copies"][2], "i9")
    assert [b["code"] for b in refused.json()["error"]["details"]["blocks"]] == [
        "copy_limit_reached"
    ]


# ── found (FR-6, BR-9; T-LIB-07-7) ──────────────────────────────────────────


def test_found_before_payment_waives_the_lost_charge(desk: dict) -> None:
    _lost(desk, _lend(desk))
    found = desk["client"].post(
        reverse("v1:library-copy-found", args=[_copy(desk).id]), {}, format="json"
    )
    assert found.status_code == 200, found.content
    charge = LibraryCharge.objects.get(kind="lost_book")
    assert (charge.status, charge.amount_due) == ("waived", D("0.00"))
    assert _copy(desk).status == "available"
    assert LibraryLoan.objects.first().status == "returned"


def test_found_after_payment_refunds_and_the_khata_returns_to_before(desk: dict) -> None:
    """T-LIB-07-7 — paid ₹250, then the book turns up: a `found_refund` waiver and a payment OUT,
    and the member's balance is what it was before the loss."""
    from apps.payments.services.record import record_payment

    _lost(desk, _lend(desk))
    charge = LibraryCharge.objects.get(kind="lost_book")
    party = Party.objects.get(pk=charge.party_id)
    record_payment(
        ctx=Ctx.system(desk["tenant"]),
        payload={
            "direction": "in",
            "party_id": str(party.id),
            "mode_breakup": [{"mode": "cash", "amount": "250.00"}],
            "allocations": [
                {
                    "document_type": "library_charge",
                    "document_id": str(charge.id),
                    "amount": "250.00",
                }
            ],
        },
    )
    found = desk["client"].post(
        reverse("v1:library-copy-found", args=[_copy(desk).id]), {}, format="json"
    )
    assert found.status_code == 200, found.content
    assert found.json()["meta"]["refund_payment"]["amount"] == "250.00"
    charge.refresh_from_db()
    party.refresh_from_db()
    assert (charge.status, charge.refunded_amount) == ("refunded", D("250.00"))
    assert party.balance == D("0.00")


# ── replacement (FR-5, BR-10) ───────────────────────────────────────────────


def test_a_replacement_adds_a_copy_waives_the_charge_and_withdraws_the_lost_one(desk: dict) -> None:
    loan_id = _lend(desk)
    _lost(desk, loan_id)
    response = desk["client"].post(
        reverse("v1:library-loan-replace", args=[loan_id]), {"new_copy": {}}, format="json"
    )
    assert response.status_code == 200, response.content
    new_number = response.json()["meta"]["replacement"]["accession_number"]
    assert LibraryCopy.objects.get(accession_number=new_number).source_note.startswith(
        "Replacement for"
    )
    assert (_copy(desk).status, _copy(desk).withdrawn_reason) == ("withdrawn", "lost")
    assert LibraryCharge.objects.get(kind="lost_book").status == "waived"


def test_a_paid_lost_book_cannot_be_replaced(desk: dict) -> None:
    """EC-7 — the money is the library's; Found is the way if the book itself is back."""
    loan_id = _lend(desk)
    _lost(desk, loan_id)
    LibraryCharge.objects.filter(kind="lost_book").update(
        amount_paid=D("250.00"), amount_due=D("0")
    )
    refused = desk["client"].post(
        reverse("v1:library-loan-replace", args=[loan_id]), {"new_copy": {}}, format="json"
    )
    assert refused.json()["error"]["code"] == "library_charge_not_open"


# ── damage at return (FR-7, BR-8) ───────────────────────────────────────────


@pytest.mark.parametrize(
    "level, amount, kind, status",
    [
        ("minor", "20.00", "damage", "available"),
        ("major", "125.00", "damage", "in_repair"),
        ("unusable", "250.00", "lost_book", "withdrawn"),
    ],
)
def test_damage_charges_and_routes_the_copy(
    desk: dict, level: str, amount: str, kind: str, status: str
) -> None:
    _lend(desk)
    returned = _return(
        desk["client"], desk["copies"][0], "r1", damage={"level": level, "note": "Torn"}
    )
    assert returned.status_code == 200, returned.content
    charges = returned.json()["meta"]["charges"]
    assert [(c["kind"], c["amount"]) for c in charges] == [(kind, amount)]
    assert _copy(desk).status == status


def test_staff_may_lower_a_damage_charge_but_not_raise_it(desk: dict, api_as: Any) -> None:
    staff, _ = api_as(desk["tenant"], role="staff")
    _lend(desk, 0)
    _lend(desk, 1)
    lower = _return(staff, desk["copies"][0], "r1", damage={"level": "minor", "amount": "10.00"})
    assert lower.json()["meta"]["charges"][0]["amount"] == "10.00"
    higher = _return(staff, desk["copies"][1], "r2", damage={"level": "minor", "amount": "90.00"})
    assert higher.status_code == 403


# ── the preview ─────────────────────────────────────────────────────────────


def test_the_fine_preview_shows_the_calculation_and_charges_nothing(desk: dict) -> None:
    loan_id = _lend(desk, days_late=3)
    preview = desk["client"].get(reverse("v1:library-loan-fine-preview", args=[loan_id])).json()
    assert (preview["data"]["days_late"], preview["data"]["amount"]) == (3, "6.00")
    assert not LibraryCharge.objects.exists()
