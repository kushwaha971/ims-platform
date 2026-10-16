"""Purchase bill reads (Part 26 §26.7 — selectors never write)."""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.db.models import Count, Q, QuerySet, Sum, Value
from django.db.models.functions import Coalesce

from apps.common.money import ZERO
from apps.common.overdue import status_tab_q
from apps.purchases.constants import (
    BILL_KINDS,
    NOT_PAYABLE_STATUSES,
    OPEN_STATUSES,
    TAB_STATUSES,
)
from apps.purchases.models import PurchaseDocument

#: PUR-03 §10 — the ordering whitelist; anything else is 400.
ORDERING_FIELDS = ("document_date", "number", "grand_total", "amount_due", "due_on")
DEFAULT_ORDERING = ("-document_date", "-created_at", "-id")


def list_bills(*, tenant: Any, kinds: tuple[str, ...] = BILL_KINDS) -> QuerySet:
    return (
        PurchaseDocument.objects.for_tenant(tenant)
        .filter(kind__in=kinds)
        .select_related("party", "created_by")
        .order_by(*DEFAULT_ORDERING)
    )


def detail_queryset(*, tenant: Any, kinds: tuple[str, ...] = BILL_KINDS) -> QuerySet:
    return (
        PurchaseDocument.objects.for_tenant(tenant)
        .filter(kind__in=kinds)
        .select_related("party", "created_by", "voided_by", "tenant")
        .prefetch_related("lines", "lines__item")
    )


def apply_tab(
    queryset: QuerySet, tab: str, tabs: dict | None = None, *, today: dt.date | None = None
) -> QuerySet:
    """`today` decides Overdue on the day (WP-06); only the bills list passes it."""
    tabs = tabs or TAB_STATUSES
    return queryset.filter(_tab_q(tabs.get(tab, tabs["all"]), tabs, today))


def tab_counts(
    queryset: QuerySet, tabs: dict | None = None, *, today: dt.date | None = None
) -> dict[str, int]:
    """FR-3 `meta.counts` — one grouped query over the filtered set WITHOUT the tab."""
    tabs = tabs or TAB_STATUSES
    aggregates = {
        tab: Count("id", filter=_tab_q(statuses, tabs, today)) for tab, statuses in tabs.items()
    }
    return queryset.order_by().aggregate(**aggregates)


def _tab_q(statuses: tuple[str, ...], tabs: dict, today: dt.date | None) -> Q:
    # Only bills fall due; orders' and debit notes' tabs are their statuses.
    if tabs is not TAB_STATUSES:
        return Q(status__in=statuses)
    return status_tab_q(statuses, today=today, open_statuses=OPEN_STATUSES)


def list_totals(queryset: QuerySet) -> dict:
    """FR-3 `meta.totals` over the FILTERED set across pages; drafts and voids never summed (BR-1)."""
    payable = ~Q(status__in=NOT_PAYABLE_STATUSES)
    return queryset.order_by().aggregate(
        count=Count("id"),
        grand_total=Coalesce(Sum("grand_total", filter=payable), Value(ZERO)),
        amount_due=Coalesce(Sum("amount_due", filter=payable), Value(ZERO)),
    )


def ledger_entry_id_for(*, tenant: Any, document_id: Any) -> str | None:
    """FR-9 — the bill's credit in the supplier's khata (standing or reversed), for the link."""
    from apps.ledger.constants import EntryType, SourceType
    from apps.ledger.models import LedgerEntry

    entry_id = (
        LedgerEntry.objects.filter(
            tenant=tenant,
            source_type=SourceType.PURCHASE_DOCUMENT,
            source_id=document_id,
            entry_type=EntryType.PURCHASE_BILL,
        )
        .values_list("id", flat=True)
        .first()
    )
    return str(entry_id) if entry_id else None
