"""Party filtersets (Part 26 §26.7 R7.3).

Sprint 0 declares `q` and `status`; `PTY-02` (Sprint 3) adds type, balance, tag
and collection filters on top of this class.
"""

from __future__ import annotations

import django_filters

from apps.common.filters import BaseTenantFilterSet
from apps.parties.constants import PartyStatus
from apps.parties.models import Party


class PartyFilterSet(BaseTenantFilterSet):
    """`q` and `status`.

    `status` is not a Sprint-3 nicety. The list screen sends it on every request
    — it is how the screen means "active parties" — and django-filter drops an
    undeclared parameter silently, so the list was unfiltered while the UI
    presented it as filtered. It is also the whole performance story of this
    endpoint: `ix_party_tenant_activity` is `(tenant, status, -last_activity_at)`
    and `status` is its middle column, so without the predicate the index cannot
    be used and the page-1 query degrades to a top-N heapsort over every alive
    row in the tenant. Declaring the filter the client already sends makes the
    index reachable.
    """

    q = django_filters.CharFilter(field_name="name", lookup_expr="icontains")
    status = django_filters.ChoiceFilter(choices=PartyStatus.choices)

    class Meta:
        model = Party
        fields = ("q", "status")
