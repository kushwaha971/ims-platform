"""B16 — card, overdue notice and no-dues payloads (LIB-13; T-LIB-13-1, -2)."""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.urls import reverse

from apps.common.dates import tenant_today
from apps.library.models import LibraryLoan, LibraryMembership, LibrarySettings
from apps.library.services import documents
from apps.library.tests.counter import _issue, _return
from apps.parties.models import PartyRelation
from apps.platform_app.models import AuditLog
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db


def _guardian(desk: dict, name: str = "Suresh Kulkarni") -> None:
    PartyRelation.objects.create(
        tenant=desk["tenant"],
        party=LibraryMembership.objects.get(pk=desk["member"]).party,
        related_party=PartyFactory(tenant=desk["tenant"], name=name),
        kind="guardian",
        receives_messages=False,
        from_on=dt.date(2025, 1, 1),
    )


# ── the card (FR-1, BR-1; T-LIB-13-1) ───────────────────────────────────────


def test_the_card_qr_is_the_member_number_and_nothing_else(desk: dict) -> None:
    _guardian(desk)
    body = desk["client"].get(reverse("v1:library-card", args=[desk["member"]])).json()["data"]
    member = body["member"]
    assert member["guardian_name"] == "Suresh Kulkarni"  # named whether or not they take messages
    assert body["business"]["name"] == desk["tenant"].name
    modules = body["qr"]["modules"]
    assert len(modules) == len(modules[0]) and len(modules) in (21, 25)  # v1 or v2
    assert "http" not in str(body).lower() and "yourkhata" not in str(body).lower()


def test_an_independent_decoder_reads_the_card_qr(desk: dict) -> None:
    cv2 = pytest.importorskip("cv2")
    np = pytest.importorskip("numpy")
    body = documents.card(desk["tenant"], desk["member"])
    grid = np.array([[int(c) for c in row] for row in body["qr"]["modules"]], dtype=np.uint8)
    image = (np.pad(1 - grid, 4, constant_values=1) * 255).astype(np.uint8)
    big = cv2.resize(image, None, fx=8, fy=8, interpolation=cv2.INTER_NEAREST)
    assert cv2.QRCodeDetector().detectAndDecode(big)[0] == body["member"]["member_number"]


def test_the_first_print_sets_card_issued_on_and_every_print_is_audited(desk: dict) -> None:
    url = reverse("v1:library-card-printed", args=[desk["member"]])
    first = desk["client"].post(url).json()["data"]["card_issued_on"]
    assert first == tenant_today(desk["tenant"]).isoformat()
    desk["client"].post(url)
    assert AuditLog.objects.filter(action="library.card.printed").count() == 2


def test_a_sheet_is_capped_at_fifty(desk: dict) -> None:
    import uuid

    ids = ",".join(str(uuid.uuid4()) for _ in range(51))
    refused = desk["client"].get(reverse("v1:library-cards"), {"ids": ids})
    assert refused.json()["error"]["code"] == "too_many_ids"
    sheet = desk["client"].get(reverse("v1:library-cards"), {"ids": desk["member"]})
    assert len(sheet.json()["data"]["cards"]) == 1


# ── the overdue notice (FR-2, BR-3) ─────────────────────────────────────────


def test_the_notice_lists_the_books_and_a_return_by_seven_open_days_ahead(desk: dict) -> None:
    loan = _issue(desk["client"], desk["member"], desk["copies"][0], "i1").json()["data"]["id"]
    today = tenant_today(desk["tenant"])
    LibraryLoan.objects.filter(pk=loan).update(
        issued_on=today - dt.timedelta(days=20), due_on=today - dt.timedelta(days=4)
    )
    body = (
        desk["client"]
        .get(reverse("v1:library-overdue-notice", args=[desk["member"]]))
        .json()["data"]
    )
    assert [(row["days_late"], row["fine_so_far"]) for row in body["loans"]] == [(4, "8.00")]
    assert body["return_by"] == documents.return_by(desk["tenant"], today).isoformat()
    assert dt.date.fromisoformat(body["return_by"]) >= today + dt.timedelta(days=7)


def test_no_notice_when_nothing_is_overdue(desk: dict) -> None:
    refused = desk["client"].get(reverse("v1:library-overdue-notice", args=[desk["member"]]))
    assert refused.json()["error"]["code"] == "library_nothing_overdue"


# ── no dues (FR-3, BR-4, BR-5; T-LIB-13-2) ──────────────────────────────────


def test_no_dues_for_each_reason_and_the_clear_case(desk: dict) -> None:
    url = reverse("v1:library-no-dues", args=[desk["member"]])
    clear = desk["client"].get(url, {"issue": "1"}).json()["data"]
    today = tenant_today(desk["tenant"])
    assert clear["clear"] is True
    assert clear["reference"] == f"{'NDC-'}{clear['member']['member_number']}-{today:%Y%m%d}"
    assert AuditLog.objects.filter(action="library.no_dues.issued").count() == 1

    LibrarySettings.objects.filter(tenant=desk["tenant"]).update(overdue_issue_rule="off")
    _issue(desk["client"], desk["member"], desk["copies"][0], "i1")
    out = desk["client"].get(url, {"issue": "1"}).json()["data"]
    assert (out["clear"], out["reference"]) == (False, None)
    assert out["reasons"][0]["code"] == "books_out"
    assert out["reasons"][0]["items"][0]["title"] == "Wings of Fire"
    assert AuditLog.objects.filter(action="library.no_dues.issued").count() == 1

    loan = LibraryLoan.objects.get()
    LibraryLoan.objects.filter(pk=loan.pk).update(
        issued_on=today - dt.timedelta(days=20), due_on=today - dt.timedelta(days=3)
    )
    _return(desk["client"], desk["copies"][0], "r1")
    owed = desk["client"].get(url).json()["data"]
    assert [r["code"] for r in owed["reasons"]] == ["dues"] and owed["reasons"][0][
        "amount"
    ] == "6.00"

    _issue(desk["client"], desk["member"], desk["copies"][1], "i2")
    lost_loan = LibraryLoan.objects.get(status="open")
    desk["client"].post(reverse("v1:library-loan-lost", args=[lost_loan.id]), {}, format="json")
    lost = desk["client"].get(url).json()["data"]
    assert "lost_unpaid" in [r["code"] for r in lost["reasons"]]


def test_a_group_is_evaluated_in_one_call(desk: dict, api_as: Any) -> None:
    LibraryMembership.objects.filter(pk=desk["member"]).update(group_label="9-B")
    body = desk["client"].get(reverse("v1:library-no-dues-group"), {"group": "9-b"}).json()
    assert [m["clear"] for m in body["data"]["members"]] == [True]
    accountant, _ = api_as(desk["tenant"], role="accountant")
    assert accountant.get(reverse("v1:library-card", args=[desk["member"]])).status_code == 200
    printed = accountant.post(reverse("v1:library-card-printed", args=[desk["member"]]))
    assert printed.status_code == 403
