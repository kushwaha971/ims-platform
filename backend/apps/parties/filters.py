"""Party filtersets (Part 26 §26.7 R7.3).

Sprint 0 declares `q` only; `PTY-02` (Sprint 3) adds type, balance, status, tag
and collection filters on top of this class.
"""

from __future__ import annotations

import django_filters

from apps.common.filters import BaseTenantFilterSet
from apps.parties.models import Party


class PartyFilterSet(BaseTenantFilterSet):
    q = django_filters.CharFilter(field_name="name", lookup_expr="icontains")

    class Meta:
        model = Party
        fields = ("q",)
