"""Tax-rate and HSN reads (Part 17 §17.6.0 "App `tax`: selectors").

Rate lookup is always by `(code, date)`, never by code alone — that is what
makes the 2025-09-21 slab boundary right for a backdated document (Part 21
§21.3.5). A tenant row with the same code shadows the global one.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.db.models import Q, QuerySet

from apps.tax.models import HsnCode, TaxRate


def _effective_on(on_date: dt.date) -> Q:
    return Q(effective_from__lte=on_date) & (
        Q(effective_to__isnull=True) | Q(effective_to__gte=on_date)
    )


def _visible_to(tenant: Any) -> Q:
    return Q(tenant__isnull=True) | Q(tenant=tenant)


def rate_for(*, tenant: Any, code: str, on_date: dt.date) -> TaxRate | None:
    """The row `code` resolves to on `on_date`, tenant row first; None if none."""
    rows = TaxRate.objects.filter(
        _visible_to(tenant), _effective_on(on_date), code=code, is_active=True
    ).order_by(
        "tenant_id"
    )  # NULLs last in Postgres ascending: the tenant row wins
    return rows.first()


def latest_rate(*, tenant: Any, code: str) -> TaxRate | None:
    """The most recent row for a code, current or ended — for the legacy hint."""
    return (
        TaxRate.objects.filter(_visible_to(tenant), code=code, is_active=True)
        .order_by("-effective_from")
        .first()
    )


def code_exists(*, tenant: Any, code: str) -> bool:
    return TaxRate.objects.filter(_visible_to(tenant), code=code, is_active=True).exists()


def rates_on(*, tenant: Any, on_date: dt.date, include: tuple[str, ...] = ()) -> list[dict]:
    """FR-6 — the codes selectable on `on_date`, plus any named in `include`.

    `include` is how a legacy code already on an item (`GST12`) stays in the
    select with its "Rate ended" hint instead of silently vanishing from it.
    """
    current: dict[str, TaxRate] = {}
    rows = TaxRate.objects.filter(
        _visible_to(tenant), _effective_on(on_date), is_active=True
    ).order_by(
        "code", "tenant_id"
    )  # ascending NULLS LAST: a tenant row is seen first
    for row in rows:
        current.setdefault(row.code, row)
    result = [_rate_dict(row, is_current=True) for row in current.values()]
    for code in include:
        if code in current:
            continue
        row = latest_rate(tenant=tenant, code=code)
        if row is not None:
            result.append(_rate_dict(row, is_current=False))
    result.sort(key=lambda r: (r["rate"], r["code"]))
    return [{**r, "rate": str(r["rate"])} for r in result]


def _rate_dict(row: TaxRate, *, is_current: bool) -> dict:
    return {
        "code": row.code,
        "name": row.name,
        "rate": row.rate,
        "cess_rate": str(row.cess_rate),
        "effective_from": row.effective_from.isoformat(),
        "effective_to": row.effective_to.isoformat() if row.effective_to else None,
        "is_current": is_current,
    }


def rate_summary(row: TaxRate | None, *, is_current: bool) -> dict | None:
    """The compact shape an item carries (`item.tax_rate`)."""
    if row is None:
        return None
    return {
        "code": row.code,
        "name": row.name,
        "rate": str(row.rate),
        "cess_rate": str(row.cess_rate),
        "effective_to": row.effective_to.isoformat() if row.effective_to else None,
        "is_current": is_current,
    }


def search_hsn(q: str, *, limit: int = 20) -> QuerySet:
    """FR-4 — code prefix, else description substring (trigram-indexed)."""
    text = (q or "").strip()
    if not text:
        return HsnCode.objects.none()
    if text.isdigit():
        return HsnCode.objects.filter(code__startswith=text).order_by("code")[:limit]
    return HsnCode.objects.filter(description__icontains=text).order_by("code")[:limit]


def hsn_known(code: str) -> bool:
    return HsnCode.objects.filter(code=code).exists()


def hsn_default_tax_code(code: str) -> str | None:
    row = HsnCode.objects.filter(code=code).only("default_tax_code").first()
    return (row.default_tax_code or None) if row else None
