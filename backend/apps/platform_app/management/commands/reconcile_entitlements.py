"""`manage.py reconcile_entitlements` — PLT-15 FR-8's nightly trim.

> **FR-8** Plan change/downgrade: existing usage above the new limit is
> tolerated (no deletion); new creations are blocked until below limit; the
> nightly `reconcile_entitlements` command trims `enabled_modules` to the
> effective set, notifies owners (`plan.modules_trimmed`), and **never deletes
> data**.

So this command does exactly one destructive-looking thing and it is not
destructive: it removes from `platform_tenant.enabled_modules` any module the
plan or the partner no longer allows. The rows of that module stay where they
are — EC-3 is explicit that "data is retained" — they simply stop being
reachable until the entitlement comes back.

The owner notification is `NTF-01`'s in-app inbox, which does not exist yet.
Until it does, the trim writes `plan.modules_trimmed` to the audit log with the
before and after sets, which is where an operator can already see it. `CR-LOG`
records the gap.
"""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx


class Command(BaseCommand):
    help = "Trim each tenant's enabled_modules to its effective entitlement. Idempotent."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument(
            "--tenant", default=None, help="Reconcile one tenant instead of all of them."
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would change and write nothing.",
        )

    def handle(self, *args: Any, **opts: Any) -> None:
        trimmed = reconcile(tenant_id=opts["tenant"], dry_run=bool(opts["dry_run"]))
        for row in trimmed:
            self.stdout.write(f"{row['tenant_id']}: {row['removed']}")
        self.stdout.write(f"tenants trimmed: {len(trimmed)}")


def reconcile(*, tenant_id: str | None = None, dry_run: bool = False) -> list[dict]:
    """Return one row per tenant whose `enabled_modules` had to shrink."""
    from apps.platform_app.models import Tenant, TenantStatus
    from apps.platform_app.services.entitlements import for_tenant

    queryset = Tenant.objects.select_related("plan", "partner").exclude(status=TenantStatus.DELETED)
    if tenant_id:
        queryset = queryset.filter(pk=tenant_id)

    changed: list[dict] = []
    for tenant in queryset.iterator(chunk_size=200):
        entitled = for_tenant(tenant).modules | {"platform"}
        before = sorted(tenant.enabled_modules or [])
        after = sorted(module for module in before if module in entitled)
        if after == before:
            continue

        removed = sorted(set(before) - set(after))
        changed.append({"tenant_id": str(tenant.pk), "removed": removed})
        if dry_run:
            continue

        tenant.enabled_modules = after
        tenant.save(update_fields=["enabled_modules", "updated_at"])
        write_audit(
            ctx=Ctx(tenant=tenant, actor=None, actor_type="system"),
            action=AuditAction.PLAN_MODULES_TRIMMED,
            entity_type="platform_tenant",
            entity_id=tenant.pk,
            before={"enabled_modules": before},
            after={"enabled_modules": after},
            metadata={"removed": removed, "plan_code": tenant.plan.code},
        )
    return changed
