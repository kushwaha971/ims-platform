"""`GET /reports/profit?group=item|party|category|bill` — profit by item, customer,
category or bill, with the period's P&L in `meta.totals`.

Thin (Part 26 §26.7 R7.1): parse, ask `selectors.profit`, page, wrap. The file
(`?format=csv`) goes through RPT-08's exporter, so it carries the same rows as
the screen and a TOTAL row under them.

── Who may read it ───────────────────────────────────────────────────────────
Every figure on it is a cost or a margin, so the whole report is
`reports.financial.read` (INV-08 EC-4) on top of `reports.basic.read` and
`sales.invoice.read`; staff hold neither half of the first and never see it.
The export is `reports.export`, as for every report.
"""

from __future__ import annotations

import math
from typing import Any

from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.common.constants import ModuleCode
from apps.common.dates import tenant_today
from apps.common.exceptions import ValidationFailed
from apps.common.exports import ExportColumn, authorise_export
from apps.common.permissions import HasPermission, ModuleEnabled
from apps.common.responses import StandardResponse
from apps.common.throttling import ScopedUserRateThrottle
from apps.common.viewsets import TenantScopeMixin
from apps.reports.exporting import Exporter, register
from apps.reports.selectors import profit as selectors
from apps.reports.views.export_support import ReportFormatMixin, positive_int, report_csv
from apps.reports.views.tax_params import _date, _range

SLUG = "profit"
Q_MAX = 80


def _dates(params: dict) -> dict[str, Any]:
    import datetime as dt

    return {
        "date_from": dt.date.fromisoformat(params["date_from"]),
        "date_to": dt.date.fromisoformat(params["date_to"]),
    }


def _queryset(tenant: Any, params: dict) -> Any:
    return selectors.grouped(
        tenant=tenant,
        group=params["group"],
        q=params.get("q") or "",
        ordering=params.get("ordering") or selectors.DEFAULT_ORDERING,
        **_dates(params),
    )


def _flat(row: dict) -> dict:
    """A JSON row as a CSV row: the bill's party folded to its name."""
    party = row.get("party")
    return {**row, "party": party["name"] if party else ""}


def profit_rows(tenant: Any, params: dict) -> Any:
    group = params["group"]
    for row in _queryset(tenant, params).iterator(chunk_size=500):
        yield _flat(selectors.row_json(group, row))
    totals = selectors.summary(tenant=tenant, with_expenses=False, **_dates(params))
    yield {"name": "TOTAL", **totals}


_COLUMNS: dict[str, tuple[tuple[str, bool], ...]] = {
    "item": (("name", False), ("unit", False), ("qty", True)),
    "party": (("name", False),),
    "category": (("name", False),),
    "bill": (("name", False), ("date", False), ("party", False)),
}
_FIGURES: tuple[tuple[str, bool], ...] = (
    ("bills", True),
    ("sale_value", True),
    ("cost", True),
    ("profit", True),
    ("margin_pct", True),
    ("uncosted_lines", True),
)


def profit_columns(params: dict) -> tuple[ExportColumn, ...]:
    def cell(row: dict, name: str) -> Any:
        value = row.get(name)
        return "" if value is None else value

    return tuple(
        ExportColumn(name, lambda r, n=name: cell(r, n), numeric=numeric)
        for name, numeric in (*_COLUMNS[params["group"]], *_FIGURES)
    )


PROFIT_EXPORTER = register(
    Exporter(
        slug=SLUG,
        columns=profit_columns,
        rows=profit_rows,
        count=lambda tenant, params: _queryset(tenant, params).count(),
        filename=lambda params: (
            f"{SLUG}-by-{params['group']}_{params['date_from']}_{params['date_to']}.csv"
        ),
    )
)


class ProfitReportView(ReportFormatMixin, TenantScopeMixin, APIView):
    permission_classes = [
        IsAuthenticated,
        ModuleEnabled(ModuleCode.REPORTS),
        ModuleEnabled(ModuleCode.SALES),
        HasPermission("reports.basic.read"),
        HasPermission("sales.invoice.read"),
        HasPermission("reports.financial.read"),
    ]
    throttle_classes = [ScopedUserRateThrottle]

    def _params(self, request: Any, tenant: Any) -> dict:
        query = request.query_params
        today = tenant_today(tenant)
        details: dict[str, list[str]] = {}
        group = query.get("group") or "item"
        if group not in selectors.GROUPS:
            details["group"] = [f"Choose one of {', '.join(selectors.GROUPS)}."]
        ordering = query.get("ordering") or selectors.DEFAULT_ORDERING
        if ordering not in selectors.ORDERINGS:
            details["ordering"] = [f"Choose one of {', '.join(selectors.ORDERINGS)}."]
        q = (query.get("q") or "").strip()
        if len(q) > Q_MAX:
            details["q"] = [f"Search with at most {Q_MAX} characters."]
        if details:
            raise ValidationFailed(details)
        date_from, date_to = _range(
            _date(request, "date_from") or today.replace(day=1),
            _date(request, "date_to") or today,
            today=today,
            message="A profit report can cover at most one year.",
        )
        return {
            "group": group,
            "ordering": ordering,
            "q": q,
            "date_from": date_from.isoformat(),
            "date_to": date_to.isoformat(),
        }

    def get(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        tenant = self.get_tenant()
        params = self._params(request, tenant)  # a typo is a 400 before any budget is charged
        if request.query_params.get("format") == "csv":
            authorise_export(
                request,
                self,
                codename="reports.export",
                refusal="You do not have permission to export reports.",
            )
            return report_csv(request, exporter=PROFIT_EXPORTER, tenant=tenant, params=params)

        page = positive_int(request, "page", default=1, cap=10**6)
        page_size = positive_int(request, "page_size", default=50, cap=100)
        rows = _queryset(tenant, params)
        count = rows.count()
        start = (page - 1) * page_size
        data = [selectors.row_json(params["group"], row) for row in rows[start : start + page_size]]
        with_expenses = ModuleCode.EXPENSES in (tenant.enabled_modules or ())
        totals = selectors.summary(tenant=tenant, with_expenses=with_expenses, **_dates(params))
        response = StandardResponse.ok(
            data,
            meta={
                "group": params["group"],
                "ordering": params["ordering"],
                "date_from": params["date_from"],
                "date_to": params["date_to"],
                "totals": totals,
                "page": page,
                "page_size": page_size,
                "total": count,
                "total_pages": max(1, math.ceil(count / page_size)),
            },
        )
        response["Cache-Control"] = "private, no-store"
        return response
