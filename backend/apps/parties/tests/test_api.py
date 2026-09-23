"""The walking skeleton, asserted exactly (Part 32 §32.3.6 task S0-70).

The acceptance check is literal: `GET /api/v1/parties` as tenant A returns
`{"data": [], "meta": {"page": 1, "page_size": 25, "total": 0, "total_pages": 0}}`;
as an unauthenticated caller, 401.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import pytest
from django.urls import reverse
from django.utils import timezone

from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db


def test_empty_list_returns_the_exact_envelope(tenant: Any, api_as: Any) -> None:
    client, _member = api_as(tenant)
    response = client.get(reverse("v1:party-list"))
    assert response.status_code == 200
    assert response.json() == {
        "data": [],
        "meta": {
            "page": 1,
            "page_size": 25,
            "total": 0,
            "total_pages": 0,
            # PTY-02 — the header's two figures travel with the page. An empty
            # list reports zeroes rather than omitting the key: a screen that
            # has to distinguish "no totals yet" from "totals are zero" ends up
            # rendering a blank where a ₹0.00 belongs.
            "totals": {"receivable": "0.00", "payable": "0.00", "count": 0, "over_limit": 0},
        },
    }


def test_unauthenticated_is_401_with_the_error_envelope(anonymous_client: Any) -> None:
    response = anonymous_client.get(reverse("v1:party-list"))
    assert response.status_code == 401
    body = response.json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message", "details", "request_id"}
    assert body["error"]["code"] == "unauthenticated"


def test_populated_list_meta_counts_the_filtered_set(tenant: Any, api_as: Any) -> None:
    PartyFactory.create_batch(30, tenant=tenant)
    client, _member = api_as(tenant)

    body = client.get(reverse("v1:party-list")).json()
    assert body["meta"]["page"] == 1
    assert body["meta"]["page_size"] == 25
    assert body["meta"]["total"] == 30
    assert body["meta"]["total_pages"] == 2
    # `meta.total` counts the filtered set and `totals.count` is the same
    # number from the same scan — a screen showing two different counts for one
    # list is a screen nobody can reconcile.
    assert body["meta"]["totals"]["count"] == 30
    assert len(body["data"]) == 25

    body = client.get(reverse("v1:party-list") + "?page=2").json()
    assert body["meta"]["page"] == 2
    assert len(body["data"]) == 5


def test_page_size_is_capped_at_100(tenant: Any, api_as: Any) -> None:
    PartyFactory.create_batch(3, tenant=tenant)
    client, _member = api_as(tenant)
    body = client.get(reverse("v1:party-list") + "?page_size=5000").json()
    assert body["meta"]["page_size"] == 100


def test_q_filter_searches_the_name(tenant: Any, api_as: Any) -> None:
    PartyFactory(tenant=tenant, name="Sharma Traders")
    PartyFactory(tenant=tenant, name="Verma Stores")
    client, _member = api_as(tenant)

    body = client.get(reverse("v1:party-list") + "?q=sharma").json()
    assert [row["name"] for row in body["data"]] == ["Sharma Traders"]


def test_money_travels_as_a_string_with_two_decimals(tenant: Any, api_as: Any) -> None:
    """Canon §0.10 / Part 22 §22.1: amounts are strings."""
    PartyFactory(tenant=tenant, balance="1234.50")
    client, _member = api_as(tenant)
    row = client.get(reverse("v1:party-list")).json()["data"][0]
    assert row["balance"] == "1234.50"
    assert isinstance(row["balance"], str)


def test_request_id_is_echoed_on_a_success_response(tenant: Any, api_as: Any) -> None:
    client, _member = api_as(tenant)
    response = client.get(reverse("v1:party-list"), HTTP_X_REQUEST_ID="abc-123")
    assert response["X-Request-Id"] == "abc-123"


def test_a_malformed_request_id_is_replaced_not_echoed(tenant: Any, api_as: Any) -> None:
    client, _member = api_as(tenant)
    response = client.get(reverse("v1:party-list"), HTTP_X_REQUEST_ID="../../etc/passwd")
    assert response["X-Request-Id"] != "../../etc/passwd"
    assert len(response["X-Request-Id"]) == 32


def test_a_method_the_viewset_does_not_implement_is_405(tenant: Any, api_as: Any) -> None:
    """DELETE is 405, and the distinction it draws still matters.

    This test used to assert POST was 405, which was true while `/parties` was
    read-only and is the exact assumption PTY-01 removes. What it was really
    guarding is subtler than "POST is refused", so it now guards it on a verb
    the viewset still does not implement.

    The point: an action the viewset does NOT have is 405, not 403. Canon
    §20.5.5 is fail-closed about actions the viewset DOES have and the
    permission map does not cover — that accident is caught on the permission
    class itself
    (`apps.common.tests.test_permissions.test_an_implemented_action_missing_from_the_map_is_still_denied`).
    Answering 403 here would tell an owner holding every permission in the
    system to go and ask for rights that would never have made it work.

    Destroy arrives with PTY-04 as archive/restore, which is a state change with
    an audit trail rather than a DELETE — a party with entries against it is
    never removed from the book.
    """
    client, _member = api_as(tenant)
    party = PartyFactory(tenant=tenant, name="Ramesh Traders")
    response = client.delete(reverse("v1:party-detail", args=[party.id]))
    assert response.status_code == 405


def test_a_tenant_scoped_response_is_marked_for_debugging(tenant: Any, api_as: Any) -> None:
    """`X-Tenant-Scope: 1` says a tenant was resolved — never which one.

    The claim is about *this* header. It used to be asserted as "no response
    header anywhere carries the tenant id", which was true only because
    `PLT-04` FR-4 / CCR-3's `X-Tenant-Id` had not been implemented; the client's
    stale-tab guard cannot work without that echo, so the broad form of the
    assertion was certifying the absence of a feature.
    """
    client, _member = api_as(tenant)
    response = client.get(reverse("v1:party-list"))
    assert response["X-Tenant-Scope"] == "1"
    assert str(tenant.id) not in response["X-Tenant-Scope"]


def test_the_status_filter_the_client_sends_is_actually_applied(tenant: Any, api_as: Any) -> None:
    """The list screen sends `status` on every request.

    django-filter drops an undeclared parameter silently, so the list was
    unfiltered while the UI presented it as filtered. It is also the whole
    performance story of this endpoint: `ix_party_tenant_activity` is
    `(tenant, status, -last_activity_at)` and cannot be used without the
    predicate.
    """
    PartyFactory.create_batch(3, tenant=tenant, status="active")
    PartyFactory.create_batch(2, tenant=tenant, status="archived")
    client, _member = api_as(tenant)

    active = client.get(reverse("v1:party-list"), {"status": "active"}).json()
    assert active["meta"]["total"] == 3
    assert {row["status"] for row in active["data"]} == {"active"}

    archived = client.get(reverse("v1:party-list"), {"status": "archived"}).json()
    assert archived["meta"]["total"] == 2

    # PTY-02 BR-4 changed what SILENCE means here. It used to mean "everything";
    # it now means "the book I am working in", so the two archived parties are
    # out. That is the point of the rule: a balance on a party the merchant put
    # away last year must not turn up in today's header total.
    assert client.get(reverse("v1:party-list")).json()["meta"]["total"] == 3


def test_an_unknown_status_is_refused_rather_than_ignored(tenant: Any, api_as: Any) -> None:
    """A filter the server cannot honour must not read as one it applied."""
    PartyFactory.create_batch(2, tenant=tenant)
    client, _member = api_as(tenant)
    response = client.get(reverse("v1:party-list"), {"status": "deleted"})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"


def test_the_list_row_carries_the_display_code(tenant: Any, api_as: Any) -> None:
    """`Party.display_code` is the subtitle the list row draws beside the name."""
    PartyFactory(tenant=tenant, display_code="C-0007")
    client, _member = api_as(tenant)
    row = client.get(reverse("v1:party-list")).json()["data"][0]
    assert row["display_code"] == "C-0007"


def test_the_explicit_default_ordering_still_puts_never_traded_parties_last(
    tenant: Any, api_as: Any
) -> None:
    """`?ordering=-last_activity_at` must mean what the selector means by it.

    This is the request the CLIENT makes. `partyListDefaults.DEFAULT_ORDERING`
    is `-last_activity_at` and the list sends it on every request including the
    first, so the endpoint essentially never sees the parameter absent.

    DRF's `OrderingFilter` REPLACES the queryset's ordering rather than adding
    to it, and `?ordering=` is a list of strings: `-last_activity_at` compiles
    to a plain `DESC`, and PostgreSQL sorts NULLs FIRST on a DESC. So the
    selector's `nulls_last=True` — which FR-7 and BR-6 both require, so that a
    party who has never transacted does not sort above one who bought something
    this morning — applied only to a request that omitted the parameter, and
    what a merchant actually saw at the top of their book was the six people
    they have never traded with.

    Every test in this file passed throughout, because a test calls the
    endpoint without `ordering` and gets the selector's version. It took
    opening the screen.
    """
    PartyFactory(tenant=tenant, name="Never Traded", last_activity_at=None)
    PartyFactory(tenant=tenant, name="Bought Today", last_activity_at=timezone.now())
    PartyFactory(
        tenant=tenant,
        name="Bought Last Year",
        last_activity_at=timezone.now() - timedelta(days=365),
    )
    client, _member = api_as(tenant)

    body = client.get(reverse("v1:party-list"), {"ordering": "-last_activity_at"}).json()

    assert [row["name"] for row in body["data"]] == [
        "Bought Today",
        "Bought Last Year",
        "Never Traded",
    ]


def test_ascending_by_activity_also_puts_the_unknown_last(tenant: Any, api_as: Any) -> None:
    """A missing value never outranks a present one, in either direction.

    Ascending is already NULLS LAST in PostgreSQL, so this passes without the
    filter doing anything — which is the point of asserting it. The rule is
    "unknown sorts last", not "reverse whatever PostgreSQL does", and a future
    change that starts forcing a placement on every term would break this one
    and not the descending test above.
    """
    PartyFactory(tenant=tenant, name="Never Traded", last_activity_at=None)
    PartyFactory(tenant=tenant, name="Bought Today", last_activity_at=timezone.now())
    client, _member = api_as(tenant)

    body = client.get(reverse("v1:party-list"), {"ordering": "last_activity_at"}).json()

    assert [row["name"] for row in body["data"]][-1] == "Never Traded"


def test_ordering_by_a_non_nullable_column_is_left_exactly_alone(tenant: Any, api_as: Any) -> None:
    """`name` cannot be NULL, so its SQL must not grow a placement clause.

    `ORDER BY name ASC NULLS LAST` on a NOT NULL column is noise that gives the
    next reader a reason to wonder whether the column is nullable, and it can
    cost an index that the plain form would have used.
    """
    PartyFactory(tenant=tenant, name="Bose Traders")
    PartyFactory(tenant=tenant, name="Anand Stores")
    client, _member = api_as(tenant)

    body = client.get(reverse("v1:party-list"), {"ordering": "name"}).json()

    assert [row["name"] for row in body["data"]] == ["Anand Stores", "Bose Traders"]
