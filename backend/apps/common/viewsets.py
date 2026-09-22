"""Base viewsets (Part 20 §20.4.5)."""

from __future__ import annotations

from typing import Any

from django.db.models import QuerySet
from rest_framework import mixins, viewsets

from apps.common.tenancy import get_effective_tenant


class TenantScopeMixin:
    """Fail-closed tenant scoping for views (legacy DigiKhaato pattern, this product's model)."""

    tenant_field = "tenant"

    def get_tenant(self) -> Any:
        return get_effective_tenant(self.request)

    def scope_to_tenant(self, qs: QuerySet) -> QuerySet:
        tenant = self.get_tenant()
        if tenant is None:
            return qs.none()  # never all-tenants data
        return qs.filter(**{self.tenant_field: tenant})

    def get_serializer_context(self) -> dict:
        return {**super().get_serializer_context(), "tenant": self.get_tenant()}


class ReadWriteSerializerMixin:
    """Separate read and write serializers (Part 26 §26.6 R6.1)."""

    read_serializer_class: Any = None
    write_serializer_class: Any = None

    def get_serializer_class(self) -> Any:
        if self.request is not None and self.request.method in ("POST", "PUT", "PATCH"):
            return self.write_serializer_class or super().get_serializer_class()
        return self.read_serializer_class or super().get_serializer_class()


class TenantScopedViewSet(TenantScopeMixin, viewsets.ModelViewSet):
    """Every business viewset inherits this. Setting `queryset` is enough.

    `get_object()` therefore looks up inside the scoped queryset: an id that
    belongs to another tenant raises `Http404`, which the exception handler turns
    into `not_found` — canon §0.11 rule 2, "cross-tenant IDs return 404, never
    403". The 404 is not a courtesy; a 403 would confirm the row exists.
    """

    def get_queryset(self) -> QuerySet:
        return self.scope_to_tenant(super().get_queryset())


class TenantScopedNoDeleteViewSet(
    TenantScopeMixin,
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """List, retrieve, create and update. **No destroy, by construction.**

    Most business entities in this product are ARCHIVED, never deleted: a party
    with entries against it, an invoice that has been issued, an item that has
    moved stock. The record is the evidence, and canon §0.7 treats archival as
    a state change with an audit row rather than a removal.

    `ModelViewSet` hands a route `destroy` for free, and a base class that
    grants a destructive verb by default is a base class that will eventually
    grant one nobody meant to expose. Leaving `destroy` out of the mixin list
    means the router never maps DELETE at all — the verb is 405, which is the
    honest answer. Refusing it with a permission would answer 403 instead,
    telling a caller to go and ask for rights that should never exist.

    An entity that genuinely deletes uses `ModelViewSet` and says so.
    """

    def get_queryset(self) -> QuerySet:
        return self.scope_to_tenant(super().get_queryset())


class TenantScopedReadOnlyViewSet(TenantScopeMixin, viewsets.ReadOnlyModelViewSet):
    """The read-only form, with the same fail-closed guarantee."""

    def get_queryset(self) -> QuerySet:
        return self.scope_to_tenant(super().get_queryset())
