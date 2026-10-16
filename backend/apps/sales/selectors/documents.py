"""Sales document reads (Part 26 §26.7 — selectors never write).

Every read is scoped to the KINDS its route serves: `/sales/invoices` never
lists an estimate or a credit note, and a GST or receivables figure built on
`list_invoices` can never include one (SAL-01 BR-1, AC-5).
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.db.models import Count, Q, QuerySet, Sum, Value
from django.db.models.functions import Coalesce

from apps.common.money import ZERO
from apps.common.overdue import status_tab_q
from apps.sales.constants import INVOICE_KINDS, OPEN_STATUSES, TAB_STATUSES, DocumentStatus
from apps.sales.models import SalesDocument

#: SAL-08 FR-1 — the ordering whitelist; anything else is 400.
ORDERING_FIELDS = ("document_date", "number", "grand_total", "amount_due", "due_on")
DEFAULT_ORDERING = ("-document_date", "-created_at", "-id")


def list_documents(*, tenant: Any, kinds: tuple[str, ...]) -> QuerySet:
    return (
        SalesDocument.objects.for_tenant(tenant)
        .filter(kind__in=kinds)
        .select_related("party", "created_by")
        .order_by(*DEFAULT_ORDERING)
    )


def list_invoices(*, tenant: Any) -> QuerySet:
    return list_documents(tenant=tenant, kinds=INVOICE_KINDS)


def detail_queryset(*, tenant: Any, kinds: tuple[str, ...] | None = INVOICE_KINDS) -> QuerySet:
    rows = SalesDocument.objects.for_tenant(tenant)
    if kinds is not None:
        rows = rows.filter(kind__in=kinds)
    return rows.select_related("party", "created_by", "tenant").prefetch_related("lines")


def apply_tab(
    queryset: QuerySet,
    tab: str,
    tabs: dict[str, tuple[str, ...]] = TAB_STATUSES,
    *,
    today: dt.date | None = None,
) -> QuerySet:
    """`today` decides Overdue on the day (WP-06); only the invoice tabs pass it."""
    return queryset.filter(_tab_q(tabs.get(tab, tabs["all"]), tabs, today))


def tab_counts(
    queryset: QuerySet,
    tabs: dict[str, tuple[str, ...]] = TAB_STATUSES,
    *,
    today: dt.date | None = None,
) -> dict[str, int]:
    """FR-2 — one grouped query over the filtered set WITHOUT the tab."""
    aggregates = {
        tab: Count("id", filter=_tab_q(statuses, tabs, today)) for tab, statuses in tabs.items()
    }
    return queryset.order_by().aggregate(**aggregates)


def _tab_q(statuses: tuple[str, ...], tabs: dict, today: dt.date | None) -> Q:
    # Only the invoice list has bills that fall due; other kinds' tabs are their statuses.
    if tabs is not TAB_STATUSES:
        return Q(status__in=statuses)
    return status_tab_q(statuses, today=today, open_statuses=OPEN_STATUSES)


def list_totals(queryset: QuerySet) -> dict:
    """FR-5 — count / grand total / due over the filtered set; voids never summed (BR-1).

    For a credit note `amount_due` is its OPEN credit, so the same sum is
    SAL-04 §14's `meta.totals.open_credit`.
    """
    live = ~Q(status=DocumentStatus.VOID)
    return queryset.order_by().aggregate(
        count=Count("id"),
        grand_total=Coalesce(Sum("grand_total", filter=live), Value(ZERO)),
        amount_due=Coalesce(Sum("amount_due", filter=live), Value(ZERO)),
    )
