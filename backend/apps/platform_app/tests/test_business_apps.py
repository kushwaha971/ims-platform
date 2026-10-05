"""docs/platform/14 step 4 — adding, turning off and leaving an app.

Owner decision 2 (§6): "Leave" depends on who asks. The OWNER turns an app off
for the business — the menu goes for everyone and the data stays. Anyone else
takes themselves out of that app. Decision 3: a new business starts with the
Shop and its owner adds apps from the switcher. Two refusals are one rule: a
business runs at least one app, and a member is in at least one.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APIClient

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


def _business(*, running: tuple[str, ...] = ("library", "lending")) -> Any:
    """A business whose PLAN includes every app and which RUNS `running` plus the Shop."""
    plan = [*ALL_MODULES, *VERTICALS]
    enabled = [m for m in ALL_MODULES] + [v for v in VERTICALS if v in running]
    enabled += ["dues", "attendance"] if running else []
    return TenantFactory(
        plan=PlanFactory(modules=plan),
        partner=PartnerFactory(allowed_modules=plan),
        enabled_modules=enabled,
        onboarding_step=4,
    )


def _role(code: str) -> Any:
    return RoleFactory(code=code, name=code.title())


def _person(tenant: Any, role: str) -> tuple[Any, APIClient]:
    user = UserFactory(password=PASSWORD)
    membership = MembershipFactory(user=user, tenant=tenant, role=_role(role))
    client = APIClient()
    got = client.post(
        reverse("v1:auth-login"), {"email": user.email, "password": PASSWORD}, format="json"
    )
    assert got.status_code == 200, got.content
    client.credentials(HTTP_X_CSRF_TOKEN=got.cookies[CSRF_COOKIE].value)
    return membership, client


def _codes(rows: list[dict]) -> list[str]:
    return [row["code"] for row in rows]


# ── The owner adds and turns off apps ───────────────────────────────────────


def test_the_owner_is_offered_the_apps_the_plan_has_and_the_business_does_not_run() -> None:
    tenant = _business(running=())
    _, owner = _person(tenant, "owner")
    me = owner.get(reverse("v1:auth-me")).json()["data"]
    assert _codes(me["apps"]) == ["shop"]
    assert _codes(me["apps_addable"]) == ["library", "lending"]


def test_nobody_but_the_owner_is_offered_an_app_to_add() -> None:
    tenant = _business(running=())
    _, staff = _person(tenant, "staff")
    assert staff.get(reverse("v1:auth-me")).json()["data"]["apps_addable"] == []


def test_adding_an_app_runs_it_for_everyone() -> None:
    tenant = _business(running=())
    _, owner = _person(tenant, "owner")
    _, staff = _person(tenant, "staff")
    got = owner.post(reverse("v1:tenant-apps"), {"app": "library", "running": True}, format="json")
    assert got.status_code == 200, got.content
    assert _codes(got.json()["data"]["apps"]) == ["library", "shop"]
    assert "library" not in _codes(got.json()["data"]["apps_addable"])
    tenant.refresh_from_db()
    assert {"library", "payments"} <= set(tenant.enabled_modules)
    # A legacy staff row (no grants) whose role opens the library now sees it.
    me = staff.get(reverse("v1:auth-me")).json()["data"]
    assert "library" in _codes(me["apps"]) or "library.member.read" not in me["permissions"]


def test_turning_an_app_off_keeps_its_data_and_removes_it_for_everyone() -> None:
    tenant = _business(running=("lending",))
    _, owner = _person(tenant, "owner")
    got = owner.post(reverse("v1:tenant-apps"), {"app": "lending", "running": False}, format="json")
    assert got.status_code == 200, got.content
    data = got.json()["data"]
    assert _codes(data["apps"]) == ["shop"]
    assert "lending" in _codes(data["apps_addable"])
    tenant.refresh_from_db()
    assert "lending" not in tenant.enabled_modules
    # Only the anchor goes: the shared engines the Shop also uses stay on.
    assert {"parties", "ledger", "payments"} <= set(tenant.enabled_modules)


def test_a_business_keeps_at_least_one_app() -> None:
    tenant = _business(running=())
    _, owner = _person(tenant, "owner")
    got = owner.post(reverse("v1:tenant-apps"), {"app": "shop", "running": False}, format="json")
    assert got.status_code == 409
    assert got.json()["error"]["code"] == "app_last_one"
    assert got.json()["error"]["details"]["of"] == "business"


@pytest.mark.parametrize("role", ["admin", "staff", "accountant"])
def test_only_the_owner_adds_or_turns_off_an_app(role: str) -> None:
    tenant = _business(running=("lending",))
    _, someone = _person(tenant, role)
    for running in (True, False):
        got = someone.post(
            reverse("v1:tenant-apps"), {"app": "lending", "running": running}, format="json"
        )
        assert got.status_code == 403, (running, got.content)
    tenant.refresh_from_db()
    assert "lending" in tenant.enabled_modules


def test_an_unknown_app_is_refused_rather_than_ignored() -> None:
    _, owner = _person(_business(), "owner")
    got = owner.post(reverse("v1:tenant-apps"), {"app": "casino", "running": True}, format="json")
    assert got.status_code == 400


# ── Anyone else leaves an app ───────────────────────────────────────────────


def test_a_member_with_grants_leaves_one_app_and_keeps_the_rest() -> None:
    tenant = _business()
    membership, staff = _person(tenant, "staff")
    for app in ("library", "shop"):
        MembershipAppGrant.objects.create(membership=membership, app=app, role=_role("staff"))
    version = membership.permissions_version
    got = staff.post(reverse("v1:auth-leave-app"), {"app": "library"}, format="json")
    assert got.status_code == 200, got.content
    assert set(
        MembershipAppGrant.objects.filter(membership=membership).values_list("app", flat=True)
    ) == {"shop"}
    assert Membership.objects.get(pk=membership.pk).permissions_version == version + 1


def test_a_member_from_before_grants_keeps_every_other_app_explicitly() -> None:
    tenant = _business()
    membership, admin = _person(tenant, "admin")
    before = _codes(admin.get(reverse("v1:auth-me")).json()["data"]["apps"])
    assert "lending" in before
    got = admin.post(reverse("v1:auth-leave-app"), {"app": "lending"}, format="json")
    assert got.status_code == 200, got.content
    kept = set(
        MembershipAppGrant.objects.filter(membership=membership).values_list("app", flat=True)
    )
    assert kept == set(before) - {"lending"}
    roles = set(
        MembershipAppGrant.objects.filter(membership=membership).values_list(
            "role__code", flat=True
        )
    )
    assert roles == {"admin"}


def test_leaving_the_app_you_were_in_forgets_it() -> None:
    tenant = _business()
    membership, staff = _person(tenant, "staff")
    Membership.objects.filter(pk=membership.pk).update(last_app="library")
    staff.post(reverse("v1:auth-leave-app"), {"app": "library"}, format="json")
    assert Membership.objects.get(pk=membership.pk).last_app == ""


def test_a_member_cannot_leave_their_last_app() -> None:
    tenant = _business()
    membership, staff = _person(tenant, "staff")
    MembershipAppGrant.objects.create(membership=membership, app="shop", role=_role("staff"))
    got = staff.post(reverse("v1:auth-leave-app"), {"app": "shop"}, format="json")
    assert got.status_code == 409
    assert got.json()["error"]["code"] == "app_last_one"
    assert got.json()["error"]["details"]["of"] == "member"


def test_the_owner_turns_an_app_off_rather_than_leaving_it() -> None:
    _, owner = _person(_business(), "owner")
    got = owner.post(reverse("v1:auth-leave-app"), {"app": "lending"}, format="json")
    assert got.status_code == 409
    assert got.json()["error"]["code"] == "owner_in_every_app"


def test_leaving_an_app_you_are_not_in_is_refused() -> None:
    tenant = _business()
    membership, staff = _person(tenant, "staff")
    MembershipAppGrant.objects.create(membership=membership, app="shop", role=_role("staff"))
    got = staff.post(reverse("v1:auth-leave-app"), {"app": "library"}, format="json")
    assert got.status_code == 400
