"""The walking skeleton, asserted exactly (Part 32 §32.3.6 task S0-70).

The acceptance check is literal: `GET /api/v1/parties` as tenant A returns
`{"data": [], "meta": {"page": 1, "page_size": 25, "total": 0, "total_pages": 0}}`;
as an unauthenticated caller, 401.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.urls import reverse

from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db


def test_empty_list_returns_the_exact_envelope(tenant: Any, api_as: Any) -> None:
    client, _member = api_as(tenant)
    response = client.get(reverse("v1:party-list"))
    assert response.status_code == 200
    assert response.json() == {
        "data": [],
        "meta": {"page": 1, "page_size": 25, "total": 0, "total_pages": 0},
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
    assert body["meta"] == {"page": 1, "page_size": 25, "total": 30, "total_pages": 2}
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


def test_an_unmapped_action_is_denied_not_allowed_by_default(tenant: Any, api_as: Any) -> None:
    """The slice is read-only: `PTY-02` (Sprint 3) adds create and update.

    `HasPermission` maps `list` and `retrieve` only, and Part 20 §20.5.5 says an
    action missing from the mapping is DENIED. So `create` is refused by the
    permission layer before the router ever reports "method not allowed" — which
    is the fail-closed behaviour, and the reason this asserts 403 rather than 405.
    """
    client, _member = api_as(tenant)
    response = client.post(reverse("v1:party-list"), {"name": "X"}, format="json")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "permission_denied"


def test_a_tenant_scoped_response_is_marked_for_debugging(tenant: Any, api_as: Any) -> None:
    """`X-Tenant-Scope: 1` says a tenant was resolved — never which one."""
    client, _member = api_as(tenant)
    response = client.get(reverse("v1:party-list"))
    assert response["X-Tenant-Scope"] == "1"
    assert str(tenant.id) not in "".join(f"{k}:{v}" for k, v in response.items())
