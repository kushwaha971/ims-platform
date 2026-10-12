"""Editing and blocking a borrower (owner, 12 Oct 2026).

"There should be also option of edit, block … for every type of user", and
"these access should be only for admin or owner, not other users". These tests
hold the three rules that request turns into:

* only the owner or an admin may edit, block or unblock — staff hold
  `lending.borrower.write` (so the counter can add a borrower with a loan) and
  are refused anyway;
* a blocked borrower is given no new loan, and money they already owe is still
  collectable — blocking never stops money coming back;
* the name and mobile are the PARTY's, changed through the parties app's own
  service, so its duplicate-mobile and archived-party rules apply here too.

Tier 1: these are a lender's books and who may change them.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.urls import reverse

from apps.common.dates import tenant_today
from apps.lending.models import LendingBorrower
from apps.lending.tests.conftest import entitle_lending
from apps.parties.models import Party
from apps.platform_app.models import AuditLog

pytestmark = pytest.mark.django_db
EVERY_DAY = 127


def _loan_body(today: dt.date, **over: Any) -> dict:
    body = {
        "plan_type": "fixed_daily",
        "principal": "4500.00",
        "frequency": "daily",
        "instalment_count": 10,
        "per_instalment_amount": "500.00",
        "collection_weekdays": EVERY_DAY,
        "disbursed_on": (today - dt.timedelta(days=4)).isoformat(),
        "first_due_on": (today - dt.timedelta(days=3)).isoformat(),
    }
    body.update(over)
    return body


def _post_loan(client: Any, today: dt.date, key: str, **over: Any) -> Any:
    return client.post(
        reverse("v1:lending-loans"),
        _loan_body(today, **over),
        format="json",
        HTTP_IDEMPOTENCY_KEY=key,
    )


def _detail_url(borrower_id: str) -> str:
    return reverse("v1:lending-borrower", args=[borrower_id])


def _block_url(borrower_id: str) -> str:
    return reverse("v1:lending-borrower-block", args=[borrower_id])


def _unblock_url(borrower_id: str) -> str:
    return reverse("v1:lending-borrower-unblock", args=[borrower_id])


@pytest.fixture
def geeta(api_as: Any, lending_on: Any) -> dict:
    """Geeta Devi with one running ₹4,500 loan, three days late."""
    client, _ = api_as(lending_on, role="owner")
    today = tenant_today(lending_on)
    made = _post_loan(client, today, "g1", party={"name": "Geeta Devi", "mobile": "+919820011223"})
    assert made.status_code == 201, made.json()
    loan = made.json()["data"]
    return {
        "client": client,
        "tenant": lending_on,
        "today": today,
        "borrower_id": loan["borrower"]["id"],
        "loan": loan,
    }


def _version(geeta: dict) -> int:
    return geeta["client"].get(_detail_url(geeta["borrower_id"])).json()["data"]["version"]


# ── who may ─────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("role", ["owner", "admin"])
def test_owner_and_admin_can_edit_block_and_unblock(geeta: dict, api_as: Any, role: str) -> None:
    """The two roles the owner named can do all three."""
    client, _ = api_as(geeta["tenant"], role=role)
    bid = geeta["borrower_id"]
    edited = client.patch(
        _detail_url(bid), {"version": _version(geeta), "area": "Camp"}, format="json"
    )
    assert edited.status_code == 200, edited.json()
    assert edited.json()["data"]["area"] == "Camp"
    blocked = client.post(_block_url(bid), {}, format="json")
    assert blocked.status_code == 200, blocked.json()
    assert blocked.json()["data"]["status"] == "blocked"
    unblocked = client.post(_unblock_url(bid), {}, format="json")
    assert unblocked.status_code == 200, unblocked.json()
    assert unblocked.json()["data"]["status"] == "active"


def test_staff_cannot_edit_block_or_unblock(geeta: dict, api_as: Any) -> None:
    """The defect this prevents: staff hold `lending.borrower.write` (to add a
    borrower at the counter), so a codename check alone would let them rename
    or block anybody. `OwnerOrAdmin` is what says no — and nothing changes."""
    staff, _ = api_as(geeta["tenant"], role="staff")
    bid = geeta["borrower_id"]
    assert (
        staff.patch(_detail_url(bid), {"version": 1, "name": "Someone"}, format="json").status_code
        == 403
    )
    assert staff.post(_block_url(bid), {}, format="json").status_code == 403
    assert staff.post(_unblock_url(bid), {}, format="json").status_code == 403
    row = LendingBorrower.objects.get(pk=bid)
    assert row.status == "active"
    assert Party.objects.get(pk=row.party_id).name == "Geeta Devi"
    # Staff still READ the borrower: the refusal is about writes only.
    assert staff.get(_detail_url(bid)).status_code == 200


def test_another_business_gets_404_for_this_borrower(
    geeta: dict, api_as: Any, other_tenant: Any
) -> None:
    """Tenant boundary: an owner elsewhere, with lending switched on, cannot
    edit, block or unblock this lender's borrower — the id does not exist there."""
    entitle_lending(other_tenant)
    stranger, _ = api_as(other_tenant, role="owner")
    bid = geeta["borrower_id"]
    assert stranger.patch(_detail_url(bid), {"version": 1}, format="json").status_code == 404
    assert stranger.post(_block_url(bid), {}, format="json").status_code == 404
    assert stranger.post(_unblock_url(bid), {}, format="json").status_code == 404
    assert LendingBorrower.objects.get(pk=bid).status == "active"


# ── blocking ────────────────────────────────────────────────────────────────


def test_a_blocked_borrower_is_refused_a_new_loan(geeta: dict) -> None:
    """The rule blocking exists for: a new loan answers 409 `borrower_blocked`,
    and no loan row is written."""
    client, bid = geeta["client"], geeta["borrower_id"]
    blocked = client.post(_block_url(bid), {"reason": "Paid late twice"}, format="json")
    data = blocked.json()["data"]
    assert (data["status"], data["blocked_reason"]) == ("blocked", "Paid late twice")
    assert data["blocked_at"]
    refused = _post_loan(client, geeta["today"], "g2", borrower_id=bid)
    assert refused.status_code == 409, refused.json()
    assert refused.json()["error"]["code"] == "borrower_blocked"
    assert LendingBorrower.objects.get(pk=bid).loans.count() == 1


def test_a_blocked_borrower_is_refused_through_their_party_too(geeta: dict) -> None:
    """Choosing the same PERSON by party id reaches the same borrower row, so it
    cannot be used to step round the block."""
    client, bid = geeta["client"], geeta["borrower_id"]
    client.post(_block_url(bid), {}, format="json")
    party_id = LendingBorrower.objects.get(pk=bid).party_id
    refused = _post_loan(client, geeta["today"], "g3", party_id=str(party_id))
    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "borrower_blocked"


def test_collections_on_a_running_loan_carry_on_while_blocked(geeta: dict) -> None:
    """The defect this prevents: a block that stops money coming BACK. A lender
    blocks a late payer to stop lending, not to stop collecting."""
    client, bid = geeta["client"], geeta["borrower_id"]
    client.post(_block_url(bid), {}, format="json")
    paid = client.post(
        reverse("v1:lending-collections", args=[geeta["loan"]["id"]]),
        {"amount": "500.00", "mode": "cash"},
        format="json",
        HTTP_IDEMPOTENCY_KEY="c1",
    )
    assert paid.status_code == 201, paid.json()
    split = client.post(
        reverse("v1:lending-borrower-collection-preview", args=[bid]),
        {"amount": "500.00"},
        format="json",
    )
    assert split.status_code == 200, split.json()


def test_unblocking_lets_a_new_loan_through(geeta: dict) -> None:
    """Blocking is reversible: once unblocked, the next loan is written, and the
    reason and time are cleared from the row (the audit keeps the history)."""
    client, bid = geeta["client"], geeta["borrower_id"]
    client.post(_block_url(bid), {"reason": "Paid late"}, format="json")
    cleared = client.post(_unblock_url(bid), {}, format="json").json()["data"]
    assert (cleared["status"], cleared["blocked_reason"], cleared["blocked_at"]) == (
        "active",
        "",
        None,
    )
    made = _post_loan(client, geeta["today"], "g4", borrower_id=bid)
    assert made.status_code == 201, made.json()
    assert LendingBorrower.objects.get(pk=bid).loans.count() == 2


def test_block_and_unblock_are_audited_once(geeta: dict) -> None:
    """One audit row per decision; a second Block on somebody already blocked is
    a double tap, not a second decision, and writes nothing."""
    client, bid = geeta["client"], geeta["borrower_id"]
    client.post(_block_url(bid), {"reason": "Moved away"}, format="json")
    client.post(_block_url(bid), {"reason": "Again"}, format="json")
    client.post(_unblock_url(bid), {}, format="json")
    rows = AuditLog.objects.filter(entity_type="lending_borrower", entity_id=bid)
    assert sorted(rows.values_list("action", flat=True)) == [
        "lending.borrower.blocked",
        "lending.borrower.unblocked",
    ]
    blocked = rows.get(action="lending.borrower.blocked")
    assert blocked.after == {"status": "blocked", "reason": "Moved away"}
    assert LendingBorrower.objects.get(pk=bid).blocked_reason == ""


def test_a_reason_longer_than_the_column_is_a_field_error(geeta: dict) -> None:
    """A 400 on `reason`, not a database error."""
    response = geeta["client"].post(
        _block_url(geeta["borrower_id"]), {"reason": "x" * 161}, format="json"
    )
    assert response.status_code == 400
    assert LendingBorrower.objects.get(pk=geeta["borrower_id"]).status == "active"


# ── the list ────────────────────────────────────────────────────────────────


def test_the_list_shows_everybody_by_default_and_filters_by_status(
    geeta: dict, api_as: Any
) -> None:
    """Absent `status` is everybody — a blocked borrower who still owes is
    somebody the lender is looking for; `active` is what the new-loan picker asks."""
    client, bid = geeta["client"], geeta["borrower_id"]
    other = _post_loan(client, geeta["today"], "r1", party={"name": "Ramesh Kumar"})
    assert other.status_code == 201
    client.post(_block_url(bid), {}, format="json")
    url = reverse("v1:lending-borrowers")

    def names(params: dict) -> list[str]:
        return sorted(r["name"] for r in client.get(url, params).json()["data"])

    assert names({}) == ["Geeta Devi", "Ramesh Kumar"]
    assert names({"status": "all"}) == ["Geeta Devi", "Ramesh Kumar"]
    assert names({"status": "blocked"}) == ["Geeta Devi"]
    assert names({"status": "active"}) == ["Ramesh Kumar"]
    assert client.get(url, {"status": "gone"}).status_code == 400
    row = next(r for r in client.get(url).json()["data"] if r["id"] == bid)
    assert row["status"] == "blocked"


# ── editing ─────────────────────────────────────────────────────────────────


def test_edit_changes_the_party_name_and_mobile(geeta: dict) -> None:
    """Name and mobile live on the party, so the khata and every loan read the
    new ones — and the party's own audit row records the change."""
    client, bid = geeta["client"], geeta["borrower_id"]
    response = client.patch(
        _detail_url(bid),
        {
            "version": _version(geeta),
            "name": "Geeta Devi Sharma",
            "mobile": "+919811122233",
            "area": "Station road",
            "notes": "Shop behind the temple",
        },
        format="json",
    )
    assert response.status_code == 200, response.json()
    data = response.json()["data"]
    assert (data["name"], data["mobile"], data["area"], data["notes"]) == (
        "Geeta Devi Sharma",
        "+919811122233",
        "Station road",
        "Shop behind the temple",
    )
    party = Party.objects.get(pk=data["party_id"])
    assert (party.name, party.mobile) == ("Geeta Devi Sharma", "+919811122233")
    loan = client.get(reverse("v1:lending-loan", args=[geeta["loan"]["id"]])).json()["data"]
    assert loan["borrower"]["name"] == "Geeta Devi Sharma"
    assert AuditLog.objects.filter(action="party.updated", entity_id=party.id).exists()
    assert AuditLog.objects.filter(action="lending.borrower.updated", entity_id=bid).exists()


def test_edit_can_clear_the_mobile(geeta: dict) -> None:
    """A blank mobile removes it (stored NULL): an empty string would be a value
    to the unique index, and two people with no number would collide."""
    client, bid = geeta["client"], geeta["borrower_id"]
    response = client.patch(
        _detail_url(bid), {"version": _version(geeta), "mobile": ""}, format="json"
    )
    assert response.status_code == 200, response.json()
    assert response.json()["data"]["mobile"] is None


def test_edit_refuses_a_mobile_another_party_holds(geeta: dict) -> None:
    """The parties service's duplicate rule applies here too, on `mobile`."""
    client, bid = geeta["client"], geeta["borrower_id"]
    _post_loan(client, geeta["today"], "r2", party={"name": "Ramesh", "mobile": "+919900000001"})
    response = client.patch(
        _detail_url(bid), {"version": _version(geeta), "mobile": "+919900000001"}, format="json"
    )
    assert response.status_code == 400
    assert "mobile" in response.json()["error"]["details"]
    assert Party.objects.get(name="Geeta Devi").mobile == "+919820011223"


def test_edit_refuses_a_stale_version_and_a_missing_one(geeta: dict) -> None:
    """Two people editing one borrower must not silently undo each other."""
    client, bid = geeta["client"], geeta["borrower_id"]
    current = _version(geeta)
    first = client.patch(_detail_url(bid), {"version": current, "area": "A"}, format="json")
    assert first.status_code == 200
    stale = client.patch(_detail_url(bid), {"version": current, "area": "B"}, format="json")
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "stale_version"
    missing = client.patch(_detail_url(bid), {"area": "C"}, format="json")
    assert missing.status_code == 400
    assert LendingBorrower.objects.get(pk=bid).area == "A"


def test_edit_refuses_a_name_too_short_and_writes_nothing(geeta: dict) -> None:
    """The parties app's name rule, unchanged by coming through lending — and
    the area sent alongside it is not saved by itself (one transaction)."""
    client, bid = geeta["client"], geeta["borrower_id"]
    response = client.patch(
        _detail_url(bid),
        {"version": _version(geeta), "name": "G", "area": "Somewhere"},
        format="json",
    )
    assert response.status_code == 400
    assert LendingBorrower.objects.get(pk=bid).area == ""
    assert Party.objects.get(name="Geeta Devi")
