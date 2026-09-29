"""PLT-X12 — module roles (A13, ADR-052, contracts §3, owner Q1 default).

T-PLT-X12-3, -4 and the roles API. A module role is a system `platform_role`
row owned by one module (`lending_agent`, `gym_trainer`,
`hospitality_housekeeping`) whose codenames are ONLY that module's: a scope a
vertical applies to its own tables is worthless if the scoped person also holds
`parties.party.read` and can open every borrower's balance through `/parties`.

The fake module `test` stands in for a vertical; its codenames are added to the
registry for the duration of each test.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.core.exceptions import ImproperlyConfigured
from django.urls import reverse

from apps.common import permissions_registry as reg
from apps.platform_app.models import Membership, Role

pytestmark = pytest.mark.django_db

AGENT = "test_agent"
CODENAMES = frozenset({"test.loan.read", "test.collection.write"})


@pytest.fixture
def fake_module(monkeypatch: Any) -> Any:
    """`test.*` codenames exist; the module-role registry is restored after."""
    extra = {"test.loan.read", "test.loan.read_all", "test.collection.write"}
    monkeypatch.setattr(reg, "PERMISSIONS", frozenset(reg.PERMISSIONS | extra))
    for codename in extra:
        monkeypatch.setitem(reg.MODULE_OF, codename, "test")
    reg._reset_module_roles_for_tests()
    yield
    reg._reset_module_roles_for_tests()


@pytest.fixture
def agent_role(fake_module: Any) -> Role:
    reg.register_module_role(AGENT, module="test", codenames=CODENAMES, label_id="test.role.agent")
    return Role.objects.create(
        tenant=None,
        code=AGENT,
        name="Collection agent",
        is_system=True,
        permissions=sorted(CODENAMES),
    )


def _module_on(tenant: Any, *modules: str) -> Any:
    for row, field in ((tenant.plan, "modules"), (tenant.partner, "allowed_modules")):
        setattr(row, field, sorted(set(getattr(row, field)) | set(modules)))
        row.save(update_fields=[field])
    tenant.enabled_modules = sorted(set(tenant.enabled_modules) | set(modules))
    tenant.save(update_fields=["enabled_modules"])
    tenant.refresh_from_db()
    if hasattr(tenant, "_ub_entitlement"):
        delattr(tenant, "_ub_entitlement")
    return tenant


def _module_off(tenant: Any, module: str) -> Any:
    tenant.enabled_modules = [m for m in tenant.enabled_modules if m != module]
    tenant.save(update_fields=["enabled_modules"])
    tenant.refresh_from_db()
    if hasattr(tenant, "_ub_entitlement"):
        delattr(tenant, "_ub_entitlement")
    return tenant


# ── The registry's rules (T-PLT-X12-3) ──────────────────────────────────────


@pytest.mark.parametrize(
    "codename",
    [
        "parties.party.read",  # the tenant-wide core read ADR-052 exists to withhold
        "ledger.entry.read",
        "payments.payment.read",
        "ledger.reminder.write",  # not even this: reminders go through the vertical
        "reports.basic.read",
        "platform.members.manage",
    ],
)
def test_a_module_role_may_not_hold_a_core_codename(fake_module: Any, codename: str) -> None:
    """BR-3 / FRD §6: every codename must belong to the role's own module, so a
    scoped agent can never reach the tenant-wide core screens."""
    with pytest.raises(ImproperlyConfigured, match=codename):
        reg.register_module_role(
            AGENT, module="test", codenames=frozenset({codename}), label_id="test.role.agent"
        )


def test_a_module_role_may_not_hold_a_read_all(fake_module: Any) -> None:
    """BR-3: `read_all` is the codename that LIFTS the scope; a scoped role
    holding it is not scoped."""
    with pytest.raises(ImproperlyConfigured, match="read_all"):
        reg.register_module_role(
            AGENT, module="test", codenames=frozenset({"test.loan.read_all"}), label_id="x"
        )


def test_a_module_role_code_is_prefixed_by_its_module(fake_module: Any) -> None:
    """Contracts §3: `code = "<module>_<role>"`, ≤ 32 characters (the column)."""
    with pytest.raises(ImproperlyConfigured):
        reg.register_module_role("agent", module="test", codenames=CODENAMES, label_id="x")
    with pytest.raises(ImproperlyConfigured):
        reg.register_module_role(
            "test_" + "a" * 40, module="test", codenames=CODENAMES, label_id="x"
        )
    with pytest.raises(ImproperlyConfigured):
        reg.register_module_role("staff", module="test", codenames=CODENAMES, label_id="x")


def test_an_unknown_codename_is_refused(fake_module: Any) -> None:
    """A typo in a vertical's role set would otherwise be a codename nobody can
    ever hold, discovered by an agent who cannot collect."""
    with pytest.raises(ImproperlyConfigured, match="test.loan.raed"):
        reg.register_module_role(
            AGENT, module="test", codenames=frozenset({"test.loan.raed"}), label_id="x"
        )


def test_registration_is_idempotent_and_a_conflicting_spec_raises(fake_module: Any) -> None:
    """ADR-042: a second `ready()` is harmless; a different set under a used
    code is a bug, not an update."""
    reg.register_module_role(AGENT, module="test", codenames=CODENAMES, label_id="test.role.agent")
    reg.register_module_role(AGENT, module="test", codenames=CODENAMES, label_id="test.role.agent")
    assert reg.module_role(AGENT).codenames == CODENAMES
    with pytest.raises(ImproperlyConfigured):
        reg.register_module_role(
            AGENT,
            module="test",
            codenames=frozenset({"test.loan.read"}),
            label_id="test.role.agent",
        )


# ── permissions_for (T-PLT-X12-4) ───────────────────────────────────────────


def test_permissions_for_resolves_a_module_role(tenant: Any, agent_role: Role, user: Any) -> None:
    """`permissions_for` used to index `ROLE_PERMISSIONS[role.code]` for every
    system role, so a module role raised `KeyError` — a 500 on every request
    that agent made."""
    _module_on(tenant, "test")
    member = Membership.objects.create(user=user, tenant=tenant, role=agent_role)
    assert reg.permissions_for(member) == CODENAMES


def test_a_module_role_holds_nothing_while_its_module_is_off(
    tenant: Any, agent_role: Role, user: Any
) -> None:
    """BR-6: the membership stays; its codenames vanish through module gating."""
    _module_on(tenant, "test")
    _module_off(tenant, "test")
    member = Membership.objects.create(user=user, tenant=tenant, role=agent_role)
    assert reg.permissions_for(member) == frozenset()


def test_an_unregistered_system_role_holds_nothing(
    tenant: Any, fake_module: Any, user: Any
) -> None:
    """Fail closed: a system role row whose module never registered it (the
    module's app was removed, or its `ready()` failed) grants nothing, and
    certainly not the codenames its row happens to list."""
    role = Role.objects.create(
        tenant=None, code="test_ghost", name="Ghost", is_system=True, permissions=["test.loan.read"]
    )
    _module_on(tenant, "test")
    member = Membership.objects.create(user=user, tenant=tenant, role=role)
    assert reg.permissions_for(member) == frozenset()


def test_module_roles_keep_the_canon_roles_unchanged(tenant: Any, system_roles: dict) -> None:
    """The four canon roles are resolved exactly as before."""
    for code, role in system_roles.items():
        member = Membership(tenant=tenant, role=role, status="active", permissions_override={})
        expected = {
            p
            for p in reg.ROLE_PERMISSIONS[code]
            if reg.MODULE_OF[p] in set(tenant.enabled_modules) or reg.MODULE_OF[p] == "platform"
        }
        assert reg.permissions_for(member) == expected


# ── GET /roles and assignment (FRD §6, §7) ──────────────────────────────────


def test_the_roles_api_lists_module_roles_of_enabled_modules_only(
    api_as: Any, tenant: Any, agent_role: Role
) -> None:
    """FRD §6: "`GET /api/v1/roles` lists module roles of enabled modules only",
    so the team screen never offers a role for a feature that is off."""
    client, member = api_as(tenant, role="owner")
    assert member.role.code == "owner"
    codes = [row["code"] for row in client.get(reverse("v1:role-list")).json()["data"]]
    assert codes == ["owner", "admin", "staff", "accountant"]

    _module_on(tenant, "test")
    rows = client.get(reverse("v1:role-list")).json()["data"]
    assert [row["code"] for row in rows] == ["owner", "admin", "staff", "accountant", AGENT]
    agent = rows[-1]
    assert agent == {
        "code": AGENT,
        "module": "test",
        "label_id": "test.role.agent",
        "assignable": True,
        "is_module_role": True,
    }
    owner = rows[0]
    assert owner["assignable"] is False and owner["module"] is None
    assert owner["label_id"] == "tenant.role.owner"


def test_the_roles_api_needs_the_members_codename(api_as: Any, tenant: Any) -> None:
    """Only the people who can hand roles out need the list."""
    client, member = api_as(tenant, role="staff")
    assert member.role.code == "staff"
    assert client.get(reverse("v1:role-list")).status_code == 403


def test_a_module_role_of_a_switched_off_module_cannot_be_given(
    api_as: Any, tenant: Any, agent_role: Role
) -> None:
    """FRD §6: 400 `validation_error {role: ["This role belongs to a feature
    that is off."]}` — through both doors, add-member and invite."""
    client, member = api_as(tenant, role="owner")
    assert member.role.code == "owner"
    body = {"email": "anil@shop.test", "full_name": "Anil", "role": AGENT}
    refused = client.post(reverse("v1:member-list"), body, format="json")
    assert refused.status_code == 400, refused.content
    assert refused.json()["error"]["details"]["role"] == [
        "This role belongs to a feature that is off."
    ]
    invite = client.post(
        reverse("v1:invitation-list"), {"email": "anil@shop.test", "role": AGENT}, format="json"
    )
    assert invite.status_code == 400
    assert invite.json()["error"]["details"]["role"] == [
        "This role belongs to a feature that is off."
    ]

    _module_on(tenant, "test")
    created = client.post(reverse("v1:member-list"), body, format="json")
    assert created.status_code == 201, created.content


def test_the_member_list_says_when_a_module_role_is_inactive(
    api_as: Any, tenant: Any, agent_role: Role, user: Any
) -> None:
    """BR-6: the team screen shows "Role inactive while <module> is off"
    rather than a member who silently can do nothing."""
    _module_on(tenant, "test")
    Membership.objects.create(user=user, tenant=tenant, role=agent_role)
    client, member = api_as(tenant, role="owner")
    assert member.role.code == "owner"

    def agent_row() -> dict:
        rows = client.get(reverse("v1:member-list")).json()["data"]
        return next(row for row in rows if row["role"] == AGENT)

    assert agent_row()["role_module"] == "test" and agent_row()["role_active"] is True
    assert agent_row()["role_label_id"] == "test.role.agent"
    _module_off(tenant, "test")
    assert agent_row()["role_active"] is False
    owner_row = next(
        row
        for row in client.get(reverse("v1:member-list")).json()["data"]
        if row["role"] == "owner"
    )
    assert owner_row["role_module"] is None and owner_row["role_active"] is True
    assert owner_row["role_label_id"] == "tenant.role.owner"


# ── The role row a vertical's data migration writes ─────────────────────────


def test_the_role_row_migration_helper_is_idempotent_and_reversible(fake_module: Any) -> None:
    """FRD §5: each vertical's data migration upserts its row by `code` where
    `tenant IS NULL`, and the reverse removes it; running forward twice is one
    row."""
    from django.apps import apps as django_apps

    from apps.platform_app.services.memberships import module_role_migration

    forwards, backwards = module_role_migration(AGENT, name="Collection agent", codenames=CODENAMES)
    forwards(django_apps, None)
    forwards(django_apps, None)
    rows = Role.objects.filter(tenant__isnull=True, code=AGENT)
    assert rows.count() == 1
    row = rows.get()
    assert row.is_system and set(row.permissions) == CODENAMES
    backwards(django_apps, None)
    assert not Role.objects.filter(code=AGENT).exists()


def test_module_role_rows_never_diverge_from_the_registry(agent_role: Role) -> None:
    """The seeds test for the canon roles, extended (FRD §5): a module role's
    row lists exactly its registered codenames, so `GET /roles` and
    `permissions_for` can never tell two different stories."""
    for role in Role.objects.filter(is_system=True, tenant__isnull=True):
        spec = reg.module_role(role.code)
        if spec is not None:
            assert set(role.permissions) == set(spec.codenames), role.code


def test_an_invitation_names_its_role_with_the_label_the_client_can_draw(
    api_as: Any, tenant: Any, agent_role: Role
) -> None:
    """The invitation list shows a module role by its registered label, not by
    a `tenant.role.test_agent` key no catalogue has."""
    _module_on(tenant, "test")
    client, member = api_as(tenant, role="owner")
    assert member.role.code == "owner"
    created = client.post(
        reverse("v1:invitation-list"), {"email": "anil@shop.test", "role": AGENT}, format="json"
    )
    assert created.status_code == 201, created.content
    rows = client.get(reverse("v1:invitation-list")).json()["data"]
    assert [(r["role"], r["role_label_id"]) for r in rows] == [(AGENT, "test.role.agent")]


def test_an_override_cannot_hand_a_module_role_a_core_read(
    tenant: Any, agent_role: Role, user: Any
) -> None:
    """QA finding (A13): `permissions_override.allow` is applied after the
    role's set, so an agent row edited in the admin to allow
    `parties.party.read` would read every balance through `/parties` — the
    exact leak ADR-052 exists to close. A module role's grants stay inside its
    own module and never include a `read_all`; a same-module grant (a trainer
    allowed to see mobiles) still works."""
    _module_on(tenant, "test")
    member = Membership.objects.create(
        user=user,
        tenant=tenant,
        role=agent_role,
        permissions_override={
            "allow": ["parties.party.read", "ledger.entry.read", "test.loan.read_all", "test.loan.read"]
        },
    )
    held = reg.permissions_for(member)
    assert "parties.party.read" not in held
    assert "ledger.entry.read" not in held
    assert "test.loan.read_all" not in held
    assert CODENAMES <= held
