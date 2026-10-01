"""The test-only subject of module `test` (10-architecture §11; Lead ruling 1 Oct 2026).

Engine tests prove every rule with NO vertical present (plan §3.4): a fake
consuming module `test` uses the dues engine, a subject `test_subject` is
registered for it, and its engine read codename is `parties.party.read`. A
second module `test_b` (codename `platform.tenant.manage`, which an admin does
not hold) exists so a test can prove rows of a module the member cannot read
never appear.

Everything registered here is undone after the test (`_reset_for_tests` on the
registry, the posting registry and the document port; `monkeypatch` for the
two maps).
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from typing import Any

import pytest

from apps.common.seams import documents
from apps.dues import registry
from apps.ledger.services import postings

TEST_MODULE = "test"
OTHER_MODULE = "test_b"
SUBJECT = "test_subject"
OTHER_SUBJECT = "test_b_subject"


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


def subject_label(subject_id: Any) -> str:
    return f"Subject {str(subject_id)[-4:]}"


@dataclass
class TestSubject:
    tenant: Any
    changes: list = field(default_factory=list)
    amount_hook: Any = None

    def set_today(self, monkeypatch: Any, today: dt.date) -> None:
        """Pin the tenant's today for every dues module that reads it."""
        from apps.dues.services import plans, posting, schedules

        for module in (plans, posting, schedules):
            monkeypatch.setattr(module, "tenant_today", lambda _t, **_k: today)


@pytest.fixture
def dues_subject(tenant: Any, monkeypatch: Any) -> Any:
    from apps.common import permissions_registry
    from apps.platform_app.services import tenant_settings

    registry._reset_for_tests()
    postings._reset_for_tests()
    documents._reset_for_tests()
    uses = dict(tenant_settings.ENGINES_USED_BY)
    uses[TEST_MODULE] = frozenset({"dues"})
    uses[OTHER_MODULE] = frozenset({"dues"})
    monkeypatch.setattr(tenant_settings, "ENGINES_USED_BY", uses)
    monkeypatch.setitem(
        permissions_registry.ENGINE_READ_PERMISSIONS,
        "dues",
        {TEST_MODULE: "parties.party.read", OTHER_MODULE: "platform.tenant.manage"},
    )
    entitle(tenant, TEST_MODULE, OTHER_MODULE)
    state = TestSubject(tenant=tenant)

    def on_due_changed(ctx: Any, due: Any, before: Any, after: Any) -> None:
        state.changes.append((due.id, before, after))

    def amount_hook(tenant: Any, row: dict) -> Any:
        return state.amount_hook(tenant, row) if state.amount_hook else row["amount"]

    def labels(ids: set) -> dict:
        return {i: subject_label(i) for i in ids}

    registry.register_subject(
        SUBJECT,
        module=TEST_MODULE,
        label=labels,
        on_due_changed=on_due_changed,
        amount_hook=amount_hook,
        reminder_template_key="test_due",
    )
    registry.register_subject(
        OTHER_SUBJECT, module=OTHER_MODULE, label=labels, reminder_template_key="test_due"
    )
    yield state
    registry._reset_for_tests()
    postings._reset_for_tests()
    documents._reset_for_tests()
