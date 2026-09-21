"""Filter primitives (Part 20 §20.2.2, Part 26 R7.3).

Ad-hoc `request.query_params` filtering in views is banned; every list endpoint
declares a `filterset_class` built on these.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

import django_filters
from django.db.models import QuerySet
from rest_framework.filters import OrderingFilter


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


def with_tie_breaker(ordering: Sequence[str], model: Any) -> list[str]:
    """`ordering` with the model's primary key appended, unless it is already in it."""
    pk_name = model._meta.pk.name
    terms = list(ordering)
    for term in terms:
        if term.lstrip("-") in (pk_name, "pk"):
            return terms
    terms.append("pk")
    return terms


class StableOrderingFilter(OrderingFilter):
    """`OrderingFilter`, but every ordering it produces ends in a unique key.

    DRF's `OrderingFilter` does not *append* to the queryset's ordering, it
    **replaces** it: `?ordering=-last_activity_at` turns the selector's
    `order_by("-last_activity_at", "name", "id")` into a single sort key. On
    `parties_party` that key is nullable, so every party that has never had an
    entry ties with every other, and PostgreSQL is free to return tied rows in
    any order it likes — including a different order for the `OFFSET 0` query
    and the `OFFSET 25` query that follow each other by milliseconds. The
    merchant sees one party twice and never sees another. That is a correctness
    bug, not a slow query: `LIMIT/OFFSET` over a non-deterministic sort has no
    defined paging semantics at all.

    Appending the primary key makes the sort total, which makes the paging
    deterministic, and costs nothing: the tie-breaker is only ever compared
    between rows that are already equal on every preceding key.

    The cursor paginator (`apps.common.pagination.CursorPagination`) does not
    need this — its ordering already ends in `-id` and it is keyset, not offset.
    """

    def get_ordering(self, request: Any, queryset: QuerySet, view: Any) -> Any:
        ordering = super().get_ordering(request, queryset, view)
        if not ordering:
            # No `ordering` parameter and no `view.ordering`: DRF leaves the
            # queryset alone, so the selector's own `order_by` survives and is
            # already total. Nothing to add.
            return ordering
        return with_tie_breaker(ordering, queryset.model)
