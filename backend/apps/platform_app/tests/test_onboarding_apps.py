"""Choosing what a business runs when it is set up (owner, 11 Oct 2026).

Until this change `POST /tenants` gave every business the Shop: the modules
came from a business-type preset, the wizard asked no question about apps, and
its last step wrote the preset back over `enabled_modules`. A reading room had
to sign up as a shop, find the switcher, add Library and turn the Shop off —
and Library and Lending could not be seen at sign-up at all.

Tier 1: this decides which capabilities a tenant has from its first request.
"""

from __future__ import annotations

import itertools
from typing import Any

import pytest
from django.urls import reverse

pytestmark = pytest.mark.django_db

CREATE_URL = "v1:tenant-create"
CURRENT_URL = "v1:tenant-current"
OFFER_URL = "v1:onboarding-apps"
_KEYS = itertools.count(1)


def _create(client: Any, **overrides: Any) -> Any:
    payload = {"name": "Vidya Reading Room", "state_code": "27", "locale": "en"}
    payload.update(overrides)
    return client.post(
        reverse(CREATE_URL), payload, format="json", HTTP_IDEMPOTENCY_KEY=f"apps-{next(_KEYS)}"
    )


def _tenant_of(response: Any) -> Any:
    from apps.platform_app.models import Tenant

    assert response.status_code in (200, 201), response.json()
    return Tenant.objects.get(pk=response.json()["data"]["tenant"]["id"])


def _running(tenant: Any) -> set[str]:
    from apps.platform_app import apps_registry

    return {a.code for a in apps_registry.apps_of_business(tenant)}


def _scoped(member_user: Any, tenant: Any) -> Any:
    from rest_framework.test import APIClient

    from apps.platform_app.models import Membership
    from tests.fixtures import build_access_token

    membership = Membership.objects.get(user=member_user, tenant=tenant)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {build_access_token(membership)}")
    return client


def test_a_new_business_is_offered_every_released_app(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    """The root cause, asserted: Library and Lending are registered, released and
    on the default plan, so the sign-up choice must list them. The list is the
    registry's — an app registered tomorrow appears with no frontend release."""
    client, _member = api_as(tenant)
    response = client.get(reverse(OFFER_URL))
    assert response.status_code == 200
    codes = [app["code"] for app in response.json()["data"]]
    assert {"shop", "library", "lending"} <= set(codes)
    assert all(app["label_id"] and app["home_path"].startswith("/") for app in response.json()["data"])


def test_an_unreleased_app_is_never_offered_at_sign_up(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    """Gym and Hotel are behind the release gate (PLT-X11). Offering them here
    would let a new business start on a module nobody may see."""
    client, _member = api_as(tenant)
    codes = {app["code"] for app in client.get(reverse(OFFER_URL)).json()["data"]}
    assert not codes & {"gym", "hotel", "hospitality"}
    refused = _create(client, apps=["gym"])
    assert refused.status_code == 400, refused.json()


def test_the_offer_needs_a_signed_in_caller(anonymous_client: Any, onboarding_ready: Any) -> None:
    assert anonymous_client.get(reverse(OFFER_URL)).status_code == 401


def test_no_choice_still_means_the_shop(api_as: Any, tenant: Any, onboarding_ready: Any) -> None:
    """Every client and script from before this change sends no `apps`. They
    get exactly what they always got — and since DEC-019 that is two apps: the
    Shop and the Udhaar book, which was part of the Shop until it became an app
    of its own (the release migration gave both to every existing Shop)."""
    client, _member = api_as(tenant)
    created = _tenant_of(_create(client, business_type="retail"))
    assert _running(created) == {"shop", "khata"}
    assert {"sales", "purchases", "inventory", "expenses"} <= set(created.enabled_modules)


@pytest.mark.parametrize("app,anchor", [("library", "library"), ("lending", "lending")])
def test_a_business_that_chose_one_app_runs_only_that_app(
    api_as: Any, tenant: Any, onboarding_ready: Any, app: str, anchor: str
) -> None:
    """A library is not handed Shop & billing to switch off afterwards: no
    sales, no purchases, no stock, and no kind-of-shop question to answer."""
    client, _member = api_as(tenant)
    created = _tenant_of(_create(client, apps=[app]))
    modules = set(created.enabled_modules)
    assert _running(created) == {app}
    assert anchor in modules
    assert {"parties", "ledger", "payments"} <= modules, "what the app itself depends on"
    assert not modules & {"sales", "purchases", "inventory", "expenses"}


def test_several_apps_can_be_chosen_together(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    client, _member = api_as(tenant)
    created = _tenant_of(_create(client, apps=["shop", "library", "lending"], business_type="retail"))
    assert _running(created) == {"shop", "library", "lending"}


def test_the_kind_of_shop_is_asked_only_of_a_shop(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    """`business_type` configures Shop & billing and nothing else, so a
    business without the Shop may leave it out and one with it may not."""
    client, _member = api_as(tenant)
    assert _create(client, apps=["shop"]).status_code == 400
    assert _create(client).status_code == 400, "no apps means the shop"
    assert _create(client, apps=["lending"]).status_code in (200, 201)


@pytest.mark.parametrize("apps", [[], ["nonsense"], ["shop", "nonsense"], "library"])
def test_an_empty_or_unknown_choice_is_refused(
    api_as: Any, tenant: Any, onboarding_ready: Any, apps: Any
) -> None:
    """Nothing is created for a choice the server cannot honour exactly."""
    from apps.platform_app.models import Tenant

    client, _member = api_as(tenant)
    before = Tenant.objects.count()
    response = _create(client, apps=apps, business_type="retail")
    assert response.status_code == 400, response.json()
    assert Tenant.objects.count() == before


def test_finishing_setup_does_not_switch_the_chosen_app_off(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    """The last step applies the business-type preset. It used to write the
    preset over the whole of `enabled_modules`, which would turn a library back
    into a shop at the moment its owner pressed Finish."""
    client, member = api_as(tenant)
    created = _tenant_of(_create(client, apps=["library"]))
    scoped = _scoped(member.user, created)
    for step in (2, 3, 4):
        response = scoped.patch(reverse(CURRENT_URL), {"onboarding_step": step}, format="json")
        assert response.status_code == 200, response.json()
    created.refresh_from_db()
    assert created.onboarding_step == 4
    assert _running(created) == {"library"}
    assert "sales" not in created.enabled_modules


def test_finishing_setup_keeps_an_app_chosen_beside_the_shop(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    """Shop + Lending: the preset still governs the shop's side (a services
    business gets no stock) and leaves Lending alone."""
    client, member = api_as(tenant)
    created = _tenant_of(_create(client, apps=["shop", "lending"], business_type="services"))
    scoped = _scoped(member.user, created)
    for step in (2, 3, 4):
        scoped.patch(reverse(CURRENT_URL), {"onboarding_step": step}, format="json")
    created.refresh_from_db()
    assert _running(created) == {"shop", "lending"}
    assert "inventory" not in created.enabled_modules


def test_the_session_opens_on_the_chosen_app(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    """The first workspace follows the choice: the session a lending business
    is issued lists Lending and not the Shop, and still offers the Shop to add."""
    client, _member = api_as(tenant)
    response = _create(client, apps=["lending"])
    session = response.json()["data"]["session"]
    assert [a["code"] for a in session["apps"]] == ["lending"]
    assert "shop" in {a["code"] for a in session["apps_addable"]}


def test_changing_the_choice_before_finishing_changes_what_runs(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    """Back to step 1, a different tick. The unfinished business is resumed
    (NEW-1) and must run what was chosen THIS time, with nothing of the first
    choice left behind — a reading room that first ticked the Shop would
    otherwise keep Purchases and Expenses for ever."""
    client, _member = api_as(tenant)
    first = _tenant_of(_create(client, apps=["shop"], business_type="retail"))
    again = _tenant_of(_create(client, apps=["library"]))
    assert again.id == first.id
    assert _running(again) == {"library"}
    assert not set(again.enabled_modules) & {"sales", "purchases", "inventory", "expenses"}


def test_choosing_apps_is_audited_like_adding_one_later(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    """An app chosen at sign-up goes through the same service as one added a
    month on, so the module change is on the audit trail either way."""
    from apps.platform_app.models import AuditLog

    client, _member = api_as(tenant)
    created = _tenant_of(_create(client, apps=["lending"]))
    assert AuditLog.objects.filter(tenant=created).count() >= 2


def test_the_tenant_says_which_apps_it_runs(api_as: Any, tenant: Any, onboarding_ready: Any) -> None:
    """The wizard restores its step-1 choice from this after a reload."""
    client, _member = api_as(tenant)
    response = _create(client, apps=["library", "lending"])
    assert sorted(response.json()["data"]["tenant"]["apps"]) == ["lending", "library"]


def test_step_one_can_change_the_choice_until_setup_is_finished(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    """Back to step 1 inside the wizard is a PATCH, not a create. It carries
    the choice too — and stops carrying it at Finish, because from then on an
    app holds people and books and is turned off from the business menu."""
    client, member = api_as(tenant)
    created = _tenant_of(_create(client, apps=["library"]))
    scoped = _scoped(member.user, created)

    changed = scoped.patch(reverse(CURRENT_URL), {"apps": ["lending", "library"]}, format="json")
    assert changed.status_code == 200, changed.json()
    assert sorted(changed.json()["data"]["apps"]) == ["lending", "library"]

    for step in (2, 3, 4):
        scoped.patch(reverse(CURRENT_URL), {"onboarding_step": step}, format="json")
    late = scoped.patch(reverse(CURRENT_URL), {"apps": ["shop"]}, format="json")
    assert late.status_code == 400
    created.refresh_from_db()
    assert _running(created) == {"library", "lending"}


def test_staff_cannot_change_what_the_business_runs(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    """Permission scenario: the choice is the owner's, at sign-up as later."""
    from apps.platform_app.models import Role
    from tests.factories.platform import MembershipFactory, UserFactory
    from tests.fixtures import build_access_token
    from rest_framework.test import APIClient

    client, _member = api_as(tenant)
    created = _tenant_of(_create(client, apps=["library"]))
    staff_role = Role.objects.filter(tenant__isnull=True, code="staff").first()
    staff = MembershipFactory(user=UserFactory(), tenant=created, role=staff_role)
    as_staff = APIClient()
    as_staff.credentials(HTTP_AUTHORIZATION=f"Bearer {build_access_token(staff)}")
    response = as_staff.patch(reverse(CURRENT_URL), {"apps": ["lending"]}, format="json")
    assert response.status_code == 403, response.json()
    created.refresh_from_db()
    assert _running(created) == {"library"}
