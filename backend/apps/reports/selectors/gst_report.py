"""RPT-07 — the sections assembled into one response (FR-2, FR-10, BR-6, BR-12).

`gst.py` computes each section; this decides which ones a request gets
(`section`, `type`, the tenant's GST scheme), applies rupee rounding, and
writes `meta`. The view only serialises what comes back.

── Rupee rounding (BR-6) ───────────────────────────────────────────────────
`rounding=rupee` rounds, half-up, the SECTION TOTALS and the GSTR-3B boxes —
the figures the portal accepts in whole rupees — and leaves every row at its
paise value. So Σ rounded rows may differ from the rounded total by a rupee;
that is the portal's arithmetic and the screen's caption says so.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from django.utils import timezone

from apps.common.money import to_rupee
from apps.reports.constants_tax import GSTR1_DUE_DAY, GSTR3B_DUE_DAY
from apps.reports.selectors import gst
from apps.reports.selectors.gst_checks import gst_exceptions


def _next_month_day(on: dt.date, day: int) -> dt.date:
    year, month = (on.year + 1, 1) if on.month == 12 else (on.year, on.month + 1)  # noqa: PLR2004
    return dt.date(year, month, day)


def _round_money(value: Any) -> Any:
    """Every Decimal in a figure block to whole rupees; rates and counts are not money."""
    if isinstance(value, dict):
        return {
            k: (v if k in ("tax_rate", "rate", "total_qty") else _round_money(v))
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [_round_money(v) for v in value]
    if isinstance(value, Decimal):
        return to_rupee(value)
    return value


def _rounded_totals(section: dict) -> dict:
    return {**section, "total": _round_money(section["total"])}


def gst_summary(*, tenant: Any, params: Any) -> dict:
    """The whole RPT-07 payload for a regular or composition tenant.

    The caller has already refused an unregistered tenant (409, FR-11).
    """
    window = {"tenant": tenant, "date_from": params.date_from, "date_to": params.date_to}
    outward = gst.outward_lines(**window)
    inward = gst.inward_lines(**window)
    wants = set(params.sections)
    outward_on = params.supply_type in ("outward", "both")
    inward_on = params.supply_type in ("inward", "both")
    composition = tenant.gst_type == "composition"
    rupee = params.rounding == "rupee"
    data: dict[str, Any] = {}

    if outward_on and ("rate" in wants or "nature" in wants):
        section: dict[str, Any] = {}
        if "rate" in wants:
            by_rate = gst.outward_by_rate(outward)
            section["by_rate"] = _rounded_totals(by_rate) if rupee else by_rate
        if "nature" in wants and not composition:
            section["by_nature"] = gst.outward_by_nature(outward, tenant=tenant)
            section["b2cs"] = gst.outward_b2cs(outward, tenant=tenant)
            section["nil_exempt"] = gst.outward_nil_exempt(outward)
        data["outward"] = section
    if outward_on and "hsn" in wants:
        hsn = gst.hsn_summary(outward)
        data["hsn"] = _rounded_totals(hsn) if rupee else hsn
    if outward_on and "docs" in wants:
        data["docs"] = gst.document_series(**window)
    if inward_on and not composition and ("rate" in wants or "itc" in wants):
        by_rate = gst.inward_by_rate(inward, tenant=tenant)
        itc = gst.itc_block(by_rate)
        data["inward"] = {
            "by_rate": _rounded_totals(by_rate) if rupee else by_rate,
            "itc": _round_money(itc) if rupee else itc,
        }
    if "gstr3b" in wants and not composition:
        boxes = gst.gstr3b(outward, inward, tenant=tenant)
        data["gstr3b"] = _round_money(boxes) if rupee else boxes
    if composition:
        block = gst.composition_block(outward, tenant=tenant)
        data["composition"] = _round_money(block) if rupee else block

    checks = gst_exceptions(**window) if "exceptions" in wants else None
    if checks is not None:
        data["exceptions"] = checks["rows"]

    meta = {
        "period": params.period,
        "period_kind": params.period_kind,
        "date_from": params.date_from,
        "date_to": params.date_to,
        "year_to_date": params.year_to_date,
        "gst_type": tenant.gst_type,
        "gstin": tenant.gstin,
        "state_code": tenant.state_code,
        "rounding": params.rounding,
        "type": params.supply_type,
        "sections": list(params.sections),
        "generated_at": timezone.now(),
        # Monthly filer dates; QRMP quarterly filing is not modelled (§24).
        "filing_due_dates": {
            "gstr1": _next_month_day(params.date_to, GSTR1_DUE_DAY),
            "gstr3b": _next_month_day(params.date_to, GSTR3B_DUE_DAY),
        },
        "document_count": gst.contributing_documents(**window),
        "exception_count": checks["count"] if checks is not None else None,
        "is_ready": checks["count"] == 0 if checks is not None else None,
    }
    return {"data": data, "meta": meta}
