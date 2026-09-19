"""The Sprint 1 permission matrix and isolation sweep (Part 28 §28.2.1, §28.2.2).

Part 28 §28.2.2 asks for one generated matrix over `{owner, admin, staff,
accountant, unauthenticated, member-of-another-tenant}` with a declared
expectation per route, and — the important half — an **exhaustiveness**
assertion, so that a new endpoint added without a declared expectation fails the
build on the commit that introduces it.

`EXPECTED` below covers every route Sprint 1 added. Its exhaustiveness check is
scoped to those routes rather than the whole URL map, because Sprints 2–13 have
not declared theirs yet and a matrix that fails for routes nobody has built is
a matrix nobody runs. The scoping is by URL name prefix, so the day `PLT-05`
adds `v1:membership-list` the assertion fails until a row is written for it.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.urls import URLPattern, URLResolver, get_resolver, reverse

pytestmark = pytest.mark.django_db

ROLES = ("owner", "admin", "staff", "accountant")

# The URL names Sprint 1 owns. Anything matching these prefixes must have a row.
SPRINT_1_PREFIXES = ("auth-", "tenant-", "membership-", "invitation-")

# (method, url name) -> {role or pseudo-role: expected status}
#
# `anon` is unauthenticated; `other_tenant` is an authenticated member of a
# different business. Statuses are what the caller *sees*, so a 400 from a
# deliberately empty body is a legitimate expectation: it proves the request
# reached the view rather than the permission layer.
EXPECTED: dict[tuple[str, str], dict[str, int]] = {
    # ── Unauthenticated by design (PLT-01 §12, PLT-02 §12) ──────────────────
    #
    # `v1:auth-otp-request` and `v1:auth-otp-verify` are deliberately absent:
    # DEC-010 registers them only when `UB_AUTH_OTP_ENABLED=1`, so under the
    # default configuration this matrix is over is not a route with a row —
    # it is not a route. `test_auth_flags.py` is the assertion for that.
    ("POST", "v1:auth-register"): {
        "owner": 400,
        "admin": 400,
        "staff": 400,
        "accountant": 400,
        "anon": 400,
        "other_tenant": 400,
    },
    ("POST", "v1:auth-login"): {
        "owner": 400,
        "admin": 400,
        "staff": 400,
        "accountant": 400,
        "anon": 400,
        "other_tenant": 400,
    },
    ("POST", "v1:auth-refresh"): {
        "owner": 401,
        "admin": 401,
        "staff": 401,
        "accountant": 401,
        "anon": 401,
        "other_tenant": 401,
    },
    ("POST", "v1:auth-password-reset-request"): {
        "owner": 400,
        "admin": 400,
        "staff": 400,
        "accountant": 400,
        "anon": 400,
        "other_tenant": 400,
    },
    ("POST", "v1:auth-password-reset-confirm"): {
        "owner": 400,
        "admin": 400,
        "staff": 400,
        "accountant": 400,
        "anon": 400,
        "other_tenant": 400,
    },
    # The address-confirmation link is spendable by whoever holds it — it names
    # its own user — so, like the reset link, it is open and takes no session.
    ("POST", "v1:auth-email-verify-confirm"): {
        "owner": 400,
        "admin": 400,
        "staff": 400,
        "accountant": 400,
        "anon": 400,
        "other_tenant": 400,
    },
    # ── Authenticated, any role (PLT-01 §12, PLT-04 §12, PLT-15 §12) ────────
    ("GET", "v1:auth-me"): {
        "owner": 200,
        "admin": 200,
        "staff": 200,
        "accountant": 200,
        "anon": 401,
        "other_tenant": 200,
    },
    ("POST", "v1:auth-logout"): {
        "owner": 200,
        "admin": 200,
        "staff": 200,
        "accountant": 200,
        "anon": 401,
        "other_tenant": 200,
    },
    ("POST", "v1:auth-password-set"): {
        "owner": 400,
        "admin": 400,
        "staff": 400,
        "accountant": 400,
        "anon": 401,
        "other_tenant": 400,
    },
    ("POST", "v1:auth-switch-tenant"): {
        "owner": 400,
        "admin": 400,
        "staff": 400,
        "accountant": 400,
        "anon": 401,
        "other_tenant": 400,
    },
    # Sending oneself a confirmation link needs a session and nothing else: the
    # address it confirms is the caller's own, so there is no body to validate.
    ("POST", "v1:auth-email-verify-request"): {
        "owner": 200,
        "admin": 200,
        "staff": 200,
        "accountant": 200,
        "anon": 401,
        "other_tenant": 200,
    },
    # PLT-03 §12: "Create business — any user".
    ("POST", "v1:tenant-create"): {
        "owner": 400,
        "admin": 400,
        "staff": 400,
        "accountant": 400,
        "anon": 401,
        "other_tenant": 400,
    },
    # ── Tenant profile (PLT-03 §12's matrix, Part 22 §22.3) ─────────────────
    ("GET", "v1:tenant-current"): {
        "owner": 200,
        "admin": 200,
        "staff": 200,
        "accountant": 200,
        "anon": 401,
        "other_tenant": 200,
    },
    ("PATCH", "v1:tenant-current"): {
        "owner": 200,
        "admin": 200,
        "staff": 403,
        "accountant": 403,
        "anon": 401,
        "other_tenant": 200,
    },
    # ── Self-service membership rows (PLT-04 §12) ───────────────────────────
    ("PATCH", "v1:membership-detail"): {
        "owner": 200,
        "admin": 200,
        "staff": 200,
        "accountant": 200,
        "anon": 401,
        "other_tenant": 404,
    },
    ("DELETE", "v1:membership-detail"): {
        # Self-service leave (FR-7). The `owner` cell is 409 because the caller
        # is that business's only owner and FR-7's `last_owner` guard is what
        # they meet; `test_an_owner_may_leave_once_another_owner_exists` covers
        # the other side of that guard.
        "owner": 409,
        "admin": 200,
        "staff": 200,
        "accountant": 200,
        "anon": 401,
        "other_tenant": 404,
    },
    ("POST", "v1:invitation-accept"): {
        "owner": 400,
        "admin": 400,
        "staff": 400,
        "accountant": 400,
        "anon": 401,
        "other_tenant": 400,
    },
}

# Bodies that are valid enough to reach the view but never mutate anything.
BODIES: dict[tuple[str, str], dict] = {
    ("PATCH", "v1:tenant-current"): {"legal_name": "Matrix Legal Name"},
    ("PATCH", "v1:membership-detail"): {"is_default": True},
}


def _sprint_1_route_keys() -> set[tuple[str, str]]:
    """Every (method, name) pair the Sprint 1 URL includes expose."""
    found: set[tuple[str, str]] = set()

    def walk(patterns: Any, namespace: str) -> None:
        for entry in patterns:
            if isinstance(entry, URLResolver):
                walk(entry.url_patterns, namespace or (entry.namespace or ""))
            elif isinstance(entry, URLPattern) and entry.name:
                if not entry.name.startswith(SPRINT_1_PREFIXES):
                    continue
                view = entry.callback.cls if hasattr(entry.callback, "cls") else None
                if view is None:
                    continue
                for method in ("get", "post", "patch", "put", "delete"):
                    if hasattr(view, method):
                        found.add((method.upper(), f"v1:{entry.name}"))

    walk(get_resolver().url_patterns, "")
    return found


def test_the_matrix_has_a_row_for_every_sprint_1_route() -> None:
    """Part 28 §28.2.2: an endpoint with no declared expectation fails the build."""
    declared = set(EXPECTED)
    actual = _sprint_1_route_keys()
    assert actual - declared == set(), f"undeclared routes: {sorted(actual - declared)}"
    assert declared - actual == set(), f"declared but absent: {sorted(declared - actual)}"


def _url(name: str, membership: Any) -> str:
    if name == "v1:membership-detail":
        return reverse(name, kwargs={"membership_id": membership.id})
    if name == "v1:invitation-accept":
        return reverse(name, kwargs={"token": "no-such-invitation-token"})
    return reverse(name)


@pytest.mark.parametrize(("method", "name"), sorted(EXPECTED), ids=lambda v: str(v))
@pytest.mark.parametrize("principal", [*ROLES, "anon", "other_tenant"])
def test_the_permission_matrix(
    method: str,
    name: str,
    principal: str,
    api_as: Any,
    tenant: Any,
    other_tenant: Any,
    anonymous_client: Any,
    system_roles: dict,
) -> None:
    """The full Sprint 1 matrix, one cell per run.

    The membership the URL points at is chosen so that each principal meets the
    case the row is about: a role acts on **its own** membership (PLT-04 FR-5
    and FR-7 are both self-service), while `other_tenant` and `anon` act on a
    membership that belongs to somebody else — which is the cross-tenant case
    canon §0.11 rule 2 says must answer 404.
    """
    if principal in ("anon", "other_tenant"):
        _resident_client, membership = api_as(tenant, role="staff")
        client = anonymous_client if principal == "anon" else api_as(other_tenant, role="owner")[0]
    else:
        client, membership = api_as(tenant, role=principal)

    url = _url(name, membership)
    body = BODIES.get((method, name), {})
    response = getattr(client, method.lower())(url, body, format="json")
    assert response.status_code == EXPECTED[(method, name)][principal], (
        f"{method} {name} as {principal} → {response.status_code} " f"{response.content[:200]!r}"
    )


def test_a_permission_failure_and_an_entitlement_failure_are_distinguishable(
    api_as: Any, tenant: Any
) -> None:
    """Part 28 §28.2.2: the two 403s carry different codes and are asserted distinct."""
    client, _member = api_as(tenant, role="staff")
    denied = client.patch(reverse("v1:tenant-current"), {"legal_name": "X"}, format="json")
    assert denied.json()["error"]["code"] == "permission_denied"

    tenant.enabled_modules = [m for m in tenant.enabled_modules if m != "parties"]
    tenant.save(update_fields=["enabled_modules"])
    gated = client.get(reverse("v1:party-list"))
    assert gated.status_code == 403
    assert gated.json()["error"]["code"] == "module_disabled"


# ── §28.2.1 isolation sweep over the Sprint 1 endpoints ──────────────────────


def test_no_sprint_1_endpoint_returns_another_tenants_row(
    two_tenants_full: Any,
) -> None:
    """§28.2.1(c): tenant A's response contains no id belonging to tenant B."""
    a, b = two_tenants_full["a"], two_tenants_full["b"]

    body = a["client"].get(reverse("v1:auth-me")).json()["data"]
    tenant_ids = {row["id"] for row in body["tenants"]}
    assert tenant_ids == {str(a["tenant"].id)}
    assert body["active_tenant_id"] == str(a["tenant"].id)
    assert str(b["tenant"].id) not in a["client"].get(reverse("v1:auth-me")).content.decode()

    profile = a["client"].get(reverse("v1:tenant-current")).json()["data"]
    assert profile["id"] == str(a["tenant"].id)


def test_a_cross_tenant_membership_id_is_404_never_403(two_tenants_full: Any) -> None:
    """§28.2.1(b) / canon §0.11 rule 2: a 403 would confirm the row exists."""
    a, b = two_tenants_full["a"], two_tenants_full["b"]
    url = reverse("v1:membership-detail", kwargs={"membership_id": b["membership"].id})

    patched = a["client"].patch(url, {"is_default": True}, format="json")
    assert patched.status_code == 404
    assert patched.json()["error"]["code"] == "not_found"
    assert a["client"].delete(url).status_code == 404


def test_a_patch_to_the_current_tenant_never_touches_the_other(
    two_tenants_full: Any,
) -> None:
    """The write side of the same guarantee."""
    a, b = two_tenants_full["a"], two_tenants_full["b"]
    before = b["tenant"].name

    a["client"].patch(reverse("v1:tenant-current"), {"name": "Renamed A"}, format="json")

    a["tenant"].refresh_from_db()
    b["tenant"].refresh_from_db()
    assert a["tenant"].name == "Renamed A"
    assert b["tenant"].name == before


def test_the_sessions_list_is_the_callers_own(two_tenants_full: Any) -> None:
    """Part 27 §27.4.3: `/auth/me` shows *the caller's* devices, nobody else's."""
    from apps.platform_app.services import sessions as session_service

    a, b = two_tenants_full["a"], two_tenants_full["b"]
    session_service.issue(user=b["user"], tenant=b["tenant"], membership=b["membership"])

    rows = a["client"].get(reverse("v1:auth-me")).json()["data"]["sessions"]
    assert all(row["device_label"] is None for row in rows)
    assert len(rows) == 0


def test_an_unauthenticated_call_to_every_guarded_route_is_401(
    anonymous_client: Any, tenant: Any, api_as: Any
) -> None:
    """§27.5.1: "a view that declares nothing still requires authentication"."""
    _client, membership = api_as(tenant)
    guarded = [
        ("GET", "v1:auth-me"),
        ("POST", "v1:auth-logout"),
        ("POST", "v1:auth-switch-tenant"),
        ("POST", "v1:auth-password-set"),
        ("POST", "v1:tenant-create"),
        ("GET", "v1:tenant-current"),
        ("PATCH", "v1:tenant-current"),
        ("PATCH", "v1:membership-detail"),
        ("DELETE", "v1:membership-detail"),
        ("POST", "v1:invitation-accept"),
    ]
    for method, name in guarded:
        response = getattr(anonymous_client, method.lower())(
            _url(name, membership), {}, format="json"
        )
        assert response.status_code == 401, f"{method} {name}"
        assert response.json()["error"]["code"] == "unauthenticated"
