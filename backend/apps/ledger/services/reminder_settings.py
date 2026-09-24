"""LED-07 FR-1 / LED-08 FR-1 — the two ledger messaging switches.

Both are well-known tenant settings (Part 21 §21.3.1) that nothing wrote until
now. They default OFF: a merchant who has not thought about automated SMS must
not find that the product texted their customers.

Read tolerantly, written in one shape. PLT-06's generic settings endpoint does
not exist yet (it is another track's), so this is the narrow writer for these
two keys; the day `PUT /tenants/current/settings` lands it writes the same rows
in the same `{"value": "on"|"off"}` shape and both keep working.
"""

from __future__ import annotations

from typing import Any

from django.db import transaction

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.exceptions import ValidationFailed
from apps.ledger.constants import SETTING_AUTO_SMS, SETTING_PARTY_SMS_ON_ENTRY

#: API field → tenant-setting key.
FIELDS: dict[str, str] = {
    "auto_sms": SETTING_AUTO_SMS,
    "party_sms_on_entry": SETTING_PARTY_SMS_ON_ENTRY,
}


def _as_bool(value: Any) -> bool:
    """`{"value": "on"}`, `"on"`, `true`, `{"enabled": true}` — anything else is off."""
    if isinstance(value, dict):
        value = value.get("value", value.get("enabled"))
    if isinstance(value, str):
        return value.strip().lower() in ("on", "true", "1", "yes")
    return value is True


def setting_on(tenant: Any, key: str) -> bool:
    from apps.platform_app.models import TenantSetting

    if tenant is None:
        return False
    row = TenantSetting.objects.filter(tenant=tenant, key=key).only("value").first()
    return _as_bool(row.value) if row is not None else False


def reminder_settings(tenant: Any) -> dict[str, bool]:
    from apps.platform_app.models import TenantSetting

    rows = {
        row.key: row.value
        for row in TenantSetting.objects.filter(tenant=tenant, key__in=FIELDS.values())
    }
    return {field: _as_bool(rows.get(key)) for field, key in FIELDS.items()}


@transaction.atomic
def update_reminder_settings(*, ctx: Ctx, payload: dict) -> dict[str, bool]:
    """Write the switches that were sent; audit the change (LED-07 §16)."""
    from apps.platform_app.models import TenantSetting

    unknown = set(payload) - set(FIELDS)
    details: dict[str, list[str]] = {f: ["Unknown setting."] for f in sorted(unknown)}
    for field in set(payload) & set(FIELDS):
        if not isinstance(payload[field], bool):
            details[field] = ["Use true or false."]
    if details:
        raise ValidationFailed(details)

    before = reminder_settings(ctx.tenant)
    for field, on in payload.items():
        TenantSetting.objects.update_or_create(
            tenant=ctx.tenant,
            key=FIELDS[field],
            defaults={"value": {"value": "on" if on else "off"}},
        )
    after = reminder_settings(ctx.tenant)
    changed = {k for k in after if after[k] != before[k]}
    if changed:
        write_audit(
            ctx=ctx,
            action=AuditAction.TENANT_SETTINGS_UPDATED,
            entity_type="platform_tenant_setting",
            entity_id=ctx.tenant.id,
            before={FIELDS[k]: before[k] for k in sorted(changed)},
            after={FIELDS[k]: after[k] for k in sorted(changed)},
        )
    return after
