"""Purchase bill list filters (PUR-03 FR-1, FR-2; PUR-01 FR-7; Part 26 §26.7 R7.3).

Every parameter is declared — django-filter drops an undeclared one silently,
and a list that claims to be filtered while showing everything is the defect
PTY-02 shipped once. `tab` is applied by the view, not here, because the tab
COUNTS are computed over every filter except the tab (FR-3).
"""

from __future__ import annotations

from typing import Any

import django_filters
from django.db.models import Q, QuerySet

from apps.common.filters import BaseTenantFilterSet
from apps.purchases.models import PurchaseDocument


class PurchaseBillFilterSet(BaseTenantFilterSet):
    date_from = django_filters.DateFilter(field_name="document_date", lookup_expr="gte")
    date_to = django_filters.DateFilter(field_name="document_date", lookup_expr="lte")
    party_id = django_filters.UUIDFilter(field_name="party_id")
    #: FR-7's duplicate pre-check — exact after the same folding the server stores.
    supplier_invoice_number = django_filters.CharFilter(method="filter_invoice_number")
    q = django_filters.CharFilter(method="filter_search")

    class Meta:
        model = PurchaseDocument
        fields: list[str] = []

    def filter_invoice_number(self, queryset: QuerySet, name: str, value: Any) -> QuerySet:
        term = " ".join(str(value or "").split())[:48]
        if not term:
            return queryset
        return queryset.filter(supplier_invoice_number__iexact=term)

    def filter_search(self, queryset: QuerySet, name: str, value: Any) -> QuerySet:
        """FR-2 — number, the supplier's invoice number, the supplier's name (AC-2 "AT/778")."""
        term = " ".join(str(value or "").split())[:64]
        if not term:
            return queryset
        return queryset.filter(
            Q(number__istartswith=term)
            | Q(number__iendswith=term)
            | Q(supplier_invoice_number__icontains=term)
            | Q(party_snapshot__name__icontains=term)
            | Q(party__name__icontains=term)
        )
