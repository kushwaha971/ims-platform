"""`GET /reports/receivables-aging` and `/reports/payables-aging` — RPT-05.

The screen stays LED-09's `/ledger/aging` (its two tabs are these two
endpoints' two sides, its cells already drill into the statement). What
RPT-05 adds under Reports is the collection-sheet row and FR-5's exact file:
`party_name,mobile,party_type,tags,…,last_payment_date` and a TOTAL row, named
`receivables-aging_<as_of>.csv`.
"""

from __future__ import annotations

import datetime as dt
import math
import uuid
from decimal import Decimal, InvalidOperation
from typing import Any

from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.common.constants import ModuleCode
from apps.common.dates import tenant_today
from apps.common.exceptions import PermissionDenied, ValidationFailed
from apps.common.exports import ExportColumn, authorise_export
from apps.common.permissions import HasPermission, ModuleEnabled
from apps.common.responses import StandardResponse
from apps.common.throttling import ScopedUserRateThrottle
from apps.common.viewsets import TenantScopeMixin
from apps.reports.exporting import Exporter, cell_date, cell_money, register
from apps.reports.selectors.aging_report import BUCKETS, ORDERINGS, aging_report
from apps.reports.views.export_support import (
    ReportFormatMixin,
    granted_permissions,
    positive_int,
    report_csv,
)

SLUGS = {"receivable": "receivables-aging", "payable": "payables-aging"}
_TOTAL = "TOTAL"


def _money(value: Any) -> str | None:
    return None if value is None else cell_money(value)


def row_json(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "party": row["party"],
        "collection_date": cell_date(row["collection_date"]) or None,
        "credit_limit": _money(row["credit_limit"]),
        "buckets": {name: cell_money(row["buckets"][name]) for name in BUCKETS},
        "total": cell_money(row["total"]),
        "oldest_entry_date": cell_date(row["oldest_entry_date"]) or None,
        "oldest_days": row["oldest_days"],
        "last_payment_date": cell_date(row["last_payment_date"]) or None,
    }


# ── The file (FR-5) ──────────────────────────────────────────────────────────


def _cell(row: dict, *path: str) -> Any:
    value: Any = row
    for key in path:
        value = (value or {}).get(key) if isinstance(value, dict) else None
    return value


def aging_columns(_params: dict) -> tuple[ExportColumn, ...]:
    """FR-5, exactly and in order. The TOTAL row fills only the money columns."""
    return (
        ExportColumn("party_name", lambda r: r["party"]["name"]),
        ExportColumn("mobile", lambda r: _cell(r, "party", "mobile") or ""),
        ExportColumn("party_type", lambda r: _cell(r, "party", "type") or ""),
        ExportColumn("tags", lambda r: ";".join(_cell(r, "party", "tags") or [])),
        ExportColumn("collection_date", lambda r: cell_date(r.get("collection_date"))),
        ExportColumn("credit_limit", lambda r: _money(r.get("credit_limit")), numeric=True),
        *(
            ExportColumn(
                f"bucket_{name}", lambda r, n=name: cell_money(r["buckets"][n]), numeric=True
            )
            for name in BUCKETS
        ),
        ExportColumn("total", lambda r: cell_money(r["total"]), numeric=True),
        ExportColumn("oldest_entry_date", lambda r: cell_date(r.get("oldest_entry_date"))),
        ExportColumn("oldest_days", lambda r: r.get("oldest_days"), numeric=True),
        ExportColumn("last_payment_date", lambda r: cell_date(r.get("last_payment_date"))),
    )


def _report(tenant: Any, params: dict) -> tuple[list[dict], dict]:
    return aging_report(
        tenant=tenant,
        as_of=dt.date.fromisoformat(params["as_of"]),
        kind=params["kind"],
        tag=params.get("tag"),
        party_id=params.get("party_id"),
        min_total=Decimal(params["min_total"]) if params.get("min_total") else None,
        bucket=params.get("bucket"),
        ordering=params.get("ordering") or "-90_plus",
    )


def _rows_with_total(tenant: Any, params: dict) -> Any:
    rows, totals = _report(tenant, params)
    yield from rows
    yield {
        "party": {"name": _TOTAL},
        "buckets": {name: totals[name] for name in BUCKETS},
        "total": totals["total"],
    }


EXPORTERS = {
    kind: register(
        Exporter(
            slug=slug,
            columns=aging_columns,
            rows=_rows_with_total,
            count=lambda tenant, params: len(_report(tenant, params)[0]),
            filename=lambda params, s=slug: f"{s}_{params['as_of']}.csv",
        )
    )
    for kind, slug in SLUGS.items()
}


# ── The view ─────────────────────────────────────────────────────────────────


class _AgingReportView(ReportFormatMixin, TenantScopeMixin, APIView):
    kind = "receivable"
    permission_classes = [
        IsAuthenticated,
        ModuleEnabled(ModuleCode.REPORTS),
        ModuleEnabled(ModuleCode.LEDGER),
        HasPermission("reports.basic.read"),
        HasPermission("ledger.entry.read"),
    ]
    throttle_classes = [ScopedUserRateThrottle]

    def _params(self, request: Any, tenant: Any) -> dict:
        """§10 — every parameter checked before the FIFO walk runs."""
        params = request.query_params
        details: dict[str, list[str]] = {}
        today = tenant_today(tenant)
        as_of = today
        if params.get("as_of"):
            try:
                as_of = dt.date.fromisoformat(params["as_of"])
            except ValueError:
                details["as_of"] = ["Give a date as YYYY-MM-DD."]
            else:
                if as_of > today:
                    details["as_of"] = ["As-of date cannot be in the future"]
                elif as_of < dt.date(2000, 1, 1):
                    details["as_of"] = ["That date is too far in the past."]
        bucket = params.get("bucket") or None
        if bucket and bucket not in BUCKETS:
            details["bucket"] = ["Choose 0_30, 31_60, 61_90 or 90_plus."]
        ordering = params.get("ordering") or "-90_plus"
        if ordering not in ORDERINGS:
            details["ordering"] = ["Cannot sort by this column."]
        min_total = params.get("min_total") or None
        if min_total:
            try:
                if Decimal(min_total) < 0:
                    details["min_total"] = ["Minimum total cannot be negative."]
            except InvalidOperation:
                details["min_total"] = ["Give an amount."]
        party_id = params.get("party_id") or None
        if party_id:
            try:
                party_id = str(uuid.UUID(party_id))
            except ValueError:
                details["party_id"] = ["That is not a valid id."]
        if details:
            raise ValidationFailed(details)
        return {
            "as_of": as_of.isoformat(),
            "kind": self.kind,
            "tag": params.get("tag") or None,
            "party_id": party_id,
            "min_total": min_total,
            "bucket": bucket,
            "ordering": ordering,
        }

    def get(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        tenant = self.get_tenant()
        params = self._params(request, tenant)
        if (request.query_params.get("fresh") or "").lower() in ("1", "true") and (
            "reports.financial.read" not in granted_permissions(tenant)
        ):
            # FR-10 — bypassing a snapshot is the accountant's control.
            raise PermissionDenied("Only the owner, an admin or the accountant can refresh this.")

        if request.query_params.get("format") == "csv":
            authorise_export(
                request,
                self,
                codename="reports.export",
                refusal="You do not have permission to export reports.",
            )
            return report_csv(request, exporter=EXPORTERS[self.kind], tenant=tenant, params=params)

        page = positive_int(request, "page", default=1, cap=10**6)
        page_size = positive_int(request, "page_size", default=25, cap=100)
        rows, totals = _report(tenant, params)
        start = (page - 1) * page_size
        return StandardResponse.ok(
            [row_json(row) for row in rows[start : start + page_size]],
            meta={
                "as_of": params["as_of"],
                "type": self.kind,
                "totals": {
                    **{name: cell_money(totals[name]) for name in (*BUCKETS, "total")},
                    "party_count": totals["party_count"],
                },
                "cached_at": None,
                "page": page,
                "page_size": page_size,
                "total": len(rows),
                "total_pages": max(1, math.ceil(len(rows) / page_size)),
            },
        )


class ReceivablesAgingView(_AgingReportView):
    kind = "receivable"


class PayablesAgingView(_AgingReportView):
    kind = "payable"
