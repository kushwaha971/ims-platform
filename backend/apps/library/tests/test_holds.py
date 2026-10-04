"""B11 — holds: place, allot on return, collect, renew, cancel, expire (LIB-08; T-LIB-08-1…6)."""

from __future__ import annotations

import datetime as dt
from io import StringIO
from typing import Any

import pytest
from django.core.management import call_command
from django.urls import reverse

from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.library.models import LibraryCopy, LibraryHold, LibraryMembership
from apps.library.services.holds import collect_by_for
from apps.library.tests.counter import _issue, _return
from apps.platform_app.models import ClosedDay
from apps.platform_app.services.calendar import set_closed_weekdays
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db


def _member(desk: dict, key: str) -> str:
    return (
        desk["client"]
        .post(
            reverse("v1:library-members"),
            {
                "membership_type_id": str(desk["kind"].id),
                "party_id": str(PartyFactory(tenant=desk["tenant"]).id),
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY=key,
        )
        .json()["data"]["membership_id"]
    )


def _hold(desk: dict, member: str, key: str, **extra: Any) -> Any:
    return desk["client"].post(
        reverse("v1:library-holds"),
        {"membership_id": member, "title_id": desk["title_id"], **extra},
        format="json",
        HTTP_IDEMPOTENCY_KEY=key,
    )


def _all_out(desk: dict) -> None:
    """Lend all three copies (the desk member twice, a third member once)."""
    _issue(desk["client"], desk["member"], desk["copies"][0], "o1")
    _issue(desk["client"], desk["member"], desk["copies"][1], "o2")
    _issue(desk["client"], _member(desk, "m-out"), desk["copies"][2], "o3")


def _copy(desk: dict, index: int) -> LibraryCopy:
    return LibraryCopy.objects.get(accession_number=desk["copies"][index])


# ── place (BR-1; T-LIB-08-6) ────────────────────────────────────────────────


def test_each_refusal_reason(desk: dict) -> None:
    other = _member(desk, "m1")
    assert _hold(desk, other, "h1").status_code == 201
    assert _hold(desk, other, "h2").json()["error"]["details"]["reason"] == "already_holding"
    _issue(desk["client"], desk["member"], desk["copies"][0], "i1")
    assert (
        _hold(desk, desk["member"], "h3").json()["error"]["details"]["reason"] == "already_on_loan"
    )
    LibraryMembership.objects.filter(pk=other).update(
        starts_on=dt.date(2025, 1, 1), valid_until=dt.date(2025, 6, 30)
    )
    third = _member(desk, "m3")
    LibraryMembership.objects.filter(pk=third).update(status="suspended")
    assert _hold(desk, third, "h4").json()["error"]["details"]["reason"] == "membership_inactive"


# ── allot on return (FR-3, BR-2; T-LIB-08-1, -2) ────────────────────────────


def test_a_return_goes_to_the_first_active_member_in_line(desk: dict) -> None:
    """T-LIB-08-1 — the first in line has expired: skipped, keeping position 1; the second
    gets the copy, kept aside until the pickup date."""
    _all_out(desk)
    first, second = _member(desk, "m1"), _member(desk, "m2")
    _hold(desk, first, "h1")
    _hold(desk, second, "h2")
    LibraryMembership.objects.filter(pk=first).update(
        starts_on=dt.date(2025, 1, 1), valid_until=dt.date(2025, 6, 30)
    )
    returned = _return(desk["client"], desk["copies"][0], "r1").json()
    assert returned["meta"]["copy_status"] == "on_hold_shelf"
    assert returned["meta"]["hold_ready"]["membership"]["id"] == second
    assert LibraryHold.objects.get(membership_id=first).status == "waiting"
    assert _copy(desk, 0).status == "on_hold_shelf"


def test_a_copy_specific_hold_comes_first_for_that_copy_only(desk: dict) -> None:
    """T-LIB-08-2 — a member waiting for volume 2 is served by volume 2, not by volume 1."""
    _all_out(desk)
    general, specific = _member(desk, "m1"), _member(desk, "m2")
    _hold(desk, general, "h1")
    _hold(desk, specific, "h2", copy_id=str(_copy(desk, 1).id))
    first = _return(desk["client"], desk["copies"][0], "r1").json()["meta"]["hold_ready"]
    assert first["membership"]["id"] == general
    second = _return(desk["client"], desk["copies"][1], "r2").json()["meta"]["hold_ready"]
    assert second["membership"]["id"] == specific


# ── collect (FR-5; T-LIB-06-2, EC-3) ────────────────────────────────────────


def test_a_kept_aside_copy_is_lent_only_to_its_member(desk: dict) -> None:
    _all_out(desk)
    waiting = _member(desk, "m1")
    _hold(desk, waiting, "h1")
    _return(desk["client"], desk["copies"][0], "r1")
    stranger = _member(desk, "m2")
    refused = _issue(desk["client"], stranger, desk["copies"][0], "i9")
    assert refused.json()["error"]["details"]["held_for"]["member_number"]
    issued = _issue(desk["client"], waiting, desk["copies"][0], "i10")
    assert issued.status_code == 201, issued.content
    hold = LibraryHold.objects.get(membership_id=waiting)
    assert (hold.status, str(hold.loan_id)) == ("collected", issued.json()["data"]["id"])


def test_borrowing_another_copy_collects_the_hold_by_proxy(desk: dict) -> None:
    """EC-3 — a member waiting for the title who is handed any copy has what they wanted."""
    other = _member(desk, "m1")
    _issue(desk["client"], desk["member"], desk["copies"][0], "i1")
    _hold(desk, other, "h1")
    _issue(desk["client"], other, desk["copies"][1], "i2")
    hold = LibraryHold.objects.get(membership_id=other)
    assert (hold.status, hold.close_reason) == ("collected", "Borrowed another copy")


# ── renew (BR-6) ────────────────────────────────────────────────────────────


def test_a_waiting_hold_refuses_a_renewal_when_nothing_is_on_the_shelf(desk: dict) -> None:
    from apps.library.models import LibraryLoan

    loan_id = _issue(desk["client"], desk["member"], desk["copies"][0], "i1").json()["data"]["id"]
    today = tenant_today(desk["tenant"])
    # Issued ten days ago, so a renewal today gains time (BR-4 refuses one that does not).
    LibraryLoan.objects.filter(pk=loan_id).update(
        issued_on=today - dt.timedelta(days=10), due_on=today + dt.timedelta(days=4)
    )
    url = reverse("v1:library-loan-renew", args=[loan_id])
    _hold(desk, _member(desk, "m1"), "h1")
    # Two copies are still on the shelf: the hold can be served from them.
    assert desk["client"].post(url, {}, format="json", HTTP_IDEMPOTENCY_KEY="n1").status_code == 200
    _issue(desk["client"], desk["member"], desk["copies"][1], "i2")
    _issue(desk["client"], _member(desk, "m2"), desk["copies"][2], "i3")
    refused = desk["client"].post(url, {}, format="json", HTTP_IDEMPOTENCY_KEY="n2")
    assert refused.json()["error"]["details"]["reason"] == "hold_waiting"


# ── cancel, undo, withdraw, close ───────────────────────────────────────────


def test_cancelling_a_ready_hold_passes_the_copy_on(desk: dict) -> None:
    """BR-5."""
    _all_out(desk)
    first, second = _member(desk, "m1"), _member(desk, "m2")
    _hold(desk, first, "h1")
    _hold(desk, second, "h2")
    _return(desk["client"], desk["copies"][0], "r1")
    ready = LibraryHold.objects.get(membership_id=first)
    cancelled = (
        desk["client"]
        .post(
            reverse("v1:library-hold-cancel", args=[ready.id]),
            {"reason": "Not needed"},
            format="json",
        )
        .json()
    )
    assert cancelled["meta"]["next_ready"]["membership"]["id"] == second


def test_undoing_an_issue_puts_the_hold_back_as_it_was(desk: dict) -> None:
    """LIB-06 BR-4 — the copy returns to the hold shelf and the hold is ready again."""
    _all_out(desk)
    waiting = _member(desk, "m1")
    _hold(desk, waiting, "h1")
    _return(desk["client"], desk["copies"][0], "r1")
    loan_id = _issue(desk["client"], waiting, desk["copies"][0], "i9").json()["data"]["id"]
    desk["client"].post(
        reverse("v1:library-loan-cancel", args=[loan_id]), {"reason": "Wrong book"}, format="json"
    )
    assert LibraryHold.objects.get(membership_id=waiting).status == "ready"
    assert _copy(desk, 0).status == "on_hold_shelf"


def test_the_last_copy_withdrawn_cancels_every_waiting_hold(desk: dict) -> None:
    """BR-7, FR-9 — "No copies left"."""
    _hold(desk, _member(desk, "m1"), "h1")
    for index in range(3):
        desk["client"].post(
            reverse("v1:library-copy-withdraw", args=[_copy(desk, index).id]),
            {"reason_code": "worn_out"},
            format="json",
        )
    hold = LibraryHold.objects.get()
    assert (hold.status, hold.close_reason) == ("cancelled", "No copies left")


def test_closing_a_membership_cancels_its_holds(desk: dict) -> None:
    """LIB-04 BR-6, LIB-08 EC-6."""
    other = _member(desk, "m1")
    _hold(desk, other, "h1")
    desk["client"].post(
        reverse("v1:library-member-close", args=[other]),
        {"reason": "Left town"},
        format="json",
        HTTP_IDEMPOTENCY_KEY="c1",
    )
    assert LibraryHold.objects.get(membership_id=other).status == "cancelled"


# ── expiry (FR-6, BR-3, BR-4; T-LIB-08-3, -5) ───────────────────────────────


def test_expiry_runs_once_per_day_and_passes_the_copy_on(desk: dict) -> None:
    _all_out(desk)
    first, second = _member(desk, "m1"), _member(desk, "m2")
    _hold(desk, first, "h1")
    _hold(desk, second, "h2")
    _return(desk["client"], desk["copies"][0], "r1")
    ready = LibraryHold.objects.get(membership_id=first)
    after = (ready.collect_by + dt.timedelta(days=1)).isoformat()
    tenant = str(desk["tenant"].id)
    first_run, second_run = StringIO(), StringIO()
    call_command("library_expire_holds", f"--tenant={tenant}", f"--date={after}", stdout=first_run)
    call_command("library_expire_holds", f"--tenant={tenant}", f"--date={after}", stdout=second_run)
    assert '"expired": 1' in first_run.getvalue() and '"expired": 0' in second_run.getvalue()
    assert LibraryHold.objects.get(membership_id=first).status == "expired"
    assert LibraryHold.objects.get(membership_id=second).status == "ready"


def test_the_pickup_date_counts_open_days_only(library_on: Any) -> None:
    """T-LIB-08-3 — three open days after Fri 6 Nov, with Sundays and Diwali (8–10 Nov) shut:
    Sat 7, Wed 11, Thu 12."""
    set_closed_weekdays(ctx=Ctx.system(library_on), value=[], modules={"library": [6]})
    for day in (8, 9, 10):
        ClosedDay.objects.create(
            tenant=library_on, date=dt.date(2026, 11, day), reason="Diwali", module="library"
        )
    assert collect_by_for(library_on, dt.date(2026, 11, 6), 3) == dt.date(2026, 11, 12)
    assert tenant_today(library_on) is not None
