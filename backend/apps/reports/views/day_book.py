"""`GET /reports/day-book` — RPT-02, as JSON pages or a CSV file.

Thin (Part 26 §26.7 R7.1): parse and validate, work out the reader's grants,
ask the selector, shape the rows. Every figure is decided in
`reports/selectors/day_book.py`.

── What the reader's permissions change (§12) ───────────────────────────────
* Rows from a source they cannot read are not in the book at all — a staff
  member without `purchases.bill.read` gets a day book with no purchases
  (T-RPT02-4), decided inside the selector's CTE.
* The cash and bank POSITION — opening, closing and the running columns —
  needs `reports.financial.read`. RPT-02 §12 lists only `reports.basic.read`,
  but RPT-01 §12 gates the same number (Cash in hand) on the financial
  codename and EXP-03 FR-13 scopes staff to today's till: the drawer's
  position is one fact, and it gets one rule. Without the codename those keys
  are ABSENT (never zeroed) and `meta.balances_visible` is false — RPT-06's
  `cost_visible` pattern.
* `created_by` is a filter for the owner, admin and accountant only
  (§12) — the three roles holding `platform.audit.read`.
"""

from __future__ import annotations

import datetime as dt
import math
import uuid
from typing import Any

from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.common.constants import ModuleCode, PaymentMode
from apps.common.dates import tenant_timezone, tenant_today
from apps.common.exceptions import PermissionDenied, ValidationFailed
from apps.common.exports import ExportColumn, authorise_export
from apps.common.permissions import HasPermission, ModuleEnabled
from apps.common.responses import StandardResponse
from apps.common.throttling import ScopedUserRateThrottle
from apps.common.viewsets import TenantScopeMixin
from apps.reports.constants import (
    DAY_BOOK,
    DAY_BOOK_MAX_DAYS,
    DAY_BOOK_MAX_PAGE_SIZE,
    DAY_BOOK_PAGE_SIZE,
    DAY_BOOK_TYPES,
)
from apps.reports.exporting import Exporter, cell_date, cell_money, inr, register
from apps.reports.selectors.day_book import (
    SOURCE_PERMISSIONS,
    DayBookQuery,
    DayBookRow,
    count_rows,
    day_book,
    iter_rows,
    summarise,
)
from apps.reports.views.export_support import (
    ReportFormatMixin,
    granted_permissions,
    positive_int,
    report_csv,
)

_TRUE = ("1", "true", "yes")


def _money(value: Any) -> str | None:
    return cell_money(value) if value is not None else None


def _figures(values: dict) -> dict[str, str]:
    return {key: cell_money(values[key]) for key in ("cash", "bank")}


# ── Wire shapes ──────────────────────────────────────────────────────────────


def row_json(row: DayBookRow, *, tz: Any, balances: bool) -> dict[str, Any]:
    local = timezone.localtime(row.at, tz)
    body: dict[str, Any] = {
        "id": f"{row.type}:{row.source_id}",
        "type": row.type,
        "void": row.void,
        "source": {"kind": row.source_kind, "id": row.source_id, "party_id": row.party_id},
        "date": row.date.isoformat(),
        "time": local.strftime("%H:%M"),
        # EC-2 — a line entered today for last week sits on its business date
        # and says when it was really written.
        "recorded_on": local.date().isoformat() if local.date() != row.date else None,
        "number": row.number,
        "party": {"id": row.party_id, "name": row.party_name or ""} if row.party_id else None,
        "walk_in_name": row.party_name if not row.party_id and row.party_name else None,
        "amount": _money(row.amount),
        "amount_due": _money(row.amount_due),
        "money_in": _money(row.money_in),
        "money_out": _money(row.money_out),
        "modes": [
            {"mode": part.get("mode"), "amount": cell_money(part.get("amount"))}
            for part in row.modes
        ],
        "note": row.note,
        "detail": row.detail,
        "lines": row.lines,
        "paid": row.paid,
        "reference": row.reference,
        "created_by": (
            {"id": row.created_by_id, "name": row.created_by_name or ""}
            if row.created_by_id
            else None
        ),
        "reverses_id": row.reverses_id,
    }
    if balances:
        body["cash_after"] = cell_money(row.cash_after)
        body["bank_after"] = cell_money(row.bank_after)
    return body


# ── The CSV (FR-6) ───────────────────────────────────────────────────────────

_TYPE_WORDS = {
    "sale": "Sale",
    "credit_note": "Credit note",
    "purchase": "Purchase bill",
    "payment_in": "Payment received",
    "payment_out": "Payment made",
    "expense": "Expense",
    "manual_gave": "You gave",
    "manual_got": "You got",
    "opening": "Opening balance",
    "write_off": "Write-off",
    "reversal": "Reversal",
    "correction": "Correction",
    "stock_adjustment": "Stock adjustment",
}


def describe(row: DayBookRow) -> str:
    """FR-6's `description`: what happened, in words, with the amount where the
    debit/credit columns are empty ("Sale ₹1,772.00 credit")."""
    base = row.type.removesuffix("_void")
    word = _TYPE_WORDS.get(base, base)
    parts: list[str] = []
    if base == "sale":
        # UAT D4 — `amount_due` on a sale row is the due AT ISSUE.
        due = row.amount_due or 0
        if due <= 0:
            parts.append(f"{word} {inr(row.amount)} paid")
        elif due >= row.amount:
            parts.append(f"{word} {inr(row.amount)} credit")
        else:
            parts.append(
                f"{word} {inr(row.amount)}: {inr(row.amount - due)} paid, {inr(due)} credit"
            )
    elif base in ("credit_note", "purchase", "opening", "write_off", "reversal", "correction"):
        parts.append(f"{word} {inr(row.amount)}")
    elif base == "expense":
        parts.append(row.detail or word)
        if not row.paid:
            parts.append(f"Payable {inr(row.amount)}")
    elif base in ("manual_gave", "manual_got"):
        parts.append(word if row.modes else f"{word} {inr(row.amount)}")
    elif base == "stock_adjustment":
        parts.append(word)
        if row.detail:
            parts.append(row.detail.replace("_", " "))
        if row.lines:
            parts.append(f"{row.lines} item{'s' if row.lines != 1 else ''}")
    else:
        parts.append(word)
    if row.note:
        parts.append(row.note)
    if row.detail and base in ("reversal", "write_off", "opening", "correction"):
        parts.append(row.detail)
    text = " · ".join(part for part in parts if part)
    return f"VOID · {text}" if row.void else text


def describe_modes(row: DayBookRow) -> str:
    """EC-1 — "UPI 700.00 + Cash 300.00"."""
    labels = {mode.value: str(mode.label) for mode in PaymentMode}
    return " + ".join(
        f"{labels.get(part.get('mode'), part.get('mode'))} {cell_money(part.get('amount'))}"
        for part in row.modes
    )


def _tz_time(tenant_tz: Any) -> Any:
    return lambda row: timezone.localtime(row.at, tenant_tz).strftime("%H:%M")


def day_book_columns(params: dict, tenant_tz: Any = None) -> tuple[ExportColumn, ...]:
    """FR-6's header, in order; the two balance columns only for a reader who may
    see the drawer (RPT-08 BR-2: absent, not blank)."""
    tz = tenant_tz or timezone.get_current_timezone()
    balances = bool(params.get("balances"))
    columns = [
        ExportColumn("date", lambda r: cell_date(r.date)),
        ExportColumn("time", _tz_time(tz)),
        ExportColumn("type", lambda r: r.type),
        ExportColumn("number", lambda r: r.number or ""),
        ExportColumn("party", lambda r: r.party_name or ""),
        ExportColumn("description", describe),
        ExportColumn("debit", lambda r: _money(r.money_in) if not r.void else None, numeric=True),
        ExportColumn("credit", lambda r: _money(r.money_out) if not r.void else None, numeric=True),
        ExportColumn("mode", describe_modes),
    ]
    if balances:
        columns += [
            ExportColumn("cash_balance", lambda r: cell_money(r.cash_after), numeric=True),
            ExportColumn("bank_balance", lambda r: cell_money(r.bank_after), numeric=True),
        ]
    columns += [
        ExportColumn("created_by", lambda r: r.created_by_name or ""),
        ExportColumn("reference", lambda r: r.reference),
        ExportColumn("source_id", lambda r: r.source_id),
    ]
    return tuple(columns)


def _export_rows(tenant: Any, params: dict) -> Any:
    return iter_rows(tenant=tenant, query=DayBookQuery.from_params(params))


def _export_count(tenant: Any, params: dict) -> int:
    return count_rows(tenant=tenant, query=DayBookQuery.from_params(params))


def _export_columns(params: dict) -> tuple[ExportColumn, ...]:
    from zoneinfo import ZoneInfo

    return day_book_columns(params, ZoneInfo(params.get("timezone") or "Asia/Kolkata"))


DAY_BOOK_EXPORTER = register(
    Exporter(
        slug=DAY_BOOK,
        columns=_export_columns,
        rows=_export_rows,
        count=_export_count,
        filename=lambda params: f"{DAY_BOOK}_{params['date_from']}_{params['date_to']}.csv",
    )
)


# ── The view ─────────────────────────────────────────────────────────────────


class DayBookView(ReportFormatMixin, TenantScopeMixin, APIView):
    """FR-1 — `?date_from&date_to&type&party_id&created_by&mode&include_void&page&format`."""

    permission_classes = [
        IsAuthenticated,
        ModuleEnabled(ModuleCode.REPORTS),
        HasPermission("reports.basic.read"),
    ]
    throttle_classes = [ScopedUserRateThrottle]

    def _query(self, request: Any, tenant: Any, granted: frozenset[str]) -> DayBookQuery:
        """Every parameter checked before a row is read (§10)."""
        params = request.query_params
        details: dict[str, list[str]] = {}
        today = tenant_today(tenant)

        def parse_date(name: str) -> dt.date | None:
            raw = params.get(name)
            if not raw:
                return None
            try:
                return dt.date.fromisoformat(raw)
            except ValueError:
                details[name] = ["Enter a date as YYYY-MM-DD."]
                return None

        date_from = parse_date("date_from")
        date_to = parse_date("date_to")
        types = tuple(t.strip() for t in (params.get("type") or "").split(",") if t.strip())
        unknown = [t for t in types if t not in DAY_BOOK_TYPES]
        if unknown:
            details["type"] = [f"Unknown type: {', '.join(unknown)}."]
        party_id = self._uuid(params.get("party_id"), "party_id", details)
        created_by = self._uuid(params.get("created_by"), "created_by", details)
        mode = (params.get("mode") or "").strip() or None
        if mode and mode not in PaymentMode.values:
            details["mode"] = ["Choose cash, upi, bank, cheque, card or other."]
        if details:
            raise ValidationFailed(details)

        # FR-5 — today by default; a single date means that one day.
        date_from = date_from or date_to or today
        date_to = date_to or date_from
        if date_from > date_to:
            raise ValidationFailed({"date_to": ["The end date cannot be before the start date."]})
        if (date_to - date_from).days + 1 > DAY_BOOK_MAX_DAYS:
            raise ValidationFailed({"date_to": ["Choose a range up to one year."]})
        if created_by and "platform.audit.read" not in granted:
            raise PermissionDenied("Only the owner, an admin or the accountant can filter by user.")

        return DayBookQuery(
            date_from=date_from,
            date_to=date_to,
            sources=frozenset(
                source for source, code in SOURCE_PERMISSIONS.items() if code in granted
            ),
            balances="reports.financial.read" in granted,
            types=types or None,
            party_id=party_id,
            created_by=created_by,
            mode=mode,
            include_void=(params.get("include_void") or "").lower() in _TRUE,
        )

    @staticmethod
    def _uuid(raw: str | None, name: str, details: dict) -> str | None:
        if not raw:
            return None
        try:
            return str(uuid.UUID(raw))
        except ValueError:
            details[name] = ["That is not a valid id."]
            return None

    def get(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        tenant = self.get_tenant()
        granted = granted_permissions(tenant)
        query = self._query(request, tenant, granted)
        tz = tenant_timezone(tenant)

        if request.query_params.get("format") == "csv":
            authorise_export(
                request,
                self,
                codename="reports.export",
                refusal="You do not have permission to export reports.",
            )
            return report_csv(
                request,
                exporter=DAY_BOOK_EXPORTER,
                tenant=tenant,
                params={**query.to_params(), "timezone": str(tz)},
            )

        page = positive_int(request, "page", default=1, cap=10**6)
        page_size = min(
            positive_int(request, "page_size", default=DAY_BOOK_PAGE_SIZE, cap=10**6),
            DAY_BOOK_MAX_PAGE_SIZE,
        )
        result = day_book(tenant=tenant, query=query, page=page, page_size=page_size)
        totals = summarise(result.totals)
        data: dict[str, Any] = {
            "rows": [row_json(row, tz=tz, balances=query.balances) for row in result.rows],
            "totals": {
                "count": totals["count"],
                **{
                    key: cell_money(totals[key])
                    for key in (
                        "sales",
                        "credit_notes",
                        "purchases",
                        "payments_in",
                        "payments_out",
                        "expenses",
                        "money_in",
                        "money_out",
                    )
                },
            },
        }
        if query.balances:
            data["opening"] = _figures(result.opening)
            data["closing"] = _figures(result.closing)
        return StandardResponse.ok(
            data,
            meta={
                "date_from": query.date_from.isoformat(),
                "date_to": query.date_to.isoformat(),
                "page": page,
                "page_size": page_size,
                "total": result.total,
                "total_pages": max(1, math.ceil(result.total / page_size)),
                "balances_visible": query.balances,
                "sources": sorted(query.sources),
                "include_void": query.include_void,
            },
        )
