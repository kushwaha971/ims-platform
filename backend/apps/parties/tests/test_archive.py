"""PTY-04 — archiving and restoring a party.

The balance guard is the rule this feature exists for, and it is the one that
cannot be exercised through the running product today: nothing writes a
`balance`, because the `ledger` app has no tables. So these tests set it
directly, which is the only place in the suite that does — and it is the right
place, because the guard is about a column's value and not about how it got
there.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.parties.models import Party
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db


def archive_url(party: Any) -> str:
    return reverse("v1:party-archive", args=[party.id])


def restore_url(party: Any) -> str:
    return reverse("v1:party-restore", args=[party.id])


# ── Archiving ───────────────────────────────────────────────────────────────


def test_a_settled_party_can_be_archived(tenant: Any, api_as: Any) -> None:
    party = PartyFactory(tenant=tenant, balance="0.00", name="Gone Away Stores")
    client, _member = api_as(tenant)

    response = client.post(archive_url(party), {"reason": "No longer trading"}, format="json")

    assert response.status_code == 200
    assert response.json()["data"]["status"] == "archived"
    party.refresh_from_db()
    assert party.status == "archived"


def test_archiving_is_not_deleting(tenant: Any, api_as: Any) -> None:
    """BR-1, and the reason the whole feature is shaped this way.

    `deleted_at` is reserved for merge losers and tenant deletion. If archive
    ever set it, the party would fall out of `Party.objects` — and with it the
    statements, the exports and the GST records that the 72-month retention rule
    requires to survive exactly this action.
    """
    party = PartyFactory(tenant=tenant, balance="0.00")
    client, _member = api_as(tenant)

    client.post(archive_url(party), {}, format="json")

    party.refresh_from_db()
    assert party.deleted_at is None
    assert Party.objects.filter(pk=party.pk).exists()


def test_a_party_who_still_owes_cannot_be_archived(tenant: Any, api_as: Any) -> None:
    """BR-2 — you cannot tidy away somebody who still owes you money."""
    party = PartyFactory(tenant=tenant, balance="2300.00", name="Ramesh Traders")
    client, _member = api_as(tenant)

    response = client.post(archive_url(party), {}, format="json")

    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "party_balance_nonzero"
    assert error["details"]["balance"] == "2300.00"
    assert error["details"]["balance_label"] == "receivable"
    party.refresh_from_db()
    assert party.status == "active"


def test_a_party_the_merchant_owes_cannot_be_archived_either(tenant: Any, api_as: Any) -> None:
    """The guard is about the balance being non-zero, not about its sign.

    A supplier the merchant still owes ₹900 is money that will leave the till,
    and losing track of it is the same failure in the other direction.
    """
    party = PartyFactory(tenant=tenant, balance="-900.00")
    client, _member = api_as(tenant)

    response = client.post(archive_url(party), {}, format="json")

    assert response.status_code == 409
    assert response.json()["error"]["details"]["balance_label"] == "payable"


def test_one_paisa_blocks_the_archive(tenant: Any, api_as: Any) -> None:
    """BR-3 — there is NO tolerance band, and that is deliberate.

    "Close enough to zero" is a rule whose threshold nobody can defend, and it
    silently eats exactly the residues a collection round is for. `numeric(14,2)`
    equality is exact; a rupee is retired on purpose or not at all.
    """
    party = PartyFactory(tenant=tenant, balance="0.01")
    client, _member = api_as(tenant)

    assert client.post(archive_url(party), {}, format="json").status_code == 409


def test_archiving_an_archived_party_is_refused_rather_than_ignored(
    tenant: Any, api_as: Any
) -> None:
    """409 and not 200: a client that has lost track of state must not be told
    it just archived something it did not."""
    party = PartyFactory(tenant=tenant, balance="0.00", status="archived")
    client, _member = api_as(tenant)

    response = client.post(archive_url(party), {}, format="json")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "party_already_archived"


def test_a_replayed_archive_returns_the_original_response(tenant: Any, api_as: Any) -> None:
    """Canon rule 5, and the case it is actually for.

    A merchant on a 2G connection taps Archive, the response is lost, they tap
    again. Without the key the second attempt answers 409
    `party_already_archived` — the truth, and it reads on screen as "that did
    not work" for something that did.
    """
    party = PartyFactory(tenant=tenant, balance="0.00")
    client, _member = api_as(tenant)
    headers = {"HTTP_IDEMPOTENCY_KEY": "archive-once"}

    first = client.post(archive_url(party), {}, format="json", **headers)
    second = client.post(archive_url(party), {}, format="json", **headers)

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["data"]["id"] == first.json()["data"]["id"]


def test_archiving_does_not_move_the_party_in_the_default_sort(tenant: Any, api_as: Any) -> None:
    """BR-12 — `last_activity_at` is when they last traded, not when they were
    filed away. Touching it would put a restored party at the top of a list
    ordered by recency, above somebody who bought something this morning."""
    party = PartyFactory(tenant=tenant, balance="0.00")
    before = party.last_activity_at
    client, _member = api_as(tenant)

    client.post(archive_url(party), {}, format="json")

    party.refresh_from_db()
    assert party.last_activity_at == before


def test_the_reason_lands_on_the_audit_row_and_not_on_the_party(
    tenant: Any, api_as: Any, django_assert_num_queries: Any
) -> None:
    """It explains a DECISION, not a record.

    A party archived, restored and archived again has two reasons; a column
    would hold one, overwritten, and the first would be gone. The audit trail is
    where "why did this leave the book" is answerable.
    """
    from django.apps import apps as django_apps

    party = PartyFactory(tenant=tenant, balance="0.00")
    client, _member = api_as(tenant)

    client.post(archive_url(party), {"reason": "Moved away"}, format="json")

    audit_log = django_apps.get_model("platform", "AuditLog")
    row = audit_log.objects.filter(action="party.archived", entity_id=party.id).get()
    assert row.metadata["reason"] == "Moved away"
    assert row.before["status"] == "active"
    assert row.after["status"] == "archived"
    # The balance at the moment of the decision, which is not recoverable later:
    # a correction posted afterwards moves it and leaves no trace of what it was.
    assert row.before["balance"] == "0.00"


def test_a_reason_longer_than_a_sentence_is_refused(tenant: Any, api_as: Any) -> None:
    party = PartyFactory(tenant=tenant, balance="0.00")
    client, _member = api_as(tenant)

    response = client.post(archive_url(party), {"reason": "x" * 161}, format="json")

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"


def test_another_tenants_party_cannot_be_archived_and_is_not_found(
    tenant: Any, other_tenant: Any, api_as: Any
) -> None:
    """404, never 403 — a 403 confirms the id exists (canon §0.11 rule 2)."""
    theirs = PartyFactory(tenant=other_tenant, balance="0.00")
    client, _member = api_as(tenant)

    response = client.post(archive_url(theirs), {}, format="json")

    assert response.status_code == 404
    theirs.refresh_from_db()
    assert theirs.status == "active"


# ── Restoring ───────────────────────────────────────────────────────────────


def test_an_archived_party_can_be_restored(tenant: Any, api_as: Any) -> None:
    party = PartyFactory(tenant=tenant, status="archived", balance="0.00")
    client, _member = api_as(tenant)

    response = client.post(restore_url(party), {}, format="json")

    assert response.status_code == 200
    assert response.json()["data"]["status"] == "active"


def test_restoring_is_unconditional_even_when_a_balance_appeared(tenant: Any, api_as: Any) -> None:
    """BR-9 — a party archived with a balance (through a later correction, or a
    merge) is a legitimate state, and restoring them is always safe. The
    asymmetry with archive is the point: archiving can lose track of money,
    restoring cannot lose anything at all.
    """
    party = PartyFactory(tenant=tenant, status="archived", balance="2300.00")
    client, _member = api_as(tenant)

    assert client.post(restore_url(party), {}, format="json").status_code == 200


def test_restoring_an_active_party_is_refused(tenant: Any, api_as: Any) -> None:
    party = PartyFactory(tenant=tenant, status="active")
    client, _member = api_as(tenant)

    response = client.post(restore_url(party), {}, format="json")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "party_not_archived"


def test_a_restore_is_audited(tenant: Any, api_as: Any) -> None:
    from django.apps import apps as django_apps

    party = PartyFactory(tenant=tenant, status="archived", balance="0.00")
    client, _member = api_as(tenant)

    client.post(restore_url(party), {}, format="json")

    audit_log = django_apps.get_model("platform", "AuditLog")
    assert audit_log.objects.filter(action="party.restored", entity_id=party.id).exists()


def test_an_archived_party_is_out_of_the_list_and_back_in_after_a_restore(
    tenant: Any, api_as: Any
) -> None:
    """The whole point of the feature, asserted through the screen's own query."""
    party = PartyFactory(tenant=tenant, balance="0.00", name="Gone Away Stores")
    client, _member = api_as(tenant)

    client.post(archive_url(party), {}, format="json")
    active = client.get(reverse("v1:party-list")).json()
    assert [row["name"] for row in active["data"]] == []
    assert active["meta"]["total"] == 0

    archived = client.get(reverse("v1:party-list"), {"status": "archived"}).json()
    assert [row["name"] for row in archived["data"]] == ["Gone Away Stores"]

    client.post(restore_url(party), {}, format="json")
    assert client.get(reverse("v1:party-list")).json()["meta"]["total"] == 1


# ── Bulk ────────────────────────────────────────────────────────────────────


def test_bulk_archive_takes_what_it_can_and_names_what_it_cannot(tenant: Any, api_as: Any) -> None:
    """FR-9's partial success, which is the whole shape of the endpoint.

    200 rather than 207 or a 400: every id in the request was a legitimate ask,
    and a status code cannot carry "two of three, and here is the one that still
    owes you ₹500".
    """
    settled = PartyFactory.create_batch(2, tenant=tenant, balance="0.00")
    owing = PartyFactory(tenant=tenant, balance="500.00", name="Still Owes")
    client, _member = api_as(tenant)

    response = client.post(
        reverse("v1:party-bulk-archive"),
        {"ids": [str(p.id) for p in [*settled, owing]], "reason": "Yearly clean-up"},
        format="json",
    )

    assert response.status_code == 200
    body = response.json()
    assert sorted(body["data"]["archived"]) == sorted(str(p.id) for p in settled)
    assert body["meta"] == {"archived_count": 2, "skipped_count": 1}
    skipped = body["data"]["skipped"]
    assert len(skipped) == 1
    assert skipped[0]["code"] == "party_balance_nonzero"
    assert skipped[0]["name"] == "Still Owes"
    assert skipped[0]["balance"] == "500.00"


def test_bulk_archive_never_writes_anything_off(tenant: Any, api_as: Any) -> None:
    """BR-10 — forgiving a debt is a decision about one person and one amount,
    and a checkbox in a list of thirty is not where it belongs."""
    owing = PartyFactory(tenant=tenant, balance="500.00")
    client, _member = api_as(tenant)

    client.post(reverse("v1:party-bulk-archive"), {"ids": [str(owing.id)]}, format="json")

    owing.refresh_from_db()
    assert owing.balance == Decimal("500.00")
    assert owing.status == "active"


def test_bulk_archive_reports_an_id_it_could_not_find(
    tenant: Any, other_tenant: Any, api_as: Any
) -> None:
    """A caller who sent thirty and got twenty-seven back with no explanation is
    a caller who will send them again. It discloses nothing: another tenant's id
    and a made-up one get the same answer.
    """
    theirs = PartyFactory(tenant=other_tenant, balance="0.00")
    client, _member = api_as(tenant)

    body = client.post(
        reverse("v1:party-bulk-archive"), {"ids": [str(theirs.id)]}, format="json"
    ).json()

    assert body["data"]["archived"] == []
    assert body["data"]["skipped"][0]["code"] == "not_found"
    theirs.refresh_from_db()
    assert theirs.status == "active"


def test_bulk_archive_refuses_more_than_it_should_hold_in_one_transaction(
    tenant: Any, api_as: Any
) -> None:
    client, _member = api_as(tenant)
    response = client.post(
        reverse("v1:party-bulk-archive"),
        {
            "ids": [str(PartyFactory(tenant=tenant).id)] * 0
            + ["01a0c000-0000-7000-8000-%012d" % i for i in range(201)]
        },
        format="json",
    )
    assert response.status_code == 400


def test_bulk_archive_writes_one_audit_row_per_party(tenant: Any, api_as: Any) -> None:
    """So that "when did this party leave the book" stays answerable from the
    party's own history, rather than only from a summary row nobody joins to."""
    from django.apps import apps as django_apps

    parties = PartyFactory.create_batch(3, tenant=tenant, balance="0.00")
    client, _member = api_as(tenant)

    client.post(
        reverse("v1:party-bulk-archive"),
        {"ids": [str(p.id) for p in parties]},
        format="json",
    )

    audit_log = django_apps.get_model("platform", "AuditLog")
    for party in parties:
        row = audit_log.objects.filter(action="party.archived", entity_id=party.id).get()
        assert row.metadata["via"] == "bulk"


# ── Who may do it ───────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "role,expected",
    [("owner", 200), ("admin", 200), ("staff", 403), ("accountant", 403)],
)
def test_only_an_owner_or_admin_may_archive(
    tenant: Any, api_as: Any, role: str, expected: int
) -> None:
    """§12 — archiving IS the delete capability, because the product has no
    hard delete.

    Staff can create and edit parties all day and cannot file one away, which is
    the right way round: adding a customer is counter work, and deciding that
    somebody has stopped trading with the business is not. `HasPermission` is
    fail-closed, so an action missing from the map denies everybody rather than
    allowing everybody — but a map that is present and WRONG fails open for the
    role it names, which is what this asserts.
    """
    party = PartyFactory(tenant=tenant, balance="0.00")
    client, _member = api_as(tenant, role=role)

    assert client.post(archive_url(party), {}, format="json").status_code == expected


@pytest.mark.parametrize(
    "role,expected",
    [("owner", 200), ("admin", 200), ("staff", 403), ("accountant", 403)],
)
def test_only_an_owner_or_admin_may_restore(
    tenant: Any, api_as: Any, role: str, expected: int
) -> None:
    party = PartyFactory(tenant=tenant, status="archived", balance="0.00")
    client, _member = api_as(tenant, role=role)

    assert client.post(restore_url(party), {}, format="json").status_code == expected


@pytest.mark.parametrize("role,expected", [("owner", 200), ("staff", 403)])
def test_bulk_archive_is_gated_the_same_way(
    tenant: Any, api_as: Any, role: str, expected: int
) -> None:
    """A bulk endpoint that forgot its permission map would be the loudest
    possible version of this mistake: one request, two hundred parties."""
    party = PartyFactory(tenant=tenant, balance="0.00")
    client, _member = api_as(tenant, role=role)

    response = client.post(
        reverse("v1:party-bulk-archive"), {"ids": [str(party.id)]}, format="json"
    )
    assert response.status_code == expected


def test_a_staff_member_who_is_refused_changes_nothing(tenant: Any, api_as: Any) -> None:
    """The 403 has to happen BEFORE the service runs, not after it.

    A permission check that fires on the way out leaves the row archived and the
    audit trail written, and answers 403 to a caller who succeeded.
    """
    party = PartyFactory(tenant=tenant, balance="0.00")
    client, _member = api_as(tenant, role="staff")

    client.post(archive_url(party), {}, format="json")

    party.refresh_from_db()
    assert party.status == "active"
