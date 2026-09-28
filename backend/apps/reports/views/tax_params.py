"""Query-parameter parsing for RPT-03, RPT-04 and RPT-07 (§10 of each FRD).

Every parameter is validated here, WITHOUT touching a document row, so an
export with a typo in it is a 400 before the export budget is charged (the
rule LED-09's view states). The selectors receive plain Python values.

── Periods ──────────────────────────────────────────────────────────────────
RPT-07 FR-1 takes `period` as a month (`2026-09`), a quarter (`2026-Q2`) or a
financial year (`fy:2026-27`), or an arbitrary `date_from`/`date_to`. A
quarter is the n-th quarter of the FINANCIAL year that starts in April of the
named year — Q1 is April–June — because that is the quarter the GST portal's
QRMP returns are filed for, and a calendar quarter would put January–March of
one financial year beside its April. A period that runs past today is clamped
to today (EC-13, "year to date"); an explicit `date_to` in the future is a 400.
"""

from __future__ import annotations

import datetime as dt
import re
import uuid
from dataclasses import dataclass, field
from typing import Any

from apps.common.exceptions import ValidationFailed
from apps.reports.constants_tax import (
    DEFAULT_REGISTER_ORDERING,
    GST_ROUNDINGS,
    GST_SECTIONS,
    GST_TYPES,
    MAX_RANGE_DAYS,
    PURCHASE_REGISTER_STATUSES,
    REGISTER_ORDERINGS,
    SALES_REGISTER_KINDS,
    SALES_REGISTER_STATUSES,
)

MONTH = re.compile(r"^(\d{4})-(\d{2})$")
QUARTER = re.compile(r"^(\d{4})-Q([1-4])$")
FY = re.compile(r"^fy:(\d{4})-(\d{2})$")
PERIOD_MESSAGE = (
    "Period must be a month (2026-09), a quarter (2026-Q2) or a financial year (fy:2026-27)"
)


def _month_end(year: int, month: int) -> dt.date:
    first_next = dt.date(year + (month == 12), month % 12 + 1, 1)
    return first_next - dt.timedelta(days=1)


def parse_period(raw: str, *, fy_start_month: int = 4) -> tuple[dt.date, dt.date, str]:
    """`2026-09` → (1 Sep, 30 Sep, "month"); `2026-Q2` → (1 Jul, 30 Sep, "quarter")."""
    text = (raw or "").strip()
    if match := MONTH.match(text):
        year, month = int(match[1]), int(match[2])
        if not 1 <= month <= 12:
            raise ValidationFailed({"period": [PERIOD_MESSAGE]})
        return dt.date(year, month, 1), _month_end(year, month), "month"
    if match := QUARTER.match(text):
        year, quarter = int(match[1]), int(match[2])
        start_month = fy_start_month + (quarter - 1) * 3
        start_year = year + (start_month - 1) // 12
        start_month = (start_month - 1) % 12 + 1
        end_month = start_month + 2
        end_year = start_year + (end_month - 1) // 12
        end_month = (end_month - 1) % 12 + 1
        return dt.date(start_year, start_month, 1), _month_end(end_year, end_month), "quarter"
    if match := FY.match(text):
        year = int(match[1])
        if int(match[2]) != (year + 1) % 100:
            raise ValidationFailed({"period": [PERIOD_MESSAGE]})
        start = dt.date(year, fy_start_month, 1)
        end = dt.date(year + 1, fy_start_month, 1) - dt.timedelta(days=1)
        return start, end, "fy"
    raise ValidationFailed({"period": [PERIOD_MESSAGE]})


def _date(request: Any, name: str) -> dt.date | None:
    raw = request.query_params.get(name)
    if raw in (None, ""):
        return None
    try:
        return dt.date.fromisoformat(raw)
    except ValueError:
        raise ValidationFailed({name: ["Give a date as YYYY-MM-DD."]}) from None


def _bool(request: Any, name: str) -> bool | None:
    raw = (request.query_params.get(name) or "").strip().lower()
    if raw == "":
        return None
    if raw in ("true", "1"):
        return True
    if raw in ("false", "0"):
        return False
    raise ValidationFailed({name: ["Give true or false."]})


def _uuid(request: Any, name: str) -> str | None:
    raw = (request.query_params.get(name) or "").strip()
    if not raw:
        return None
    try:
        return str(uuid.UUID(raw))
    except ValueError:
        raise ValidationFailed({name: ["That is not a valid id."]}) from None


def _multi(request: Any, name: str, allowed: tuple[str, ...], message: str) -> tuple[str, ...]:
    raw = request.query_params.get(name) or ""
    values = tuple(dict.fromkeys(v.strip() for v in raw.split(",") if v.strip()))
    unknown = [v for v in values if v not in allowed]
    if unknown:
        raise ValidationFailed({name: [message]})
    return values


def _range(
    date_from: dt.date, date_to: dt.date, *, today: dt.date, message: str
) -> tuple[dt.date, dt.date]:
    if date_from > date_to:
        raise ValidationFailed({"date_from": ["The start date is after the end date."]})
    if (date_to - date_from).days + 1 > MAX_RANGE_DAYS:
        raise ValidationFailed({"date_to": [message]})
    return date_from, date_to


@dataclass(frozen=True)
class RegisterParams:
    """RPT-03 FR-1/FR-6, RPT-04 FR-1/FR-6, plus CR-RPT-2's drill-down keys."""

    date_from: dt.date
    date_to: dt.date
    party_id: str | None = None
    statuses: tuple[str, ...] = ()
    kinds: tuple[str, ...] = ()
    b2b: bool | None = None
    inter_state: bool | None = None
    itc: bool | None = None
    include_void: bool = False
    series: str | None = None
    created_by: str | None = None
    #: CR-RPT-2 — RPT-07's drill-down: documents with a line at this code/rate.
    tax_code: str | None = None
    level: str = "document"
    ordering: str = DEFAULT_REGISTER_ORDERING
    extra: dict = field(default_factory=dict)


def register_params(request: Any, *, today: dt.date, purchase: bool = False) -> RegisterParams:
    """Every register parameter, checked. The default range is the current month (FR-7)."""
    date_from = _date(request, "date_from") or today.replace(day=1)
    date_to = _date(request, "date_to") or today
    date_from, date_to = _range(
        date_from, date_to, today=today, message="A register can cover at most one year."
    )
    level = request.query_params.get("level") or "document"
    if level not in ("document", "line"):
        raise ValidationFailed({"level": ["Choose document or line."]})
    ordering = request.query_params.get("ordering") or DEFAULT_REGISTER_ORDERING
    if ordering not in REGISTER_ORDERINGS:
        raise ValidationFailed({"ordering": ["That is not a sort this report offers."]})
    statuses = _multi(
        request,
        "status",
        PURCHASE_REGISTER_STATUSES if purchase else SALES_REGISTER_STATUSES,
        "Unknown status.",
    )
    kinds = _multi(
        request,
        "kind",
        ("purchase_bill",) if purchase else SALES_REGISTER_KINDS,
        "Unknown document kind.",
    )
    series = (request.query_params.get("series") or "").strip() or None
    tax_code = (request.query_params.get("tax_code") or "").strip().upper() or None
    include_void = bool(_bool(request, "include_void"))
    return RegisterParams(
        date_from=date_from,
        date_to=date_to,
        party_id=_uuid(request, "party_id"),
        statuses=statuses,
        kinds=kinds,
        b2b=None if purchase else _bool(request, "b2b"),
        inter_state=_bool(request, "inter_state"),
        itc=_bool(request, "itc") if purchase else None,
        # Asking for the void status IS asking to see voids.
        include_void=include_void or "void" in statuses,
        series=series[:32] if series else None,
        created_by=_uuid(request, "created_by"),
        tax_code=tax_code[:16] if tax_code else None,
        level=level,
        ordering=ordering,
    )


@dataclass(frozen=True)
class GstParams:
    """RPT-07 FR-1."""

    date_from: dt.date
    date_to: dt.date
    period: str | None
    period_kind: str
    year_to_date: bool
    supply_type: str
    sections: tuple[str, ...]
    rounding: str


def gst_params(request: Any, *, today: dt.date, fy_start_month: int = 4) -> GstParams:
    """RPT-07 §10, every row of it."""
    period = (request.query_params.get("period") or "").strip() or None
    date_from = _date(request, "date_from")
    date_to = _date(request, "date_to")
    if period and (date_from or date_to):
        raise ValidationFailed({"period": ["Give either a period or a date range, not both"]})
    clamped = False
    if period:
        date_from, date_to, kind = parse_period(period, fy_start_month=fy_start_month)
        if date_from > today:
            raise ValidationFailed({"period": ["Period cannot be in the future"]})
        if date_to > today:
            date_to, clamped = today, True
    else:
        if date_from is None or date_to is None:
            # §6 — the accountant files for the CLOSED month.
            last_month_end = today.replace(day=1) - dt.timedelta(days=1)
            date_from = date_from or last_month_end.replace(day=1)
            date_to = date_to or last_month_end
        if date_to > today:
            raise ValidationFailed({"date_to": ["Period cannot be in the future"]})
        kind = "range"
    date_from, date_to = _range(
        date_from, date_to, today=today, message="GST summary can cover at most one year"
    )
    supply_type = request.query_params.get("type") or "both"
    if supply_type not in GST_TYPES:
        raise ValidationFailed({"type": ["Unknown supply type"]})
    raw_sections = request.query_params.get("section") or ""
    sections = tuple(s.strip() for s in raw_sections.split(",") if s.strip()) or GST_SECTIONS
    for section in sections:
        if section not in GST_SECTIONS:
            raise ValidationFailed({"section": [f"Unknown section: {section}"]})
    rounding = request.query_params.get("rounding") or "paise"
    if rounding not in GST_ROUNDINGS:
        raise ValidationFailed({"rounding": ["Rounding must be paise or rupee"]})
    return GstParams(
        date_from=date_from,
        date_to=date_to,
        period=period,
        period_kind=kind,
        year_to_date=clamped,
        supply_type=supply_type,
        sections=sections,
        rounding=rounding,
    )
