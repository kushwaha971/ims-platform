"""Expense filtersets (Part 26 §26.7 R7.3).

Every parameter the list accepts is DECLARED here, because django-filter drops
an undeclared one silently — a screen can send `?mode=cash`, present itself as
filtered and show the merchant everything (the party list's `status` was
exactly that bug before Sprint 1 closed it).
"""

from __future__ import annotations

import uuid
from typing import Any

import django_filters
from django.db.models import Q, QuerySet

from apps.common.constants import PaymentMode
from apps.common.filters import BaseTenantFilterSet
from apps.expenses.constants import ExpenseStatus
from apps.expenses.models import Expense


class ExpenseFilterSet(BaseTenantFilterSet):
    """EXP-01 FR-9 / §14 — date range, categories, mode, tab, party and search.

    `status` defaults to `recorded` in the SELECTOR rather than here, so the
    default holds for every caller of the list — the totals, the CSV and the
    page all read "recorded" when nobody said otherwise, and a void only ever
    appears on the tab that asks for it.
    """

    date_from = django_filters.DateFilter(field_name="expense_date", lookup_expr="gte")
    date_to = django_filters.DateFilter(field_name="expense_date", lookup_expr="lte")
    #: `?category=<uuid>,<uuid>` — a multi-select ORs within itself.
    category = django_filters.CharFilter(method="filter_category")
    mode = django_filters.ChoiceFilter(field_name="mode", choices=PaymentMode.choices)
    status = django_filters.ChoiceFilter(field_name="status", choices=ExpenseStatus.choices)
    paid = django_filters.BooleanFilter(field_name="paid")
    party = django_filters.UUIDFilter(field_name="party_id")
    q = django_filters.CharFilter(method="filter_search")

    class Meta:
        model = Expense
        fields: list[str] = []

    def filter_category(self, queryset: QuerySet, name: str, value: Any) -> QuerySet:
        ids = []
        for raw in str(value or "").split(","):
            try:
                ids.append(uuid.UUID(raw.strip()))
            except ValueError:
                # A malformed id matches nothing rather than 500ing or being
                # ignored — ignoring it would widen the list the merchant
                # thinks they narrowed.
                continue
        if not ids:
            return queryset.none() if str(value or "").strip() else queryset
        return queryset.filter(category_id__in=ids)

    def filter_search(self, queryset: QuerySet, name: str, value: Any) -> QuerySet:
        """FR-9 — over number, note and the party's name."""
        term = " ".join(str(value or "").split())
        if not term:
            return queryset
        return queryset.filter(
            Q(number__icontains=term) | Q(note__icontains=term) | Q(party__name__icontains=term)
        )
