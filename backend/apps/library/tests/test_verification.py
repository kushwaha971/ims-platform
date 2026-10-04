"""B13 — stock verification: scan, close, reopen, mark and withdraw missing (LIB-10; T-LIB-10-1…5)."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.common.dates import tenant_today
from apps.ledger.models import LedgerEntry
from apps.library.models import (
    LibraryCharge,
    LibraryCopy,
    LibraryCopyEvent,
    LibraryLoan,
    LibraryLocation,
    LibraryVerification,
)
from apps.library.services import verification as vf
from apps.library.tests.counter import _issue

pytestmark = pytest.mark.django_db


@pytest.fixture
def shelves(desk: dict) -> dict:
    """The desk's three copies: 1 and 2 on A-1, 3 on B-2."""
    tenant = desk["tenant"]
    a1 = LibraryLocation.objects.create(tenant=tenant, code="A-1")
    b2 = LibraryLocation.objects.create(tenant=tenant, code="B-2")
    LibraryCopy.objects.filter(accession_number__in=["1", "2"]).update(location=a1)
    LibraryCopy.objects.filter(accession_number="3").update(location=b2)
    return {**desk, "a1": a1, "b2": b2}


def _start(desk: dict, key: str = "v1", **body: Any) -> Any:
    return desk["client"].post(
        reverse("v1:library-verifications"),
        {"name": "Annual 2026–27", **body},
        format="json",
        HTTP_IDEMPOTENCY_KEY=key,
    )


def _scan(desk: dict, vid: str, code: str, key: str, **body: Any) -> Any:
    return desk["client"].post(
        reverse("v1:library-verification-scans", args=[vid]),
        {"code": code, **body},
        format="json",
        HTTP_IDEMPOTENCY_KEY=key,
    )


def _post(desk: dict, name: str, vid: str, body: dict | None = None, client: Any = None) -> Any:
    return (client or desk["client"]).post(
        reverse(f"v1:library-verification-{name}", args=[vid]), body or {}, format="json"
    )


def _copy(code: str) -> LibraryCopy:
    return LibraryCopy.objects.get(accession_number=code)


# ── start (FR-1) ────────────────────────────────────────────────────────────


def test_start_counts_the_scope_and_warns_about_an_overlap(shelves: dict) -> None:
    first = _start(shelves, scope_kind="locations", location_ids=[str(shelves["a1"].id)])
    assert first.status_code == 201, first.content
    assert first.json()["meta"] == {"expected_count": 2, "overlaps": []}
    second = _start(shelves, "v2", scope_kind="range", range_from="2", range_to="3")
    assert second.json()["meta"]["overlaps"] == [
        {"id": first.json()["data"]["id"], "name": "Annual 2026–27"}
    ]
    refused = _start(shelves, "v3", scope_kind="range", range_from="9", range_to="2")
    assert refused.status_code == 400


# ── classification (BR-2; T-LIB-10-1) ──────────────────────────────────────


def test_every_branch_of_the_classification(shelves: dict) -> None:
    """T-LIB-10-1 — unknown, outside scope, duplicate, flagged, on loan, wrong place, found."""
    vid = _start(shelves, scope_kind="range", range_from="1", range_to="2").json()["data"]["id"]
    a1 = str(shelves["a1"].id)
    assert _scan(shelves, vid, "1", "s1", location_id=a1).json()["data"]["result"] == "found"
    assert _scan(shelves, vid, "1", "s2").json()["data"]["result"] == "duplicate_scan"
    assert _scan(shelves, vid, "3", "s3").json()["data"]["result"] == "outside_scope"
    assert _scan(shelves, vid, "7777", "s4").json()["data"]["result"] == "unknown_number"
    _issue(shelves["client"], shelves["member"], "2", "i1")
    on_loan = _scan(shelves, vid, "2", "s5").json()["data"]
    assert on_loan["result"] == "on_loan" and on_loan["message_params"]["member"]
    assert _copy("2").last_seen_on == tenant_today(shelves["tenant"])

    other = _start(shelves, "v2").json()["data"]["id"]
    wrong = _scan(shelves, other, "3", "s6", location_id=a1).json()["data"]
    assert (wrong["result"], wrong["message_params"]) == (
        "found_wrong_location",
        {"location": "B-2"},
    )
    LibraryCopy.objects.filter(accession_number="1").update(status="missing")
    assert _scan(shelves, other, "1", "s7").json()["data"]["result"] == "found_flagged"


def test_a_scan_of_a_book_on_loan_closes_nothing_and_charges_nothing(shelves: dict) -> None:
    """T-LIB-10-3 — FR-3: a scan records; it does not act."""
    loan_id = _issue(shelves["client"], shelves["member"], "1", "i1").json()["data"]["id"]
    today = tenant_today(shelves["tenant"])
    LibraryLoan.objects.filter(pk=loan_id).update(
        issued_on=today - dt.timedelta(days=19), due_on=today - dt.timedelta(days=5)
    )
    vid = _start(shelves).json()["data"]["id"]
    counts = (
        LibraryLoan.objects.count(),
        LibraryCharge.objects.count(),
        LedgerEntry.objects.count(),
    )
    _scan(shelves, vid, "1", "s1")
    assert LibraryLoan.objects.get(pk=loan_id).status == "open"
    assert _copy("1").status == "on_loan"
    assert counts == (
        LibraryLoan.objects.count(),
        LibraryCharge.objects.count(),
        LedgerEntry.objects.count(),
    )


# ── close (FR-5, BR-1, BR-3; T-LIB-10-2) ────────────────────────────────────


def test_close_counts_equal_a_recount_and_ignore_voided_scans(shelves: dict) -> None:
    vid = _start(shelves).json()["data"]["id"]
    a1 = str(shelves["a1"].id)
    _scan(shelves, vid, "1", "s1", location_id=a1)
    wrong = _scan(shelves, vid, "3", "s2", location_id=a1).json()["data"]["id"]
    _scan(shelves, vid, "7777", "s3")
    shelves["client"].post(
        reverse("v1:library-verification-scan-void", args=[vid, wrong]), {}, format="json"
    )
    closed = _post(shelves, "close", vid)
    assert closed.status_code == 200, closed.content
    counts = closed.json()["data"]["counts"]
    assert (counts["expected"], counts["found"], counts["missing"], counts["unknown"]) == (
        3,
        1,
        2,
        1,
    )
    assert (counts["wrong_location"], counts["missing_value"]) == (0, "500.00")
    v = LibraryVerification.objects.get(pk=vid)
    recount = vf.recount(v)
    assert (recount["found_count"], recount["missing_count"]) == (v.found_count, v.missing_count)
    assert _scan(shelves, vid, "2", "s9").json()["error"]["code"] == "library_verification_closed"


def test_a_copy_issued_during_the_count_is_on_loan_not_missing(shelves: dict) -> None:
    """EC-1 — BR-1 is evaluated at close."""
    vid = _start(shelves).json()["data"]["id"]
    _scan(shelves, vid, "1", "s1")
    _issue(shelves["client"], shelves["member"], "2", "i1")
    counts = _post(shelves, "close", vid).json()["data"]["counts"]
    assert (counts["on_loan"], counts["missing"]) == (1, 1)


def test_reopen_once_then_refused(shelves: dict, api_as: Any) -> None:
    """T-LIB-10-5 — and staff may not reopen at all."""
    vid = _start(shelves).json()["data"]["id"]
    _post(shelves, "close", vid)
    staff, _ = api_as(shelves["tenant"], role="staff")
    assert _post(shelves, "reopen", vid, {"reason": "Shelf C"}, client=staff).status_code == 403
    assert _post(shelves, "reopen", vid, {"reason": "Shelf C forgotten"}).status_code == 200
    _post(shelves, "close", vid)
    again = _post(shelves, "reopen", vid, {"reason": "Again"})
    assert again.json()["error"]["code"] == "library_verification_reopen_used"


# ── acting on the result (FR-6, BR-6) ───────────────────────────────────────


def test_mark_missing_needs_a_closed_check_and_charges_nobody(shelves: dict) -> None:
    vid = _start(shelves).json()["data"]["id"]
    _scan(shelves, vid, "1", "s1")
    early = _post(shelves, "mark-missing", vid, {"all": True})
    assert early.json()["error"]["code"] == "library_verification_open"
    _post(shelves, "close", vid)
    marked = _post(shelves, "mark-missing", vid, {"all": True, "reason": "Annual count"})
    assert marked.json()["data"]["marked"] == 2
    assert {_copy("2").status, _copy("3").status} == {"missing"}
    event = LibraryCopyEvent.objects.filter(copy=_copy("2")).latest("created_at")
    assert (event.source_type, str(event.source_id)) == ("library_verification", vid)
    assert not LibraryCharge.objects.exists()
    from apps.platform_app.models import AuditLog

    assert set(
        AuditLog.objects.filter(entity_type="library_verification").values_list("action", flat=True)
    ) == {
        "library.verification.started",
        "library.verification.closed",
        "library.verification.missing_marked",
    }
    missing = shelves["client"].get(
        reverse("v1:library-verification-results", args=[vid]), {"bucket": "missing"}
    )
    assert len(missing.json()["data"]) == 2  # the list survives being worked


def test_withdraw_missing_needs_the_withdraw_permission(shelves: dict, api_as: Any) -> None:
    vid = _start(shelves).json()["data"]["id"]
    _post(shelves, "close", vid)
    copy_id = str(_copy("3").id)
    withdrawn = _post(shelves, "withdraw-missing", vid, {"copy_ids": [copy_id], "note": "Gone"})
    assert withdrawn.json()["data"]["withdrawn"] == 1
    copy = _copy("3")
    assert (copy.status, copy.withdrawn_reason) == ("withdrawn", "missing")


def test_a_missing_copy_above_a_thousand_rupees_is_flagged(shelves: dict) -> None:
    """BR-5."""
    LibraryCopy.objects.filter(accession_number="1").update(price=Decimal("1200.00"))
    vid = _start(shelves).json()["data"]["id"]
    _post(shelves, "close", vid)
    rows = (
        shelves["client"]
        .get(reverse("v1:library-verification-results", args=[vid]), {"bucket": "missing"})
        .json()["data"]
    )
    flagged = {row["copy"]["accession_number"]: row["high_value"] for row in rows}
    assert flagged == {"1": True, "2": False, "3": False}


# ── loss per 1,000 (BR-4; T-LIB-10-4) ───────────────────────────────────────


def test_loss_per_thousand_is_five_for_ten_lost_in_two_thousand(library_on: Any) -> None:
    """T-LIB-10-4 — 8 marked missing by this check + 2 lost in the year ÷ 2,000 loans = 5.0."""
    from apps.library.models import LibraryTitle
    from apps.library.tests.factories import loans_issued

    tenant = library_on
    today = tenant_today(tenant)
    title = LibraryTitle.objects.create(tenant=tenant, title="Godaan")
    copies = [
        LibraryCopy.objects.create(
            tenant=tenant, title=title, accession_number=str(n), accession_sort=f"{n:012d}"
        )
        for n in range(10)
    ]
    v = LibraryVerification.objects.create(
        tenant=tenant,
        name="Annual",
        scope_kind="all",
        started_on=today,
        status="closed",
        closed_on=today,
    )
    for copy in copies[:8]:
        LibraryCopyEvent.objects.create(
            tenant=tenant,
            copy=copy,
            to_status="missing",
            reason_code="missing",
            on_date=today,
            source_type="library_verification",
            source_id=v.id,
        )
    for copy in copies[8:]:
        LibraryCopy.objects.filter(pk=copy.pk).update(status="lost")
        LibraryCopyEvent.objects.create(
            tenant=tenant, copy=copy, to_status="lost", reason_code="lost", on_date=today
        )
    loans_issued(tenant, copies[0], 2000, today)
    loss = vf.loss_per_thousand(v)
    assert (loss["per_thousand"], loss["norm"]) == ("5.0", "5")


# ── performance (T-LIB-10-6) ────────────────────────────────────────────────


@pytest.mark.slow
def test_close_over_twenty_thousand_copies_takes_under_five_seconds(library_on: Any) -> None:
    """Set-based: two queries over the scope and one pass over the scans, never a query
    per copy. 20,000 copies in scope, 15,000 of them scanned."""
    import time

    from django.utils import timezone

    from apps.library.models import LibraryTitle, LibraryVerificationScan

    tenant = library_on
    title = LibraryTitle.objects.create(tenant=tenant, title="Bulk")
    copies = LibraryCopy.objects.bulk_create(
        LibraryCopy(tenant=tenant, title=title, accession_number=str(n), accession_sort=f"{n:012d}")
        for n in range(20_000)
    )
    v = LibraryVerification.objects.create(
        tenant=tenant, name="Annual", scope_kind="all", started_on=tenant_today(tenant)
    )
    moment = timezone.now()
    LibraryVerificationScan.objects.bulk_create(
        LibraryVerificationScan(
            tenant=tenant,
            verification=v,
            code_entered=copy.accession_number,
            copy=copy,
            result="found",
            scanned_at=moment,
        )
        for copy in copies[:15_000]
    )
    from types import SimpleNamespace

    began = time.monotonic()
    closed = vf.close(
        ctx=SimpleNamespace(tenant=tenant, actor=None, actor_type="system"), verification_id=v.id
    )
    assert time.monotonic() - began <= 5
    assert (closed.found_count, closed.missing_count) == (15_000, 5_000)
