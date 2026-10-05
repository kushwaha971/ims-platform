"""Hide an app's setup checklist for the business (docs/platform/14 step 5)."""

from __future__ import annotations

from typing import Any

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.exceptions import PermissionDenied, ValidationFailed


def hide_setup(*, membership: Any, code: str, ctx: Ctx) -> None:
    """The owner or an admin hides the checklist for everyone in the business.

    Hidden is not done: the steps stay facts, and nothing they gate changes.
    """
    from apps.platform_app import apps_registry
    from apps.platform_app.models import Tenant

    if getattr(membership.role, "code", None) not in {"owner", "admin"}:
        raise PermissionDenied("Only the owner or an admin hides the setup list.")
    if apps_registry.app_setup(code) is None:
        raise ValidationFailed({"app": ["That app has no setup list."]})
    tenant = membership.tenant
    hidden = sorted(set(tenant.setup_hidden_apps or []) | {code})
    if hidden == sorted(tenant.setup_hidden_apps or []):
        return
    Tenant.objects.filter(pk=tenant.pk).update(setup_hidden_apps=hidden)
    tenant.setup_hidden_apps = hidden
    write_audit(
        ctx=ctx,
        action=AuditAction.TENANT_SETTINGS_UPDATED,
        entity_type="platform_tenant",
        entity_id=tenant.id,
        after={"setup_hidden_apps": hidden},
    )
