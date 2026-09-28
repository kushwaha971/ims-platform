"""Payment list filters (PAY-01 FR-10, §14; CCR-6's `status` and `q`).

Every parameter is DECLARED — django-filter drops an undeclared one silently,
and a list that claims to be filtered while showing everything is the defect
PTY-02 shipped once.
"""

from __future__ import annotations

from typing import Any

import django_filters
from django.db.models import Q, QuerySet

from apps.common.constants import PaymentMode
from apps.common.filters import BaseTenantFilterSet
from apps.payments.constants import PaymentDirection, PaymentStatus
from apps.payments.models import Payment


class PaymentFilterSet(BaseTenantFilterSet):
    direction = django_filters.ChoiceFilter(
        field_name="direction", choices=PaymentDirection.choices
    )
    party_id = django_filters.UUIDFilter(field_name="party_id")
    date_from = django_filters.DateFilter(field_name="payment_date", lookup_expr="gte")
    date_to = django_filters.DateFilter(field_name="payment_date", lookup_expr="lte")
    #: A split payment matches every mode it carries (PAY-02 FR-7), not only its primary.
    mode = django_filters.ChoiceFilter(method="filter_mode", choices=PaymentMode.choices)
    #: `?status=recorded,void` (CCR-6).
    status = django_filters.CharFilter(method="filter_status")
    q = django_filters.CharFilter(method="filter_search")

    class Meta:
        model = Payment
        fields: list[str] = []

    def filter_mode(self, queryset: QuerySet, name: str, value: Any) -> QuerySet:
        return queryset.filter(mode_breakup__contains=[{"mode": value}])

    def filter_status(self, queryset: QuerySet, name: str, value: Any) -> QuerySet:
        wanted = [s.strip() for s in str(value or "").split(",") if s.strip()]
        if not wanted:
            return queryset
        # An unknown status matches nothing rather than being ignored — ignoring
        # it would widen the list the merchant thinks they narrowed.
        return queryset.filter(status__in=[s for s in wanted if s in PaymentStatus.values])

    def filter_search(self, queryset: QuerySet, name: str, value: Any) -> QuerySet:
        """Number (prefix or suffix, so "0017" finds RCT/26-27/0017), party name, reference."""
        term = " ".join(str(value or "").split())[:64]
        if not term:
            return queryset
        return queryset.filter(
            Q(number__icontains=term)
            | Q(party__name__icontains=term)
            | Q(reference__icontains=term)
        )
