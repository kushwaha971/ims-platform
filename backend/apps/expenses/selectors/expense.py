"""Expense and category reads (Part 26 §26.7 — selectors never write)."""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.db.models import Count, IntegerField, OuterRef, QuerySet, Subquery, Sum, Value
from django.db.models.functions import Coalesce

from apps.common.dates import tenant_today
from apps.common.money import ZERO
from apps.expenses.constants import ExpenseStatus
from apps.expenses.models import Expense, ExpenseCategory

#: FR-9's breakdown strip — "Top: Salaries ₹18,000 · Rent ₹12,000 · …".
TOP_CATEGORIES = 5

#: EXP-02 BR-7 — the picker's usage window.
USAGE_WINDOW_DAYS = 30

LIST_ORDERING = ("-expense_date", "-created_at", "-id")


def list_expenses(*, tenant: Any) -> QuerySet:
    """Every expense of the tenant, newest first, with its three joins (§20).

    `select_related` for the category, the party and the author: the list
    renders all three on every row, and without it a page of 25 is 76 queries.
    """
    return (
        Expense.objects.for_tenant(tenant)
        .select_related("category", "party", "created_by", "voided_by")
        .order_by(*LIST_ORDERING)
    )


def default_to_recorded(queryset: QuerySet, params: Any) -> QuerySet:
    """No `status` asked for means the recorded ones (FR-9's "All" tab).

    A void is a withdrawn expense. Counting it into "Total ₹41,230" because
    nobody sent a status would be the header claiming money went out that the
    merchant has explicitly said did not.
    """
    if not (params.get("status") or "").strip():
        return queryset.filter(status=ExpenseStatus.RECORDED)
    return queryset


def expense_totals(queryset: QuerySet) -> dict:
    """`meta.totals` over the FILTERED set — the amount, the count, the top five.

    Two aggregate queries whatever the page size: the sum and count in one, the
    per-category breakdown in the other. Ordered by amount then name so ties
    come back the same way twice, and a strip of five chips does not reshuffle
    on refresh.
    """
    overall = queryset.order_by().aggregate(
        amount=Coalesce(Sum("amount"), Value(ZERO)), count=Count("id")
    )
    rows = (
        queryset.order_by()
        .values("category_id", "category__name", "category__color")
        .annotate(amount=Sum("amount"))
        .order_by("-amount", "category__name")[:TOP_CATEGORIES]
    )
    return {
        "amount": overall["amount"],
        "count": overall["count"],
        "by_category": [
            {
                "category_id": row["category_id"],
                "name": row["category__name"],
                "color": row["category__color"],
                "amount": row["amount"],
            }
            for row in rows
        ],
    }


def expense_detail_queryset(*, tenant: Any) -> QuerySet:
    return Expense.objects.for_tenant(tenant).select_related(
        "category", "party", "created_by", "voided_by"
    )


def list_categories(*, tenant: Any, include_archived: bool) -> QuerySet:
    """The tenant's categories, usage-first (EXP-02 FR-5, BR-7).

    The picker is ordered by how often each category was used in the last 30
    days, then by the curated `sort_order`, then by name — so "Food" is at the
    top for a shop that buys tea twice a day and "Rent" still sits in its seeded
    place for a shop that has not recorded anything yet. One correlated count,
    served by `ix_expense_tenant_category`; voids are excluded (BR-8).
    """
    since = tenant_today(tenant) - dt.timedelta(days=USAGE_WINDOW_DAYS)
    usage = (
        Expense.objects.filter(
            tenant=tenant,
            category_id=OuterRef("pk"),
            status=ExpenseStatus.RECORDED,
            expense_date__gte=since,
        )
        .order_by()
        .values("category_id")
        .annotate(n=Count("id"))
        .values("n")
    )
    queryset = ExpenseCategory.objects.for_tenant(tenant).filter(deleted_at__isnull=True)
    if not include_archived:
        queryset = queryset.filter(status="active")
    return queryset.annotate(
        recent_uses=Coalesce(Subquery(usage, output_field=IntegerField()), Value(0))
    ).order_by("-recent_uses", "sort_order", "name", "id")
