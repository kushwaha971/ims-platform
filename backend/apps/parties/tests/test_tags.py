"""PTY-05 — tags.

Two small tables and a filter, and three rules that are easy to get subtly
wrong: case-insensitive uniqueness that preserves the merchant's casing, OR
semantics within the tag group, and a filter that must not multiply the totals
aggregate by the join.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.urls import reverse

from apps.parties.models import PartyTag, Tag
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db

TAGS = "v1:party-tag-list"
TAG_DETAIL = "v1:party-tag-detail"
PARTIES = "v1:party-list"
PARTY_DETAIL = "v1:party-detail"


def make_tag(client: Any, name: str, color: str | None = None) -> dict:
    body = {"name": name}
    if color:
        body["color"] = color
    return client.post(reverse(TAGS), body, format="json").json()["data"]


# ── Names ───────────────────────────────────────────────────────────────────


def test_a_tag_is_created_and_listed(tenant: Any, api_as: Any) -> None:
    client, _member = api_as(tenant)

    response = client.post(reverse(TAGS), {"name": "Camp Area"}, format="json")

    assert response.status_code == 201
    assert response.json()["data"]["name"] == "Camp Area"
    assert [row["name"] for row in client.get(reverse(TAGS)).json()["data"]] == ["Camp Area"]


def test_the_same_name_in_another_casing_is_the_same_tag(tenant: Any, api_as: Any) -> None:
    """BR-1, and the half that is easy to miss: the FIRST casing survives.

    "Camp Area" and "camp area" are one tag. Which one the merchant sees is not
    arbitrary — it is the one they typed first, because a label they chose
    should not be rewritten by whoever next happened to be less careful with
    the shift key.
    """
    client, _member = api_as(tenant)
    first = make_tag(client, "Camp Area")

    response = client.post(reverse(TAGS), {"name": "camp area"}, format="json")

    # 200, not 201 and not 409: asking for a tag that exists is not an error,
    # because creating one is a convenience rather than a transaction (FR-3).
    assert response.status_code == 200
    assert response.json()["data"]["id"] == first["id"]
    assert response.json()["data"]["name"] == "Camp Area"
    assert Tag.objects.for_tenant(tenant).count() == 1


def test_surrounding_space_does_not_make_a_second_tag(tenant: Any, api_as: Any) -> None:
    """EC-2."""
    client, _member = api_as(tenant)
    make_tag(client, "Camp Area")

    client.post(reverse(TAGS), {"name": "  Camp Area  "}, format="json")

    assert Tag.objects.for_tenant(tenant).count() == 1


def test_the_database_refuses_a_duplicate_even_when_the_service_is_bypassed(
    tenant: Any,
) -> None:
    """EC-3 — the constraint, not the service, is what makes this safe.

    Two staff members creating "Camp Area" from two party forms in the same
    second both pass their own lookup and both insert. A service check cannot
    see the other transaction; a unique index on `lower(name)` can.
    """
    from django.db import IntegrityError

    Tag.objects.create(tenant=tenant, name="Camp Area")

    with pytest.raises(IntegrityError):
        Tag.objects.create(tenant=tenant, name="CAMP AREA")


def test_two_tenants_may_both_have_camp_area(tenant: Any, other_tenant: Any) -> None:
    """BR-2 — the uniqueness is per tenant, and they are unrelated rows."""
    Tag.objects.create(tenant=tenant, name="Camp Area")
    Tag.objects.create(tenant=other_tenant, name="Camp Area")

    assert Tag.objects.filter(name="Camp Area").count() == 2


def test_a_name_with_a_comma_is_refused(tenant: Any, api_as: Any) -> None:
    """EC-14, and it is not fussiness.

    The list filter serialises tags as `?tag=Camp Area,Route 2` and the CSV
    export joins them with semicolons. "Camp, East" would round-trip as two
    tags that do not exist and the merchant would see a filter matching
    nothing. The character has to be refused where it is typed, or a URL a
    human is meant to read needs an escaping scheme.
    """
    client, _member = api_as(tenant)

    response = client.post(reverse(TAGS), {"name": "Camp, East"}, format="json")

    assert response.status_code == 400
    assert "," in str(response.json()["error"]["details"])


def test_an_empty_name_is_refused(tenant: Any, api_as: Any) -> None:
    client, _member = api_as(tenant)
    assert client.post(reverse(TAGS), {"name": "   "}, format="json").status_code == 400


def test_a_colour_outside_the_palette_is_refused(tenant: Any, api_as: Any) -> None:
    """FR-12 — the eight tokens are the ones that pass 4.5:1 on the card
    surface, so free hex entry would let a merchant choose an unreadable chip."""
    client, _member = api_as(tenant)

    response = client.post(reverse(TAGS), {"name": "Route 2", "color": "#FFFF00"}, format="json")

    assert response.status_code == 400


# ── Renaming, merging, deleting ─────────────────────────────────────────────


def test_renaming_changes_it_everywhere_at_once(tenant: Any, api_as: Any) -> None:
    """BR-7 / US-4 — the join stores the id, so one UPDATE is the whole rename.

    Fixing a spelling must not mean editing sixty parties, and this is why it
    does not have to.
    """
    client, _member = api_as(tenant)
    tag = make_tag(client, "Camp area")
    parties = PartyFactory.create_batch(3, tenant=tenant)
    for party in parties:
        PartyTag.objects.create(party=party, tag_id=tag["id"])

    client.patch(reverse(TAG_DETAIL, args=[tag["id"]]), {"name": "Camp Area"}, format="json")

    rows = client.get(reverse(PARTIES)).json()["data"]
    assert {row["tags"][0]["name"] for row in rows} == {"Camp Area"}


def test_renaming_on_to_an_existing_name_offers_the_merge(tenant: Any, api_as: Any) -> None:
    """409 with the other tag's id, rather than a bare refusal.

    The merchant has just discovered that the two are the same thing under
    different casing, and the useful next move is to merge them — so the
    response carries what the client needs to offer it.
    """
    client, _member = api_as(tenant)
    keeper = make_tag(client, "Camp Area")
    other = make_tag(client, "Deccan")

    response = client.patch(
        reverse(TAG_DETAIL, args=[other["id"]]), {"name": "Camp Area"}, format="json"
    )

    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "tag_name_taken"
    assert error["details"]["existing_tag_id"] == keeper["id"]


def test_merging_moves_the_parties_and_skips_the_duplicates(tenant: Any, api_as: Any) -> None:
    """BR-6 / EC-11 — duplicates are skipped rather than failing the merge.

    A party that already carries the target needs nothing done to it, and
    refusing the whole operation because three of twelve were already correct
    would be a merge that cannot run on the data it is most needed for.

    Two genuinely DIFFERENT names, because a mis-cased duplicate cannot exist:
    an earlier draft of this test used "Camp area" and "Camp Area" and they
    resolved to one tag, so there was nothing to merge. The real case is a
    merchant who made "Camp" early on and "Camp Area" later and wants one.
    """
    client, _member = api_as(tenant)
    source = make_tag(client, "Camp")
    target = make_tag(client, "Camp Area")
    movers = PartyFactory.create_batch(2, tenant=tenant)
    both = PartyFactory(tenant=tenant)
    for party in [*movers, both]:
        PartyTag.objects.create(party=party, tag_id=source["id"])
    PartyTag.objects.create(party=both, tag_id=target["id"])

    response = client.post(
        reverse("v1:party-tag-merge", args=[source["id"]]),
        {"into_tag_id": target["id"]},
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["meta"] == {"moved": 2, "skipped_duplicates": 1}
    assert not Tag.objects.filter(pk=source["id"]).exists()
    assert PartyTag.objects.filter(tag_id=target["id"]).count() == 3


def test_a_tag_cannot_be_merged_into_itself(tenant: Any, api_as: Any) -> None:
    """EC-10 — it would delete the tag and move nothing."""
    client, _member = api_as(tenant)
    tag = make_tag(client, "Camp Area")

    response = client.post(
        reverse("v1:party-tag-merge", args=[tag["id"]]),
        {"into_tag_id": tag["id"]},
        format="json",
    )

    assert response.status_code == 400
    assert Tag.objects.filter(pk=tag["id"]).exists()


def test_deleting_a_tag_keeps_every_party(tenant: Any, api_as: Any) -> None:
    """BR-5, and the reason the copy says "The parties stay".

    Merchants genuinely fear that deleting a label deletes the people.
    """
    client, _member = api_as(tenant)
    tag = make_tag(client, "Camp Area")
    parties = PartyFactory.create_batch(3, tenant=tenant)
    for party in parties:
        PartyTag.objects.create(party=party, tag_id=tag["id"])

    assert client.delete(reverse(TAG_DETAIL, args=[tag["id"]])).status_code == 204

    assert not Tag.objects.filter(pk=tag["id"]).exists()
    assert PartyTag.objects.filter(tag_id=tag["id"]).count() == 0
    for party in parties:
        party.refresh_from_db()
        assert party.status == "active"


def test_the_delete_dialog_can_ask_how_many_without_deleting(tenant: Any, api_as: Any) -> None:
    """`?dry_run=true`. The number has to be the server's, and asking for it
    must not become a second way to delete something."""
    client, _member = api_as(tenant)
    tag = make_tag(client, "Camp Area")
    for party in PartyFactory.create_batch(2, tenant=tenant):
        PartyTag.objects.create(party=party, tag_id=tag["id"])

    response = client.delete(reverse(TAG_DETAIL, args=[tag["id"]]) + "?dry_run=true")

    assert response.status_code == 200
    assert response.json()["data"]["party_count"] == 2
    assert Tag.objects.filter(pk=tag["id"]).exists()


# ── Counting ────────────────────────────────────────────────────────────────


def test_the_count_leaves_out_archived_parties(tenant: Any, api_as: Any) -> None:
    """BR-9 — a tag on somebody who has left the book is not a party the
    merchant can act on, and "Camp Area · 34" that sends them to a list of 23
    is a count they stop trusting."""
    client, _member = api_as(tenant)
    tag = make_tag(client, "Camp Area")
    for party in PartyFactory.create_batch(2, tenant=tenant, status="active"):
        PartyTag.objects.create(party=party, tag_id=tag["id"])
    PartyTag.objects.create(party=PartyFactory(tenant=tenant, status="archived"), tag_id=tag["id"])

    assert client.get(reverse(TAGS)).json()["data"][0]["party_count"] == 2
    with_archived = client.get(reverse(TAGS) + "?include_archived=true").json()
    assert with_archived["data"][0]["party_count"] == 3


def test_a_tag_whose_parties_are_all_archived_still_appears(tenant: Any, api_as: Any) -> None:
    """A tag holding nothing live is exactly the one the merchant wants to find
    and delete, so it must not vanish from the manager.

    This is why the archived filter lives inside the `Count` rather than in a
    `.filter()` on the queryset: a WHERE on the joined table drops the tag
    itself.
    """
    client, _member = api_as(tenant)
    tag = make_tag(client, "Old Route")
    PartyTag.objects.create(party=PartyFactory(tenant=tenant, status="archived"), tag_id=tag["id"])

    rows = client.get(reverse(TAGS)).json()["data"]
    assert [row["name"] for row in rows] == ["Old Route"]
    assert rows[0]["party_count"] == 0


# ── Assignment and filtering ────────────────────────────────────────────────


def test_a_party_is_created_with_tags_that_did_not_exist(tenant: Any, api_as: Any) -> None:
    """FR-4 / US-2 — no taxonomy to set up first."""
    client, _member = api_as(tenant)

    response = client.post(
        reverse(PARTIES),
        {"name": "Ramesh Traders", "tags": ["Camp Area", "Monday route"]},
        format="json",
    )

    assert response.status_code == 201
    assert {tag["name"] for tag in response.json()["data"]["tags"]} == {
        "Camp Area",
        "Monday route",
    }
    assert Tag.objects.for_tenant(tenant).count() == 2


def test_patching_tags_REPLACES_the_set(tenant: Any, api_as: Any) -> None:
    """The form sends the complete set the merchant can see, so anything
    missing from it was removed on purpose."""
    client, _member = api_as(tenant)
    created = client.post(
        reverse(PARTIES), {"name": "Ramesh", "tags": ["A", "B"]}, format="json"
    ).json()["data"]

    response = client.patch(
        reverse("v1:party-detail", args=[created["id"]]), {"tags": ["B", "C"]}, format="json"
    )

    assert {tag["name"] for tag in response.json()["data"]["tags"]} == {"B", "C"}


def test_patching_without_the_key_leaves_tags_alone(tenant: Any, api_as: Any) -> None:
    """Absent is not empty. A merchant fixing a typo in the notes must not lose
    the party's tags because the form did not send them."""
    client, _member = api_as(tenant)
    created = client.post(
        reverse(PARTIES), {"name": "Ramesh", "tags": ["Camp Area"]}, format="json"
    ).json()["data"]

    response = client.patch(
        reverse("v1:party-detail", args=[created["id"]]), {"notes": "called"}, format="json"
    )

    assert [tag["name"] for tag in response.json()["data"]["tags"]] == ["Camp Area"]


def test_an_empty_list_clears_them(tenant: Any, api_as: Any) -> None:
    client, _member = api_as(tenant)
    created = client.post(
        reverse(PARTIES), {"name": "Ramesh", "tags": ["Camp Area"]}, format="json"
    ).json()["data"]

    response = client.patch(
        reverse("v1:party-detail", args=[created["id"]]), {"tags": []}, format="json"
    )

    assert response.json()["data"]["tags"] == []


def test_more_than_ten_tags_on_one_party_is_refused(tenant: Any, api_as: Any) -> None:
    """BR-3 / EC-5 — past ten the chips stop being scannable in a row."""
    client, _member = api_as(tenant)

    response = client.post(
        reverse(PARTIES),
        {"name": "Ramesh", "tags": [f"Tag {n}" for n in range(11)]},
        format="json",
    )

    assert response.status_code == 400


def test_the_tag_filter_is_OR_within_the_group(tenant: Any, api_as: Any) -> None:
    """BR-4 — "show me Camp Area and Deccan today" means both areas, not the
    parties that are in both."""
    client, _member = api_as(tenant)
    camp = client.post(reverse(PARTIES), {"name": "In Camp", "tags": ["Camp Area"]}, format="json")
    client.post(reverse(PARTIES), {"name": "In Deccan", "tags": ["Deccan"]}, format="json")
    client.post(reverse(PARTIES), {"name": "In Neither"}, format="json")
    assert camp.status_code == 201

    body = client.get(reverse(PARTIES), {"tag": "Camp Area,Deccan"}).json()

    assert {row["name"] for row in body["data"]} == {"In Camp", "In Deccan"}
    assert body["meta"]["total"] == 2


def test_a_party_with_both_tags_is_counted_once(tenant: Any, api_as: Any) -> None:
    """The reason the filter is an EXISTS subquery and not a join.

    A join returns that party once per matching tag, so PTY-02's totals — which
    sum `balance` over this same queryset — would report their balance twice
    and disagree with the rows underneath. `DISTINCT` fixes the rows and not
    the aggregate.
    """
    client, _member = api_as(tenant)
    client.post(
        reverse(PARTIES), {"name": "In Both", "tags": ["Camp Area", "Deccan"]}, format="json"
    )
    party = client.get(reverse(PARTIES)).json()["data"][0]
    PartyFactory(tenant=tenant, name="Untagged", balance="0.00")
    Tag.objects.filter(name="Camp Area").first()
    # Give the tagged party a balance so the totals would visibly double.
    from apps.parties.models import Party

    Party.objects.filter(pk=party["id"]).update(balance="500.00")

    body = client.get(reverse(PARTIES), {"tag": "Camp Area,Deccan"}).json()

    assert body["meta"]["total"] == 1
    assert len(body["data"]) == 1
    assert body["meta"]["totals"]["receivable"] == "500.00"
    assert body["meta"]["totals"]["count"] == 1


def test_an_unknown_tag_name_matches_nothing_rather_than_erroring(tenant: Any, api_as: Any) -> None:
    """EC-6 — a tag deleted by somebody else while this filter was open should
    narrow the list, not break the screen."""
    client, _member = api_as(tenant)
    client.post(reverse(PARTIES), {"name": "Ramesh", "tags": ["Camp Area"]}, format="json")

    body = client.get(reverse(PARTIES), {"tag": "Nonexistent"}).json()

    assert body["meta"]["total"] == 0


def test_the_tag_filter_ands_against_the_other_filters(tenant: Any, api_as: Any) -> None:
    client, _member = api_as(tenant)
    client.post(
        reverse(PARTIES),
        {"name": "Camp Supplier", "tags": ["Camp Area"], "is_supplier": True, "is_customer": False},
        format="json",
    )
    client.post(reverse(PARTIES), {"name": "Camp Customer", "tags": ["Camp Area"]}, format="json")

    body = client.get(reverse(PARTIES), {"tag": "Camp Area", "type": "supplier"}).json()

    assert [row["name"] for row in body["data"]] == ["Camp Supplier"]


# ── Bulk ────────────────────────────────────────────────────────────────────


def test_bulk_add_puts_the_tag_on_every_selected_party(tenant: Any, api_as: Any) -> None:
    client, _member = api_as(tenant)
    parties = PartyFactory.create_batch(3, tenant=tenant)

    response = client.post(
        reverse("v1:party-tag-bulk-tag"),
        {
            "party_ids": [str(p.id) for p in parties],
            "tag_names": ["Route 2"],
            "mode": "add",
        },
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["data"]["updated_count"] == 3
    assert PartyTag.objects.filter(tag__name="Route 2").count() == 3


def test_bulk_add_is_safe_to_repeat(tenant: Any, api_as: Any) -> None:
    """`ignore_conflicts` on the join, so pressing Add twice does not fail on
    the unique constraint for the parties that already had it."""
    client, _member = api_as(tenant)
    parties = PartyFactory.create_batch(2, tenant=tenant)
    body = {
        "party_ids": [str(p.id) for p in parties],
        "tag_names": ["Route 2"],
        "mode": "add",
    }

    client.post(reverse("v1:party-tag-bulk-tag"), body, format="json")
    second = client.post(reverse("v1:party-tag-bulk-tag"), body, format="json")

    assert second.status_code == 200
    assert PartyTag.objects.filter(tag__name="Route 2").count() == 2


def test_bulk_replace_returns_what_it_overwrote(tenant: Any, api_as: Any) -> None:
    """BR-11 — this is what makes Undo exact.

    Replacing throws away tag sets that differ per party, so an inverse built
    from "the tag we added" would restore the wrong thing. The response carries
    the prior ids per party instead.
    """
    client, _member = api_as(tenant)
    created = client.post(
        reverse(PARTIES), {"name": "Ramesh", "tags": ["Old"]}, format="json"
    ).json()["data"]

    response = client.post(
        reverse("v1:party-tag-bulk-tag"),
        {"party_ids": [created["id"]], "tag_names": ["New"], "mode": "replace"},
        format="json",
    )

    previous = response.json()["data"]["previous"]
    assert len(previous) == 1
    assert previous[0]["party_id"] == created["id"]
    assert len(previous[0]["tag_ids"]) == 1
    assert {t.name for t in Tag.objects.filter(party_tags__party_id=created["id"])} == {"New"}


def test_bulk_remove_is_the_inverse_of_add(tenant: Any, api_as: Any) -> None:
    """FR-9's Undo, on the wire."""
    client, _member = api_as(tenant)
    parties = PartyFactory.create_batch(2, tenant=tenant)
    ids = [str(p.id) for p in parties]
    client.post(
        reverse("v1:party-tag-bulk-tag"),
        {"party_ids": ids, "tag_names": ["Route 2"], "mode": "add"},
        format="json",
    )

    client.post(
        reverse("v1:party-tag-bulk-tag"),
        {"party_ids": ids, "tag_names": ["Route 2"], "mode": "remove"},
        format="json",
    )

    assert PartyTag.objects.filter(tag__name="Route 2").count() == 0


def test_bulk_add_cannot_push_a_party_past_the_ten_tag_ceiling(tenant: Any, api_as: Any) -> None:
    """BR-3 held on the form path and was ignored by the bulk path.

    `set_party_tags` refuses an eleventh tag, so the party drawer was safe. The
    bulk endpoint went straight to `bulk_create` with no count at all, which
    means a merchant who selected a hundred parties carrying nine tags each and
    added five ended up with a hundred parties carrying fourteen — past the
    ceiling BR-3 sets, and past the number of chips a list row can show before
    the name is pushed off the card.

    The defect is only reachable in bulk, which is exactly where it does the
    most damage: one request, a hundred parties, no way to see it happening.
    """
    client, _member = api_as(tenant)
    party = PartyFactory(tenant=tenant)
    client.patch(
        reverse(PARTY_DETAIL, args=[party.id]),
        {"tags": [f"Tag {index}" for index in range(9)]},
        format="json",
    )

    response = client.post(
        reverse("v1:party-tag-bulk-tag"),
        {
            "party_ids": [str(party.id)],
            "tag_names": ["Route 2", "Camp Area"],
            "mode": "add",
        },
        format="json",
    )

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["updated_count"] == 0
    assert body["skipped"] == [
        {"id": str(party.id), "name": party.name, "reason": "tag_limit_reached"}
    ]
    assert PartyTag.objects.filter(party=party).count() == 9


def test_bulk_add_still_tags_everyone_who_has_room(tenant: Any, api_as: Any) -> None:
    """A party at the ceiling must not cost the other ninety-nine their tag.

    The whole point of the bulk endpoint is one action over a selection, and
    failing the request because one member of that selection is full would make
    the feature unusable on precisely the books that need it. The full party is
    reported the same way an unknown id is, so the dialog can name them.
    """
    client, _member = api_as(tenant)
    full = PartyFactory(tenant=tenant)
    roomy = PartyFactory(tenant=tenant)
    client.patch(
        reverse(PARTY_DETAIL, args=[full.id]),
        {"tags": [f"Tag {index}" for index in range(10)]},
        format="json",
    )

    body = client.post(
        reverse("v1:party-tag-bulk-tag"),
        {
            "party_ids": [str(full.id), str(roomy.id)],
            "tag_names": ["Route 2"],
            "mode": "add",
        },
        format="json",
    ).json()["data"]

    assert body["updated_count"] == 1
    assert body["skipped"] == [
        {"id": str(full.id), "name": full.name, "reason": "tag_limit_reached"}
    ]
    assert PartyTag.objects.filter(party=roomy, tag__name="Route 2").exists()
    assert PartyTag.objects.filter(party=full).count() == 10


def test_a_tag_a_party_already_carries_does_not_count_against_the_ceiling(
    tenant: Any, api_as: Any
) -> None:
    """Re-adding a tag somebody already has is a no-op, not an eleventh tag.

    Without this the ceiling check would be counting the request rather than
    the result, and pressing Add twice on a selection of parties sitting at ten
    would start refusing the second press — for a request that changes nothing.
    """
    client, _member = api_as(tenant)
    party = PartyFactory(tenant=tenant)
    names = [f"Tag {index}" for index in range(10)]
    client.patch(reverse(PARTY_DETAIL, args=[party.id]), {"tags": names}, format="json")

    body = client.post(
        reverse("v1:party-tag-bulk-tag"),
        {"party_ids": [str(party.id)], "tag_names": [names[0]], "mode": "add"},
        format="json",
    ).json()["data"]

    # Not skipped — the request was fine and the party is not over the ceiling.
    assert body["skipped"] == []
    # And not COUNTED either: `updated_count` is parties changed, and nothing
    # changed. It used to be the number of parties matched, which is how a
    # merchant who removed a tag from a selection of forty that three of them
    # carried was told "Removed from 40 parties".
    assert body["updated_count"] == 0
    assert body["changed"] == []
    assert PartyTag.objects.filter(party=party).count() == 10


def test_bulk_replace_is_capped_the_same_way_the_form_is(tenant: Any, api_as: Any) -> None:
    """Replace writes a whole set, so the set itself has to fit.

    `tag_names` allows five, which is under the ceiling, so this can only be
    reached if that ever changes — the assertion is here so that raising one
    limit cannot silently breach the other.
    """
    client, _member = api_as(tenant)
    party = PartyFactory(tenant=tenant)

    body = client.post(
        reverse("v1:party-tag-bulk-tag"),
        {
            "party_ids": [str(party.id)],
            "tag_names": ["A", "B", "C"],
            "mode": "replace",
        },
        format="json",
    ).json()["data"]

    assert body["updated_count"] == 1
    assert PartyTag.objects.filter(party=party).count() == 3


def test_a_skipped_party_is_NAMED_so_the_merchant_can_go_and_fix_it(
    tenant: Any, api_as: Any
) -> None:
    """A reason with no subject is not a report.

    The dialog rendered `skipped` as a list of reasons — "already carries 10
    tags", three times, with nothing saying which three parties. A party at the
    ceiling is exactly the one a merchant CAN fix, by going to it and taking a
    tag off, and they cannot do that for a party they cannot identify.

    Not for `not_found`: that id is not this tenant's, and inventing a label for
    a row the tenant cannot see would be the one kind of leak this endpoint must
    not have.
    """
    client, _member = api_as(tenant)
    full = PartyFactory(tenant=tenant, name="Farhan Supply")
    client.patch(
        reverse(PARTY_DETAIL, args=[full.id]),
        {"tags": [f"Tag {index}" for index in range(10)]},
        format="json",
    )

    body = client.post(
        reverse("v1:party-tag-bulk-tag"),
        {"party_ids": [str(full.id)], "tag_names": ["Route 2"], "mode": "add"},
        format="json",
    ).json()["data"]

    assert body["skipped"] == [
        {"id": str(full.id), "name": "Farhan Supply", "reason": "tag_limit_reached"}
    ]


def test_eleven_names_that_fold_to_ten_tags_is_ten_tags(tenant: Any, api_as: Any) -> None:
    """BR-3 counts the result, not the request.

    The ceiling was checked against `len(names)` before the names were resolved,
    so a form carrying "Camp Area" and "camp area" among eleven entries was
    refused with "Up to 10 tags per party" — about a party that would have ended
    up carrying exactly ten.
    """
    client, _member = api_as(tenant)
    party = PartyFactory(tenant=tenant)
    names = [f"Tag {index}" for index in range(9)] + ["Camp Area", "camp area"]

    response = client.patch(reverse(PARTY_DETAIL, args=[party.id]), {"tags": names}, format="json")

    assert response.status_code == 200
    assert PartyTag.objects.filter(party=party).count() == 10


def test_bulk_reports_an_id_that_is_not_this_tenants(
    tenant: Any, other_tenant: Any, api_as: Any
) -> None:
    client, _member = api_as(tenant)
    theirs = PartyFactory(tenant=other_tenant)

    body = client.post(
        reverse("v1:party-tag-bulk-tag"),
        {"party_ids": [str(theirs.id)], "tag_names": ["Route 2"], "mode": "add"},
        format="json",
    ).json()

    assert body["data"]["updated_count"] == 0
    assert body["data"]["skipped"][0]["reason"] == "not_found"
    assert body["data"]["skipped"][0]["name"] == ""
    assert PartyTag.objects.filter(party=theirs).count() == 0


# ── The numbers a merchant is shown ─────────────────────────────────────────


def test_the_delete_dialog_counts_the_same_parties_the_manager_row_does(
    tenant: Any, api_as: Any
) -> None:
    """BR-9, in the one place two counts of the same tag sit two clicks apart.

    The manager's row excludes archived parties, because a tag on somebody who
    has left the book is not a party the merchant can act on. The delete
    dialog's dry-run counted every join row, archived included — so the same tag
    read "2 parties" on the row and "it will be taken off 3 parties" in the
    confirmation. Nothing was broken; the screen simply told the merchant two
    different things about one decision.
    """
    client, _member = api_as(tenant)
    tag = make_tag(client, "Camp Area")
    active = PartyFactory.create_batch(2, tenant=tenant)
    gone = PartyFactory(tenant=tenant, status="archived")
    for party in [*active, gone]:
        PartyTag.objects.create(party=party, tag_id=tag["id"])

    row = next(t for t in client.get(reverse(TAGS)).json()["data"] if t["id"] == tag["id"])
    dry = client.delete(f"{reverse(TAG_DETAIL, args=[tag['id']])}?dry_run=true").json()["data"]

    assert row["party_count"] == 2
    assert dry["party_count"] == row["party_count"]


def test_the_merge_preflight_and_the_result_count_the_same_parties(
    tenant: Any, api_as: Any
) -> None:
    """The same disagreement, on the other destructive action.

    The dialog quotes the source tag's row count, which excludes archived
    parties; `moved` counted every row that was updated, which does not. A
    merge of a tag on two active and one archived party said "2 parties will
    move" and then reported "3 moved" — about an operation the merchant cannot
    undo.

    The archived party's row still MOVES, which is the point: the tag has to
    survive on somebody who comes back. It is just not counted in a sentence
    whose subject is parties the merchant can act on.
    """
    client, _member = api_as(tenant)
    source = make_tag(client, "Camp")
    target = make_tag(client, "Camp Area")
    active = PartyFactory.create_batch(2, tenant=tenant)
    gone = PartyFactory(tenant=tenant, status="archived")
    for party in [*active, gone]:
        PartyTag.objects.create(party=party, tag_id=source["id"])

    shown = next(t for t in client.get(reverse(TAGS)).json()["data"] if t["id"] == source["id"])
    result = client.post(
        reverse("v1:party-tag-merge", args=[source["id"]]),
        {"into_tag_id": target["id"]},
        format="json",
    ).json()["meta"]

    assert shown["party_count"] == 2
    assert result["moved"] == shown["party_count"]
    # Every row moved, including the archived party's.
    assert PartyTag.objects.filter(tag_id=target["id"]).count() == 3


# ── The tag filter, and the one place a merchant types a tag name ───────────


def test_the_tag_filter_ignores_case(tenant: Any, api_as: Any) -> None:
    """BR-1 arriving from the read side, and it was broken.

    Tag names are case-insensitively unique and the casing the merchant first
    typed is what everybody sees — so "Camp Area" and "camp area" ARE one tag.
    The filter used `name__in`, which is exact, and `?tag=` is the one parameter
    in the product a person types or edits by hand.

    The failure was silent: a merchant who lower-cases a shared link gets zero
    parties and ₹0.00 totals under a chip that reads "Camp Area" in the right
    colour, because the client resolves the label case-insensitively on purpose.
    A filter that is on, correctly named, and matching nothing.
    """
    client, _member = api_as(tenant)
    client.post(reverse(PARTIES), {"name": "Aarav", "tags": ["Camp Area"]}, format="json")

    body = client.get(reverse(PARTIES), {"tag": "camp area"}).json()

    assert [row["name"] for row in body["data"]] == ["Aarav"]


def test_the_tag_filter_folds_the_whitespace_the_write_path_folds(tenant: Any, api_as: Any) -> None:
    """EC-2's normalisation, applied to the read side too.

    A name typed with a double space is stored as one space, so a filter carrying
    the double space has to find it — otherwise the two halves of the product
    disagree about what the merchant's own tag is called.
    """
    client, _member = api_as(tenant)
    client.post(reverse(PARTIES), {"name": "Aarav", "tags": ["Camp Area"]}, format="json")

    body = client.get(reverse(PARTIES), {"tag": "  Camp  Area  "}).json()

    assert [row["name"] for row in body["data"]] == ["Aarav"]


# ── Undo has to be exact, or it is worse than nothing ───────────────────────


def test_bulk_add_reports_only_the_parties_that_actually_gained_the_tag(
    tenant: Any, api_as: Any
) -> None:
    """BR-11, and the case an inverse built from the REQUEST gets wrong.

    Undo of an `add` used to be "remove the same tags from the same parties".
    A party that already carried the tag before the merchant ever pressed Add
    therefore lost it on Undo — silently, under a message saying "put back the
    way it was".

    `changed` lists the pairs the call actually wrote, so the inverse touches
    only what the call touched.
    """
    client, _member = api_as(tenant)
    had_it = client.post(
        reverse(PARTIES), {"name": "Ramesh", "tags": ["Camp Area"]}, format="json"
    ).json()["data"]
    fresh = PartyFactory(tenant=tenant)

    body = client.post(
        reverse("v1:party-tag-bulk-tag"),
        {
            "party_ids": [had_it["id"], str(fresh.id)],
            "tag_names": ["Camp Area"],
            "mode": "add",
        },
        format="json",
    ).json()["data"]

    assert body["updated_count"] == 1
    assert [entry["party_id"] for entry in body["changed"]] == [str(fresh.id)]


def test_bulk_remove_reports_only_the_parties_that_actually_lost_it(
    tenant: Any, api_as: Any
) -> None:
    """The mirror image, and the one that produced the false sentence.

    Selecting forty parties and removing a tag three of them carried reported
    "Removed from 40 parties".
    """
    client, _member = api_as(tenant)
    tagged = client.post(
        reverse(PARTIES), {"name": "Ramesh", "tags": ["Camp Area"]}, format="json"
    ).json()["data"]
    untagged = PartyFactory(tenant=tenant)

    body = client.post(
        reverse("v1:party-tag-bulk-tag"),
        {
            "party_ids": [tagged["id"], str(untagged.id)],
            "tag_names": ["Camp Area"],
            "mode": "remove",
        },
        format="json",
    ).json()["data"]

    assert body["updated_count"] == 1
    assert [entry["party_id"] for entry in body["changed"]] == [tagged["id"]]


def test_bulk_replace_captures_the_prior_sets_in_one_query(tenant: Any, api_as: Any) -> None:
    """`previous` is still per-party, and it is no longer per-party QUERIES.

    It was built with a `filter(party=party)` inside a comprehension over up to
    two hundred parties, inside the request's transaction — two hundred round
    trips from an endpoint whose whole promise is that it is one statement.
    """
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    client, _member = api_as(tenant)
    parties = []
    for index in range(5):
        parties.append(
            client.post(
                reverse(PARTIES),
                {"name": f"Party {index}", "tags": [f"Old {index}"]},
                format="json",
            ).json()["data"]
        )

    with CaptureQueriesContext(connection) as captured:
        body = client.post(
            reverse("v1:party-tag-bulk-tag"),
            {
                "party_ids": [party["id"] for party in parties],
                "tag_names": ["New"],
                "mode": "replace",
            },
            format="json",
        ).json()["data"]

    assert len(body["previous"]) == 5
    assert all(entry["tag_ids"] for entry in body["previous"])
    # One read of the join table for five parties, not five. The budget is
    # generous on purpose — this asserts the SHAPE (constant, not per-party),
    # and a tighter number would fail on an unrelated middleware query.
    reads = [q for q in captured.captured_queries if "parties_partytag" in q["sql"].lower()]
    assert len(reads) <= 4, [q["sql"] for q in reads]


# ── Who may do what ─────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "role,expected",
    [("owner", 201), ("admin", 201), ("staff", 201), ("accountant", 403)],
)
def test_who_may_create_a_tag(tenant: Any, api_as: Any, role: str, expected: int) -> None:
    """§12 — tags introduce no new codenames. Creating one is the party write
    right, because a staff member at the counter needs it to finish a form."""
    client, _member = api_as(tenant, role=role)
    assert (
        client.post(reverse(TAGS), {"name": f"Tag {role}"}, format="json").status_code == expected
    )


@pytest.mark.parametrize(
    "role,expected",
    [("owner", 204), ("admin", 204), ("staff", 403), ("accountant", 403)],
)
def test_who_may_delete_a_tag(tenant: Any, api_as: Any, role: str, expected: int) -> None:
    """Deleting is the party DELETE right, deliberately: it changes what every
    other user in the business sees, which is a different kind of act from
    labelling one party at the counter."""
    tag = Tag.objects.create(tenant=tenant, name=f"Tag {role}")
    client, _member = api_as(tenant, role=role)

    assert client.delete(reverse(TAG_DETAIL, args=[tag.id])).status_code == expected


def test_another_tenants_tag_is_not_found(tenant: Any, other_tenant: Any, api_as: Any) -> None:
    """Canon §0.11 rule 2."""
    theirs = Tag.objects.create(tenant=other_tenant, name="Theirs")
    client, _member = api_as(tenant)

    assert (
        client.patch(
            reverse(TAG_DETAIL, args=[theirs.id]), {"name": "Mine"}, format="json"
        ).status_code
        == 404
    )
