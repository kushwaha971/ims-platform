"""QA F10 — a reading room's students and a lender's running loans, from a file.

The owner's go-live problem was a paper register of two hundred students or
loans and no way in but one form at a time. Each kind imports through the SAME
service the single form uses (F1's existing-student enrol, F8's running loan),
so what a row brings in is exactly what the form would: no fee today, no cash
today, the deposit and the money already collected as history.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest
from django.test import override_settings
from django.urls import reverse

from apps.common.dates import tenant_today
from apps.imports.tests.helpers import detail, upload
from apps.reports.selectors.day_book import money_position

pytestmark = pytest.mark.django_db
D = Decimal


def _cash(tenant: Any) -> Decimal:
    return money_position(tenant=tenant, before=tenant_today(tenant) + dt.timedelta(days=1))["cash"]


def _commit(client: Any, job_id: str, capture: Any, **body: Any) -> Any:
    with capture(execute=True):
        return client.post(reverse("v1:import-commit", args=[job_id]), body, format="json")


def _d(day: dt.date) -> str:
    return day.strftime("%d/%m/%Y")


# ── students ────────────────────────────────────────────────────────────────


@pytest.fixture
def library(tenant: Any, api_as: Any) -> Any:
    from apps.library.models import LibraryMembershipType, LibrarySeat, LibraryShift
    from apps.library.tests.conftest import entitle_library

    with override_settings(UB_UNRELEASED_MODULES=True):
        entitle_library(tenant)
        LibraryMembershipType.objects.create(
            tenant=tenant,
            name="Monthly",
            validity_months=1,
            fee_amount=D("800.00"),
            deposit_amount=D("500.00"),
        )
        LibraryShift.objects.create(
            tenant=tenant, name="Morning", starts_at=dt.time(6), ends_at=dt.time(12)
        )
        LibrarySeat.objects.create(tenant=tenant, label="A-12", label_sort="A-0012")
        client, _ = api_as(tenant, role="owner")
        yield client


STUDENT_HEADER = "name,mobile,plan,joined,paid_till,deposit,old_dues,seat,shift"


def test_students_come_in_as_existing_students_with_no_cash_today(
    library: Any, tenant: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """F10/F1: joined in August, paid till a date, deposit held, dues owed — the
    plan reads those dates, no fee or receipt is made and today's cash is unchanged."""
    from apps.library.models import LibraryMembership

    today = tenant_today(tenant)
    joined = today - dt.timedelta(days=60)
    paid = today + dt.timedelta(days=20)
    text = "\n".join(
        [
            STUDENT_HEADER,
            f"Asha Kumari,9876500011,Monthly,{_d(joined)},{_d(paid)},500,,A-12,Morning",
            f"Ravi Kumar,9876500012,monthly,{_d(joined)},{_d(paid)},,300,,",
        ]
    )
    before = _cash(tenant)
    response = upload(library, "students", text, capture=django_capture_on_commit_callbacks)
    assert response.status_code == 201, response.content
    job = detail(library, response.json()["data"]["id"])
    assert job["status"] == "ready", job["errors"]
    assert job["valid_rows"] == 2
    assert D(job["totals"]["deposits_held"]) == D("500.00")
    assert D(job["totals"]["old_dues"]) == D("300.00")

    done = _commit(library, job["id"], django_capture_on_commit_callbacks)
    assert done.status_code == 202, done.json()
    after = detail(library, job["id"])
    assert after["status"] == "completed", after
    asha = LibraryMembership.objects.get(party__name="Asha Kumari")
    assert (asha.starts_on, asha.valid_until) == (joined, paid)
    assert asha.seat.label == "A-12" and asha.shift.name == "Morning"
    assert after["summary"]["created_students"] == 2
    assert _cash(tenant) == before


def test_a_student_row_is_refused_for_an_unknown_plan_and_a_taken_seat(
    library: Any, tenant: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """The sheet's words are matched to the room's own plans and seats; two rows
    on one seat in one shift — the second is the problem, not a 409 at commit."""
    today = tenant_today(tenant)
    text = "\n".join(
        [
            STUDENT_HEADER,
            f"Asha Kumari,9876500011,Monthly,{_d(today)},,,,A-12,Morning",
            f"Ravi Kumar,9876500012,Yearly,{_d(today)},,,,,",
            f"Mina Devi,9876500013,Monthly,{_d(today)},,,,A-12,Morning",
        ]
    )
    response = upload(library, "students", text, capture=django_capture_on_commit_callbacks)
    job = detail(library, response.json()["data"]["id"])
    problems = {(e["row"], e["column"]) for e in job["errors"]}
    assert problems == {(3, "plan"), (4, "seat")}


def test_a_mobile_already_a_member_is_named_and_one_already_a_party_is_reused(
    library: Any, tenant: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """DEC-019: the person is the one shared record. A customer of the shop joins
    the library as THAT party; a student already enrolled is an error, not a twin."""
    from apps.library.models import LibraryMembership
    from apps.parties.models import Party
    from tests.factories.parties import PartyFactory

    PartyFactory(tenant=tenant, name="Shop Customer", mobile="+919876500021")
    today = tenant_today(tenant)
    text = "\n".join([STUDENT_HEADER, f"Shop Customer,9876500021,Monthly,{_d(today)},,,,,"])
    job = detail(
        library,
        upload(library, "students", text, capture=django_capture_on_commit_callbacks).json()[
            "data"
        ]["id"],
    )
    _commit(library, job["id"], django_capture_on_commit_callbacks)
    assert Party.objects.filter(tenant=tenant, mobile="+919876500021").count() == 1
    assert LibraryMembership.objects.filter(party__mobile="+919876500021").count() == 1

    again = detail(
        library,
        upload(library, "students", text, capture=django_capture_on_commit_callbacks).json()[
            "data"
        ]["id"],
    )
    assert [e["code"] for e in again["errors"]] == ["already_member"]


# ── loans ───────────────────────────────────────────────────────────────────


@pytest.fixture
def lender(tenant: Any, api_as: Any) -> Any:
    from apps.lending.tests.conftest import entitle_lending

    with override_settings(UB_UNRELEASED_MODULES=True):
        entitle_lending(tenant)
        client, _ = api_as(tenant, role="owner")
        yield client


LOAN_HEADER = "name,mobile,amount,given_on,collect,instalments,each_instalment,interest,collected"


def test_running_loans_come_in_with_what_was_collected_and_no_cash_today(
    lender: Any, tenant: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """F10/F8: a daily loan 60 of 100 paid and a monthly loan at 2% — both come in,
    nothing moves today's cash, and what is left is the loan less what was paid."""
    from apps.lending.models import LendingLoan
    from apps.lending.services.loans import figures

    today = tenant_today(tenant)
    text = "\n".join(
        [
            LOAN_HEADER,
            f"Geeta Devi,9820011223,10000,{_d(today - dt.timedelta(days=80))},daily,100,120,,6000",
            f"Mohan Lal,9830022334,20000,{_d(today - dt.timedelta(days=100))},monthly,12,,2,3600",
            f"New Borrower,9830022335,5000,{_d(today - dt.timedelta(days=3))},weekly,10,550,,",
        ]
    )
    before = _cash(tenant)
    response = upload(lender, "loans", text, capture=django_capture_on_commit_callbacks)
    assert response.status_code == 201, response.content
    job = detail(lender, response.json()["data"]["id"])
    assert job["status"] == "ready", job["errors"]
    assert D(job["totals"]["lent"]) == D("35000.00")
    assert D(job["totals"]["collected"]) == D("9600.00")

    done = _commit(lender, job["id"], django_capture_on_commit_callbacks)
    assert done.status_code == 202, done.json()
    assert detail(lender, job["id"])["status"] == "completed"
    geeta = LendingLoan.objects.get(party__name="Geeta Devi")
    numbers = figures(geeta, today)
    assert D(numbers["collected"]) == D("6000.00")
    assert D(numbers["remaining"]) == D("6000.00")  # 100 × 120 − 6,000
    fresh = LendingLoan.objects.get(party__name="New Borrower")
    assert D(figures(fresh, today)["collected"]) == D("0.00")
    assert _cash(tenant) == before


def test_a_loan_row_says_what_is_missing_in_the_registers_words(
    lender: Any, tenant: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """A daily loan needs the amount collected each day; collected cannot reach the
    whole loan; a future date is refused."""
    today = tenant_today(tenant)
    given = _d(today - dt.timedelta(days=10))
    text = "\n".join(
        [
            LOAN_HEADER,
            f"No Instalment,9820011224,10000,{given},daily,100,,,",
            f"Paid Off,9820011225,1000,{given},daily,10,110,,1100",
            f"Future,9820011226,1000,{_d(today + dt.timedelta(days=3))},daily,10,110,,",
        ]
    )
    job = detail(
        lender,
        upload(lender, "loans", text, capture=django_capture_on_commit_callbacks).json()["data"][
            "id"
        ],
    )
    problems = {(e["row"], e["column"]) for e in job["errors"]}
    assert problems == {(2, "each_instalment"), (3, "collected"), (4, "given_on")}
