"""Purchase bill reads (Part 26 §26.7 — selectors never write)."""

from __future__ import annotations

from typing import Any

from django.db.models import Count, Q, QuerySet, Sum, Value
from django.db.models.functions import Coalesce

from apps.common.money import ZERO
from apps.purchases.constants import NOT_PAYABLE_STATUSES, TAB_STATUSES
from apps.purchases.models import PurchaseDocument

#: PUR-03 §10 — the ordering whitelist; anything else is 400.
ORDERING_FIELDS = ("document_date", "number", "grand_total", "amount_due", "due_on")
DEFAULT_ORDERING = ("-document_date", "-created_at", "-id")


def list_bills(*, tenant: Any) -> QuerySet:
    return (
        PurchaseDocument.objects.for_tenant(tenant)
        .select_related("party", "created_by")
        .order_by(*DEFAULT_ORDERING)
    )


def detail_queryset(*, tenant: Any) -> QuerySet:
    return (
        PurchaseDocument.objects.for_tenant(tenant)
        .select_related("party", "created_by", "voided_by", "tenant")
        .prefetch_related("lines", "lines__item")
    )


def apply_tab(queryset: QuerySet, tab: str) -> QuerySet:
    return queryset.filter(status__in=TAB_STATUSES.get(tab, TAB_STATUSES["all"]))


def tab_counts(queryset: QuerySet) -> dict[str, int]:
    """FR-3 `meta.counts` — one grouped query over the filtered set WITHOUT the tab."""
    aggregates = {
        tab: Count("id", filter=Q(status__in=statuses)) for tab, statuses in TAB_STATUSES.items()
    }
    return queryset.order_by().aggregate(**aggregates)


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
