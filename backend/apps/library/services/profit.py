"""A reading room's month: what came in, what went out, what is left (Library P0).

Income is what students PAID in the period — fee, admission, renewal and fine
collections, by the payment's date, from the same allocation rows the fees report
counts (`selectors.reports.fines_summary`), so the two never disagree. A fee charged
and not yet paid is not income; a deposit is money held for the student, never income.
Spend is the business's recorded expenses in the period, by category, read through the
spend seam (the library never imports the expenses app). Profit is the difference.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from apps.common.seams.spend import spend_by_category

ZERO = Decimal("0.00")


def _money(value: Decimal) -> str:
    return f"{Decimal(value):.2f}"


def profit(tenant: Any, start: dt.date, end: dt.date) -> dict:
    from apps.library.selectors.reports import fines_summary

    summary = fines_summary(tenant, {"from": start, "to": end})
    income = [
        {"kind": kind, "amount": _money(figures["collected"])}
        for kind, figures in sorted(summary.items())
        if figures["collected"] > ZERO
    ]
    income_total = sum((figures["collected"] for figures in summary.values()), ZERO)
    spend = spend_by_category(tenant, start, end)
    spend_total = sum((Decimal(row["amount"]) for row in spend), ZERO)
    return {
        "from": start.isoformat(),
        "to": end.isoformat(),
        "income": income,
        "income_total": _money(income_total),
        "expenses": [{"category": r["category"], "amount": _money(r["amount"])} for r in spend],
        "expenses_total": _money(spend_total),
        "profit": _money(income_total - spend_total),
    }
