"""The notification-type and default-template registries modules fill (A10).

`REGISTRY` (in-app types) and `DEFAULT_TEMPLATES` (message bodies) were literal
dicts in `notifications`, so a library overdue notice or a gym renewal text
would have been a core edit (ADR-042; contracts §1.9, R16, R29). The defects
prevented: a module type raised by `notify()` and refused as unknown because it
was never registered; a module silently overriding a CORE template's words
(one `register_default_templates` call replacing the reminder every shop
sends); a module template with no English body, which the resolver's `en`
fallback cannot rescue in Hindi; and a registration leaking between tests.
"""

from __future__ import annotations

import dataclasses
from typing import Any

import pytest
from django.core.exceptions import ImproperlyConfigured

from apps.notifications.constants import NotificationCategory, NotificationSeverity
from apps.notifications.models import Notification
from apps.notifications.services import notify as notify_module
from apps.notifications.services import templates
from apps.notifications.services.notify import (
    REGISTRY,
    NotificationType,
    notify,
    register_notification_type,
)
from apps.notifications.services.templates import (
    DEFAULT_TEMPLATES,
    register_default_templates,
    resolve_template,
)

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _restore() -> Any:
    notify_module._reset_for_tests()
    templates._reset_for_tests()
    yield
    notify_module._reset_for_tests()
    templates._reset_for_tests()


def _route(_params: Any) -> str:
    return "/inventory"


PROBE = NotificationType(
    code="inventory.probe_due",
    category=NotificationCategory.STOCK,
    severity=NotificationSeverity.INFO,
    required_permission="inventory.item.read",
    title_en="{count} probes are due",
    route=_route,
)


# ── notification types ────────────────────────────────────────────────────────


def test_a_registered_type_can_be_raised(tenant: Any) -> None:
    register_notification_type(PROBE.code, PROBE)
    notify(tenant, PROBE.code, params={"count": 2})
    row = Notification.objects.get(tenant=tenant, type=PROBE.code)
    assert row.title == "2 probes are due"


def test_type_registration_is_idempotent_and_refuses_a_conflict() -> None:
    register_notification_type(PROBE.code, PROBE)
    register_notification_type(PROBE.code, PROBE)
    assert REGISTRY[PROBE.code] is PROBE
    other = dataclasses.replace(PROBE, title_en="different")
    with pytest.raises(ImproperlyConfigured):
        register_notification_type(PROBE.code, other)


@pytest.mark.parametrize("code", ["probe_due", "reminder_due", "Inventory.Due", "inventory."])
def test_a_module_type_code_is_module_dot_event(code: str) -> None:
    """BR-3; and a core literal code can never be re-registered."""
    spec = dataclasses.replace(PROBE, code=code)
    with pytest.raises(ImproperlyConfigured):
        register_notification_type(code, spec)


def test_the_code_and_the_spec_must_agree() -> None:
    with pytest.raises(ImproperlyConfigured):
        register_notification_type("inventory.other_event", PROBE)


def test_reset_restores_the_core_types() -> None:
    before = dict(REGISTRY)
    register_notification_type(PROBE.code, PROBE)
    notify_module._reset_for_tests()
    assert before == REGISTRY
    assert "reminder_due" in REGISTRY


# ── default templates ─────────────────────────────────────────────────────────

BODIES = {
    "inventory_probe_notice": {
        "whatsapp": {"en": "Namaste {{party_name}}, probe due. — {{shop}}", "hi": "नमस्ते {{party_name}} — {{shop}}"},
        "sms": {"en": "{{shop}}: probe due. -{{shop}}"},
    }
}


def test_registered_templates_resolve_like_core_defaults(tenant: Any) -> None:
    """R29: `<module>_<purpose>` → bodies per channel × locale, resolved
    through the same tenant → partner → global → code-default chain, with
    `hi` falling back to `en` where a channel has no Hindi."""
    register_default_templates(BODIES)
    hi = resolve_template(tenant=tenant, code="inventory_probe_notice", channel="whatsapp", locale="hi")
    assert hi.body.startswith("नमस्ते")
    sms_hi = resolve_template(tenant=tenant, code="inventory_probe_notice", channel="sms", locale="hi")
    assert sms_hi.body == "{{shop}}: probe due. -{{shop}}"


def test_template_registration_is_idempotent_and_never_overrides() -> None:
    register_default_templates(BODIES)
    register_default_templates(BODIES)
    core_key = next(iter(DEFAULT_TEMPLATES))
    code, channel, locale = core_key
    with pytest.raises(ImproperlyConfigured):
        register_default_templates({code: {channel: {locale: "Replaced words"}}})
    with pytest.raises(ImproperlyConfigured):
        register_default_templates(
            {"inventory_probe_notice": {"sms": {"en": "Different words -{{shop}}"}}}
        )


@pytest.mark.parametrize(
    "mapping",
    [
        {"probe": {"sms": {"en": "x"}}},  # no <module>_ prefix
        {"Inventory_probe": {"sms": {"en": "x"}}},
        {"inventory_" + "x" * 48: {"sms": {"en": "x"}}},  # longer than the column
        {"inventory_probe": {"telegram": {"en": "x"}}},  # not a channel
        {"inventory_probe": {"sms": {"fr": "x"}}},  # not a locale
        {"inventory_probe": {"sms": {"hi": "x"}}},  # no English to fall back to
        {"inventory_probe": {"sms": {"en": ""}}},  # empty body
    ],
)
def test_template_mappings_are_validated_before_anything_is_stored(mapping: dict) -> None:
    before = dict(DEFAULT_TEMPLATES)
    with pytest.raises(ImproperlyConfigured):
        register_default_templates(mapping)
    assert before == DEFAULT_TEMPLATES
