"""Tenant-timezone date helpers (Part 20 §20.2.2, S0-32).

Business dates live in the tenant's timezone; storage is UTC (Part 21 §21.1
rule 7). The Indian financial year starts on 1 April by default and is
tenant-configurable through `Tenant.fy_start_month`.
"""

from __future__ import annotations

import datetime as dt
from zoneinfo import ZoneInfo

from django.utils import timezone

DEFAULT_TIMEZONE = "Asia/Kolkata"


def tenant_timezone(tenant: object | None) -> ZoneInfo:
    name = getattr(tenant, "timezone", None) or DEFAULT_TIMEZONE
    return ZoneInfo(name)


def tenant_today(tenant: object | None, *, now: dt.datetime | None = None) -> dt.date:
    """Today, as the merchant's wall clock sees it."""
    moment = now or timezone.now()
    return moment.astimezone(tenant_timezone(tenant)).date()


def fy_start_month(tenant: object | None) -> int:
    return int(getattr(tenant, "fy_start_month", 4) or 4)


def fy_label_for(tenant: object | None, on: dt.date) -> str:
    """`2026-27` for any date in the financial year containing `on`."""
    start_month = fy_start_month(tenant)
    start_year = on.year if on.month >= start_month else on.year - 1
    return f"{start_year}-{str((start_year + 1) % 100).zfill(2)}"


def fy_bounds(tenant: object | None, on: dt.date) -> tuple[dt.date, dt.date]:
    """The inclusive first and last day of the financial year containing `on`."""
    start_month = fy_start_month(tenant)
    start_year = on.year if on.month >= start_month else on.year - 1
    start = dt.date(start_year, start_month, 1)
    end_month_first = dt.date(start_year + 1, start_month, 1)
    return start, end_month_first - dt.timedelta(days=1)
