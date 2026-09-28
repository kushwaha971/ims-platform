"""`GET /reports/sales-register` (RPT-03) and `/reports/purchase-register` (RPT-04).

Thin (Part 26 §26.7 R7.1): parse, ask the selector, page, wrap. Every figure
is decided in `reports/selectors/registers.py`; every column is declared once
in `reports/exporters/registers.py` and read by both the page and the file.

`?format=csv` goes through IMP-02's pipeline (`CsvExportMixin`): the cross-site
refusal, `reports.export`, the export budget, the audit row, the streamed
≤ 5,000-row file and the queued job above it. A line-level export is its own
small view class, because the async replay rebuilds the file from the view
class it stored and its column list (see `replay_export_queryset`).

── Permissions (FRD §12, not the lead's summary) ─────────────────────────────
RPT-03 §12 and RPT-04 §12 put the registers on `reports.basic.read` plus the
module's own read — staff may VIEW them (they carry no cost column) and may
not export. The one cost column, a purchase line's `unit_cost`, needs
`reports.financial.read` and is absent from the page and the file without it
(RPT-08 BR-2). RPT-07's GST summary is `reports.financial.read` throughout.
"""

from __future__ import annotations

from typing import Any

from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.common.constants import ModuleCode
from apps.common.dates import tenant_today
from apps.common.exceptions import ValidationFailed
from apps.common.exports import CsvExportMixin, request_has
from apps.common.permissions import HasPermission, ModuleEnabled
from apps.common.responses import StandardResponse
from apps.common.tenancy import get_effective_tenant
from apps.common.throttling import ScopedUserRateThrottle
from apps.reports.constants_tax import (
    REGISTER_PAGE_SIZE,
    REGISTER_PAGE_SIZE_MAX,
    SLUG_PURCHASE_REGISTER,
    SLUG_SALES_REGISTER,
)
from apps.reports.exporters.registers import FIELDS, export_columns, json_row
from apps.reports.selectors import registers as selectors
from apps.reports.views.tax_params import RegisterParams, register_params


def _money(block: Any) -> Any:
    if isinstance(block, dict):
        return {key: _money(value) for key, value in block.items()}
    return block if isinstance(block, int) else str(block)


class _RegisterBase(CsvExportMixin, APIView):
    """Shared by the four register views; subclasses name the book and the level."""

    book: str = "sales"
    level: str = "document"
    slug: str = SLUG_SALES_REGISTER
    throttle_classes = (ScopedUserRateThrottle,)

    # ── what the export pipeline replays ─────────────────────────────────
    def tenant(self) -> Any:
        return get_effective_tenant(self.request)

    def params(self) -> RegisterParams:
        return register_params(
            self.request, today=tenant_today(self.tenant()), purchase=self.book == "purchase"
        )

    def export_queryset(self) -> Any:
        params = self.params()
        return self.rows(params)

    def rows(self, params: RegisterParams) -> Any:
        select = {
            ("sales", "document"): selectors.sales_register,
            ("sales", "line"): selectors.sales_register_lines,
            ("purchase", "document"): selectors.purchase_register,
            ("purchase", "line"): selectors.purchase_register_lines,
        }[(self.book, self.level)]
        return select(tenant=self.tenant(), params=params)

    def export_file_name(self, tenant: Any) -> str:
        """RPT-08 FR-8 — `sales-register_2026-09-01_2026-09-30.csv`."""
        params = self.params()
        suffix = "-lines" if self.level == "line" else ""
        return f"{self.slug}{suffix}_{params.date_from}_{params.date_to}.csv"

    # ── the page ───────────────────────────────────────────────────────────
    def get(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        params = self.params()  # a typo is a 400 before any budget is charged
        level_view = self._level_view(params.level)
        if level_view is not self:
            return level_view.get(request, *args, **kwargs)
        if self.wants_csv(request):
            return self.csv_export(request)
        return self._page(request, params)

    def _level_view(self, level: str) -> Any:
        if level == self.level:
            return self
        target = LEVEL_VIEWS[(self.book, level)]()
        target.request, target.args, target.kwargs = self.request, self.args, self.kwargs
        target.format_kwarg = getattr(self, "format_kwarg", None)
        target.headers = getattr(self, "headers", {})
        return target

    def _page(self, request: Any, params: RegisterParams) -> Any:
        page = _positive_int(request, "page", 1)
        page_size = min(
            _positive_int(request, "page_size", REGISTER_PAGE_SIZE), REGISTER_PAGE_SIZE_MAX
        )
        queryset = self.rows(params)
        total = queryset.count()
        start = (page - 1) * page_size
        fields = FIELDS[(self.book, self.level)]
        allowed = lambda codename: request_has(request, codename)  # noqa: E731
        data = [self._row(row, fields, allowed) for row in queryset[start : start + page_size]]
        totals_of = (
            selectors.sales_register_totals
            if self.book == "sales"
            else selectors.purchase_register_totals
        )
        totals = totals_of(tenant=self.tenant(), params=params)
        return StandardResponse.ok(
            data,
            meta={
                "page": page,
                "page_size": page_size,
                "total": total,
                "total_pages": (total + page_size - 1) // page_size if total else 0,
                "level": self.level,
                "date_from": params.date_from.isoformat(),
                "date_to": params.date_to.isoformat(),
                "include_void": params.include_void,
                "totals": _money(totals),
            },
        )

    def _row(self, row: Any, fields: Any, allowed: Any) -> dict:
        document = row.document if self.level == "line" else row
        head = {
            "id": str(row.id),
            "document_id": str(document.id),
            "party_id": str(document.party_id) if document.party_id else None,
        }
        if self.book == "sales":
            head["is_b2b"] = bool(document.party_gstin_snapshot)
            head["is_walk_in"] = document.party_id is None
        return {**head, **json_row(row, fields, allowed)}


def _positive_int(request: Any, name: str, default: int) -> int:
    raw = request.query_params.get(name)
    if raw in (None, ""):
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ValidationFailed({name: ["Give a whole number."]}) from None
    if value < 1:
        raise ValidationFailed({name: ["Give a number of 1 or more."]})
    return value


_SALES_READ = [
    IsAuthenticated,
    ModuleEnabled(ModuleCode.REPORTS),
    ModuleEnabled(ModuleCode.SALES),
    HasPermission("reports.basic.read"),
    HasPermission("sales.invoice.read"),
]
_PURCHASE_READ = [
    IsAuthenticated,
    ModuleEnabled(ModuleCode.REPORTS),
    ModuleEnabled(ModuleCode.PURCHASES),
    HasPermission("reports.basic.read"),
    HasPermission("purchases.bill.read"),
]


class SalesRegisterView(_RegisterBase):
    permission_classes = _SALES_READ
    export_resource = SLUG_SALES_REGISTER
    export_columns = export_columns(FIELDS[("sales", "document")])


class SalesRegisterLinesView(_RegisterBase):
    level = "line"
    permission_classes = _SALES_READ
    export_resource = f"{SLUG_SALES_REGISTER}-lines"
    export_columns = export_columns(FIELDS[("sales", "line")])


class PurchaseRegisterView(_RegisterBase):
    book = "purchase"
    slug = SLUG_PURCHASE_REGISTER
    permission_classes = _PURCHASE_READ
    export_resource = SLUG_PURCHASE_REGISTER
    export_columns = export_columns(FIELDS[("purchase", "document")])


class PurchaseRegisterLinesView(_RegisterBase):
    book = "purchase"
    level = "line"
    slug = SLUG_PURCHASE_REGISTER
    permission_classes = _PURCHASE_READ
    export_resource = f"{SLUG_PURCHASE_REGISTER}-lines"
    export_columns = export_columns(FIELDS[("purchase", "line")])


LEVEL_VIEWS: dict[tuple[str, str], type[_RegisterBase]] = {
    ("sales", "document"): SalesRegisterView,
    ("sales", "line"): SalesRegisterLinesView,
    ("purchase", "document"): PurchaseRegisterView,
    ("purchase", "line"): PurchaseRegisterLinesView,
}
