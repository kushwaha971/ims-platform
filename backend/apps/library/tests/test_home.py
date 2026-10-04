"""B14 — the library's day on the dashboard and the library home (LIB-11; T-LIB-11-1…3)."""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse

from apps.common.dates import tenant_today
from apps.library.models import LibraryHold, LibraryLoan, LibraryMembership, LibrarySettings
from apps.library.selectors.home import library_dashboard
from apps.library.tests.counter import _issue, _return
from apps.platform_app.models import Membership

pytestmark = pytest.mark.django_db


def _member(desk: dict) -> str:
    from tests.factories.parties import PartyFactory

    return (
        desk["client"]
        .post(
            reverse("v1:library-members"),
            {
                "membership_type_id": str(desk["kind"].id),
                "party_id": str(PartyFactory(tenant=desk["tenant"]).id),
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY="m-other",
        )
        .json()["data"]["membership_id"]
    )


def test_each_figure_counts_what_it_says(desk: dict) -> None:
    """T-LIB-11-1 — a cancelled issue today is not counted; overdue counts loans and members."""
    LibrarySettings.objects.filter(tenant=desk["tenant"]).update(overdue_issue_rule="off")
    today = tenant_today(desk["tenant"])
    late = _issue(desk["client"], desk["member"], desk["copies"][0], "i1").json()["data"]["id"]
    LibraryLoan.objects.filter(pk=late).update(
        issued_on=today - dt.timedelta(days=20), due_on=today - dt.timedelta(days=3)
    )
    _issue(desk["client"], desk["member"], desk["copies"][1], "i2")
    other = _member(desk)
    cancelled = _issue(desk["client"], other, desk["copies"][2], "i3")
    desk["client"].post(
        reverse("v1:library-loan-cancel", args=[cancelled.json()["data"]["id"]]),
        {"reason": "Wrong book"},
        format="json",
    )
    _issue(desk["client"], other, desk["copies"][2], "i4")
    _return(desk["client"], desk["copies"][2], "r1")
    LibraryMembership.objects.filter(pk=desk["member"]).update(
        valid_until=today + dt.timedelta(days=5)
    )
    data = library_dashboard(desk["tenant"], today)
    assert data["today"] == {"issued": 2, "returned": 1, "renewed": 0}
    assert (data["out_now"], data["overdue"]) == (2, {"loans": 1, "members": 1})
    assert data["memberships"] == {"expiring_7d": 1, "expired_holding": 0}
    assert data["holds"] == {"ready": 0, "expiring_today": 0}
    assert LibraryHold.objects.count() == 0
    LibraryMembership.objects.filter(pk=desk["member"]).update(
        starts_on=today - dt.timedelta(days=60), valid_until=today - dt.timedelta(days=1)
    )
    expired = library_dashboard(desk["tenant"], today)["memberships"]
    assert expired == {"expiring_7d": 0, "expired_holding": 1}


def test_the_section_is_one_query(desk: dict) -> None:
    """T-LIB-11-3 — inside the core section budget (three) and BR-4's six."""
    with CaptureQueriesContext(connection) as queries:
        library_dashboard(desk["tenant"], tenant_today(desk["tenant"]))
    assert len(queries) == 1


def test_without_member_read_the_money_key_is_absent(desk: dict, api_as: Any) -> None:
    """T-LIB-11-2 — absent, not zeroed; on the home and on the core dashboard alike."""
    accountant, membership = api_as(desk["tenant"], role="accountant")
    assert "money" in accountant.get(reverse("v1:library-home")).json()["data"]
    Membership.objects.filter(pk=membership.pk).update(
        permissions_override={"deny": ["library.member.read"]}
    )
    home = accountant.get(reverse("v1:library-home")).json()["data"]
    assert "money" not in home and home["out_now"] == 0
    assert [a["key"] for a in home["quick_actions"]] == []
    sections = accountant.get(reverse("v1:report-dashboard")).json()["data"]["sections"]
    library = next(s for s in sections if s["key"] == "library.today")
    assert "money" not in library["data"]


def test_the_home_lists_overdue_by_group_and_the_owners_actions(desk: dict) -> None:
    LibraryMembership.objects.filter(pk=desk["member"]).update(group_label="9-B")
    loan = _issue(desk["client"], desk["member"], desk["copies"][0], "i1").json()["data"]["id"]
    today = tenant_today(desk["tenant"])
    LibraryLoan.objects.filter(pk=loan).update(
        issued_on=today - dt.timedelta(days=20), due_on=today - dt.timedelta(days=2)
    )
    home = desk["client"].get(reverse("v1:library-home")).json()["data"]
    assert home["overdue_by_group"] == [{"group_label": "9-B", "loans": 1, "members": 1}]
    assert [a["key"] for a in home["quick_actions"]] == [
        "counter",
        "add_book",
        "add_member",
        "stock_check",
    ]
    assert home["money"] == {"open_charges": "0.00", "deposits_held": "0.00"}
