"""Editing, archiving and restoring a party is the owner's or an admin's act.

Owner, 12 Oct 2026: "these access should be only for admin or owner, not other
users." The codename (`parties.party.write` / `.delete`) still has to pass; on
top of it `PartyManagerActions` checks the actor's ROLE, so a custom role that
was ticked every party codename is refused exactly like staff. What the counter
keeps doing — adding a customer, setting the promise date — is pinned here too,
because a rule that locked those away would be a regression nobody asked for.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.parties.models import Party
from tests.factories.parties import PartyFactory
from tests.factories.platform import MembershipFactory, RoleFactory, UserFactory
from tests.fixtures import build_access_token

pytestmark = pytest.mark.django_db

DETAIL = "v1:party-detail"
EVERY_PARTY_CODENAME = [
    "parties.party.read",
    "parties.party.write",
    "parties.party.delete",
    "parties.party.export",
]


def _custom_client(tenant: Any) -> APIClient:
    """A tenant role that holds EVERY party codename and is not owner or admin."""
    role = RoleFactory(
        tenant=tenant,
        code="senior_cashier",
        name="Senior cashier",
        is_system=False,
        permissions=EVERY_PARTY_CODENAME,
    )
    member = MembershipFactory(user=UserFactory(), tenant=tenant, role=role)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {build_access_token(member)}")
    return client


def _client(tenant: Any, api_as: Any, who: str) -> APIClient:
    if who == "custom":
        return _custom_client(tenant)
    client, member = api_as(tenant, role=who)
    if who == "staff":
        # Granted the delete codename too, so the refusal below is the ROLE's and
        # not merely the codename's.
        member.permissions_override = {"allow": ["parties.party.delete"], "deny": []}
        member.save(update_fields=["permissions_override"])
    return client


def _archive(client: APIClient, party: Party, key: str = "a1") -> Any:
    return client.post(
        reverse("v1:party-archive", args=[party.id]),
        {"reason": "Closed shop"},
        format="json",
        HTTP_IDEMPOTENCY_KEY=key,
    )


# ── Refused for anybody below admin ────────────────────────────────────────


@pytest.mark.parametrize("who", ["staff", "custom"])
@pytest.mark.parametrize(
    "body",
    [
        {"name": "Renamed"},
        {"mobile": "9876500000"},
        {"is_supplier": True},
        {"gstin": "27AAAPL1234C1Z5"},
        {"credit_limit": "5000.00"},
        {"notes": "Pays late"},
        # A mixed body is refused whole: applying the date and dropping the name
        # would answer "saved" about a change that never happened.
        {"collection_date": "2026-10-20", "name": "Renamed"},
    ],
)
def test_a_non_manager_cannot_edit_a_party(tenant: Any, api_as: Any, who: str, body: dict) -> None:
    """Prevents staff, or a custom role ticked every party codename, from
    editing who a customer is through `PATCH /parties/{id}`."""
    party = PartyFactory(tenant=tenant, name="Ramesh Traders")
    response = _client(tenant, api_as, who).patch(
        reverse(DETAIL, args=[party.id]), body, format="json"
    )
    assert response.status_code == 403, response.content
    party.refresh_from_db()
    assert party.name == "Ramesh Traders"


@pytest.mark.parametrize("who", ["staff", "custom"])
def test_a_non_manager_cannot_archive_restore_or_bulk_archive(
    tenant: Any, api_as: Any, who: str
) -> None:
    """Prevents a role holding `parties.party.delete` from filing a party away
    or bringing one back — the codename alone is no longer enough."""
    client = _client(tenant, api_as, who)
    active = PartyFactory(tenant=tenant)
    archived = PartyFactory(tenant=tenant, status="archived")

    assert _archive(client, active).status_code == 403
    assert (
        client.post(reverse("v1:party-restore", args=[archived.id]), format="json").status_code
        == 403
    )
    bulk = client.post(
        reverse("v1:party-bulk-archive"),
        {"ids": [str(active.id)]},
        format="json",
        HTTP_IDEMPOTENCY_KEY="b1",
    )
    assert bulk.status_code == 403
    active.refresh_from_db()
    archived.refresh_from_db()
    assert (active.status, archived.status) == ("active", "archived")


# ── Allowed for the owner and an admin ─────────────────────────────────────


@pytest.mark.parametrize("who", ["owner", "admin"])
def test_the_owner_and_an_admin_edit_archive_and_restore(
    tenant: Any, api_as: Any, who: str
) -> None:
    client, _ = api_as(tenant, role=who)
    party = PartyFactory(tenant=tenant)
    edited = client.patch(reverse(DETAIL, args=[party.id]), {"name": "Edited"}, format="json")
    assert edited.status_code == 200, edited.content
    assert _archive(client, party).status_code == 200
    restored = client.post(reverse("v1:party-restore", args=[party.id]), format="json")
    assert restored.status_code == 200, restored.content
    other = PartyFactory(tenant=tenant)
    bulk = client.post(
        reverse("v1:party-bulk-archive"),
        {"ids": [str(other.id)]},
        format="json",
        HTTP_IDEMPOTENCY_KEY="b1",
    )
    assert bulk.status_code == 200, bulk.content
    assert bulk.json()["meta"]["archived_count"] == 1


# ── What the counter keeps ─────────────────────────────────────────────────


def test_staff_still_set_and_clear_the_promise_date(tenant: Any, api_as: Any) -> None:
    """The khata page's promise date is not "editing the person": it is what a
    customer said at the counter today. It goes through the same PATCH, so the
    split is by body — this pins that a date-only PATCH still works for staff."""
    client, _ = api_as(tenant, role="staff")
    party = PartyFactory(tenant=tenant, balance="500.00")  # a promise needs money owed
    url = reverse(DETAIL, args=[party.id])
    set_ = client.patch(url, {"collection_date": "2026-10-20"}, format="json")
    assert set_.status_code == 200, set_.content
    assert set_.json()["data"]["collection_date"] == "2026-10-20"
    cleared = client.patch(url, {"collection_date": None}, format="json")
    assert cleared.status_code == 200
    party.refresh_from_db()
    assert party.collection_date is None


def test_staff_still_add_a_customer_at_the_counter(tenant: Any, api_as: Any) -> None:
    client, _ = api_as(tenant, role="staff")
    created = client.post(
        reverse("v1:party-list"),
        {"name": "Walk-in Sunita"},
        format="json",
        HTTP_IDEMPOTENCY_KEY="c1",
    )
    assert created.status_code == 201, created.content


def test_an_accountant_is_still_refused_by_the_codename(tenant: Any, api_as: Any) -> None:
    """The role check is in ADDITION to the codename: an accountant, who holds
    no write codename, is refused even the promise date, as before."""
    client, _ = api_as(tenant, role="accountant")
    party = PartyFactory(tenant=tenant)
    response = client.patch(
        reverse(DETAIL, args=[party.id]), {"collection_date": "2026-10-20"}, format="json"
    )
    assert response.status_code == 403
