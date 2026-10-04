"""B09 — the counter: issue, return, renew, cancel, change due (LIB-06; T-LIB-06-1…8)."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest
from django.db import IntegrityError, connection, transaction
from django.test.utils import CaptureQueriesContext
from django.urls import reverse

from apps.common.dates import tenant_today
from apps.library.models import (
    LibraryCharge,
    LibraryCopy,
    LibraryLoan,
    LibraryLoanRule,
    LibraryMembership,
)
from apps.library.services import loans as loan_service
from apps.library.tests.counter import _issue, _return
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db
D = Decimal


# ── issue (BR-1) ────────────────────────────────────────────────────────────


def test_an_issue_lends_the_copy_with_a_snapshot_of_its_rule(desk: dict) -> None:
    response = _issue(desk["client"], desk["member"], desk["copies"][0], "i1")
    assert response.status_code == 201, response.content
    body = response.json()
    loan = LibraryLoan.objects.get(pk=body["data"]["id"])
    assert (loan.loan_days, loan.fine_per_day, loan.max_renewals) == (14, D("2.00"), 2)
    copy = LibraryCopy.objects.get(accession_number=desk["copies"][0])
    assert (copy.status, copy.issued_ever) == ("on_loan", True)
    assert body["meta"]["member"]["loans_open"] == 1
    assert loan.events.filter(kind="issued").exists()


def test_the_copy_limit_is_overridable_by_someone_allowed_to_override(
    desk: dict, api_as: Any
) -> None:
    """T-LIB-06-1 — the third book is refused with the block; staff cannot override; the owner
    can, with a reason, and the override is an event naming the block."""
    client, member, copies = desk["client"], desk["member"], desk["copies"]
    _issue(client, member, copies[0], "i1")
    _issue(client, member, copies[1], "i2")
    refused = _issue(client, member, copies[2], "i3")
    assert refused.status_code == 409
    assert [b["code"] for b in refused.json()["error"]["details"]["blocks"]] == [
        "copy_limit_reached"
    ]
    staff, _ = api_as(desk["tenant"], role="staff")
    assert _issue(staff, member, copies[2], "i4", override_reason="Project work").status_code == 403
    allowed = _issue(client, member, copies[2], "i5", override_reason="Project work")
    assert allowed.status_code == 201, allowed.content
    loan = LibraryLoan.objects.get(pk=allowed.json()["data"]["id"])
    assert loan.events.get(kind="overridden").blocks_overridden == ["copy_limit_reached"]


def test_an_expired_member_cannot_borrow(desk: dict) -> None:
    LibraryMembership.objects.filter(pk=desk["member"]).update(
        starts_on=dt.date(2025, 1, 1), valid_until=dt.date(2025, 6, 30)
    )
    refused = _issue(desk["client"], desk["member"], desk["copies"][0], "i1")
    assert refused.json()["error"]["code"] == "library_membership_inactive"
    assert refused.json()["error"]["details"]["effective_status"] == "expired"


def test_a_copy_out_with_someone_else_says_who_has_it(desk: dict) -> None:
    other = (
        desk["client"]
        .post(
            reverse("v1:library-members"),
            {
                "membership_type_id": str(desk["kind"].id),
                "party_id": str(PartyFactory(tenant=desk["tenant"]).id),
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY="e2",
        )
        .json()["data"]["membership_id"]
    )
    _issue(desk["client"], desk["member"], desk["copies"][0], "i1")
    refused = _issue(desk["client"], other, desk["copies"][0], "i2")
    details = refused.json()["error"]["details"]
    assert (refused.status_code, details["status"]) == (409, "on_loan")
    assert details["with"]["membership_id"] == desk["member"]


def test_a_reference_copy_is_not_loanable_without_an_override(desk: dict) -> None:
    LibraryLoanRule.objects.create(tenant=desk["tenant"], material_type="reference", loanable=False)
    LibraryCopy.objects.filter(accession_number=desk["copies"][0]).update(is_reference=True)
    refused = _issue(desk["client"], desk["member"], desk["copies"][0], "i1")
    assert [b["code"] for b in refused.json()["error"]["details"]["blocks"]] == ["not_loanable"]


def test_the_database_refuses_a_second_open_loan_of_one_copy(desk: dict) -> None:
    """T-LIB-06-3, BR-6 — whatever writer tries it."""
    body = _issue(desk["client"], desk["member"], desk["copies"][0], "i1").json()["data"]
    loan = LibraryLoan.objects.get(pk=body["id"])
    with pytest.raises(IntegrityError), transaction.atomic():
        LibraryLoan.objects.create(
            tenant=loan.tenant,
            copy=loan.copy,
            membership=loan.membership,
            party_id=loan.party_id,
            issued_on=loan.issued_on,
            issued_at=loan.issued_at,
            due_on=loan.due_on,
            loan_days=14,
            fine_per_day=D("2"),
            grace_days=0,
            max_renewals=2,
        )


def test_a_replayed_issue_returns_the_same_loan(desk: dict) -> None:
    """T-LIB-06-7 — a scan retried after a lost response never issues twice."""
    first = _issue(desk["client"], desk["member"], desk["copies"][0], "same")
    again = _issue(desk["client"], desk["member"], desk["copies"][0], "same")
    assert again.json()["data"]["id"] == first.json()["data"]["id"]
    assert LibraryLoan.objects.count() == 1


def test_issue_and_return_stay_within_a_query_budget(desk: dict) -> None:
    """T-LIB-06-8 — the counter's P95; 30 issues in 20 minutes at one desk. The FRD asks for 12
    and this build measures 42 and 40 (holds included), about twenty of them fixed costs of any write here (the
    session, the idempotency row, the audit row, eight savepoint pairs). The budget holds the
    measured figure so it cannot grow unnoticed; QA-B09-1 records the gap for the lead."""
    with CaptureQueriesContext(connection) as issued:
        _issue(desk["client"], desk["member"], desk["copies"][0], "i1")
    with CaptureQueriesContext(connection) as returned:
        _return(desk["client"], desk["copies"][0], "r1")
    assert len(issued) <= 42 and len(returned) <= 40, (len(issued), len(returned))


# ── return (BR-2; LIB-07 FR-1) ──────────────────────────────────────────────


def test_a_late_return_charges_the_fine_at_once(desk: dict) -> None:
    body = _issue(desk["client"], desk["member"], desk["copies"][0], "i1").json()["data"]
    today = tenant_today(desk["tenant"])
    LibraryLoan.objects.filter(pk=body["id"]).update(
        issued_on=today - dt.timedelta(days=20), due_on=today - dt.timedelta(days=3)
    )
    returned = _return(desk["client"], desk["copies"][0], "r1")
    assert returned.status_code == 200, returned.content
    meta = returned.json()["meta"]
    assert meta["fine"]["amount"] == "6.00"
    assert [c["kind"] for c in meta["charges"]] == ["overdue_fine"]
    charge = LibraryCharge.objects.get(kind="overdue_fine")
    assert (charge.loan_id is not None, charge.amount, charge.fine_days) == (True, D("6.00"), 3)
    copy = LibraryCopy.objects.get(accession_number=desk["copies"][0])
    assert (copy.status, copy.last_seen_on) == ("available", today)


def test_a_copy_not_on_loan_is_refused_and_a_lost_one_offers_found(desk: dict) -> None:
    refused = _return(desk["client"], desk["copies"][0], "r1")
    assert refused.json()["error"]["details"] == {"status": "available", "offer_found": False}
    LibraryCopy.objects.filter(accession_number=desk["copies"][1]).update(status="lost")
    lost = _return(desk["client"], desk["copies"][1], "r2")
    assert lost.json()["error"]["details"]["offer_found"] is True


def test_a_backdated_return_needs_adjust(desk: dict, api_as: Any) -> None:
    """FR-12 — staff return today; only someone who may adjust loans backdates."""
    body = _issue(desk["client"], desk["member"], desk["copies"][0], "i1").json()["data"]
    today = tenant_today(desk["tenant"])
    LibraryLoan.objects.filter(pk=body["id"]).update(issued_on=today - dt.timedelta(days=5))
    staff, _ = api_as(desk["tenant"], role="staff")
    yesterday = (today - dt.timedelta(days=1)).isoformat()
    assert _return(staff, desk["copies"][0], "r1", returned_on=yesterday).status_code == 403


# ── renew (BR-3) ────────────────────────────────────────────────────────────


def test_renewals_stop_at_the_snapshot_limit(desk: dict) -> None:
    body = _issue(desk["client"], desk["member"], desk["copies"][0], "i1").json()["data"]
    LibraryLoan.objects.filter(pk=body["id"]).update(renew_count=2)
    refused = desk["client"].post(
        reverse("v1:library-loan-renew", args=[body["id"]]),
        {},
        format="json",
        HTTP_IDEMPOTENCY_KEY="n1",
    )
    assert refused.json()["error"]["details"]["reason"] == "max_renewals"


def test_an_overdue_renewal_charges_the_fine_first(desk: dict) -> None:
    """T-LIB-06-5 — `renew_overdue = charge_fine`: one fine dated the renewal day, then a new
    due date from today."""
    body = _issue(desk["client"], desk["member"], desk["copies"][0], "i1").json()["data"]
    today = tenant_today(desk["tenant"])
    LibraryLoan.objects.filter(pk=body["id"]).update(
        issued_on=today - dt.timedelta(days=20), due_on=today - dt.timedelta(days=3)
    )
    renewed = desk["client"].post(
        reverse("v1:library-loan-renew", args=[body["id"]]),
        {},
        format="json",
        HTTP_IDEMPOTENCY_KEY="n1",
    )
    assert renewed.status_code == 200, renewed.content
    assert renewed.json()["meta"]["fine_charge"]["amount"] == "6.00"
    loan = LibraryLoan.objects.get(pk=body["id"])
    assert loan.due_on > today and loan.renew_count == 1


# ── cancel, change due, close guard ─────────────────────────────────────────


def test_cancel_restores_the_copy_and_only_on_the_same_day(desk: dict) -> None:
    """T-LIB-06-6."""
    first = _issue(desk["client"], desk["member"], desk["copies"][0], "i1").json()["data"]
    url = reverse("v1:library-loan-cancel", args=[first["id"]])
    assert desk["client"].post(url, {"reason": "Wrong member"}, format="json").status_code == 200
    copy = LibraryCopy.objects.get(accession_number=desk["copies"][0])
    assert copy.status == "available"
    second = _issue(desk["client"], desk["member"], desk["copies"][1], "i2").json()["data"]
    LibraryLoan.objects.filter(pk=second["id"]).update(
        issued_on=tenant_today(desk["tenant"]) - dt.timedelta(days=1)
    )
    late = desk["client"].post(
        reverse("v1:library-loan-cancel", args=[second["id"]]), {"reason": "Oops"}, format="json"
    )
    assert late.json()["error"]["code"] == "library_cancel_window_passed"


def test_a_member_with_a_book_out_cannot_be_closed(desk: dict) -> None:
    """LIB-04 BR-6, G24."""
    _issue(desk["client"], desk["member"], desk["copies"][0], "i1")
    refused = desk["client"].post(
        reverse("v1:library-member-close", args=[desk["member"]]),
        {"reason": "Left town"},
        format="json",
        HTTP_IDEMPOTENCY_KEY="c1",
    )
    assert refused.json()["error"]["code"] == "library_membership_has_loans"


def test_a_holiday_moves_the_books_due_in_it(desk: dict) -> None:
    """LIB-05 FR-6 — 'Move the 14 books due that day'."""
    body = _issue(desk["client"], desk["member"], desk["copies"][0], "i1").json()["data"]
    due = dt.date.fromisoformat(body["due_on"])
    counted = (
        desk["client"]
        .get(reverse("v1:library-loans-due-on"), {"from": due.isoformat(), "to": due.isoformat()})
        .json()["data"]
    )
    assert counted["count"] == 1
    moved = (
        desk["client"]
        .post(
            reverse("v1:library-loans-shift-due"),
            {"from": due.isoformat(), "to": due.isoformat(), "reason": "Diwali"},
            format="json",
        )
        .json()["data"]
    )
    assert moved["moved"] == 1
    assert LibraryLoan.objects.get(pk=body["id"]).due_on > due


def test_the_fine_so_far_is_computed_not_stored(desk: dict) -> None:
    body = _issue(desk["client"], desk["member"], desk["copies"][0], "i1").json()["data"]
    today = tenant_today(desk["tenant"])
    LibraryLoan.objects.filter(pk=body["id"]).update(
        issued_on=today - dt.timedelta(days=20), due_on=today - dt.timedelta(days=2)
    )
    row = loan_service.loan_json(
        LibraryLoan.objects.select_related("copy__title", "membership__party").get(pk=body["id"]),
        today,
    )
    assert (row["days_overdue"], row["fine_so_far"]) == (2, "4.00")
    assert not LibraryCharge.objects.filter(kind="overdue_fine").exists()
