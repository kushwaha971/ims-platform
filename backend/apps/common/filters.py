"""Filter primitives (Part 20 §20.2.2, Part 26 R7.3).

Ad-hoc `request.query_params` filtering in views is banned; every list endpoint
declares a `filterset_class` built on these.
"""

from __future__ import annotations

from typing import Any

import django_filters
from django.db.models import QuerySet


class MultiEnumFilter(django_filters.CharFilter):
    """`?status=issued,overdue` — a comma list of enum values (Part 22 §22.1)."""

    def filter(self, qs: QuerySet, value: Any) -> QuerySet:
        if not value:
            return qs
        values = [v.strip() for v in str(value).split(",") if v.strip()]
        if not values:
            return qs
        return qs.filter(**{f"{self.field_name}__in": values})


class DateRangeFilter(django_filters.FilterSet):
    """Mixin marker; concrete filtersets declare `date_from`/`date_to` explicitly."""

    class Meta:
        abstract = True


class BaseTenantFilterSet(django_filters.FilterSet):
    """Every list filterset inherits this.

    The tenant scope itself is *not* applied here — it belongs to
    `TenantScopeMixin.get_queryset()`, which runs first and fails closed. This
    base exists so a filterset can reach the tenant for related-object filtering
    without reading `self.request` in ad-hoc ways.
    """

    @property
    def tenant(self) -> Any:
        from apps.common.tenancy import get_effective_tenant

        return get_effective_tenant(self.request) if self.request is not None else None
