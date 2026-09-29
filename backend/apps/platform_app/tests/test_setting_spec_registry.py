"""`register_setting_spec` — module settings without editing core's catalogue (R43, A10).

A module declares its `<module>.*` keys, pure validators and defaults from its
own `ready()`; the settings screen shows and accepts them only while the module
is on (contracts §1.9). The defects prevented: a module key visible (with its
default) to every tenant, including the ones that never switched the module
on; a key a tenant can still write after switching the module off; a module
taking over a core key or a core section's prefix; and one test's key leaking
into the next test's settings payload.

This file tests the schema half. The call sites in
`services/tenant_settings.py` that read `specs_for`/`spec_for` belong to Track P
(A1/A12 own that file) — see docs/platform/progress/wave-a-track-f.md.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.core.exceptions import ImproperlyConfigured

from apps.platform_app import settings_schema as schema
from apps.platform_app.settings_schema import SettingError, SettingSpec

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _restore() -> Any:
    schema._reset_for_tests()
    yield
    schema._reset_for_tests()


def _rounding(value: Any, _tenant: Any) -> dict:
    mode = (value or {}).get("mode") if isinstance(value, dict) else None
    if mode not in ("rupee", "paise"):
        raise SettingError(["Choose rupee or paise."])
    return {"mode": mode}


def _default(_business_type: str) -> dict:
    return {"mode": "rupee"}


SPEC = SettingSpec("probe.fine_rounding", "probe", _default, _rounding)


def test_a_module_key_is_shown_only_while_the_module_is_on(tenant: Any, monkeypatch: Any) -> None:
    schema.register_setting_spec(SPEC)
    monkeypatch.setattr(schema, "_enabled_modules", lambda t: frozenset({"platform"}))
    assert "probe.fine_rounding" not in schema.specs_for(tenant)
    assert schema.spec_for(tenant, "probe.fine_rounding") is None
    monkeypatch.setattr(schema, "_enabled_modules", lambda t: frozenset({"platform", "probe"}))
    assert schema.specs_for(tenant)["probe.fine_rounding"] is SPEC
    assert schema.spec_for(tenant, "probe.fine_rounding") is SPEC


def test_core_keys_are_always_there_and_unchanged(tenant: Any) -> None:
    """Nothing changes for today's tenants: no module registers a key yet."""
    specs = schema.specs_for(tenant)
    assert set(schema.SETTINGS) <= set(specs)
    assert {k: v for k, v in specs.items() if k in schema.SETTINGS} == schema.SETTINGS
    assert schema.spec_for(tenant, "ledger.auto_sms") is schema.SETTINGS["ledger.auto_sms"]


def test_the_real_tenant_path_reads_effective_modules(tenant: Any) -> None:
    """Without the monkeypatch: an ordinary tenant has no `probe` module."""
    schema.register_setting_spec(SPEC)
    assert "probe.fine_rounding" not in schema.specs_for(tenant)


def test_registration_is_idempotent_and_refuses_a_conflict() -> None:
    schema.register_setting_spec(SPEC)
    schema.register_setting_spec(SettingSpec("probe.fine_rounding", "probe", _default, _rounding))
    with pytest.raises(ImproperlyConfigured):
        schema.register_setting_spec(SettingSpec("probe.fine_rounding", "probe", _default, _rounding, 2))


@pytest.mark.parametrize(
    "spec",
    [
        SettingSpec("fine_rounding", "probe", _default, _rounding),  # no module prefix
        SettingSpec("Probe.Rounding", "probe", _default, _rounding),
        SettingSpec("probe.fine_rounding", "general", _default, _rounding),  # a core section
        SettingSpec("ledger.auto_sms", "ledger", _default, _rounding),  # a core key
        SettingSpec("ledger.new_thing", "ledger", _default, _rounding),  # a core prefix
        SettingSpec("numbering.probe", "numbering", _default, _rounding),
    ],
)
def test_a_module_may_only_register_its_own_namespace(spec: SettingSpec) -> None:
    with pytest.raises(ImproperlyConfigured):
        schema.register_setting_spec(spec)


def test_reset_restores_the_start_up_registrations(tenant: Any, monkeypatch: Any) -> None:
    monkeypatch.setattr(schema, "_enabled_modules", lambda t: frozenset({"platform", "probe"}))
    before = schema.specs_for(tenant)
    schema.register_setting_spec(SPEC)
    schema._reset_for_tests()
    assert schema.specs_for(tenant) == before
