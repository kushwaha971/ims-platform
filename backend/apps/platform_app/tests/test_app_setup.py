"""docs/platform/14 step 5 — each app's setup checklist, on its own home.

Onboarding is never global (§4.1): app setup is per business per app, and it
never blocks. The steps are facts read from the books, a person sees only the
steps they could do, and the owner or an admin may hide the list for the
business (hidden is not done).
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from apps.library.models import LibraryMembershipType
from apps.platform_app.models import MembershipAppGrant
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


@pytest.fixture(autouse=True)
def _verticals_released() -> Iterator[None]:
    with override_settings(UB_UNRELEASED_MODULES=True):
        yield


def _business() -> Any:
    modules = [*ALL_MODULES, "library", "lending", "dues", "attendance"]
    return TenantFactory(
        plan=PlanFactory(modules=modules),
        partner=PartnerFactory(allowed_modules=modules),
        enabled_modules=modules,
        onboarding_step=4,
    )


def _person(tenant: Any, role: str) -> tuple[Any, APIClient]:
    user = UserFactory(password=PASSWORD)
    membership = MembershipFactory(user=user, tenant=tenant, role=RoleFactory(code=role, name=role))
    client = APIClient()
    got = client.post(
        reverse("v1:auth-login"), {"email": user.email, "password": PASSWORD}, format="json"
    )
    assert got.status_code == 200, got.content
    client.credentials(HTTP_X_CSRF_TOKEN=got.cookies[CSRF_COOKIE].value)
    return membership, client


def _setup(client: APIClient, app: str) -> dict:
    got = client.get(reverse("v1:app-setup", kwargs={"code": app}))
    assert got.status_code == 200, got.content
    return got.json()["data"]


def test_a_new_library_lists_its_three_steps_none_done() -> None:
    _, owner = _person(_business(), "owner")
    data = _setup(owner, "library")
    assert [(s["key"], s["done"]) for s in data["steps"]] == [
        ("plans", False),
        ("seats", False),
        ("student", False),
    ]
    assert data["steps"][0]["path"] == "/library/fees"
    assert (data["complete"], data["hidden"], data["can_hide"]) == (False, False, True)


def test_a_step_is_done_when_the_books_say_so() -> None:
    tenant = _business()
    _, owner = _person(tenant, "owner")
    LibraryMembershipType.objects.create(tenant=tenant, name="Monthly", code="MONTHLY")
    assert _setup(owner, "library")["steps"][0]["done"] is True


def test_lending_lists_routes_a_first_loan_and_the_team() -> None:
    _, owner = _person(_business(), "owner")
    assert [s["key"] for s in _setup(owner, "lending")["steps"]] == ["routes", "loan", "team"]


def test_a_person_sees_only_the_steps_they_could_do() -> None:
    tenant = _business()
    membership, staff = _person(tenant, "staff")
    data = _setup(staff, "library")
    assert "plans" not in [s["key"] for s in data["steps"]]
    assert data["can_hide"] is False


def test_an_app_the_person_is_not_in_has_no_checklist_for_them() -> None:
    tenant = _business()
    membership, staff = _person(tenant, "staff")
    MembershipAppGrant.objects.create(
        membership=membership, app="shop", role=RoleFactory(code="staff", name="staff")
    )
    assert _setup(staff, "library")["steps"] == []


def test_the_owner_hides_it_for_the_business_and_hidden_is_not_done() -> None:
    tenant = _business()
    _, owner = _person(tenant, "owner")
    _, admin = _person(tenant, "admin")
    got = owner.post(reverse("v1:app-setup-hide", kwargs={"code": "library"}))
    assert got.status_code == 200, got.content
    data = _setup(admin, "library")
    assert data["hidden"] is True and data["complete"] is False


def test_staff_cannot_hide_the_list_for_everyone() -> None:
    _, staff = _person(_business(), "staff")
    got = staff.post(reverse("v1:app-setup-hide", kwargs={"code": "library"}))
    assert got.status_code == 403
