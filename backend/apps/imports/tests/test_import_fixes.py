"""The 12 Oct QA import findings — B27, B28, B29, B30, B32, B33, B34, B35, B44.

Each test names the defect it prevents. The file shapes are the QA report's: a
party file with good and bad rows mixed, a balance with no direction, a name the
book already has, formula-looking text.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.imports.tests.helpers import PARTY_HEADER, detail, upload
from apps.parties.models import Party
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db
D = Decimal

MIXED = "\n".join(
    [
        PARTY_HEADER,
        "Ramesh Traders,9876500001,customer,1000,to_receive,01/04/2025,,,",
        "Sunita Stores,9876500002,supplier,250.50,to_pay,01/04/2025,,,",
        "Gupta & Sons,9876500003,both,,,,,,",
        # Bad: a one-letter name — its 1,300 must not reach the review total (B27).
        "X,9876500004,customer,1300,to_receive,01/04/2025,,,",
        # Bad: a balance with no direction (B29).
        "Meena Devi,9876500005,customer,500,,01/04/2025,,,",
    ]
)


def _ready(client: Any, text: str, capture: Any) -> dict:
    response = upload(client, "parties", text, capture=capture)
    assert response.status_code == 201, response.content
    return detail(client, response.json()["data"]["id"])


def _commit(client: Any, job_id: str, capture: Any, **body: Any) -> Any:
    with capture(execute=True):
        return client.post(reverse("v1:import-commit", args=[job_id]), body, format="json")


# ── B29 ─────────────────────────────────────────────────────────────────────


def test_a_balance_with_no_direction_is_a_row_problem(
    owner: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """B29: "Meena Devi, 500, (blank)" was imported as They owe me, silently."""
    job = _ready(owner, MIXED, django_capture_on_commit_callbacks)
    problems = {(e["row"], e["column"]) for e in job["errors"]}
    assert (6, "opening_type") in problems


# ── B27 / B44 ───────────────────────────────────────────────────────────────


def test_the_review_totals_count_only_rows_that_will_import(
    owner: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """B27: "You will get ₹1,30,250.50" counted rows that would never import. The
    total is the good rows' (1,000); the problem rows' money is shown apart."""
    job = _ready(owner, MIXED, django_capture_on_commit_callbacks)
    totals = job["totals"]
    assert D(totals["opening_receivable"]) == D("1000.00")
    assert D(totals["opening_payable"]) == D("250.50")
    problems = job["totals_problems"]
    # 1,300 from the bad name; the 500 with no direction is not counted as owed,
    # because which way it goes is exactly what that row does not say (B29).
    assert D(problems["opening_receivable"]) == D("1300.00")


def test_the_counts_say_customers_suppliers_and_both(
    owner: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """B44: "Import 11 customers" when some were suppliers. The good rows' kinds."""
    job = _ready(owner, MIXED, django_capture_on_commit_callbacks)
    totals = job["totals"]
    assert (totals["customers"], totals["suppliers"], totals["both"]) == (1, 1, 1)


# ── B33 ─────────────────────────────────────────────────────────────────────


def test_the_good_rows_import_and_the_bad_ones_are_skipped_when_asked(
    owner: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """B33: "Fix 16 rows first" blocked 11 good rows. All-or-nothing stays the
    default; asked to skip, only the good rows are created and the rest reported."""
    job = _ready(owner, MIXED, django_capture_on_commit_callbacks)
    refused = _commit(owner, job["id"], django_capture_on_commit_callbacks)
    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "import_has_errors"
    assert Party.objects.count() == 0

    done = _commit(owner, job["id"], django_capture_on_commit_callbacks, skip_errors=True)
    assert done.status_code == 202, done.json()
    after = detail(owner, job["id"])
    assert after["status"] == "completed"
    assert sorted(Party.objects.values_list("name", flat=True)) == [
        "Gupta & Sons",
        "Ramesh Traders",
        "Sunita Stores",
    ]
    assert after["summary"]["skipped_rows"] == 2
    assert after["has_error_file"] is True  # the skipped rows, downloadable


# ── B28 ─────────────────────────────────────────────────────────────────────


def test_a_name_the_book_already_has_is_a_check_with_a_choice(
    owner: Any, tenant: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """B28: a second "Ramesh Traders" with no mobile was created with no word.
    It is a check; skipping duplicates leaves the book as it was."""
    PartyFactory(tenant=tenant, name="Ramesh Traders", mobile="")
    text = "\n".join([PARTY_HEADER, "ramesh traders,,customer,,,,,,", "New Shop,,customer,,,,,,"])
    job = _ready(owner, text, django_capture_on_commit_callbacks)
    checks = [w for w in job["warnings"] if w["code"] == "duplicate_name"]
    assert [w["row"] for w in checks] == [2]
    assert job["duplicates"] == 1

    done = _commit(owner, job["id"], django_capture_on_commit_callbacks, duplicates="skip")
    assert done.status_code == 202, done.json()
    names = sorted(Party.objects.values_list("name", flat=True))
    assert names == ["New Shop", "Ramesh Traders"]
    assert detail(owner, job["id"])["summary"]["skipped_duplicates"] == 1


def test_duplicates_are_created_when_that_is_the_choice(
    owner: Any, tenant: Any, django_capture_on_commit_callbacks: Any
) -> None:
    PartyFactory(tenant=tenant, name="Ramesh Traders", mobile="")
    text = "\n".join([PARTY_HEADER, "Ramesh Traders,,customer,,,,,,"])
    job = _ready(owner, text, django_capture_on_commit_callbacks)
    _commit(owner, job["id"], django_capture_on_commit_callbacks, duplicates="create")
    assert Party.objects.filter(name="Ramesh Traders").count() == 2


# ── B34 ─────────────────────────────────────────────────────────────────────


def test_every_row_can_be_seen_before_importing_with_its_problems(
    owner: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """B34: the review showed the first 20 rows; row 21's defaulted direction was
    never visible. Every row pages through, and "only problems" filters."""
    lines = [PARTY_HEADER] + [
        f"Party {n:03d},98765{n:05d},customer,{n},to_receive,01/04/2025,,," for n in range(1, 31)
    ]
    lines.append("Late Row,9876599999,customer,500,,01/04/2025,,,")  # row 32, a problem
    job = _ready(owner, "\n".join(lines), django_capture_on_commit_callbacks)
    url = reverse("v1:import-rows", args=[job["id"]])
    page2 = owner.get(url, {"page": 2, "page_size": 20}).json()
    assert [r["row"] for r in page2["data"]] == list(range(22, 33))
    assert page2["meta"]["total"] == 31
    only = owner.get(url, {"problems": "1"}).json()["data"]
    assert [r["row"] for r in only] == [32]
    assert only[0]["errors"][0]["column"] == "opening_type"


# ── B35 ─────────────────────────────────────────────────────────────────────


def test_an_imported_balance_shows_its_own_date_as_the_last_entry(
    owner: Any, tenant: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """B35: 300 imported parties all read "Last entry: Today". The paper book's
    date is the last thing that happened on that khata."""
    text = "\n".join(
        [PARTY_HEADER, "Ramesh Traders,9876500001,customer,1000,to_receive,01/04/2025,,,"]
    )
    job = _ready(owner, text, django_capture_on_commit_callbacks)
    _commit(owner, job["id"], django_capture_on_commit_callbacks)
    from apps.common.dates import tenant_timezone

    party = Party.objects.get(name="Ramesh Traders")
    assert party.last_activity_at.astimezone(tenant_timezone(tenant)).date() == dt.date(2025, 4, 1)


# ── B30 ─────────────────────────────────────────────────────────────────────


def test_a_formula_looking_name_exports_as_text(tenant: Any, api_as: Any) -> None:
    """B30: `=HYPERLINK(...)` as a name must open in Excel as text, not a link."""
    PartyFactory(tenant=tenant, name='=HYPERLINK("http://x","click")')
    client, _ = api_as(tenant)
    response = client.get(reverse("v1:party-list"), {"format": "csv"})
    body = b"".join(response.streaming_content).decode("utf-8-sig")
    assert "'=HYPERLINK" in body
    assert "\n=HYPERLINK" not in body


# ── B32 ─────────────────────────────────────────────────────────────────────


def test_a_small_file_is_checked_in_the_upload_request_not_after_the_queue(
    owner: Any, settings: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """B32: 27 rows took 35 s, nearly all of it waiting for the 30-second scheduler.
    A small file runs the moment its upload commits, even with the queue in charge."""
    settings.UB_JOBS_EAGER = False
    response = upload(owner, "parties", MIXED, capture=django_capture_on_commit_callbacks)
    job = detail(owner, response.json()["data"]["id"])
    assert job["status"] == "ready"
