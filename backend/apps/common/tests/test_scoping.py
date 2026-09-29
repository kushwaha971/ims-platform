"""PLT-X12 — the fail-closed row scope and restricted fields (A13, ADR-052).

T-PLT-X12-1, -2 and -6. The defect class is the one ADR-052 names: a scope a
vertical applies only to its own tables, or only when the viewset remembers to,
is a scope a collection agent walks straight around. So the mixin fails CLOSED
(no `scope_filter` → no rows, loudly), an out-of-scope id is 404 and never 403,
and a restricted field is absent — not blank — without its codename.

Every API test asserts WHO is signed in before anything else (the CLAUDE.md
harness lesson): a check that passes for the wrong person proves nothing.
"""

from __future__ import annotations

from typing import Any

import pytest

from apps.common.scoping import scoped_queryset
from tests.factories.parties import PartyFactory

pytestmark = [pytest.mark.django_db, pytest.mark.urls("apps.common.tests.scoping_urls")]


@pytest.fixture
def book(tenant: Any, other_tenant: Any) -> dict:
    return {
        "mine": PartyFactory(tenant=tenant, name="Route A · Ramesh", mobile="+919876500001"),
        "theirs": PartyFactory(tenant=tenant, name="Route B · Sita", mobile="+919876500002"),
        "elsewhere": PartyFactory(tenant=other_tenant, name="Route A · Other shop"),
    }


def test_a_scoped_member_lists_only_their_rows(api_as: Any, tenant: Any, book: dict) -> None:
    """T-PLT-X12-1: without the `read_all` codename the list is the scope."""
    client, member = api_as(tenant, role="staff")
    assert member.role.code == "staff"
    names = [row["name"] for row in client.get("/scoped").json()["data"]]
    assert names == ["Route A · Ramesh"]


def test_the_read_all_codename_bypasses_the_scope(api_as: Any, tenant: Any, book: dict) -> None:
    """T-PLT-X12-1: owner holds the stand-in `read_all`, so sees every row of
    THIS tenant — and still none of another tenant's."""
    client, member = api_as(tenant, role="owner")
    assert member.role.code == "owner"
    names = sorted(row["name"] for row in client.get("/scoped").json()["data"])
    assert names == ["Route A · Ramesh", "Route B · Sita"]


def test_an_out_of_scope_id_is_not_found_never_forbidden(
    api_as: Any, tenant: Any, book: dict
) -> None:
    """T-PLT-X12-2 / BR-2: a 403 would confirm the row exists; 404 does not."""
    client, member = api_as(tenant, role="staff")
    assert member.role.code == "staff"
    assert client.get(f"/scoped/{book['mine'].id}").status_code == 200
    response = client.get(f"/scoped/{book['theirs'].id}")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"
    assert client.get(f"/scoped/{book['elsewhere'].id}").status_code == 404


def test_a_viewset_without_scope_filter_fails_closed(api_as: Any, tenant: Any, book: dict) -> None:
    """T-PLT-X12-1 / BR-1: forgetting `scope_filter` must never mean "no
    scope". It answers an error and leaks no row — even to the owner, so the
    mistake is found by the first person to open the screen."""
    for role in ("staff", "owner"):
        client, member = api_as(tenant, role=role)
        assert member.role.code == role
        response = client.get("/unscoped")
        assert response.status_code == 500
        assert "Route" not in response.content.decode()


def test_restricted_fields_are_absent_without_their_codename(
    api_as: Any, tenant: Any, book: dict
) -> None:
    """T-PLT-X12-6 / BR-7: the KEY is absent, not null — a `null` mobile reads
    as "no number" and a client might render the empty state as fact."""
    staff, member = api_as(tenant, role="staff")
    assert member.role.code == "staff"
    # The test viewset's retrieve is DRF's own, not wrapped in the envelope.
    row = staff.get(f"/scoped/{book['mine'].id}").json()
    assert "mobile" not in row and row["name"] == "Route A · Ramesh"

    owner, member = api_as(tenant, role="owner")
    assert member.role.code == "owner"
    row = owner.get(f"/scoped/{book['mine'].id}").json()
    assert row["mobile"] == "+919876500001"


def test_a_serializer_without_a_request_drops_restricted_fields(tenant: Any, book: dict) -> None:
    """T-PLT-X12-6: a CSV export or a job serialises without a request. With no
    member to ask, the restricted field is dropped (fail closed) unless the
    caller passes the member's codenames explicitly."""
    from apps.common.tests.scoping_urls import ScopedPartySerializer

    assert "mobile" not in ScopedPartySerializer(book["mine"]).data
    granted = ScopedPartySerializer(book["mine"], context={"permissions": {"parties.party.export"}})
    assert granted.data["mobile"] == "+919876500001"
    many = ScopedPartySerializer([book["mine"], book["theirs"]], many=True).data
    assert all("mobile" not in row for row in many)


def test_scoped_queryset_is_the_same_rule_for_plain_views(tenant: Any, book: dict) -> None:
    """APIViews that are not viewsets use `scoped_queryset` — the same filter,
    the same bypass, the same fail-closed default when no member resolves."""
    from django.db.models import Q

    from apps.parties.models import Party

    base = Party.objects.filter(tenant=tenant)
    scope = Q(name__startswith="Route A")
    assert list(scoped_queryset(base, scope=scope, held=frozenset(), read_all="x.y.read_all")) == [
        book["mine"]
    ]
    assert (
        scoped_queryset(base, scope=scope, held={"x.y.read_all"}, read_all="x.y.read_all").count()
        == 2
    )
    assert scoped_queryset(base, scope=scope, held=None, read_all="x.y.read_all").count() == 0
