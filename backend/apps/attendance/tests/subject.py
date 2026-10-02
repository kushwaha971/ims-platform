"""The test-only subject of module `test` (10-architecture §11; Lead ruling 1 Oct 2026).

Engine tests prove every rule with NO vertical present (plan §3.4). A fake
consuming module `test` uses the attendance engine; a check-in policy and a
mark listener are registered for its context type `test_subject`; its engine
read codename is `parties.party.read` (the A12 trick of standing a core
codename in for a vertical's). A second module `test_b` (read codename
`platform.tenant.manage`, which an admin does not hold) proves that rows of a
module the member cannot read never appear.

Two vertical-shaped codenames exist only while the fixture runs:
`test.attendance.edit_closed` (ATT-03 BR-3) and `test.membership.override`
(the policy's override permission). No role holds them; `grant(member, …)`
adds one to a membership's `permissions_override`.

The policy's answer is set per test (`subject.answer(...)`); every call is
recorded, and a listener records `(mark_id, created)` — or raises, when
`subject.listener_raises` is set. Everything registered here is undone after
the test (`_reset_for_tests`; `monkeypatch` for the maps).
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from typing import Any

import pytest

from apps.attendance import registry

TEST_MODULE = "test"
OTHER_MODULE = "test_b"
CONTEXT = "test_subject"
OTHER_CONTEXT = "test_b_subject"
EDIT_CLOSED = "test.attendance.edit_closed"
OVERRIDE = "test.membership.override"


def entitle(tenant: Any, *modules: str, enabled: bool = True) -> Any:
    """Entitle and switch on (or off) fake modules — `test_engine_enablement._entitle`."""
    for row, attr in ((tenant.plan, "modules"), (tenant.partner, "allowed_modules")):
        setattr(row, attr, sorted(set(getattr(row, attr)) | set(modules)))
        row.save(update_fields=[attr])
    if enabled:
        tenant.enabled_modules = sorted(set(tenant.enabled_modules) | set(modules))
    else:
        tenant.enabled_modules = sorted(set(tenant.enabled_modules) - set(modules))
    tenant.save(update_fields=["enabled_modules"])
    tenant.refresh_from_db()
    if hasattr(tenant, "_ub_entitlement"):
        delattr(tenant, "_ub_entitlement")
    return tenant


def grant(membership: Any, *codenames: str) -> Any:
    override = dict(membership.permissions_override or {})
    override["allow"] = sorted(set(override.get("allow", [])) | set(codenames))
    membership.permissions_override = override
    membership.save(update_fields=["permissions_override"])
    return membership


@dataclass
class TestSubject:
    tenant: Any
    result: dict = field(default_factory=lambda: {"decision": "allow", "reason": ""})
    calls: list = field(default_factory=list)
    marked: list = field(default_factory=list)
    listener_raises: bool = False

    def answer(
        self,
        decision: str = "allow",
        reason: str = "",
        *,
        override_permission: str | None = None,
        entitlement_id: Any = None,
    ) -> None:
        self.result = {
            "decision": decision,
            "reason": reason,
            "override_permission": override_permission,
            "entitlement_id": entitlement_id,
        }


class Clock:
    """`django.utils.timezone.now` pinned and movable (no freezegun, ADR-021)."""

    def __init__(self, monkeypatch: Any, at: dt.datetime) -> None:
        from django.utils import timezone

        self.now = at
        monkeypatch.setattr(timezone, "now", lambda: self.now)

    def set(self, at: dt.datetime) -> None:
        self.now = at

    def advance(self, **delta: Any) -> dt.datetime:
        self.now = self.now + dt.timedelta(**delta)
        return self.now


@pytest.fixture
def attendance_subject(tenant: Any, monkeypatch: Any) -> Any:
    from apps.common import permissions_registry
    from apps.platform_app.services import tenant_settings

    registry._reset_for_tests()
    uses = dict(tenant_settings.ENGINES_USED_BY)
    uses[TEST_MODULE] = frozenset({"attendance"})
    uses[OTHER_MODULE] = frozenset({"attendance"})
    monkeypatch.setattr(tenant_settings, "ENGINES_USED_BY", uses)
    monkeypatch.setitem(
        permissions_registry.ENGINE_READ_PERMISSIONS,
        "attendance",
        {TEST_MODULE: "parties.party.read", OTHER_MODULE: "platform.tenant.manage"},
    )
    monkeypatch.setattr(
        permissions_registry,
        "PERMISSIONS",
        frozenset(permissions_registry.PERMISSIONS | {EDIT_CLOSED, OVERRIDE}),
    )
    monkeypatch.setitem(permissions_registry.MODULE_OF, EDIT_CLOSED, TEST_MODULE)
    monkeypatch.setitem(permissions_registry.MODULE_OF, OVERRIDE, TEST_MODULE)
    entitle(tenant, TEST_MODULE, OTHER_MODULE)
    state = TestSubject(tenant=tenant)

    def policy(tenant: Any, party_id: Any, context_id: Any, on: dt.date) -> dict:
        state.calls.append((party_id, context_id, on))
        return dict(state.result)

    def on_marked(ctx: Any, mark: Any, created: bool) -> None:
        if state.listener_raises:
            raise RuntimeError("the vertical refused this mark")
        state.marked.append((mark.id, created))

    registry.register_checkin_policy(CONTEXT, module=TEST_MODULE, policy=policy)
    registry.register_mark_listener(CONTEXT, module=TEST_MODULE, on_marked=on_marked)
    registry.register_checkin_policy(OTHER_CONTEXT, module=OTHER_MODULE, policy=policy)
    yield state
    registry._reset_for_tests()
