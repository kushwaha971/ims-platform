"""`GET /reports/stock-summary` — RPT-06's file of INV-08's list.

The screens are INV-08's `/stock/summary` and INV-07's `/stock/low`
(RPT-06 FR-2: "one implementation, two entry points"); this endpoint is the
report surface's export of the SAME query — `inventory.selectors.stock.
filtered_summary`, which the screen's own view now calls — in RPT-06 §14's
exact columns, with a TOTAL row and the cost columns REMOVED for a reader
without `reports.financial.read` (FR-8, RPT-08 BR-2).

`?stock=all|in|low|out` (RPT-06 FR-1) and INV-08's `?status=` are the same
filter under two spellings; both are accepted so the file can be requested
with the screen's own query string.
"""

from __future__ import annotations

import datetime as dt
import math
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.common.constants import ModuleCode
from apps.common.dates import tenant_timezone, tenant_today
from apps.common.exceptions import PermissionDenied, ValidationFailed
from apps.common.exports import ExportColumn, authorise_export
from apps.common.permissions import HasPermission, ModuleEnabled
from apps.common.responses import StandardResponse
from apps.common.throttling import ScopedUserRateThrottle
from apps.common.viewsets import TenantScopeMixin
from apps.reports.exporting import Exporter, cell_money, register
from apps.reports.views.export_support import (
    ReportFormatMixin,
    granted_permissions,
    positive_int,
    report_csv,
)

SLUG = "stock-summary"
_STOCK_FILTERS = {"all": None, "in": "in", "low": "low", "out": "out", "negative": "negative"}
_COST_COLUMNS = ("avg_cost", "stock_value", "potential_sale_value")


def _qty(value: Any) -> str:
    return "" if value is None else str(Decimal(value).quantize(Decimal("0.001")))


def _default_location_id(tenant: Any) -> Any:
    from apps.inventory.models import Location

    return (
        Location.objects.filter(tenant=tenant, is_default=True)
        .order_by("created_at")
        .values_list("id", flat=True)
        .first()
    )


def _queryset(tenant: Any, params: dict) -> Any:
    from apps.inventory.constants import SUMMARY_ORDERINGS
    from apps.inventory.selectors.stock import filtered_summary

    location_id = _default_location_id(tenant)
    if location_id is None:
        from apps.inventory.models import Item

        return Item.objects.none()
    ordering = params.get("ordering") or "name"
    qs, _historical = filtered_summary(
        tenant=tenant,
        location_id=location_id,
        as_of=dt.date.fromisoformat(params["as_of"]) if params.get("as_of") else None,
        today=dt.date.fromisoformat(params["today"]),
        q=params.get("q") or "",
        category_id=params.get("category_id") or None,
        status=params.get("status"),
        hide_zero=bool(params.get("hide_zero")),
        ordering=ordering if ordering in SUMMARY_ORDERINGS else "name",
    )
    return qs


def _potential(item: Any) -> Decimal:
    return (Decimal(item.on_hand) * Decimal(item.selling_price)).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )


def _row(item: Any, tz: Any) -> dict:
    return {
        "item_name": item.name,
        "sku": item.sku,
        "barcode": item.barcode or "",
        "category": item.category.name if item.category_id else "",
        "unit": item.unit.code,
        "hsn_sac": item.hsn_sac or "",
        "tax_code": item.tax_code,
        "on_hand": _qty(item.on_hand),
        "avg_cost": str(Decimal(item.avg_cost).quantize(Decimal("0.0001"))),
        "stock_value": cell_money(item.stock_value),
        "reorder_point": _qty(item.reorder_point),
        "stock_status": item.stock_status,
        "selling_price": cell_money(item.selling_price),
        "potential_sale_value": cell_money(_potential(item)),
        "last_movement_date": (
            timezone.localtime(item.last_movement_at, tz).date().isoformat()
            if item.last_movement_at
            else ""
        ),
    }


def _total_row(*, on_hand: Any, stock_value: Any, potential: Any, units: set[str]) -> dict:
    return {
        "item_name": "TOTAL",
        "unit": "MIXED" if len(units) > 1 else (next(iter(units)) if units else ""),
        "on_hand": _qty(on_hand),
        "stock_value": cell_money(stock_value),
        "potential_sale_value": cell_money(potential),
    }


def stock_rows(tenant: Any, params: dict) -> Any:
    """Every item as a row, then RPT-06's TOTAL row (EC-6: `MIXED` for many units).

    The CSV's generator. The screen's JSON page does NOT call it: building all
    5,000 rows of a real shop in Python to show 25 of them was 1.8 s (H3 scale
    run); `page_and_totals` slices in SQL and aggregates the totals there.
    """
    tz = tenant_timezone(tenant)
    on_hand = stock_value = potential = Decimal("0")
    units: set[str] = set()
    for item in _queryset(tenant, params).iterator(chunk_size=500):
        units.add(item.unit.code)
        on_hand += item.on_hand or 0
        stock_value += item.stock_value or 0
        potential += _potential(item)
        yield _row(item, tz)
    yield _total_row(on_hand=on_hand, stock_value=stock_value, potential=potential, units=units)


def page_and_totals(tenant: Any, params: dict, *, page: int, page_size: int) -> tuple:
    """`(rows_on_this_page, total_row, item_count)` — the same figures `stock_rows`
    yields (BR-4: the total is the SUM of the per-item ROUNDED values, and the
    potential value is rounded per item the same half-up way), in two queries."""
    from django.db import connection

    qs = _queryset(tenant, params)
    # An outer query over the annotated rows, as `inventory.selectors.items.
    # aggregate_values` does and for its reason: `qs.aggregate(Sum("on_hand"))`
    # compiles the annotation's alias against the base table (or refuses it as
    # an aggregate), never its expression.
    inner, sql_params = (
        qs.order_by()
        .values("id", "on_hand", "stock_value", "selling_price", "unit__code")
        .query.sql_with_params()
    )
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT COUNT(*), COALESCE(SUM(sub.on_hand), 0), COALESCE(SUM(sub.stock_value), 0), "
            "COALESCE(SUM(ROUND(sub.on_hand * sub.selling_price, 2)), 0), "
            "COUNT(DISTINCT sub.code), MAX(sub.code) "
            f"FROM ({inner}) sub(id, on_hand, stock_value, selling_price, code)",  # noqa: S608
            sql_params,
        )
        count, on_hand, stock_value, potential, unit_count, one_unit = cursor.fetchone()
    units = set() if not count else ({one_unit} if unit_count == 1 else {"", "MIXED"})
    total = _total_row(
        on_hand=Decimal(on_hand),
        stock_value=Decimal(stock_value),
        potential=Decimal(potential),
        units=units,
    )
    tz = tenant_timezone(tenant)
    start = (page - 1) * page_size
    rows = [_row(item, tz) for item in qs[start : start + page_size]]
    return rows, total, count


_HEADER: tuple[tuple[str, bool], ...] = (
    ("item_name", False),
    ("sku", False),
    ("barcode", False),
    ("category", False),
    ("unit", False),
    ("hsn_sac", False),
    ("tax_code", False),
    ("on_hand", True),
    ("avg_cost", True),
    ("stock_value", True),
    ("reorder_point", True),
    ("stock_status", False),
    ("selling_price", True),
    ("potential_sale_value", True),
    ("last_movement_date", False),
)


def stock_columns(params: dict) -> tuple[ExportColumn, ...]:
    cost = bool(params.get("cost_visible"))
    return tuple(
        ExportColumn(name, lambda r, n=name: r.get(n, ""), numeric=numeric)
        for name, numeric in _HEADER
        if cost or name not in _COST_COLUMNS
    )


STOCK_EXPORTER = register(
    Exporter(
        slug=SLUG,
        columns=stock_columns,
        rows=stock_rows,
        count=lambda tenant, params: _queryset(tenant, params).count(),
        filename=lambda params: f"{SLUG}_{params.get('as_of') or params['today']}.csv",
    )
)


class StockSummaryReportView(ReportFormatMixin, TenantScopeMixin, APIView):
    permission_classes = [
        IsAuthenticated,
        ModuleEnabled(ModuleCode.REPORTS),
        ModuleEnabled(ModuleCode.INVENTORY),
        HasPermission("reports.basic.read"),
        HasPermission("inventory.stock.read"),
    ]
    throttle_classes = [ScopedUserRateThrottle]

    def _params(self, request: Any, tenant: Any, granted: frozenset[str]) -> dict:
        from apps.inventory.constants import SUMMARY_ORDERINGS

        query = request.query_params
        today = tenant_today(tenant)
        details: dict[str, list[str]] = {}
        as_of = None
        if query.get("as_of"):
            try:
                as_of = dt.date.fromisoformat(query["as_of"])
            except ValueError:
                details["as_of"] = ["Give a date as YYYY-MM-DD."]
            else:
                if as_of > today:
                    details["as_of"] = ["As-of date cannot be in the future"]
                elif as_of < dt.date(2000, 1, 1):
                    details["as_of"] = ["That date is too far in the past."]
        stock = query.get("stock") or query.get("status") or "all"
        if stock not in _STOCK_FILTERS:
            details["stock"] = ["Unknown stock filter"]
        ordering = query.get("ordering") or "name"
        if ordering not in SUMMARY_ORDERINGS:
            details["ordering"] = ["Cannot sort by this column"]
        if details:
            raise ValidationFailed(details)
        cost = "reports.financial.read" in granted
        if as_of is not None and as_of < today and not cost:
            # RPT-06 §12 / EC-10 — a past valuation is the accountant's.
            raise PermissionDenied("Past valuations are for owners and accountants.")
        hide_zero = (query.get("hide_zero") or "true").lower() != "false"
        if query.get("include_zero"):
            hide_zero = query["include_zero"].lower() == "false"
        return {
            "today": today.isoformat(),
            "as_of": as_of.isoformat() if as_of else None,
            "q": query.get("q") or "",
            "category_id": query.get("category_id") or None,
            "status": _STOCK_FILTERS[stock],
            "hide_zero": hide_zero,
            "ordering": ordering,
            "cost_visible": cost,
        }

    def get(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        tenant = self.get_tenant()
        params = self._params(request, tenant, granted_permissions(tenant))
        if request.query_params.get("format") == "csv":
            authorise_export(
                request,
                self,
                codename="reports.export",
                refusal="You do not have permission to export reports.",
            )
            return report_csv(request, exporter=STOCK_EXPORTER, tenant=tenant, params=params)

        page = positive_int(request, "page", default=1, cap=10**6)
        page_size = positive_int(request, "page_size", default=25, cap=100)
        rows, total, count = page_and_totals(tenant, params, page=page, page_size=page_size)
        if not params["cost_visible"]:
            # FR-8 — omitted, not zeroed, so the payload cannot leak a margin.
            for row in (*rows, total):
                for name in _COST_COLUMNS:
                    row.pop(name, None)
        return StandardResponse.ok(
            rows,
            meta={
                "as_of": params["as_of"] or params["today"],
                "totals": {
                    **{key: value for key, value in total.items() if key != "item_name"},
                    "item_count": count,
                },
                "cost_visible": params["cost_visible"],
                "page": page,
                "page_size": page_size,
                "total": count,
                "total_pages": max(1, math.ceil(count / page_size)),
            },
        )
