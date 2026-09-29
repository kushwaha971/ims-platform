"""PLT-X10 — engine enablement, labelled module-off guards and enable hooks (A12).

T-PLT-X10-1…6 plus the R14/R15/R25 additions. Engines have no module code and
no switch (ADR-041): an engine is on exactly when an enabled module uses it, its
read endpoints answer only that module's rows, and a module with OPEN records
cannot be switched off — with a refusal that names each open thing, not "not
allowed".

The test module `test` stands in for a vertical, so every rule is proven with
no vertical present (10-architecture §11).
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest
from django.test import override_settings
from django.urls import reverse

from apps.common.exceptions import ModuleDisabled
from apps.common.permissions import EngineEnabled, HasEngineReadPermission, readable_engine_modules
from apps.platform_app.services import entitlements, guards, tenant_settings

pytestmark = pytest.mark.django_db


@pytest.fixture
def clean_guards() -> Any:
    guards._reset_for_tests()
    yield
    guards._reset_for_tests()


@pytest.fixture
def test_modules(monkeypatch: Any) -> dict:
    """Two fake consumers of one fake engine, `test_a` and `test_b` → `dues`."""
    uses = dict(tenant_settings.ENGINES_USED_BY)
    uses["test_a"] = frozenset({"dues"})
    uses["test_b"] = frozenset({"dues", "attendance"})
    monkeypatch.setattr(tenant_settings, "ENGINES_USED_BY", uses)
    return uses


def _entitle(tenant: Any, *modules: str, enabled: bool = True) -> Any:
    for row, field in ((tenant.plan, "modules"), (tenant.partner, "allowed_modules")):
        setattr(row, field, sorted(set(getattr(row, field)) | set(modules)))
        row.save(update_fields=[field])
    if enabled:
        tenant.enabled_modules = sorted(set(tenant.enabled_modules) | set(modules))
    else:
        tenant.enabled_modules = sorted(set(tenant.enabled_modules) - set(modules))
    tenant.save(update_fields=["enabled_modules"])
    tenant.refresh_from_db()
    if hasattr(tenant, "_ub_entitlement"):  # the per-instance entitlement cache
        delattr(tenant, "_ub_entitlement")
    return tenant


# ── The two maps (10-architecture §2.3) ─────────────────────────────────────


def test_the_module_dependencies_are_the_architecture_ones() -> None:
    """10-architecture §2.3: gym and hospitality need the SALES module because
    their money is tax invoices; lending and library need payments. A missing
    line lets a tenant switch gym on with no way to invoice a membership."""
    deps = tenant_settings.MODULE_DEPENDENCIES
    assert deps["sales"] == {"parties", "ledger"}
    assert deps["lending"] == {"parties", "ledger", "payments"}
    assert deps["library"] == {"parties", "ledger", "payments"}
    assert deps["gym"] == {"parties", "ledger", "payments", "sales"}
    assert deps["hospitality"] == {"parties", "ledger", "payments", "sales"}


def test_engines_used_by_is_the_architecture_map_and_names_no_module_code() -> None:
    """ADR-041: engines get NO module code; `ENGINES_USED_BY` is data read by
    `engine_enabled`. An engine name that were also a module code would appear
    on the Features screen as a switch for a mechanism."""
    from apps.common.constants import ModuleCode

    uses = tenant_settings.ENGINES_USED_BY
    assert uses == {
        "lending": {"dues"},
        "library": {"dues"},
        "gym": {"dues", "attendance"},
        "hospitality": {"bookings", "dues"},
    }
    engines = set().union(*uses.values())
    assert not engines & {m.value for m in ModuleCode}


# ── BR-1 truth table (T-PLT-X10-2) ──────────────────────────────────────────


@pytest.mark.parametrize(
    ("enabled", "engine", "expected"),
    [
        ((), "dues", False),
        (("test_a",), "dues", True),
        (("test_a",), "attendance", False),
        (("test_b",), "attendance", True),
        (("test_a", "test_b"), "dues", True),
        (("test_a", "test_b"), "bookings", False),
    ],
)
def test_an_engine_is_on_exactly_when_an_enabled_module_uses_it(
    tenant: Any, test_modules: dict, enabled: tuple, engine: str, expected: bool
) -> None:
    """T-PLT-X10-2 / BR-1: `engine_enabled ⇔ ∃ m ∈ effective_modules with the
    engine in ENGINES_USED_BY[m]`."""
    _entitle(tenant, "test_a", "test_b", enabled=False)
    _entitle(tenant, *enabled)
    assert entitlements.engine_enabled(tenant, engine) is expected
    assert entitlements.enabled_modules_using(tenant, engine) == frozenset(
        m for m in enabled if engine in test_modules[m]
    )


def test_a_module_in_the_plan_but_switched_off_does_not_enable_its_engine(
    tenant: Any, test_modules: dict
) -> None:
    """`enabled_modules_using` is ∩ `effective_modules`, not ∩ the plan: a
    tenant whose owner switched gym off must lose the attendance endpoints."""
    _entitle(tenant, "test_b", enabled=False)
    assert entitlements.engine_enabled(tenant, "attendance") is False


def test_an_unreleased_module_does_not_enable_its_engine(tenant: Any) -> None:
    """R11 carried into engines: gym stored on a dev tenant must not light up
    `/api/v1/attendance/` for anybody once the flag is off."""
    _entitle(tenant, "gym")
    assert entitlements.engine_enabled(tenant, "attendance") is False
    with override_settings(UB_UNRELEASED_MODULES=True):
        assert entitlements.engine_enabled(tenant, "attendance") is True


# ── EngineEnabled and engine reads (T-PLT-X10-3) ────────────────────────────


def _request(tenant: Any, membership: Any = None) -> Any:
    if membership is not None:
        tenant._ub_membership = membership
    user = SimpleNamespace(is_authenticated=True, is_active=True)
    return SimpleNamespace(_ub_tenant=tenant, method="GET", user=user, auth_claims={})


def _member(tenant: Any, codenames: list[str]) -> Any:
    role = SimpleNamespace(is_system=False, code="custom", permissions=codenames)
    return SimpleNamespace(
        status="active", role=role, permissions_override={}, tenant=tenant, permissions_version=1
    )


def test_engine_enabled_refuses_with_the_engine_named_when_no_consumer_is_on(
    tenant: Any, test_modules: dict
) -> None:
    """T-PLT-X10-3: 403 `module_disabled` with `details.module = <engine>` —
    the client is told which thing is off, not a bare 403."""
    view = SimpleNamespace(action_map=None)
    with pytest.raises(ModuleDisabled) as caught:
        EngineEnabled("dues")().has_permission(_request(tenant), view)
    assert caught.value.details == {"module": "dues"}
    _entitle(tenant, "test_a")
    assert EngineEnabled("dues")().has_permission(_request(tenant), view) is True


def test_engine_reads_pass_on_any_consuming_modules_codename_and_filter_the_rest(
    tenant: Any, test_modules: dict, monkeypatch: Any
) -> None:
    """T-PLT-X10-3 / BR-2 / R25: the read passes when the member holds the
    codename a CONSUMING module named, and rows are narrowed to the modules
    that are enabled and whose codename is held — a switched-off module's rows
    never appear in a cross-module list."""
    from apps.common import permissions_registry as reg

    monkeypatch.setitem(
        reg.ENGINE_READ_PERMISSIONS,
        "dues",
        {"test_a": "parties.party.read", "test_b": "ledger.entry.read"},
    )
    _entitle(tenant, "test_a", "test_b")
    view = SimpleNamespace(action_map=None)
    reader = HasEngineReadPermission("dues")()

    only_a = _request(tenant, _member(tenant, ["parties.party.read"]))
    assert reader.has_permission(only_a, view) is True
    assert readable_engine_modules(only_a, "dues") == frozenset({"test_a"})

    neither = _request(tenant, _member(tenant, ["sales.invoice.read"]))
    assert reader.has_permission(neither, view) is False

    _entitle(tenant, "test_b", enabled=False)
    both = _request(tenant, _member(tenant, ["parties.party.read", "ledger.entry.read"]))
    assert readable_engine_modules(both, "dues") == frozenset({"test_a"})


def test_the_engine_read_codenames_are_the_contract_ones() -> None:
    """R25: the codename each module names for engine reads, as strings (L4).
    The rule that no scoped role holds one is A13's architecture test."""
    from apps.common.permissions_registry import ENGINE_READ_PERMISSIONS

    assert ENGINE_READ_PERMISSIONS == {
        "dues": {
            "lending": "lending.loan.read_all",
            "library": "library.member.read",
            "gym": "gym.membership.money_read",
        },
        "attendance": {"gym": "gym.member.read_all"},
        "bookings": {"hospitality": "hospitality.booking.read"},
    }


# ── Labelled, deduplicated off-guards (T-PLT-X10-1, -4, -6) ─────────────────


def test_registering_the_same_counter_twice_counts_once(tenant: Any, clean_guards: Any) -> None:
    """T-PLT-X10-4 / BR-5: `guards.py` used to APPEND, so a second `ready()`
    (tests, a reloaded app) doubled every count and a merchant with 3 books out
    was told 6."""

    def three(_t: Any) -> int:
        return 3

    guards.register_module_off_guard("test_a", three, label_id="test.off.things")
    guards.register_module_off_guard("test_a", three, label_id="test.off.things")
    assert guards.blocking_rows_for_module_off(tenant, "test_a") == 3
    assert guards.module_off_blockers(tenant, "test_a") == [
        {"label_id": "test.off.things", "count": 3}
    ]


def test_blockers_list_only_counters_with_open_rows(tenant: Any, clean_guards: Any) -> None:
    """T-PLT-X10-1: a counter returning 0 is not a blocker — closed history
    never blocks, and a zero row in the refusal would be a line saying
    "0 deposits held"."""
    guards.register_module_off_guard("test_a", lambda _t: 0, label_id="test.off.none")
    guards.register_module_off_guard("test_a", lambda _t: 2, label_id="test.off.two")
    assert guards.module_off_blockers(tenant, "test_a") == [
        {"label_id": "test.off.two", "count": 2}
    ]


def test_the_refusal_carries_a_breakdown_that_sums_to_the_count(
    api_as: Any, tenant: Any, clean_guards: Any
) -> None:
    """T-PLT-X10-6 and the worked example: library off with 3 copies out and 2
    deposits held → count 5 with both lines, so the screen can say what to
    close rather than "still has records"."""
    guards.register_module_off_guard("inventory", lambda _t: 3, label_id="inventory.off.copies")
    guards.register_module_off_guard(
        "inventory", lambda _t: 2, label_id="payments.off.depositsHeld"
    )
    client, _member = api_as(tenant, role="owner")
    modules = [m for m in tenant.enabled_modules if m != "inventory"]
    response = client.patch(
        reverse("v1:tenant-current"), {"enabled_modules": modules}, format="json"
    )
    assert response.status_code == 409, response.content
    details = response.json()["error"]["details"]
    assert details["module"] == "inventory"
    assert details["count"] == 5
    labelled = [row for row in details["breakdown"] if row["label_id"]]
    assert labelled == [
        {"label_id": "inventory.off.copies", "count": 3},
        {"label_id": "payments.off.depositsHeld", "count": 2},
    ]
    assert sum(row["count"] for row in details["breakdown"]) == details["count"]


def test_a_counter_without_a_label_still_appears_in_the_breakdown(
    tenant: Any, clean_guards: Any
) -> None:
    """The three existing guards (inventory, sales, purchases) register without
    a label; their counts must still be in the breakdown or it would not sum."""
    guards.register_module_off_guard("test_a", lambda _t: 4)
    assert guards.module_off_blockers(tenant, "test_a") == [{"label_id": None, "count": 4}]


def test_every_registered_counter_answers_zero_for_an_empty_tenant(tenant: Any) -> None:
    """T-PLT-X10-1 (contract): each real counter returns an int, and 0 for a
    tenant with no rows — a guard that raised would make the PATCH a 500
    (EC-3), and one that miscounted would lock a module on for ever."""
    for module in guards.registered_off_guard_modules():
        for row in guards.module_off_blockers(tenant, module):
            pytest.fail(f"{module}: {row} on an empty tenant")
        assert guards.blocking_rows_for_module_off(tenant, module) == 0


def test_two_modules_on_one_engine_are_counted_separately(
    api_as: Any, tenant: Any, clean_guards: Any
) -> None:
    """EC-1: lending and library both use `dues`; switching lending off while
    LIBRARY has open dues is allowed, because each engine counter counts its
    own module's rows."""
    guards.register_module_off_guard("library", lambda _t: 7, label_id="dues.off.open")
    _entitle(tenant, "lending", "library")
    client, _member = api_as(tenant, role="owner")
    url = reverse("v1:tenant-current")
    with override_settings(UB_UNRELEASED_MODULES=True):
        lending_off = [m for m in tenant.enabled_modules if m != "lending"]
        assert client.patch(url, {"enabled_modules": lending_off}, format="json").status_code == 200
        library_off = [m for m in lending_off if m != "library"]
        refused = client.patch(url, {"enabled_modules": library_off}, format="json")
    assert refused.status_code == 409
    assert refused.json()["error"]["details"]["breakdown"] == [
        {"label_id": "dues.off.open", "count": 7}
    ]


# ── The enable hook (R15, T-PLT-X10-5) ──────────────────────────────────────


def test_the_enable_hook_runs_once_on_enable_and_not_on_an_unrelated_patch(
    api_as: Any, tenant: Any, clean_guards: Any
) -> None:
    """T-PLT-X10-5 / BR-6: switching a module on seeds its presets, inside the
    switching transaction, for that module only; flipping another module
    must not re-run it, and registering the hook twice must not run it twice."""
    calls: list[tuple[str, Any]] = []

    def seed(ctx: Any, t: Any) -> None:
        calls.append((str(t.pk), ctx.tenant.pk))

    guards.register_module_enable_hook("expenses", seed)
    guards.register_module_enable_hook("expenses", seed)
    _entitle(tenant, "expenses", enabled=False)
    client, _member = api_as(tenant, role="owner")
    url = reverse("v1:tenant-current")

    on = [*tenant.enabled_modules, "expenses"]
    assert client.patch(url, {"enabled_modules": on}, format="json").status_code == 200
    assert calls == [(str(tenant.pk), tenant.pk)]

    unrelated = [m for m in on if m != "purchases"]
    assert client.patch(url, {"enabled_modules": unrelated}, format="json").status_code == 200
    assert len(calls) == 1


def test_an_enable_hook_that_refuses_rolls_the_switch_back(
    api_as: Any, tenant: Any, clean_guards: Any
) -> None:
    """BR-6: the hook runs INSIDE the transaction, so a preset seed that fails
    leaves the module off rather than on and half-seeded."""
    from apps.common.exceptions import BusinessRuleViolation

    def refuse(_ctx: Any, _t: Any) -> None:
        raise BusinessRuleViolation("validation_error", "no")

    guards.register_module_enable_hook("expenses", refuse)
    _entitle(tenant, "expenses", enabled=False)
    client, _member = api_as(tenant, role="owner")
    response = client.patch(
        reverse("v1:tenant-current"),
        {"enabled_modules": [*tenant.enabled_modules, "expenses"]},
        format="json",
    )
    assert response.status_code >= 400
    tenant.refresh_from_db()
    assert "expenses" not in tenant.enabled_modules


def test_a_dependency_is_refused_before_the_hook_runs(
    api_as: Any, tenant: Any, clean_guards: Any
) -> None:
    """BR-4 / BR-6: gym needs sales; asking for gym without sales is refused
    with the dependency named, and nothing is seeded."""
    calls: list[str] = []
    guards.register_module_enable_hook("gym", lambda _c, _t: calls.append("gym"))
    _entitle(tenant, "gym", enabled=False)
    client, _member = api_as(tenant, role="owner")
    wanted = [m for m in tenant.enabled_modules if m != "sales"] + ["gym"]
    with override_settings(UB_UNRELEASED_MODULES=True):
        response = client.patch(
            reverse("v1:tenant-current"), {"enabled_modules": wanted}, format="json"
        )
    assert response.status_code == 400, response.content
    assert "sales" in response.json()["error"]["details"]["enabled_modules"][0]
    assert calls == []


def test_a_bound_method_counter_registered_twice_counts_once(
    tenant: Any, clean_guards: Any
) -> None:
    """QA finding (A12): `obj.count` is a NEW bound-method object on every
    attribute access, so deduplicating by `is` let a vertical that registers a
    method counter from `ready()` double its count on the second call."""

    class Counters:
        def open_loans(self, _t: Any) -> int:
            return 2

    counters = Counters()
    guards.register_module_off_guard("test_a", counters.open_loans, label_id="test.off.loans")
    guards.register_module_off_guard("test_a", counters.open_loans, label_id="test.off.loans")
    assert guards.blocking_rows_for_module_off(tenant, "test_a") == 2

    calls: list[int] = []

    class Seeds:
        def seed(self, _ctx: Any, _t: Any) -> None:
            calls.append(1)

    seeds = Seeds()
    guards.register_module_enable_hook("test_a", seeds.seed)
    guards.register_module_enable_hook("test_a", seeds.seed)
    guards.run_module_enable_hooks(ctx=None, tenant=tenant, modules=["test_a"])
    assert calls == [1]
