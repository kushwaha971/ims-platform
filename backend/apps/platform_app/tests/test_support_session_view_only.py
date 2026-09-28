"""CR-2026-09-29-SEC-A — a support (impersonation) session is VIEW ONLY.

The defect: the console and the owner's consent copy promise a read-only
session (Part 20 §20.4.8 rule 5, CR-2026-09-24-W2C-B), but the authentication
door refused only a short list of writes (team, bank/UPI/PAN, export, delete,
the console, consent). Every other write depended on each view's permission
class remembering the `imp` claim, and several did not.

This file proves the rule the owner consented to, for EVERY route the URL
resolver knows: an unsafe method under a support token answers 403
`impersonation_forbidden`, except the three routes on the explicit allow-list.
A route added tomorrow is walked by the same test without anyone editing it.
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Iterator
from typing import Any

import pytest
from django.test import RequestFactory
from django.urls import URLPattern, URLResolver, get_resolver, reverse
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.common.authentication import CookieOrBearerJWTAuthentication
from apps.platform_app.tests.test_admin_console import _admin, _bearer, _consent, _impersonate

pytestmark = pytest.mark.django_db

UNSAFE = ("post", "put", "patch", "delete")
SAMPLE_ID = "00000000-0000-4000-8000-000000000001"

# The allow-list, mirrored from `CookieOrBearerJWTAuthentication` on purpose:
# a route moving onto it must be a visible edit to this test too.
ALLOWED_UNDER_SUPPORT = {
    "/api/v1/admin/impersonation/end",
    "/api/v1/auth/logout",
    "/api/v1/reminders/preview",
}

# Routes that never authenticate (`authentication_classes = []`): sign-in,
# sign-up, refresh, reset, e-mail verification, the public share page, health.
# The support token never reaches them, so they are not "during a support
# session"; `test_the_anonymous_routes_never_read_a_token` proves that claim
# rather than trusting this list.
_ARG = re.compile(r"<(?:(?P<conv>\w+):)?(?P<name>\w+)>")
_GROUP = re.compile(r"\(\?P<\w+>[^)]*\)")


def _concrete(fragment: str) -> str:
    if fragment.startswith("^"):  # a DRF router's regex route
        fragment = fragment[1:].rstrip("$")
        fragment = _GROUP.sub(SAMPLE_ID, fragment)
        return fragment.replace("\\", "")
    return _ARG.sub(
        lambda m: "1" if m.group("conv") == "int" else SAMPLE_ID,
        fragment,
    )


def _walk(patterns: list, prefix: str = "") -> Iterator[tuple[str, Any]]:
    for entry in patterns:
        if isinstance(entry, URLResolver):
            yield from _walk(entry.url_patterns, prefix + _concrete(str(entry.pattern)))
        elif isinstance(entry, URLPattern):
            if "(?P<format>" in str(entry.pattern):
                continue  # the router's `.json` twin of a route already walked
            yield prefix + _concrete(str(entry.pattern)), entry.callback


def _unsafe_methods(callback: Any) -> list[str]:
    actions = getattr(callback, "actions", None)
    if actions:  # a router-bound viewset: exactly the methods this route maps
        return [m for m in UNSAFE if m in actions]
    cls = getattr(callback, "cls", None) or getattr(callback, "view_class", None)
    if cls is None:
        return []
    return [m for m in UNSAFE if hasattr(cls, m)]


def _authenticates(callback: Any) -> bool:
    cls = getattr(callback, "cls", None)
    if cls is None:
        return False  # not DRF (Django admin): session auth, never the JWT
    return any(isinstance(a, CookieOrBearerJWTAuthentication) for a in cls().get_authenticators())


def _routes() -> tuple[list[tuple[str, str]], list[tuple[str, str]]]:
    guarded: set[tuple[str, str]] = set()
    anonymous: set[tuple[str, str]] = set()
    for raw, callback in _walk(get_resolver().url_patterns):
        path = "/" + raw.lstrip("/")
        if not path.startswith("/api/"):
            continue
        for method in _unsafe_methods(callback):
            (guarded if _authenticates(callback) else anonymous).add((method, path))
    return sorted(guarded), sorted(anonymous)


GUARDED, ANONYMOUS = _routes()
REFUSED = [(m, p) for m, p in GUARDED if p.rstrip("/") not in ALLOWED_UNDER_SUPPORT]


def _support_client(tenant: Any, api_as: Any) -> tuple[APIClient, str, Any]:
    admin, admin_user, _ = _admin()
    owner_client, _ = api_as(tenant, "owner")
    raw = (
        _impersonate(admin, tenant, _consent(admin, owner_client, tenant))
        .cookies["ub_access"]
        .value
    )
    return _bearer(raw), raw, admin_user


def test_the_walk_found_the_writes() -> None:
    """Guards the guard: a resolver walk that silently finds nothing proves nothing."""
    assert len(REFUSED) > 80
    paths = {p for _, p in REFUSED}
    assert "/api/v1/parties" in paths  # a router route
    assert "/api/v1/ledger-entries" in paths
    assert "/api/v1/notifications/read-all" in paths  # a plain APIView, not HasPermission
    assert "/api/v1/payments/upi-intent" in paths  # writes nothing, but not on the list
    assert {p for _, p in GUARDED} >= ALLOWED_UNDER_SUPPORT


@pytest.mark.parametrize(("method", "path"), REFUSED, ids=[f"{m} {p}" for m, p in REFUSED])
def test_every_write_is_refused_under_a_support_session(
    tenant: Any, api_as: Any, method: str, path: str
) -> None:
    """CR-2026-09-29-SEC-A: the owner consented to VIEW ONLY; no write reaches a view."""
    support, _, _ = _support_client(tenant, api_as)
    response = getattr(support, method)(path, {}, format="json")
    assert response.status_code == 403, (method, path, response.status_code)
    assert response.json()["error"]["code"] == "impersonation_forbidden"


def test_the_refusal_reads_as_view_only(tenant: Any, api_as: Any) -> None:
    """The snackbar shows the server's words; they must say why, not "no permission"."""
    support, _, _ = _support_client(tenant, api_as)
    body = support.post(reverse("v1:party-list"), {"name": "x"}, format="json").json()
    assert "view-only support session" in body["error"]["message"]


def test_the_anonymous_routes_never_read_a_token() -> None:
    """The routes outside the walk's assertion are exactly those with no authenticator.

    If one of them gained JWT authentication it would move into GUARDED and be
    asserted above; this pins that the remaining ones are the sign-in family
    family, not a business write that slipped through. `refresh` is here on
    purpose: it reads the operator's OWN refresh cookie, which is how a lapsed
    support token hands the tab back to them.
    """
    assert {p for _, p in ANONYMOUS} == {
        "/api/v1/auth/email/verify/confirm",
        "/api/v1/auth/login",
        "/api/v1/auth/password/reset/confirm",
        "/api/v1/auth/password/reset/request",
        "/api/v1/auth/refresh",
        "/api/v1/auth/register",
    }


@pytest.mark.parametrize(
    "name",
    [
        "v1:auth-me",
        "v1:party-list",
        "v1:tenant-current",
        "v1:notification-list",
    ],
)
def test_reads_still_work_under_a_support_session(tenant: Any, api_as: Any, name: str) -> None:
    """View only is not view nothing: the screens the operator came to look at still load."""
    support, _, _ = _support_client(tenant, api_as)
    response = support.get(reverse(name))
    assert response.status_code == 200, (name, response.json())


def test_the_allow_list_still_works(tenant: Any, api_as: Any) -> None:
    """Preview (a pure read), ending the session, and signing out are never refused."""
    from tests.factories.parties import PartyFactory

    support, _, _ = _support_client(tenant, api_as)
    party = PartyFactory(tenant=tenant)
    preview = support.post(
        reverse("v1:reminder-preview"), {"party_id": str(party.id)}, format="json"
    )
    assert preview.status_code != 403, preview.json()
    assert preview.json().get("error", {}).get("code") != "impersonation_forbidden"

    ended = support.post(reverse("v1:admin-imp-end"))
    assert ended.status_code == 200, ended.json()

    # A second session on the same consent, and the operator signs out of it.
    from apps.platform_app.models import SupportAccess

    admin, _, _ = _admin()
    consent = str(SupportAccess.objects.get(tenant=tenant).id)
    raw = _impersonate(admin, tenant, consent).cookies["ub_access"].value
    assert _bearer(raw).post(reverse("v1:auth-logout")).status_code == 200


def test_rows_written_under_a_support_token_stay_marked(tenant: Any, api_as: Any) -> None:
    """PLT-14 FR-5: anything audited in the session carries `impersonation=true`."""
    from apps.common.context import Ctx

    _, raw, admin_user = _support_client(tenant, api_as)
    request = RequestFactory().get("/api/v1/parties")
    request.user = admin_user
    request.auth_claims = dict(AccessToken(raw).payload)
    ctx = Ctx.from_request(request)
    assert ctx.audit_meta["impersonation"] is True
    assert ctx.audit_meta["impersonation_id"]
    assert ctx.actor_type == "super_admin"


def test_the_owners_own_session_is_unaffected(tenant: Any, api_as: Any) -> None:
    """The gate keys on the `imp` claim: the owner, even DURING a live support
    session on their business, still writes."""
    owner_client, _ = api_as(tenant, "owner")
    _support_client(tenant, api_as)  # a live support session exists meanwhile
    created = owner_client.post(
        reverse("v1:party-list"),
        {"name": "Owner's own", "party_type": "customer"},
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )
    assert created.status_code == 201, created.json()
    tenant_patch = owner_client.patch(
        reverse("v1:tenant-current"), {"name": "Renamed by owner"}, format="json"
    )
    assert tenant_patch.status_code == 200, tenant_patch.json()
