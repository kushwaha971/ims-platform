"""Read-only party queries (Part 26 §26.5).

A selector takes the tenant explicitly and scopes first; it never writes and
never opens a transaction (rule D8).
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from django.db.models import QuerySet

from apps.parties.models import Party

#: The columns `PartyListSerializer` reads, and the only ones the list page
#: fetches. The model has 30; the list row needs these 9, and the three it does
#: not need are the wide ones — `notes` (TEXT), `billing_address` and
#: `shipping_address` (JSONB). §20.14.2 allows `only()` exactly here, on a hot
#: list path, and warns about the deferred-field footgun: a field left out and
#: then touched is a query *per row*. `test_list_columns_cover_the_list_row`
#: keeps this tuple and the serializer from drifting apart, and the query-budget
#: test would catch the N+1 if they ever did.
#:
#: Measured at a page of 100 on a 98 000-row tenant: 0.575 ms (`SELECT *`,
#: planner row width 897) -> 0.181 ms (width 81).
LIST_COLUMNS = (
    "id",
    "name",
    "display_code",
    "mobile",
    "is_customer",
    "is_supplier",
    "balance",
    "status",
    "last_activity_at",
)


def list_parties(*, tenant: Any, search: str | None = None) -> QuerySet[Party]:
    """The party list, scoped and ordered, ready for the paginator.

    Scoping is the first operation, so a `None` tenant yields the empty set
    rather than every tenant's rows (canon §0.11 rule 2).

    The ordering ends in `id` because the paginator is offset-based: a sort that
    is not total lets a tied row appear on two pages. `last_activity_at` is
    nullable, so ties are the common case, not the rare one. DRF's ordering
    backend replaces this tuple when the client sends `?ordering=`, which is why
    `StableOrderingFilter` re-appends the key rather than trusting this line.
    """
    qs = Party.objects.for_tenant(tenant)
    if search:
        qs = qs.filter(name__icontains=search.strip())
    return qs.only(*LIST_COLUMNS).order_by("-last_activity_at", "name", "id")


def get_party(*, tenant: Any, party_id: UUID | str) -> Party | None:
    """One party, or None. The caller decides whether None is a 404."""
    return Party.objects.for_tenant(tenant).filter(pk=party_id).first()


def party_detail_queryset(*, tenant: Any) -> QuerySet[Party]:
    """The scoped queryset `retrieve` looks an id up in — every column, no `only()`.

    The list path defers 21 of the model's 30 columns. The detail path must not:
    the serializer it feeds today happens to be the list serializer, but a detail
    serializer that grows one more field would turn each deferred column into a
    second query, which is the trap §20.14.2 names.
    """
    return Party.objects.for_tenant(tenant)
