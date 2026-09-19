"""Tenant-aware managers and querysets (Part 20 §20.4.4)."""

from __future__ import annotations

from typing import Any

from django.db import models


class TenantQuerySet(models.QuerySet):
    """Explicit tenant scoping. Never implicit."""

    def for_tenant(self, tenant: Any) -> "TenantQuerySet":
        """The form every selector uses. `None` yields the empty set, not everything."""
        if tenant is None:
            return self.none()
        return self.filter(tenant=tenant)

    def alive(self) -> "TenantQuerySet":
        return self.filter(deleted_at__isnull=True)


class TenantManager(models.Manager.from_queryset(TenantQuerySet)):
    """Default manager: does NOT auto-scope by tenant.

    Auto-scoping from a thread-local is deliberately rejected (Part 20 §20.4.4):
    it makes the scope invisible at the call site, breaks in management commands
    and jobs that legitimately cross tenants, and turns a missing context into
    silent data loss instead of a loud failure. Scoping is explicit —
    `Model.objects.for_tenant(ctx.tenant)` — and the fail-closed guarantee lives
    at the boundary (`TenantScopedViewSet`, selectors), where it is testable.
    """


class SoftDeleteManager(models.Manager.from_queryset(TenantQuerySet)):
    """`objects` on a soft-deletable model: hides soft-deleted rows."""

    def get_queryset(self) -> TenantQuerySet:
        return super().get_queryset().filter(deleted_at__isnull=True)


class AllObjectsManager(models.Manager.from_queryset(TenantQuerySet)):
    """`all_objects` — includes soft-deleted rows.

    Allowed callers (Part 20 §20.4.4): Django admin, `files.gc_orphans`, the
    tenant-deletion job, and tests. Nothing else.
    """
