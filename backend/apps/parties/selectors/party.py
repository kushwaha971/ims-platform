"""Read-only party queries (Part 26 §26.5).

A selector takes the tenant explicitly and scopes first; it never writes and
never opens a transaction (rule D8).
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from django.db.models import QuerySet

from apps.parties.models import Party


def list_parties(*, tenant: Any, search: str | None = None) -> QuerySet[Party]:
    """The party list, scoped and ordered, ready for the paginator.

    Scoping is the first operation, so a `None` tenant yields the empty set
    rather than every tenant's rows (canon §0.11 rule 2).
    """
    qs = Party.objects.for_tenant(tenant)
    if search:
        qs = qs.filter(name__icontains=search.strip())
    return qs.order_by("-last_activity_at", "name", "id")


def get_party(*, tenant: Any, party_id: UUID | str) -> Party | None:
    """One party, or None. The caller decides whether None is a 404."""
    return Party.objects.for_tenant(tenant).filter(pk=party_id).first()
