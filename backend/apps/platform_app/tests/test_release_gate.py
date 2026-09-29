"""PLT-X11 — the release gate for module codes that land before their module ships.

T-PLT-X11-1, -2 and the R11 widening to `effective_modules`. The defect this whole
file prevents is vision §4's: a merchant must never see, switch on or reach a
module that is not built. A module code has to land with its app's first
migration, weeks before the module is released, and `modules_view` lists every
`ModuleCode` it knows — so without this gate the first vertical's first commit
would put a locked "Gym" row on every tenant's Features screen.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest
from django.test import override_settings
from django.urls import reverse

from apps.common.constants import ModuleCode
from apps.common.exceptions import ModuleDisabled
from apps.common.permissions import ModuleEnabled
from apps.platform_app.constants import UNRELEASED_MODULES
from apps.platform_app.services import entitlements, tenant_settings

pytestmark = pytest.mark.django_db

NEW = ("lending", "library", "gym", "hospitality")


def _with_new_modules(tenant: Any) -> Any:
    """A plan, a partner and a switch that all say yes to every new module.

    The gate has to hold even when every piece of DATA says the module is
    there — which is exactly the state a developer's database is in after they
    enabled gym with the flag on and then restarted without it.
    """
    for row, field in ((tenant.plan, "modules"), (tenant.partner, "allowed_modules")):
        setattr(row, field, sorted(set(getattr(row, field)) | set(NEW)))
        row.save(update_fields=[field])
    tenant.enabled_modules = sorted(set(tenant.enabled_modules) | set(NEW))
    tenant.save(update_fields=["enabled_modules"])
    tenant.refresh_from_db()
    return tenant


def test_the_four_new_codes_exist_and_are_all_unreleased() -> None:
    """Contracts §1.1: the codes are real `ModuleCode` values and every one of
    them is behind the gate until its release CR. A code added to the enum and
    forgotten in the set is shown to every merchant the next deploy."""
    values = {m.value for m in ModuleCode}
    assert set(NEW) <= values
    assert UNRELEASED_MODULES == frozenset(NEW)


def test_released_modules_leaves_out_the_new_codes_unless_the_flag_is_set() -> None:
    """`released_modules()` reads the setting at CALL time; a value captured at
    import would make `override_settings` (and a restart without the flag) a
    no-op."""
    everything = {m.value for m in ModuleCode}
    assert entitlements.released_modules() == frozenset(everything - set(NEW))
    with override_settings(UB_UNRELEASED_MODULES=True):
        assert entitlements.released_modules() == frozenset(everything)
        assert entitlements.hidden_modules() == frozenset()


def test_modules_view_lists_no_unreleased_code_without_the_flag(tenant: Any) -> None:
    """T-PLT-X11-1: not in `available`, not in `locked`, not in `enabled` — a
    locked row is still an unbuilt feature on screen."""
    view = tenant_settings.modules_view(_with_new_modules(tenant))
    for key in ("available", "locked", "enabled"):
        assert not set(view[key]) & set(NEW), key


def test_modules_view_lists_them_with_the_flag(tenant: Any) -> None:
    """T-PLT-X11-1, positive control: with the flag a developer can see and
    enable them, or nobody could ever build one."""
    with override_settings(UB_UNRELEASED_MODULES=True):
        view = tenant_settings.modules_view(_with_new_modules(tenant))
    assert set(NEW) <= set(view["available"])
    assert set(NEW) <= set(view["enabled"])


def test_an_unreleased_code_is_listed_as_locked_with_the_flag_when_the_plan_lacks_it(
    tenant: Any,
) -> None:
    """With the flag the new codes are ordinary codes: outside the plan they
    are `locked`, exactly like any other module."""
    with override_settings(UB_UNRELEASED_MODULES=True):
        view = tenant_settings.modules_view(tenant)
    assert set(NEW) <= set(view["locked"])


def test_enabling_an_unreleased_code_is_refused_as_not_in_the_plan(
    api_as: Any, tenant: Any
) -> None:
    """T-PLT-X11-2 / BR-2: the API refuses it whatever the plan says, with the
    existing message, so a hand-made PATCH cannot switch on an unbuilt module."""
    _with_new_modules(tenant)
    tenant.enabled_modules = [m for m in tenant.enabled_modules if m not in NEW]
    tenant.save(update_fields=["enabled_modules"])
    client, _member = api_as(tenant, role="owner")
    response = client.patch(
        reverse("v1:tenant-current"),
        {"enabled_modules": [*tenant.enabled_modules, "gym"]},
        format="json",
    )
    assert response.status_code == 400, response.content
    error = response.json()["error"]
    assert error["code"] == "validation_error"
    assert error["details"]["enabled_modules"] == ["'gym' is not included in your plan."]


def test_with_the_flag_an_unreleased_code_can_be_enabled(api_as: Any, tenant: Any) -> None:
    """Positive control for BR-2: the e2e stack enables gym with the flag on."""
    _with_new_modules(tenant)
    tenant.enabled_modules = [m for m in tenant.enabled_modules if m not in NEW]
    tenant.save(update_fields=["enabled_modules"])
    client, _member = api_as(tenant, role="owner")
    with override_settings(UB_UNRELEASED_MODULES=True):
        response = client.patch(
            reverse("v1:tenant-current"),
            {"enabled_modules": [*tenant.enabled_modules, "gym"]},
            format="json",
        )
    assert response.status_code == 200, response.content
    tenant.refresh_from_db()
    assert "gym" in tenant.enabled_modules


def test_switching_another_module_does_not_wipe_a_stored_unreleased_code(
    api_as: Any, tenant: Any
) -> None:
    """EC-1: a dev database with gym enabled, then the flag removed — gym
    disappears from responses but the DATA stays, so putting the flag back
    restores it. A PATCH that rewrote `enabled_modules` from the filtered view
    would silently switch gym off for good."""
    _with_new_modules(tenant)
    client, _member = api_as(tenant, role="owner")
    visible = [m for m in tenant.enabled_modules if m not in NEW and m != "expenses"]
    response = client.patch(
        reverse("v1:tenant-current"), {"enabled_modules": visible}, format="json"
    )
    assert response.status_code == 200, response.content
    tenant.refresh_from_db()
    assert "expenses" not in tenant.enabled_modules
    assert set(NEW) <= set(tenant.enabled_modules)


def test_effective_modules_leaves_out_unreleased_codes(tenant: Any) -> None:
    """R11: `effective_modules` is the ONE answer `/auth/me`, `ModuleEnabled`,
    `plan_limits.modules` and `EngineEnabled` read. Filtering only the three
    functions contracts §1.1 first named left this one reporting gym."""
    _with_new_modules(tenant)
    assert not entitlements.effective_modules(tenant) & set(NEW)
    with override_settings(UB_UNRELEASED_MODULES=True):
        assert set(NEW) <= entitlements.effective_modules(tenant)


def test_for_tenant_is_not_filtered_so_reconcile_keeps_the_data(tenant: Any) -> None:
    """`reconcile_entitlements` switches off whatever the ENTITLEMENT lacks.
    If the release gate lived in `for_tenant`, the nightly job would strip gym
    from a developer's `enabled_modules` the first night the flag was off."""
    _with_new_modules(tenant)
    assert set(NEW) <= entitlements.for_tenant(tenant).modules


def test_module_enabled_refuses_an_unreleased_code(tenant: Any) -> None:
    """T-PLT-X11-2: 403 `module_disabled` for `ModuleEnabled("gym")`, even with
    gym in the plan, the partner and the switches."""
    _with_new_modules(tenant)
    request = SimpleNamespace(_ub_tenant=tenant, method="GET")
    view = SimpleNamespace(action_map=None)
    with pytest.raises(ModuleDisabled) as caught:
        ModuleEnabled("gym")().has_permission(request, view)
    assert caught.value.details == {"module": "gym"}
    with override_settings(UB_UNRELEASED_MODULES=True):
        assert ModuleEnabled("gym")().has_permission(request, view) is True


def test_auth_me_never_lists_an_unreleased_code(api_as: Any, tenant: Any) -> None:
    """Contracts §1.1 / X11 §6: `/auth/me` `enabled_modules` and
    `plan_limits.modules` never name a hidden module — the frontend has no gate
    of its own, so this is the whole of the client-side guarantee."""
    _with_new_modules(tenant)
    client, _member = api_as(tenant, role="owner")
    me = client.get(reverse("v1:auth-me")).json()["data"]
    assert not set(me["active_tenant"]["enabled_modules"]) & set(NEW)
    assert not set(me["plan_limits"]["modules"]) & set(NEW)


def test_permissions_for_drops_codenames_of_an_unreleased_module(tenant: Any) -> None:
    """X11 §10: a module's codenames enter the registry with its first commit;
    while it is unreleased nobody may hold them, even an owner whose tenant row
    lists the module."""
    from apps.common import permissions_registry as reg

    _with_new_modules(tenant)
    fake = "gym.member.read"
    role = SimpleNamespace(is_system=False, code="custom", permissions=[fake, "parties.party.read"])
    member = SimpleNamespace(status="active", role=role, permissions_override={}, tenant=tenant)
    original = reg.PERMISSIONS
    original_of = dict(reg.MODULE_OF)
    try:
        reg.PERMISSIONS = frozenset(original | {fake})
        reg.MODULE_OF[fake] = "gym"
        held = reg.permissions_for(member)
        assert fake not in held and "parties.party.read" in held
        with override_settings(UB_UNRELEASED_MODULES=True):
            assert fake in reg.permissions_for(member)
    finally:
        reg.PERMISSIONS = original
        reg.MODULE_OF.clear()
        reg.MODULE_OF.update(original_of)


def test_the_tenant_profile_never_echoes_an_unreleased_code(api_as: Any, tenant: Any) -> None:
    """QA finding (A1): `GET` and `PATCH /tenants/current` serialised the RAW
    `enabled_modules` column, so a stored gym came straight back to the client
    in the profile even though `/auth/me` and the settings screen hid it — BR-1
    says absent from EVERY response that lists modules."""
    _with_new_modules(tenant)
    client, _member = api_as(tenant, role="owner")
    got = client.get(reverse("v1:tenant-current")).json()["data"]
    assert not set(got["enabled_modules"]) & set(NEW)
    visible = [m for m in got["enabled_modules"] if m != "expenses"]
    patched = client.patch(
        reverse("v1:tenant-current"), {"enabled_modules": visible}, format="json"
    ).json()["data"]
    assert not set(patched["enabled_modules"]) & set(NEW)
    with override_settings(UB_UNRELEASED_MODULES=True):
        shown = client.get(reverse("v1:tenant-current")).json()["data"]
    assert set(NEW) <= set(shown["enabled_modules"])
