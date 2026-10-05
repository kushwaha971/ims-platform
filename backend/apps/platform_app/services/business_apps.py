"""Which apps a business runs, and who is in them (docs/platform/14 §6, decision 2).

"Leave" means two different things depending on who asks, and both live here:

- The OWNER turns an app on or off for the business (`set_app_running`). Off
  removes the app's anchor capability from the business's switches: its menu
  goes for everyone and its data stays, exactly as switching a feature off in
  Settings always has (PLT-06 BR-4), including the refusal while something is
  still open (`module_has_data`). On switches the anchor and the app's own
  capabilities the plan includes, with their dependencies, through the same
  service, so the plan, the dependency rules, the enable hooks and the audit
  are the ones Settings uses.
- Anyone ELSE removes themselves from an app (`leave_app`). That is their own
  grant, not the business's switches. A member from before grants existed
  (no grants: their one role covers every app) is given explicit grants for
  the apps they keep, so leaving one does not take the others with it.

Two refusals are the same rule seen from two sides: a business runs at least
one app, and a member is in at least one (to go further, leave the business).
"""

from __future__ import annotations

from typing import Any

from django.db import transaction

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation, PermissionDenied, ValidationFailed


def set_app_running(*, membership: Any, app: Any, running: Any, ctx: Ctx) -> Any:
    """`POST /tenants/current/apps {app, running}` — the owner adds or turns off an app."""
    from apps.platform_app import apps_registry
    from apps.platform_app.services.tenant_settings import (
        MODULE_DEPENDENCIES,
        modules_view,
        update_enabled_modules,
    )

    if not apps_registry.is_business_owner(membership):
        raise PermissionDenied("Only the owner adds or turns off an app.")
    spec = apps_registry.app_spec(str(app or ""))
    if spec is None or not isinstance(running, bool):
        raise ValidationFailed({"app": ["Choose an app, and whether it should run."]})
    tenant = membership.tenant
    current = set(tenant.enabled_modules or [])
    on_now = {a.code for a in apps_registry.apps_of_business(tenant)}

    if running:
        if spec.code in on_now:
            return tenant
        available = set(modules_view(tenant)["available"])
        if spec.anchor not in available:
            raise ValidationFailed({"app": ["That app is not included in your plan."]})
        wanted = current | {spec.anchor} | (spec.capabilities & available)
        for module in list(wanted):
            wanted |= MODULE_DEPENDENCIES.get(module, frozenset())
    else:
        if spec.code not in on_now:
            return tenant
        if on_now == {spec.code}:
            raise BusinessRuleViolation(
                "app_last_one",
                "A business runs at least one app. Add another before turning this one off.",
                details={"app": spec.code, "of": "business"},
            )
        wanted = current - {spec.anchor}

    # Only switches Settings itself could send: a name the plan does not list
    # (an engine such as `dues`, which has no switch, or a module the plan has
    # since lost) would make the whole change refuse with "not in your plan".
    # The nightly reconcile drops those anyway; the hidden ones are carried
    # through by `update_enabled_modules` itself.
    switchable = set(modules_view(tenant)["available"])
    return update_enabled_modules(tenant=tenant, modules=sorted(wanted & switchable), ctx=ctx)


def leave_app(*, membership: Any, app: Any, ctx: Ctx) -> Any:
    """`POST /auth/leave-app {app}` — a member takes themselves out of one app."""
    from apps.common.permissions_registry import module_role, permissions_for
    from apps.platform_app import apps_registry
    from apps.platform_app.models import Membership, MembershipAppGrant

    if apps_registry.is_business_owner(membership):
        raise BusinessRuleViolation(
            "owner_in_every_app",
            "The owner is in every app. Turn the app off for the business instead.",
            details={"app": str(app or "")},
        )
    code = str(app or "")
    opens = apps_registry.accessible_apps(membership, permissions_for(membership))
    if code not in {a.code for a in opens}:
        raise ValidationFailed({"app": ["You are not in that app here."]})
    if len(opens) == 1:
        raise BusinessRuleViolation(
            "app_last_one",
            "This is the only app you are in here. To stop working here, leave the business.",
            details={"app": code, "of": "member"},
        )

    grants = apps_registry.grants_of(membership)
    before = {a: r.code for a, r in grants.items()}
    with transaction.atomic():
        if grants:
            MembershipAppGrant.objects.filter(membership=membership, app=code).delete()
        else:
            # Legacy: the one business role covered every app. Keep it for the
            # others, explicitly, and leave this one out.
            role = membership.role
            keep = [
                a
                for a in opens
                if a.code != code
                and ((m := module_role(role.code)) is None or m.module in a.capabilities)
            ]
            MembershipAppGrant.objects.bulk_create(
                [MembershipAppGrant(membership=membership, app=a.code, role=role) for a in keep]
            )
        fields = {"permissions_version": membership.permissions_version + 1}
        if (membership.last_app or "") == code:
            fields["last_app"] = ""
        Membership.objects.filter(pk=membership.pk).update(**fields)
        for name, value in fields.items():
            setattr(membership, name, value)
        if hasattr(membership, "_ub_app_grants"):
            del membership._ub_app_grants
        write_audit(
            ctx=ctx,
            action=AuditAction.MEMBER_APPS_CHANGED,
            entity_type="platform_membership",
            entity_id=membership.id,
            before={"grants": before},
            after={
                "grants": {a: r.code for a, r in apps_registry.grants_of(membership).items()},
                "left": code,
            },
        )
    return membership
