"""Row scoping below the tenant (A13, ADR-052, contracts §3, FRD 00 PLT-X12).

Tenant scoping is fail-closed with 404 semantics (ADR-032). Some members are
scoped further: a collection agent sees the loans on their routes, a trainer
the members of their batches, housekeeping the rooms. Such a member holds a
module role (`permissions_registry.register_module_role`) and the vertical's
viewsets narrow every queryset with a `scope_filter` the vertical MUST write —
unless the member holds the viewset's `<module>.<resource>.read_all`.

Three rules, each a test in `apps/common/tests/test_scoping.py`:

* **Fail closed (BR-1).** A viewset that uses the mixin and does not override
  `scope_filter` raises on its first request, for everybody, owner included —
  so the mistake is found by the first person to open the screen, not by an
  agent who notices they can see the whole book.
* **404, never 403 (BR-2).** The filter is applied to the queryset, so
  `get_object()` of an out-of-scope id raises `Http404`: a 403 would confirm
  that the row exists.
* **No member, no rows.** When no membership resolves, the scope applies and
  nothing is bypassed.

`scope_exempt = "<reason>"` on a vertical viewset that deliberately shows
tenant-wide rows is the one alternative the architecture test accepts
(`tests/architecture/test_module_scoping.py`).
"""

from __future__ import annotations

from typing import Any

from django.core.exceptions import ImproperlyConfigured
from django.db.models import Q, QuerySet

from apps.common.permissions_registry import permissions_for
from apps.common.tenancy import get_effective_tenant


def member_codenames(request: Any) -> frozenset[str] | None:
    """The signed-in member's effective codenames, or None when none resolves."""
    tenant = get_effective_tenant(request) if request is not None else None
    membership = getattr(tenant, "_ub_membership", None) if tenant is not None else None
    if membership is None:
        return None
    return permissions_for(membership)


def scoped_queryset(
    queryset: QuerySet, *, scope: Q, held: frozenset[str] | set[str] | None, read_all: str
) -> QuerySet:
    """`queryset` narrowed by `scope` unless `read_all` is in `held`.

    `held=None` (no member resolved) is the most restrictive case: the scope
    applies AND no row is returned, because a request nobody can be named for
    is not one to answer from a tenant's data.
    """
    if held is None:
        return queryset.none()
    if read_all and read_all in held:
        return queryset
    return queryset.filter(scope)


class ScopedViewSetMixin:
    """Put before the tenant base viewset: `class X(ScopedViewSetMixin, TenantScopedViewSet)`.

    `get_queryset()` is the tenant queryset (from the base class) narrowed by
    `scope_filter(request)` unless the member holds `scope_all_permission`.
    """

    #: e.g. "lending.loan.read_all" — held by owner and admin by default and
    #: explicitly by accountant (BR-4); never by a module role (BR-3).
    scope_all_permission: str = ""

    def scope_filter(self, request: Any) -> Q:
        """REQUIRED. The assigned-rows filter for a scoped member."""
        raise NotImplementedError(
            f"{type(self).__name__} uses ScopedViewSetMixin without a scope_filter (fail closed)."
        )

    def get_queryset(self) -> QuerySet:
        if not self.scope_all_permission:
            raise ImproperlyConfigured(
                f"{type(self).__name__} uses ScopedViewSetMixin without a scope_all_permission."
            )
        if type(self).scope_filter is ScopedViewSetMixin.scope_filter:
            # Checked before the `read_all` bypass, so the owner's first visit
            # finds the missing filter too — not a scoped agent months later.
            raise NotImplementedError(
                f"{type(self).__name__} uses ScopedViewSetMixin without a scope_filter "
                "(fail closed)."
            )
        queryset = super().get_queryset()  # type: ignore[misc]
        held = member_codenames(self.request)  # type: ignore[attr-defined]
        if held is not None and self.scope_all_permission in held:
            return queryset
        scope = self.scope_filter(self.request)  # type: ignore[attr-defined]
        return scoped_queryset(queryset, scope=scope, held=held, read_all=self.scope_all_permission)
