"""B15 — the eight library reports (LIB-12; T-LIB-12-1…4)."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest
from django.db.models import Sum
from django.urls import reverse

from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.ledger.models import LedgerEntry
from apps.library.models import LibraryCharge, LibraryCopy, LibraryLoan, LibrarySettings
from apps.library.selectors import reports as rp
from apps.library.services import codes
from apps.library.tests.counter import _issue, _return

pytestmark = pytest.mark.django_db
D = Decimal


def _get(desk: dict, name: str, **params: Any) -> Any:
    return desk["client"].get(reverse("v1:library-report", args=[name]), params)


def _late_return(desk: dict, index: int, days: int, key: str) -> str:
    LibrarySettings.objects.filter(tenant=desk["tenant"]).update(overdue_issue_rule="off")
    loan_id = _issue(desk["client"], desk["member"], desk["copies"][index], f"i{key}").json()[
        "data"
    ]["id"]
    today = tenant_today(desk["tenant"])
    LibraryLoan.objects.filter(pk=loan_id).update(
        issued_on=today - dt.timedelta(days=days + 14), due_on=today - dt.timedelta(days=days)
    )
    _return(desk["client"], desk["copies"][index], f"r{key}")
    return loan_id


def test_every_report_answers_and_is_listed_in_the_core_hub(desk: dict) -> None:
    today = tenant_today(desk["tenant"]).isoformat()
    params = {
        "circulation": {"from": today, "to": today},
        "fines_fees": {"from": today, "to": today},
        "verification": None,
    }
    for name in rp.REPORTS:
        if params.get(name, {}) is None:
            continue
        response = _get(desk, name, **params.get(name, {}))
        assert response.status_code == 200, (name, response.content)
        assert {"columns", "rows", "totals"} <= set(response.json()["data"])
    listed = desk["client"].get(reverse("v1:report-list")).json()["data"]
    assert {r["key"] for r in listed} >= {f"library.{name}" for name in rp.REPORTS}


def test_the_accession_register_orders_suffixed_numbers_naturally(desk: dict) -> None:
    """T-LIB-12-2 — 9, 9-A, 10: not "10" before "9"."""
    title = LibraryCopy.objects.first().title
    for number in ("10", "9-A", "9"):
        LibraryCopy.objects.create(
            tenant=desk["tenant"],
            title=title,
            accession_number=number,
            accession_sort=codes.natural_sort_key(number),
        )
    rows = _get(desk, "accession_register", range_from="3", range_to="10").json()["data"]["rows"]
    assert [r["accession_number"] for r in rows] == ["3", "9", "9-A", "10"]


def test_circulation_needs_a_period_and_leaves_out_cancelled_issues(desk: dict) -> None:
    """T-LIB-12-1, BR-1."""
    assert _get(desk, "circulation").status_code == 400
    today = tenant_today(desk["tenant"])
    long = _get(desk, "circulation", **{"from": "2025-01-01", "to": today.isoformat()})
    assert long.status_code == 400
    kept = _issue(desk["client"], desk["member"], desk["copies"][0], "i1").json()["data"]["id"]
    undone = _issue(desk["client"], desk["member"], desk["copies"][1], "i2").json()["data"]["id"]
    desk["client"].post(
        reverse("v1:library-loan-cancel", args=[undone]), {"reason": "Wrong book"}, format="json"
    )
    body = _get(desk, "circulation", **{"from": today.isoformat(), "to": today.isoformat()})
    assert body.json()["meta"]["count"] == 1
    assert body.json()["data"]["totals"]["loans"] == 1
    assert kept


def test_fines_and_fees_reconcile_with_the_ledger(desk: dict) -> None:
    """T-LIB-12-4 — charged − waived − refunded = Σ ledger lines of the two sources; and
    charged − collected − waived = open."""
    from apps.payments.services.record import record_payment

    _late_return(desk, 0, 5, "a")  # ₹10
    _late_return(desk, 1, 3, "b")  # ₹6
    first, second = LibraryCharge.objects.order_by("charge_date", "number")
    desk["client"].post(
        reverse("v1:library-charge-waive", args=[first.id]),
        {"amount": "4.00", "reason": "First time late"},
        format="json",
    )
    record_payment(
        ctx=Ctx.system(desk["tenant"]),
        payload={
            "direction": "in",
            "party_id": str(second.party_id),
            "mode_breakup": [{"mode": "cash", "amount": "6.00"}],
            "allocations": [
                {"document_type": "library_charge", "document_id": str(second.id), "amount": "6.00"}
            ],
        },
    )
    today = tenant_today(desk["tenant"]).isoformat()
    totals = _get(desk, "fines_fees", **{"from": today, "to": today}).json()["data"]["totals"]
    charged, collected = D(totals["charged"]), D(totals["collected"])
    waived, refunded, open_ = D(totals["waived"]), D(totals["refunded"]), D(totals["open"])
    assert (charged, collected, waived, open_) == (D("16"), D("6"), D("4"), D("6"))
    assert charged - collected - waived == open_
    lines = LedgerEntry.objects.filter(
        tenant=desk["tenant"], source_type__in=["library_charge", "library_waiver"]
    )
    debit = lines.filter(direction="debit").aggregate(s=Sum("amount"))["s"] or D(0)
    credit = lines.filter(direction="credit").aggregate(s=Sum("amount"))["s"] or D(0)
    assert charged - waived - refunded == debit - credit


def test_the_overdue_report_as_of_a_past_day(desk: dict) -> None:
    """A book returned yesterday was still overdue the day before."""
    _late_return(desk, 0, 5, "a")
    today = tenant_today(desk["tenant"])
    LibraryLoan.objects.update(returned_on=today - dt.timedelta(days=1))
    earlier = (today - dt.timedelta(days=2)).isoformat()
    rows = _get(desk, "overdue", as_of=earlier).json()["data"]["rows"]
    assert [(r["days_late"], r["fine_so_far"]) for r in rows] == [(3, "6.00")]
    assert _get(desk, "overdue").json()["data"]["rows"] == []


def test_stock_counts_copies_without_a_price_instead_of_valuing_them_at_zero(desk: dict) -> None:
    """BR-5."""
    LibraryCopy.objects.filter(accession_number="3").update(price=None)
    totals = _get(desk, "stock_summary").json()["data"]["totals"]
    assert (totals["copies"], totals["value"], totals["unpriced"]) == (3, "500.00", 1)


def test_no_dues_names_who_is_not_clear(desk: dict) -> None:
    _issue(desk["client"], desk["member"], desk["copies"][0], "i1")
    rows = _get(desk, "no_dues").json()["data"]["rows"]
    assert [(r["status"], r["books_out"]) for r in rows] == [("not_clear", 1)]
    assert _get(desk, "no_dues", status="clear").json()["data"]["rows"] == []


def test_the_csv_has_a_bom_and_indian_dates(desk: dict) -> None:
    """T-LIB-12-3."""
    LibraryCopy.objects.filter(accession_number="1").update(acquired_on=dt.date(2026, 4, 1))
    response = _get(desk, "accession_register", format="csv")
    assert response.status_code == 200
    body = b"".join(response.streaming_content).decode("utf-8")
    assert body.startswith("﻿accession_number,")
    assert "01/04/2026" in body


def test_a_print_above_two_thousand_rows_is_refused(desk: dict, monkeypatch: Any) -> None:
    monkeypatch.setattr(rp, "PRINT_MAX", 2)
    refused = desk["client"].get(reverse("v1:library-report-print", args=["accession_register"]))
    assert refused.json()["error"]["code"] == "library_print_too_large"
    assert refused.json()["error"]["details"]["count"] == 3


def test_staff_may_not_read_the_reports(desk: dict, api_as: Any) -> None:
    staff, _ = api_as(desk["tenant"], role="staff")
    assert staff.get(reverse("v1:library-report", args=["stock_summary"])).status_code == 403
