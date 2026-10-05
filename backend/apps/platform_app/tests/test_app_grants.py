"""docs/platform/14 §4.2 and §6 — apps, and per-person app grants with a role per app.

The owner's words: "I worked here but I want to own my side business along
with that", and "owner for shop but employee of library". A person's access is
a list of grants, business → app → role; the owner of a business is in every
app; a membership with no grants is a legacy one whose role covers every app.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from apps.common.permissions_registry import permissions_for
from apps.platform_app.models import Membership, MembershipAppGrant
from apps.platform_app.tokens import CSRF_COOKIE
from tests.factories.platform import (
    ALL_MODULES,
    MembershipFactory,
    PartnerFactory,
    PlanFactory,
    RoleFactory,
    TenantFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db
PASSWORD = "Kirana-1234-x"
VERTICALS = ["library", "lending", "dues", "attendance"]


@pytest.fixture(autouse=True)
def _verticals_released() -> Iterator[None]:
    with override_settings(UB_UNRELEASED_MODULES=True):
        yield


def _business(*, verticals: tuple[str, ...] = ("library", "lending"), shop: bool = True) -> Any:
    modules = [m for m in ALL_MODULES if shop or m not in {"sales", "purchases", "inventory"}]
    modules += [v for v in VERTICALS if v in verticals or v in {"dues", "attendance"}]
    return TenantFactory(
        plan=PlanFactory(modules=modules),
        partner=PartnerFactory(allowed_modules=modules),
        enabled_modules=modules,
        onboarding_step=4,
    )


def _role(code: str) -> Any:
    return RoleFactory(code=code, name=code.title())


def _client(user: Any) -> APIClient:
    client = APIClient()
    got = client.post(
        reverse("v1:auth-login"), {"email": user.email, "password": PASSWORD}, format="json"
    )
    assert got.status_code == 200, got.content
    client.credentials(HTTP_X_CSRF_TOKEN=got.cookies[CSRF_COOKIE].value)
    return client


def _me(client: APIClient) -> dict:
    return client.get(reverse("v1:auth-me")).json()["data"]


def _grant(membership: Any, **apps: str) -> None:
    for app, role in apps.items():
        MembershipAppGrant.objects.create(membership=membership, app=app, role=_role(role))


# ── Which apps a person sees ────────────────────────────────────────────────


def test_an_owner_is_in_every_app_the_business_runs_verticals_first() -> None:
    user = UserFactory(password=PASSWORD)
    MembershipFactory(user=user, tenant=_business(), role=_role("owner"))
    me = _me(_client(user))
    assert [a["code"] for a in me["apps"]] == ["library", "lending", "shop"]
    assert me["active_app"] == "library"
    assert me["landing"]["app"] == "library" and me["landing"]["path"] == "/library"


def test_a_business_without_the_shop_has_no_shop_app() -> None:
    user = UserFactory(password=PASSWORD)
    MembershipFactory(user=user, tenant=_business(verticals=("library",), shop=False),
                      role=_role("owner"))  # fmt: skip
    assert [a["code"] for a in _me(_client(user))["apps"]] == ["library"]


def test_a_member_without_grants_keeps_every_app_their_role_opens() -> None:
    """Legacy: memberships from before grants existed behave exactly as they did."""
    user = UserFactory(password=PASSWORD)
    MembershipFactory(user=user, tenant=_business(), role=_role("staff"))
    assert [a["code"] for a in _me(_client(user))["apps"]] == ["library", "lending", "shop"]


def test_a_grant_puts_a_person_in_that_app_only_with_that_apps_rights() -> None:
    user = UserFactory(password=PASSWORD)
    m = MembershipFactory(user=user, tenant=_business(), role=_role("staff"))
    _grant(m, lending="staff")
    me = _me(_client(user))
    assert [a["code"] for a in me["apps"]] == ["lending"]
    held = set(me["permissions"])
    assert "lending.today.read" in held and "parties.party.read" in held  # lending uses parties
    assert "sales.invoice.read" not in held and "library.member.read" not in held


def test_admin_in_the_shop_and_staff_in_the_library_is_exactly_that() -> None:
    user = UserFactory(password=PASSWORD)
    m = MembershipFactory(user=user, tenant=_business(), role=_role("staff"))
    _grant(m, shop="admin", library="staff")
    held = permissions_for(Membership.objects.select_related("role", "tenant").get(pk=m.pk))
    assert "sales.invoice.void" in held  # an admin's in the shop
    assert "library.member.close" not in held  # staff's in the library
    assert "library.member.read" in held


def test_owning_one_business_and_working_in_another_never_mixes() -> None:
    """The owner's case: rights in the side business never reach the workplace."""
    user = UserFactory(password=PASSWORD)
    side = _business(verticals=())
    work = _business()
    MembershipFactory(user=user, tenant=side, role=_role("owner"), is_default=True)
    m = MembershipFactory(user=user, tenant=work, role=_role("staff"), is_default=False)
    _grant(m, lending="staff")
    client = _client(user)
    assert "platform.members.manage" in _me(client)["permissions"]
    switched = client.post(reverse("v1:auth-switch-tenant"), {"tenant_id": str(work.id)},
                           format="json").json()["data"]  # fmt: skip
    assert "platform.members.manage" not in switched["permissions"]
    assert [a["code"] for a in switched["apps"]] == ["lending"]


# ── Switching app ───────────────────────────────────────────────────────────


def test_switching_app_is_remembered_for_the_next_sign_in_on_any_device() -> None:
    user = UserFactory(password=PASSWORD)
    MembershipFactory(user=user, tenant=_business(), role=_role("owner"))
    got = _client(user).post(reverse("v1:auth-switch-app"), {"app": "lending"}, format="json")
    assert got.status_code == 200, got.content
    assert got.json()["data"]["active_app"] == "lending"
    landing = _me(_client(user))["landing"]  # another device, later
    assert landing["app"] == "lending" and landing["path"] == "/lending"


def test_an_app_the_person_is_not_in_cannot_be_switched_to() -> None:
    user = UserFactory(password=PASSWORD)
    m = MembershipFactory(user=user, tenant=_business(), role=_role("staff"))
    _grant(m, lending="staff")
    got = _client(user).post(reverse("v1:auth-switch-app"), {"app": "shop"}, format="json")
    assert got.status_code == 403


# ── Setting grants (the Team screen) ────────────────────────────────────────


@pytest.fixture
def team() -> dict:
    tenant = _business()
    _role("admin")  # the system roles a real database is seeded with
    owner = UserFactory(password=PASSWORD)
    MembershipFactory(user=owner, tenant=tenant, role=_role("owner"))
    ravi = MembershipFactory(tenant=tenant, role=_role("staff"), is_default=True)
    return {"tenant": tenant, "owner": owner, "ravi": ravi}


def _put(client: APIClient, membership: Any, grants: list[dict]) -> Any:
    return client.put(
        reverse("v1:member-apps", args=[membership.id]), {"grants": grants}, format="json"
    )


def test_the_owner_assigns_apps_per_person(team: dict) -> None:
    client = _client(team["owner"])
    got = _put(client, team["ravi"], [{"app": "lending", "role": "staff"},
                                      {"app": "shop", "role": "admin"}])  # fmt: skip
    assert got.status_code == 200, got.content
    assert [(g["app"], g["role"]) for g in got.json()["data"]["grants"]] == [
        ("lending", "staff"),
        ("shop", "admin"),
    ]
    team["ravi"].refresh_from_db()
    assert team["ravi"].permissions_version == 2  # held sessions re-read


@pytest.mark.parametrize(
    "grants, says",
    [
        ([{"app": "gym", "role": "staff"}], "does not run that app"),
        ([{"app": "lending", "role": "owner"}], "choose a role"),
        ([{"app": "lending", "role": "staff"}, {"app": "lending", "role": "admin"}], "one role"),
    ],
)
def test_a_grant_the_business_cannot_give_is_refused(team: dict, grants: list, says: str) -> None:
    got = _put(_client(team["owner"]), team["ravi"], grants)
    assert got.status_code == 400
    assert says in " ".join(got.json()["error"]["details"]["grants"])


def test_the_owner_takes_no_grants(team: dict) -> None:
    owner_membership = Membership.objects.get(user=team["owner"], tenant=team["tenant"])
    got = _put(_client(team["owner"]), owner_membership, [{"app": "shop", "role": "staff"}])
    assert got.status_code == 400


def test_only_the_owner_makes_someone_an_admin(team: dict) -> None:
    admin = UserFactory(password=PASSWORD)
    MembershipFactory(user=admin, tenant=team["tenant"], role=_role("admin"))
    got = _put(_client(admin), team["ravi"], [{"app": "shop", "role": "admin"}])
    assert got.status_code == 400
    assert "only the owner" in " ".join(got.json()["error"]["details"]["grants"])


def test_staff_cannot_set_anyones_apps(team: dict) -> None:
    staff = UserFactory(password=PASSWORD)
    MembershipFactory(user=staff, tenant=team["tenant"], role=_role("staff"))
    got = _put(_client(staff), team["ravi"], [{"app": "shop", "role": "staff"}])
    assert got.status_code == 403


def test_another_business_member_is_not_found(team: dict) -> None:
    stranger = MembershipFactory(tenant=_business(), role=_role("staff"))
    got = _put(_client(team["owner"]), stranger, [{"app": "shop", "role": "staff"}])
    assert got.status_code == 404
