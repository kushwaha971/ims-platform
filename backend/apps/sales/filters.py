"""Invoice list filters (SAL-08 FR-3, FR-4; Part 26 §26.7 R7.3).

Every parameter is declared — django-filter drops an undeclared one silently,
and a list that claims to be filtered while showing everything is the defect
PTY-02 shipped once. `tab` is applied by the view, not here, because the tab
COUNTS are computed over every filter except the tab (FR-2).
"""

from __future__ import annotations

import re
from typing import Any

import django_filters
from django.db.models import Q, QuerySet

from apps.common.filters import BaseTenantFilterSet
from apps.sales.models import SalesDocument

MOBILE_SUFFIX = re.compile(r"^\+?\d{4,15}$")


class InvoiceFilterSet(BaseTenantFilterSet):
    date_from = django_filters.DateFilter(field_name="document_date", lookup_expr="gte")
    date_to = django_filters.DateFilter(field_name="document_date", lookup_expr="lte")
    party_id = django_filters.UUIDFilter(field_name="party_id")
    amount_min = django_filters.NumberFilter(field_name="grand_total", lookup_expr="gte")
    amount_max = django_filters.NumberFilter(field_name="grand_total", lookup_expr="lte")
    kind = django_filters.CharFilter(field_name="kind")
    # SAL-04 §14 — "credit notes of this invoice".
    against_id = django_filters.UUIDFilter(field_name="against_id")
    created_by = django_filters.UUIDFilter(field_name="created_by_id")
    q = django_filters.CharFilter(method="filter_search")
    # ── A5 ── PLT-X05 §6/§7: the list's origin chip, and a module reading its own invoices back.
    origin_module = django_filters.CharFilter(field_name="origin_module")
    origin_type = django_filters.CharFilter(field_name="origin_type")
    origin_id = django_filters.UUIDFilter(field_name="origin_id")

    class Meta:
        model = SalesDocument
        fields: list[str] = []

    def filter_search(self, queryset: QuerySet, name: str, value: Any) -> QuerySet:
        """FR-4 — number prefix (icase), names, and a mobile SUFFIX of ≥ 4 digits (AC-2)."""
        term = " ".join(str(value or "").split())[:64]
        if not term:
            return queryset
        match = (
            Q(number__istartswith=term)
            | Q(number__iendswith=term)
            | Q(party_snapshot__name__icontains=term)
            | Q(party__name__icontains=term)
            | Q(walk_in_name__icontains=term)
        )
        if MOBILE_SUFFIX.match(term):
            digits = term.lstrip("+")
            match |= Q(walk_in_mobile__endswith=digits) | Q(party__mobile__endswith=digits)
        return queryset.filter(match)
