"""Sales document reads (Part 26 §26.7 — selectors never write)."""

from __future__ import annotations

from typing import Any

from django.db.models import Count, Q, QuerySet, Sum, Value
from django.db.models.functions import Coalesce

from apps.common.money import ZERO
from apps.sales.constants import TAB_STATUSES, DocumentStatus
from apps.sales.models import SalesDocument

#: SAL-08 FR-1 — the ordering whitelist; anything else is 400.
ORDERING_FIELDS = ("document_date", "number", "grand_total", "amount_due", "due_on")
DEFAULT_ORDERING = ("-document_date", "-created_at", "-id")


def list_invoices(*, tenant: Any) -> QuerySet:
    return (
        SalesDocument.objects.for_tenant(tenant)
        .select_related("party", "created_by")
        .order_by(*DEFAULT_ORDERING)
    )


def detail_queryset(*, tenant: Any) -> QuerySet:
    return (
        SalesDocument.objects.for_tenant(tenant)
        .select_related("party", "created_by", "tenant")
        .prefetch_related("lines")
    )


def apply_tab(queryset: QuerySet, tab: str) -> QuerySet:
    return queryset.filter(status__in=TAB_STATUSES.get(tab, TAB_STATUSES["all"]))


def tab_counts(queryset: QuerySet) -> dict[str, int]:
    """FR-2 — one grouped query over the filtered set WITHOUT the tab."""
    aggregates = {
        tab: Count("id", filter=Q(status__in=statuses)) for tab, statuses in TAB_STATUSES.items()
    }
    return queryset.order_by().aggregate(**aggregates)


def list_totals(queryset: QuerySet) -> dict:
    """FR-5 — count / grand total / due over the filtered set; voids never summed (BR-1)."""
    live = ~Q(status=DocumentStatus.VOID)
    return queryset.order_by().aggregate(
        count=Count("id"),
        grand_total=Coalesce(Sum("grand_total", filter=live), Value(ZERO)),
        amount_due=Coalesce(Sum("amount_due", filter=live), Value(ZERO)),
    )
