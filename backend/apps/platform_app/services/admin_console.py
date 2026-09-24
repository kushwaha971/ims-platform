"""PLT-14 FR-3 — the operator's writes on a tenant: plan, status, limit overrides.

Every change requires a reason (FR-10) and writes one audit row per logical
change with `actor_type='super_admin'` (§16), in the TENANT's log, so the
merchant's own activity page shows that support changed their plan and why.
There is no way to change a tenant from the console without leaving that trace.
"""

from __future__ import annotations

from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.common.audit import write_audit
from apps.common.exceptions import BusinessRuleViolation, ValidationFailed
from apps.platform_app.constants import TenantStatus
from apps.platform_app.services.support_access import admin_ctx

ADMIN_STATUSES = (TenantStatus.ACTIVE, TenantStatus.SUSPENDED)


def _clean_overrides(raw: Any) -> dict:
    from apps.platform_app.services.entitlements import LIMIT_KEYS

    if not isinstance(raw, dict):
        raise ValidationFailed({"entitlement_overrides": ["Send an object of limits."]})
    unknown = sorted(set(raw) - set(LIMIT_KEYS))
    if unknown:
        raise ValidationFailed(
            {"entitlement_overrides": [f"{unknown[0]} is not an enforced limit (DEC-001)."]}
        )
    clean: dict[str, int | None] = {}
    for key, value in raw.items():
        if value is None or value == "":
            clean[key] = None
            continue
        try:
            number = int(value)
        except (TypeError, ValueError):
            raise ValidationFailed({"entitlement_overrides": [f"{key} must be a whole number."]})
        if number < 0:
            raise ValidationFailed({"entitlement_overrides": [f"{key} cannot be negative."]})
        clean[key] = number
    return clean


def update_tenant(
    *,
    admin: Any,
    tenant: Any,
    reason: str,
    plan_id: Any = None,
    status: str | None = None,
    entitlement_overrides: Any = None,
    meta: dict | None = None,
) -> Any:
    from apps.platform_app.models import Plan, Session, Tenant, TenantSetting
    from apps.platform_app.services.entitlements import OVERRIDE_SETTING_KEY

    with transaction.atomic():
        tenant = Tenant.objects.select_for_update().get(pk=tenant.pk)
        ctx = admin_ctx(admin=admin, tenant=tenant, meta=meta)

        if plan_id is not None and str(plan_id) != str(tenant.plan_id):
            plan = Plan.objects.filter(pk=plan_id, is_active=True).first()
            if plan is None:
                raise ValidationFailed({"plan_id": ["Choose an active plan."]})
            before = tenant.plan.code
            tenant.plan = plan
            tenant.save(update_fields=["plan", "updated_at"])
            write_audit(
                ctx=ctx,
                action="admin.tenant_plan_changed",
                entity_type="platform_tenant",
                entity_id=tenant.id,
                before={"plan": before},
                after={"plan": plan.code},
                metadata={"reason": reason},
            )

        if entitlement_overrides is not None:
            # `plan.overrides` is `{"limits": {...}, "modules_extra": [...]}`, which
            # is the shape `entitlements.for_tenant` reads; only `limits` is
            # edited here, and a null removes an override (back to the plan).
            clean = _clean_overrides(entitlement_overrides)
            row = TenantSetting.objects.filter(tenant=tenant, key=OVERRIDE_SETTING_KEY).first()
            stored = dict(row.value or {}) if row is not None else {}
            before = dict(stored.get("limits") or {})
            after = {**before, **clean}
            after = {k: v for k, v in after.items() if v is not None}
            if after != before:
                TenantSetting.objects.update_or_create(
                    tenant=tenant,
                    key=OVERRIDE_SETTING_KEY,
                    defaults={"value": {**stored, "limits": after}},
                )
                write_audit(
                    ctx=ctx,
                    action="admin.tenant_overrides_changed",
                    entity_type="platform_tenant",
                    entity_id=tenant.id,
                    before=before,
                    after=after,
                    metadata={"reason": reason},
                )

        if status is not None and status != tenant.status:
            if tenant.status not in ADMIN_STATUSES or status not in ADMIN_STATUSES:
                # A pending or deleted business is the owner's decision (EC-5):
                # the console cannot suspend it into limbo or wake it up.
                raise BusinessRuleViolation(
                    "tenant_pending_deletion",
                    "This business is being deleted; its status cannot be changed here.",
                )
            tenant.status = status
            tenant.save(update_fields=["status", "updated_at"])
            revoked = 0
            if status == TenantStatus.SUSPENDED:
                revoked = Session.objects.filter(tenant=tenant, revoked_at__isnull=True).update(
                    revoked_at=timezone.now()
                )
            write_audit(
                ctx=ctx,
                action=(
                    "admin.tenant_suspended"
                    if status == TenantStatus.SUSPENDED
                    else "admin.tenant_reactivated"
                ),
                entity_type="platform_tenant",
                entity_id=tenant.id,
                metadata={"reason": reason, "sessions_revoked": revoked},
            )
    return tenant
