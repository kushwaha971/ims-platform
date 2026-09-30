"""PLT-X04 — guardian and payer relations (A6, FRD 00 PLT-X04 §5, §6, BR-2, BR-6, BR-7).

T-PLT-X04-6: relation CRUD, a self relation and a duplicate are 400s, another
tenant's party is a 404, and a relation with history is ended instead of
deleted. Plus the parties-owned guardian guard (BR-6) and `receiving_parties`
(BR-7), which is what the reminder sources read.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.db import IntegrityError, transaction
from django.urls import reverse

from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.parties.constants import PartyStatus, RelationKind
from apps.parties.models import PartyRelation
from apps.parties.services import relations as relation_service
from apps.platform_app.models import AuditLog
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db


def relations_url(party: Any) -> str:
    return reverse("v1:party-relations", args=[party.id])


def relation_url(party: Any, relation_id: Any) -> str:
    return reverse("v1:party-delete-relation", kwargs={"pk": party.id, "rid": relation_id})


@pytest.fixture
def people(tenant: Any) -> dict:
    return {
        "rahul": PartyFactory(tenant=tenant, name="Rahul", mobile="9876543210"),
        "father": PartyFactory(tenant=tenant, name="Mohan", mobile="9812345678"),
        "company": PartyFactory(tenant=tenant, name="Acme Pvt Ltd", mobile=None),
    }


@pytest.fixture
def history() -> Any:
    """A stand-in reminder history: relations whose id is in `used` have been used."""
    relation_service._reset_history_for_tests()
    used: set = set()
    relation_service.register_relation_history(lambda relation: int(relation.id in used))
    yield used
    relation_service._reset_history_for_tests()


def _link(client: Any, person: Any, related: Any, **extra: Any) -> Any:
    body = {"related_party_id": str(related.id), "kind": "guardian", **extra}
    return client.post(relations_url(person), body, format="json")


# ── Create and read ──────────────────────────────────────────────────────────


def test_a_guardian_is_linked_and_listed_from_both_sides(
    tenant: Any, api_as: Any, people: dict
) -> None:
    """T-PLT-X04-6 — 201 with the §6 shape; the person's page lists it under
    `as_person`, the guardian's under `as_related`; mobiles are masked."""
    client, _ = api_as(tenant, role="staff")  # parties.party.write
    rahul, father = people["rahul"], people["father"]

    response = _link(client, rahul, father, receives_messages=True)

    assert response.status_code == 201, response.content
    data = response.json()["data"]
    assert data["kind"] == "guardian"
    assert data["receives_messages"] is True
    assert data["from_on"] == tenant_today(tenant).isoformat()
    assert data["to_on"] is None
    assert data["active"] is True
    assert data["party"] == {
        "id": str(rahul.id),
        "name": "Rahul",
        "mobile_masked": "XXXXXX3210",
        "status": "active",
    }
    assert data["related_party"]["name"] == "Mohan"

    mine = client.get(relations_url(rahul)).json()["data"]
    assert [row["id"] for row in mine["as_person"]] == [data["id"]]
    assert mine["as_related"] == []
    theirs = client.get(relations_url(father)).json()["data"]
    assert [row["id"] for row in theirs["as_related"]] == [data["id"]]

    audit = AuditLog.objects.get(action="party.relation.created", entity_id=data["id"])
    assert audit.after["kind"] == "guardian"


def test_a_payer_and_a_guardian_can_both_be_linked(tenant: Any, api_as: Any, people: dict) -> None:
    """The unique key is per KIND: the father can be guardian AND pay."""
    client, _ = api_as(tenant)
    assert _link(client, people["rahul"], people["father"]).status_code == 201
    assert _link(client, people["rahul"], people["father"], kind="payer").status_code == 201
    assert _link(client, people["rahul"], people["company"], kind="payer").status_code == 201
    assert PartyRelation.objects.filter(party=people["rahul"]).count() == 3


def test_a_self_relation_an_unknown_kind_and_a_duplicate_are_400s(
    tenant: Any, api_as: Any, people: dict
) -> None:
    """BR-2 — and none of them writes a row."""
    client, _ = api_as(tenant)
    rahul, father = people["rahul"], people["father"]

    self_link = _link(client, rahul, rahul)
    assert self_link.status_code == 400
    assert "related_party_id" in self_link.json()["error"]["details"]

    unknown = _link(client, rahul, father, kind="uncle")
    assert unknown.status_code == 400
    assert "kind" in unknown.json()["error"]["details"]

    missing = client.post(relations_url(rahul), {"kind": "guardian"}, format="json")
    assert missing.status_code == 400

    assert _link(client, rahul, father).status_code == 201
    duplicate = _link(client, rahul, father)
    assert duplicate.status_code == 400
    assert duplicate.json()["error"]["details"] == {
        "related_party_id": ["They are already linked this way."]
    }
    assert PartyRelation.objects.count() == 1


def test_a_future_start_date_is_refused(tenant: Any, api_as: Any, people: dict) -> None:
    """A link that starts next month would be "active" in no useful sense."""
    client, _ = api_as(tenant)
    tomorrow = tenant_today(tenant) + dt.timedelta(days=1)
    response = _link(client, people["rahul"], people["father"], from_on=tomorrow.isoformat())
    assert response.status_code == 400
    assert "from_on" in response.json()["error"]["details"]


def test_the_database_refuses_a_self_relation_and_a_bad_date_range(
    tenant: Any, people: dict
) -> None:
    """The CHECKs are the backstop for a write that does not come through the service."""
    today = tenant_today(tenant)
    rahul, father = people["rahul"], people["father"]
    for kwargs in (
        {"related_party": rahul},
        {"related_party": father, "to_on": today - dt.timedelta(days=1)},
        {"related_party": father, "kind": "uncle"},
    ):
        values = {"kind": RelationKind.GUARDIAN, **kwargs}
        with pytest.raises(IntegrityError), transaction.atomic():
            PartyRelation.objects.create(tenant=tenant, party=rahul, from_on=today, **values)


def test_another_tenants_party_is_a_404_on_either_end(
    tenant: Any, other_tenant: Any, api_as: Any, people: dict
) -> None:
    """Canon §0.11 rule 2 — never 403, never a row."""
    client, _ = api_as(tenant)
    theirs = PartyFactory(tenant=other_tenant)

    assert _link(client, people["rahul"], theirs).status_code == 404
    assert _link(client, theirs, people["rahul"]).status_code == 404
    assert client.get(relations_url(theirs)).status_code == 404
    assert PartyRelation.objects.count() == 0


def test_linking_to_or_from_an_archived_party_is_a_409(
    tenant: Any, api_as: Any, people: dict
) -> None:
    """EC-4 — an archived party's relations stay readable; a new one is refused."""
    client, _ = api_as(tenant)
    assert _link(client, people["rahul"], people["father"]).status_code == 201
    people["father"].status = PartyStatus.ARCHIVED
    people["father"].save(update_fields=["status"])

    response = _link(client, people["rahul"], people["father"], kind="payer")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "party_archived"
    assert _link(client, people["father"], people["company"]).status_code == 409

    listed = client.get(relations_url(people["rahul"])).json()["data"]["as_person"]
    assert listed[0]["related_party"]["status"] == "archived"


# ── Delete or end ────────────────────────────────────────────────────────────


def test_an_unused_relation_is_deleted(
    tenant: Any, api_as: Any, people: dict, history: set
) -> None:
    """T-PLT-X04-6 — 204 and the row is gone; the audit row says it was deleted."""
    client, _ = api_as(tenant)
    created = _link(client, people["rahul"], people["father"]).json()["data"]

    response = client.delete(relation_url(people["rahul"], created["id"]))

    assert response.status_code == 204
    assert not PartyRelation.objects.filter(pk=created["id"]).exists()
    audit = AuditLog.objects.get(action="party.relation.deleted", entity_id=created["id"])
    assert audit.metadata["ended"] is False


def test_a_used_relation_is_ended_instead_and_can_be_reopened(
    tenant: Any, api_as: Any, people: dict, history: set
) -> None:
    """T-PLT-X04-6 — with history the DELETE ends it (200, `to_on` today), so "who
    was told" stays answerable; adding it again re-opens the one row."""
    client, _ = api_as(tenant)
    created = _link(client, people["rahul"], people["father"]).json()["data"]
    history.add(PartyRelation.objects.get(pk=created["id"]).id)

    response = client.delete(relation_url(people["rahul"], created["id"]))

    assert response.status_code == 200
    ended = response.json()["data"]
    assert ended["to_on"] == tenant_today(tenant).isoformat()
    assert ended["active"] is False
    assert PartyRelation.objects.filter(pk=created["id"]).exists()
    assert client.delete(relation_url(people["rahul"], created["id"])).status_code == 200

    again = _link(client, people["rahul"], people["father"], receives_messages=True)
    assert again.status_code == 200  # re-opened, not created
    assert again.json()["data"]["id"] == created["id"]
    assert again.json()["data"]["to_on"] is None
    assert PartyRelation.objects.count() == 1


def test_the_guardian_can_unlink_from_their_own_page_and_strangers_cannot(
    tenant: Any, api_as: Any, people: dict
) -> None:
    """The relation must touch the party in the URL, in either direction; another
    party's relation id through this URL is a 404."""
    client, _ = api_as(tenant)
    created = _link(client, people["rahul"], people["father"]).json()["data"]

    assert client.delete(relation_url(people["company"], created["id"])).status_code == 404
    assert client.delete(relation_url(people["father"], created["id"])).status_code == 204


# ── Permissions (§10) ────────────────────────────────────────────────────────


def test_an_accountant_reads_relations_and_cannot_change_them(
    tenant: Any, api_as: Any, people: dict
) -> None:
    """§10 — read with `parties.party.read`, write with `parties.party.write`."""
    owner, _ = api_as(tenant)
    created = _link(owner, people["rahul"], people["father"]).json()["data"]
    accountant, _ = api_as(tenant, role="accountant")

    assert accountant.get(relations_url(people["rahul"])).status_code == 200
    assert _link(accountant, people["rahul"], people["company"]).status_code == 403
    assert accountant.delete(relation_url(people["rahul"], created["id"])).status_code == 403


# ── BR-6: the guardian guard ─────────────────────────────────────────────────


def test_an_active_guardian_of_an_active_party_cannot_be_archived(
    tenant: Any, api_as: Any, people: dict
) -> None:
    """BR-6 — "Rahul's guardian" stays while Rahul is active; archiving Rahul does
    not end the relation, and once he is archived his guardian may be."""
    client, _ = api_as(tenant)
    assert _link(client, people["rahul"], people["father"]).status_code == 201
    father, rahul = people["father"], people["rahul"]

    refused = client.post(reverse("v1:party-archive", args=[father.id]), {}, format="json")
    assert refused.status_code == 409
    assert refused.json()["error"]["details"] == {
        "module": "parties",
        "count": 1,
        "label_id": "parties.archive.activeGuardian",
    }

    assert (
        client.post(reverse("v1:party-archive", args=[rahul.id]), {}, format="json").status_code
        == 200
    )
    assert PartyRelation.objects.get(party=rahul).to_on is None  # not ended by the archive
    assert (
        client.post(reverse("v1:party-archive", args=[father.id]), {}, format="json").status_code
        == 200
    )


def test_a_payer_or_an_ended_guardian_does_not_block_the_archive(
    tenant: Any, api_as: Any, people: dict, history: set
) -> None:
    """BR-6 names the guardian; a payer is a commercial arrangement."""
    client, _ = api_as(tenant)
    _link(client, people["rahul"], people["company"], kind="payer")
    guardian = _link(client, people["rahul"], people["father"]).json()["data"]
    history.add(PartyRelation.objects.get(pk=guardian["id"]).id)
    client.delete(relation_url(people["rahul"], guardian["id"]))  # ended, not deleted

    for party in (people["company"], people["father"]):
        response = client.post(reverse("v1:party-archive", args=[party.id]), {}, format="json")
        assert response.status_code == 200, response.content


def test_bulk_archive_skips_an_active_guardian(tenant: Any, api_as: Any, people: dict) -> None:
    """BR-4 through the parties-owned guard."""
    client, _ = api_as(tenant)
    _link(client, people["rahul"], people["father"])

    body = client.post(
        reverse("v1:party-bulk-archive"),
        {"ids": [str(people["father"].id), str(people["company"].id)]},
        format="json",
    ).json()

    assert body["data"]["archived"] == [str(people["company"].id)]
    assert body["data"]["skipped"][0]["code"] == "party_has_open_records"
    assert body["data"]["skipped"][0]["module"] == "parties"


# ── BR-7: who receives the messages ──────────────────────────────────────────


def test_receiving_parties_are_the_active_links_that_asked_for_messages(
    tenant: Any, people: dict, history: set
) -> None:
    """BR-7 — a preference the reminder sources read; ended links and archived
    guardians are not recipients."""
    ctx = Ctx.system(tenant)
    rahul = people["rahul"]
    relation_service.create_relation(
        ctx=ctx,
        party=rahul,
        related_party_id=people["father"].id,
        kind="guardian",
        receives_messages=True,
    )
    payer, _ = relation_service.create_relation(
        ctx=ctx, party=rahul, related_party_id=people["company"].id, kind="payer"
    )
    assert [p.name for p in relation_service.receiving_parties(tenant, rahul)] == ["Mohan"]

    people["father"].status = PartyStatus.ARCHIVED
    people["father"].save(update_fields=["status"])
    assert relation_service.receiving_parties(tenant, rahul) == []
    assert payer.receives_messages is False
