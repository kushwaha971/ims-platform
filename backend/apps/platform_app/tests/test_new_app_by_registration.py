"""docs/platform/14 step 7 — a new app is a registration, not an edit.

R7 was that apps were listed in shared code, so a new one meant editing six
shared files. This test plays the next app (a gym) arriving the way the guide
(docs/platform/16) says it should: one `register_app` and one
`register_app_setup`, from the app's own code, and NOTHING else. If the
platform still needed a shared edit, one of these would fail: the owner would
not see it, could not add it, could not switch to it, would not land in it, or
would get no checklist.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from apps.platform_app import apps_registry
from apps.platform_app.apps_registry import AppSpec, SetupStep
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

GYM = AppSpec(
    code="gym",
    label_id="nav.workspace.gym",
    anchor="gym",
    capabilities=frozenset({"gym", "parties", "ledger", "payments", "sales"}),
    entry_permission="parties.party.read",
    home_path="/gym",
    order=30,
)


def _gym_setup(tenant: Any) -> list:
    return [
        SetupStep(
            key="plans",
            label_id="gym.setup.plans",
            path="/gym/plans",
            done=False,
            permission="parties.party.read",
        )
    ]


@pytest.fixture(autouse=True)
def _a_gym_registered_by_its_own_code() -> Iterator[None]:
    """What `apps/gym/apps.py` would do in `ready()` — and nothing more."""
    # Restored by hand rather than with `_reset_for_tests`, whose first call
    # snapshots whatever is registered at that moment — which would be the gym.
    apps_before = dict(apps_registry._APPS)
    with override_settings(UB_UNRELEASED_MODULES=True):
        apps_registry.register_app(GYM)
        apps_registry.register_app_setup("gym", _gym_setup)
        try:
            yield
        finally:
            apps_registry._APPS.clear()
            apps_registry._APPS.update(apps_before)
            apps_registry._SETUP.pop("gym", None)


def _owner(*, running_gym: bool) -> APIClient:
    plan = [*ALL_MODULES, "gym", "dues", "attendance"]
    enabled = [*ALL_MODULES, *(["gym"] if running_gym else [])]
    tenant = TenantFactory(
        plan=PlanFactory(modules=plan),
        partner=PartnerFactory(allowed_modules=plan),
        enabled_modules=enabled,
        onboarding_step=4,
    )
    user = UserFactory(password=PASSWORD)
    MembershipFactory(user=user, tenant=tenant, role=RoleFactory(code="owner", name="Owner"))
    client = APIClient()
    got = client.post(
        reverse("v1:auth-login"), {"email": user.email, "password": PASSWORD}, format="json"
    )
    assert got.status_code == 200, got.content
    client.credentials(HTTP_X_CSRF_TOKEN=got.cookies[CSRF_COOKIE].value)
    return client


def test_the_owner_is_offered_the_new_app_and_adding_it_opens_it() -> None:
    owner = _owner(running_gym=False)
    me = owner.get(reverse("v1:auth-me")).json()["data"]
    assert "gym" in [a["code"] for a in me["apps_addable"]]
    got = owner.post(reverse("v1:tenant-apps"), {"app": "gym", "running": True}, format="json")
    assert got.status_code == 200, got.content
    assert [a["code"] for a in got.json()["data"]["apps"]] == ["gym", "shop"]


def test_a_business_running_it_lands_in_it_and_can_switch_to_it() -> None:
    owner = _owner(running_gym=True)
    me = owner.get(reverse("v1:auth-me")).json()["data"]
    gym = next(a for a in me["apps"] if a["code"] == "gym")
    assert gym == {"code": "gym", "label_id": "nav.workspace.gym", "home_path": "/gym", "order": 30}
    switched = owner.post(reverse("v1:auth-switch-app"), {"app": "gym"}, format="json")
    assert switched.status_code == 200, switched.content
    data = switched.json()["data"]
    assert data["active_app"] == "gym"
    assert (data["landing"]["app"], data["landing"]["path"]) == ("gym", "/gym")


def test_its_home_gets_a_setup_checklist() -> None:
    owner = _owner(running_gym=True)
    setup = owner.get(reverse("v1:app-setup", kwargs={"code": "gym"})).json()["data"]
    assert [s["key"] for s in setup["steps"]] == ["plans"]
