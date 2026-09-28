"""Filter primitives (Part 20 §20.2.2, Part 26 R7.3).

Ad-hoc `request.query_params` filtering in views is banned; every list endpoint
declares a `filterset_class` built on these.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

import django_filters
from django.core.exceptions import FieldDoesNotExist
from django.db.models import F, OrderBy, QuerySet
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

    ── It also decides where NULLs go, and that is the half that was missing ──

    The replacement above throws away more than the tie-breaker. The party
    list's selector orders by `F("last_activity_at").desc(nulls_last=True)`,
    because FR-7 and BR-6 both say a party who has never transacted must not
    sort above one who bought something this morning. `?ordering=` cannot
    express that: it is a list of strings, `-last_activity_at` compiles to a
    plain `DESC`, and PostgreSQL puts NULLs FIRST on a DESC sort.

    So the careful default was live only for a request that omitted `ordering`
    — and the client omits it never. `DEFAULT_ORDERING` in the party list's own
    constants is `-last_activity_at`, sent on every request including the first
    one, so what a merchant actually saw at the top of their book was six
    parties they have never traded with. Every backend test passed, because a
    test calls the endpoint without `ordering` and gets the selector's version.

    The rule applied here is that **a missing value never outranks a present
    one**: nulls last, in both directions. Ascending already behaves that way
    in PostgreSQL, so in practice this changes descending sorts on nullable
    columns and nothing else. It is also what makes the ordering match
    `ix_party_tenant_activity`, which is declared `DESC NULLS LAST` — a query
    asking for the other null placement cannot use it, so before this the real
    client request was still a sequential scan and a sort of the whole tenant.
    """

    def get_ordering(self, request: Any, queryset: QuerySet, view: Any) -> Any:
        ordering = super().get_ordering(request, queryset, view)
        if not ordering:
            # No `ordering` parameter and no `view.ordering`: DRF leaves the
            # queryset alone, so the selector's own `order_by` survives and is
            # already total. Nothing to add.
            return ordering
        return [
            _with_null_placement(term, queryset.model)
            for term in with_tie_breaker(ordering, queryset.model)
        ]


def _is_nullable(model: Any, field_name: str) -> bool:
    """Whether `field_name` on `model` can hold NULL.

    Unknown names are treated as non-nullable rather than raising: DRF has
    already validated the term against `ordering_fields`, and a name this
    cannot resolve (a related lookup, an annotation) is one where null
    placement is not ours to decide.
    """
    if field_name in ("pk", ""):
        return False
    try:
        return bool(model._meta.get_field(field_name).null)
    except (FieldDoesNotExist, AttributeError):
        return False


def _with_null_placement(term: str, model: Any) -> Any:
    """One ordering term, as an expression that says where its NULLs go.

    Returns the plain string unchanged for anything that does not need it, so
    the SQL for a non-nullable column is exactly what it was — `ORDER BY name
    ASC`, not `ORDER BY name ASC NULLS LAST`, which reads as noise and gives a
    future reader a reason to wonder whether `name` can be null.
    """
    descending = term.startswith("-")
    field_name = term.lstrip("-")
    if not descending or not _is_nullable(model, field_name):
        # Ascending is already NULLS LAST in PostgreSQL, and a column that
        # cannot be null has no placement to decide.
        return term
    return OrderBy(F(field_name), descending=True, nulls_last=True)
