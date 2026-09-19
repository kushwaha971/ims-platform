"""Tenant isolation fails closed (Part 20 §20.4.7, canon §0.11 rule 2)."""

from __future__ import annotations

from typing import Any

import pytest
from django.urls import reverse

from apps.common.tenancy import get_effective_tenant
from apps.parties.models import Party
from apps.parties.selectors.party import get_party, list_parties

pytestmark = pytest.mark.django_db


class _FakeRequest:
    """The smallest thing `get_effective_tenant` accepts."""

    def __init__(self, user: Any = None, claims: dict | None = None) -> None:
        self.user = user
        self.auth_claims = claims or {}


def test_for_tenant_with_none_returns_nothing_not_everything(two_tenants_full: dict) -> None:
    """The fail-closed primitive itself: `None` is the empty set."""
    assert Party.objects.count() == 2
    assert Party.objects.for_tenant(None).count() == 0


def test_selector_with_no_tenant_returns_nothing(two_tenants_full: dict) -> None:
    assert list_parties(tenant=None).count() == 0


def test_selector_sees_only_its_own_tenant(two_tenants_full: dict) -> None:
    a, b = two_tenants_full["a"], two_tenants_full["b"]
    assert list(list_parties(tenant=a["tenant"])) == [a["party"]]
    assert list(list_parties(tenant=b["tenant"])) == [b["party"]]


def test_get_party_across_tenants_is_none(two_tenants_full: dict) -> None:
    a, b = two_tenants_full["a"], two_tenants_full["b"]
    assert get_party(tenant=a["tenant"], party_id=b["party"].id) is None


def test_cross_tenant_detail_is_404_never_403(two_tenants_full: dict) -> None:
    """Canon §0.11 rule 2. A 403 would confirm the row exists."""
    a, b = two_tenants_full["a"], two_tenants_full["b"]
    response = a["client"].get(reverse("v1:party-detail", args=[b["party"].id]))
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_own_detail_is_200(two_tenants_full: dict) -> None:
    a = two_tenants_full["a"]
    response = a["client"].get(reverse("v1:party-detail", args=[a["party"].id]))
    assert response.status_code == 200
    assert response.json()["data"]["id"] == str(a["party"].id)


def test_list_never_leaks_the_other_tenant(two_tenants_full: dict) -> None:
    a, b = two_tenants_full["a"], two_tenants_full["b"]
    body = a["client"].get(reverse("v1:party-list")).json()
    ids = {row["id"] for row in body["data"]}
    assert ids == {str(a["party"].id)}
    assert str(b["party"].id) not in ids


def test_x_tenant_id_header_is_never_trusted(two_tenants_full: dict) -> None:
    """Part 20 §20.4.6: sending the header changes nothing."""
    a, b = two_tenants_full["a"], two_tenants_full["b"]
    body = a["client"].get(reverse("v1:party-list"), HTTP_X_TENANT_ID=str(b["tenant"].id)).json()
    assert {row["id"] for row in body["data"]} == {str(a["party"].id)}


def test_unauthenticated_request_resolves_no_tenant(user: Any) -> None:
    class _Anonymous:
        is_authenticated = False

    assert get_effective_tenant(_FakeRequest(user=_Anonymous())) is None


def test_revoked_membership_resolves_no_tenant(membership: Any) -> None:
    """A revoked membership must not survive until token expiry (§20.4.2 step 3)."""
    request = _FakeRequest(user=membership.user, claims={"tid": str(membership.tenant_id)})
    assert get_effective_tenant(request) == membership.tenant

    membership.status = "removed"
    membership.save(update_fields=["status"])
    assert (
        get_effective_tenant(
            _FakeRequest(user=membership.user, claims={"tid": str(membership.tenant_id)})
        )
        is None
    )


def test_suspended_tenant_resolves_no_tenant(membership: Any) -> None:
    membership.tenant.status = "suspended"
    membership.tenant.save(update_fields=["status"])
    request = _FakeRequest(user=membership.user, claims={"tid": str(membership.tenant_id)})
    assert get_effective_tenant(request) is None


def test_impersonation_claim_grants_nothing_without_a_grant(membership: Any) -> None:
    """Fail closed: an unimplemented grant must not become an implicit one."""
    membership.user.is_super_admin = True
    membership.user.save(update_fields=["is_super_admin"])
    request = _FakeRequest(
        user=membership.user,
        claims={"imp": str(membership.tenant_id), "tid": str(membership.tenant_id)},
    )
    assert get_effective_tenant(request) is None


def test_the_tenant_is_resolved_once_per_http_request(two_tenants_full: dict) -> None:
    """The memo lives on the underlying request, not on the DRF wrapper.

    DRF's `Request` proxies attribute reads but not writes, so memoising on the
    wrapper would resolve the tenant again for every wrapper and leave the
    middleware and the access log looking at an unresolved request.
    """
    from django.test import RequestFactory
    from rest_framework.request import Request

    a = two_tenants_full["a"]
    django_request = RequestFactory().get("/api/v1/parties")
    django_request.user = a["user"]
    django_request.auth_claims = {"tid": str(a["tenant"].id)}

    drf_request = Request(django_request)
    drf_request.user = a["user"]

    assert get_effective_tenant(drf_request) == a["tenant"]
    assert django_request._ub_tenant == a["tenant"]
    # A second wrapper over the same HTTP request reuses the memo.
    assert get_effective_tenant(Request(django_request)) == a["tenant"]


# ── PLT-04 FR-4 / CCR-3: every tenant-scoped response echoes the tenant ──────


def test_every_tenant_scoped_response_echoes_the_tenant_id(tenant: Any, api_as: Any) -> None:
    """The stale-tab guard keys on `X-Tenant-Id`, so a response without it is
    a response the guard cannot police. It is set once, in the middleware, for
    every response whose tenant resolved — not per-view.
    """
    from django.urls import reverse as _reverse

    client, _member = api_as(tenant)
    for name in ("v1:party-list", "v1:tenant-current", "v1:auth-me"):
        response = client.get(_reverse(name))
        assert response["X-Tenant-Id"] == str(tenant.id), name
        assert response["X-Tenant-Scope"] == "1", name


def test_a_response_with_no_resolved_tenant_carries_no_tenant_header(
    anonymous_client: Any,
) -> None:
    """The header is an echo of a resolved tenant, never a placeholder."""
    from django.urls import reverse as _reverse

    response = anonymous_client.get(_reverse("v1:party-list"))
    assert response.status_code == 401
    assert "X-Tenant-Id" not in response


def test_the_tenant_header_is_never_read_from_the_request(
    two_tenants_full: dict,
) -> None:
    """Scoping is the `tid` claim. A forged `X-Tenant-Id` changes nothing —
    including the header the response echoes back."""
    from django.urls import reverse as _reverse

    a, b = two_tenants_full["a"], two_tenants_full["b"]
    response = a["client"].get(_reverse("v1:party-list"), HTTP_X_TENANT_ID=str(b["tenant"].id))
    assert response["X-Tenant-Id"] == str(a["tenant"].id)
    assert [row["name"] for row in response.json()["data"]] == [a["party"].name]
