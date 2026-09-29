"""The tenant's closed-day calendar (A9b, ADR-055, contracts §1.8, FRD 00 PLT-X08).

One calendar per tenant — closed weekdays plus dated closures, with an optional
per-module override — instead of three calendars that disagree about Diwali.
Lending's collection days, the library's fines and gym sessions read it.

**The rule (BR-1).** A date is closed for module `m` when its weekday is in
`m`'s override if `m` has one, else in the tenant's weekdays; **or** a
`platform_closed_day` row exists for every module (`module IS NULL`) or for `m`.

**Storage.** Weekdays are settings rows under the contract's keys (R32):
`calendar.closed_weekdays` → `{"value": [6]}` (0 = Monday) and
`calendar.closed_weekdays.<module>` → `{"value": [0, 6]}` for an override. Dated
closures are `ClosedDay` rows. Reads are ONE query (the weekday rows and the
closures in a single statement), because a fine over a long loan or a year of
sessions must not read the calendar once per day.

**Never rewrites history (BR-4).** Adding or removing a closure changes no posted
due, fine or mark; consumers read the calendar when they next compute.

Writes: tenant-wide rows and weekdays need `platform.calendar.manage` (owner,
admin — owner Q2, R26); a row or override for module X may also be written by a
member holding X's settings codename. The views check that; the services below
validate and audit.
"""

from __future__ import annotations

import datetime as dt
from collections.abc import Iterable
from typing import Any

from django.core.exceptions import ImproperlyConfigured
from django.db import connection, transaction

from apps.common.audit import AuditAction, write_audit
from apps.common.exceptions import ValidationFailed

WEEKDAYS_KEY = "calendar.closed_weekdays"
MAX_RANGE_ADD_DAYS = 31
MAX_READ_RANGE_DAYS = 400
MAX_REASON = 60
#: `next_open_day` looks this far ahead. Unreachable in practice: a calendar
#: closed on every weekday is refused (BR-2), so some day within a week is open
#: unless a year of dated closures says otherwise.
SEARCH_HORIZON_DAYS = 366

# ── Readers (visibility only) ────────────────────────────────────────────────

_READERS: dict[str, None] = {}
_READERS_BASELINE: dict[str, None] | None = None


def register_calendar_reader(module: str) -> None:
    """`module` reads the calendar, so the Business days screen is shown while
    it is enabled. Idempotent. Registered from the module's `ready()`."""
    _READERS.setdefault(module, None)


def calendar_readers() -> tuple[str, ...]:
    return tuple(_READERS)


def readers_for(tenant: Any) -> list[str]:
    """The calendar readers among the tenant's effective modules, sorted."""
    if not _READERS:
        return []
    from apps.platform_app.services.entitlements import effective_modules

    effective = effective_modules(tenant)
    return sorted(module for module in _READERS if module in effective)


def _reset_readers_for_tests() -> None:  # pragma: no cover - test helper
    global _READERS_BASELINE
    if _READERS_BASELINE is None:
        _READERS_BASELINE = dict(_READERS)
    _READERS.clear()
    _READERS.update(_READERS_BASELINE)


def module_key(module: str) -> str:
    return f"{WEEKDAYS_KEY}.{module}"


# ── Reading ──────────────────────────────────────────────────────────────────

_SQL = """
    SELECT d.date, NULL::varchar AS key, NULL::jsonb AS value
      FROM platform_closed_day d
     WHERE d.tenant_id = %(tenant)s AND d.date BETWEEN %(start)s AND %(end)s
       AND (d.module IS NULL OR d.module = %(module)s)
    UNION ALL
    SELECT NULL::date, s.key, s.value
      FROM platform_tenant_setting s
     WHERE s.tenant_id = %(tenant)s AND s.key IN (%(tenant_key)s, %(module_key)s)
"""


def _weekday_list(value: Any) -> list[int]:
    raw = value.get("value") if isinstance(value, dict) else value
    if isinstance(raw, str):  # jsonb read raw by psycopg arrives decoded; be tolerant
        import json

        raw = json.loads(raw).get("value")
    return sorted({int(day) for day in (raw or []) if isinstance(day, int) and 0 <= day <= 6})


def _read(
    tenant: Any, start: dt.date, end: dt.date, module: str | None
) -> tuple[set[dt.date], set[int]]:
    """Dated closures in `[start, end]` and the weekdays that apply — one query."""
    params = {
        "tenant": tenant.pk,
        "start": start,
        "end": end,
        "module": module,
        "tenant_key": WEEKDAYS_KEY,
        "module_key": module_key(module) if module else WEEKDAYS_KEY,
    }
    dates: set[dt.date] = set()
    tenant_days: list[int] = []
    override: list[int] | None = None
    with connection.cursor() as cursor:
        cursor.execute(_SQL, params)
        for date, key, value in cursor.fetchall():
            if date is not None:
                dates.add(date)
            elif key == WEEKDAYS_KEY:
                tenant_days = _weekday_list(value)
            elif module and key == module_key(module):
                override = _weekday_list(value)
    weekdays = set(override if override is not None else tenant_days)
    return dates, weekdays


def closed_days_between(
    tenant: Any, start: dt.date, end: dt.date, *, module: str | None = None
) -> set[dt.date]:
    """Every closed date in `[start, end]`, both ends inclusive (R32). One query."""
    if end < start:
        return set()
    dates, weekdays = _read(tenant, start, end, module)
    closed = set(dates)
    if weekdays:
        day = start
        while day <= end:
            if day.weekday() in weekdays:
                closed.add(day)
            day += dt.timedelta(days=1)
    return closed


def is_open(tenant: Any, on: dt.date, *, module: str | None = None) -> bool:
    return not closed_days_between(tenant, on, on, module=module)


def next_open_day(tenant: Any, on: dt.date, *, module: str | None = None) -> dt.date:
    """`on` itself when open, else the next open day (one query for the horizon)."""
    end = on + dt.timedelta(days=SEARCH_HORIZON_DAYS)
    closed = closed_days_between(tenant, on, end, module=module)
    day = on
    while day <= end:
        if day not in closed:
            return day
        day += dt.timedelta(days=1)
    raise ImproperlyConfigured(f"No open day within {SEARCH_HORIZON_DAYS} days of {on}.")


def closed_weekdays(tenant: Any) -> dict[str, Any]:
    """`{"value": [...], "modules": {module: [...]}}` for the screen and the list's meta."""
    from apps.platform_app.models import TenantSetting

    rows = dict(
        TenantSetting.objects.filter(tenant=tenant, key__startswith=WEEKDAYS_KEY).values_list(
            "key", "value"
        )
    )
    # Only the calendar readers that are on: a stored override of a module
    # switched off (or hidden) is kept for its return, never listed by name.
    readers = set(readers_for(tenant))
    modules = {
        key[len(WEEKDAYS_KEY) + 1 :]: _weekday_list(value)
        for key, value in rows.items()
        if key != WEEKDAYS_KEY and key[len(WEEKDAYS_KEY) + 1 :] in readers
    }
    return {
        "value": _weekday_list(rows.get(WEEKDAYS_KEY)),
        "modules": dict(sorted(modules.items())),
    }


def closed_day_rows(
    tenant: Any, start: dt.date, end: dt.date, *, module: str | None = None
) -> list[Any]:
    """`GET /calendar/closed-days`: rows in range (every module's, or one's plus
    the tenant-wide ones)."""
    from apps.platform_app.models import ClosedDay

    qs = ClosedDay.objects.filter(tenant=tenant, date__range=(start, end))
    if module:
        from django.db.models import Q

        qs = qs.filter(Q(module__isnull=True) | Q(module=module))
    return list(qs.order_by("date", "module"))


# ── Validation ───────────────────────────────────────────────────────────────


def validate_module(tenant: Any, module: Any, *, field: str = "module") -> str | None:
    """None, or a calendar reader the tenant has on. Anything else is refused."""
    if module in (None, ""):
        return None
    if not isinstance(module, str) or module not in readers_for(tenant):
        raise ValidationFailed({field: ["This feature does not use business days."]})
    return module


def _clean_weekdays(value: Any, field: str) -> list[int]:
    if not isinstance(value, list) or not all(
        isinstance(day, int) and not isinstance(day, bool) and 0 <= day <= 6 for day in value
    ):
        raise ValidationFailed({field: ["Choose days of the week."]})
    days = sorted(set(value))
    if len(days) == 7:
        raise ValidationFailed({field: ["Keep at least one day open."]})
    return days


# ── Writing ──────────────────────────────────────────────────────────────────


@transaction.atomic
def set_closed_weekdays(*, ctx: Any, value: Any, modules: Any) -> dict[str, Any]:
    """Replace the tenant's closed weekdays and the given modules' overrides.

    `modules` maps a module to its override list, or to `None` to remove the
    override (the module follows the tenant again). Modules not named keep
    theirs. BR-2: no list may close all seven days. One audit row per change.
    """
    from apps.platform_app.models import TenantSetting

    tenant = ctx.tenant
    days = _clean_weekdays(value, "value")
    if not isinstance(modules, dict):
        raise ValidationFailed({"modules": ["Expected an object keyed by feature."]})
    overrides: dict[str, list[int] | None] = {}
    for module, module_days in modules.items():
        validate_module(tenant, module, field=f"modules.{module}")
        overrides[module] = (
            None if module_days is None else _clean_weekdays(module_days, f"modules.{module}")
        )

    before = closed_weekdays(tenant)
    TenantSetting.objects.update_or_create(
        tenant=tenant, key=WEEKDAYS_KEY, defaults={"value": {"value": days}}
    )
    for module, module_days in overrides.items():
        if module_days is None:
            TenantSetting.objects.filter(tenant=tenant, key=module_key(module)).delete()
        else:
            TenantSetting.objects.update_or_create(
                tenant=tenant, key=module_key(module), defaults={"value": {"value": module_days}}
            )
    after = closed_weekdays(tenant)
    if after != before:
        write_audit(
            ctx=ctx,
            action=AuditAction.CALENDAR_WEEKDAYS_UPDATED,
            entity_type="platform_tenant",
            entity_id=tenant.pk,
            before=before,
            after=after,
        )
    return after


def _dates(start: dt.date, end: dt.date) -> Iterable[dt.date]:
    day = start
    while day <= end:
        yield day
        day += dt.timedelta(days=1)


@transaction.atomic
def add_closed_days(
    *, ctx: Any, start: dt.date, end: dt.date | None = None, reason: Any, module: Any = None
) -> tuple[list[Any], int]:
    """Close `[start, end]` (≤ 31 days) for every module or one; `(rows, skipped)`.

    BR-3: a date that already has the same `(date, module)` row is skipped and
    counted, so adding "Diwali week" over an existing Diwali day is not an error.
    """
    from apps.platform_app.models import ClosedDay

    tenant = ctx.tenant
    end = end or start
    errors: dict[str, list[str]] = {}
    if end < start:
        errors["to"] = ["The last day must be on or after the first."]
    elif (end - start).days + 1 > MAX_RANGE_ADD_DAYS:
        errors["to"] = [f"Add at most {MAX_RANGE_ADD_DAYS} days at a time."]
    text = reason.strip() if isinstance(reason, str) else ""
    if not text:
        errors["reason"] = ["Say why the business is closed."]
    elif len(text) > MAX_REASON:
        errors["reason"] = [f"Keep it to {MAX_REASON} characters."]
    if errors:
        raise ValidationFailed(errors)
    module = validate_module(tenant, module)

    wanted = list(_dates(start, end))
    existing = set(
        ClosedDay.objects.filter(tenant=tenant, date__in=wanted, module=module).values_list(
            "date", flat=True
        )
        if module
        else ClosedDay.objects.filter(
            tenant=tenant, date__in=wanted, module__isnull=True
        ).values_list("date", flat=True)
    )
    missing = [day for day in wanted if day not in existing]
    actor = getattr(ctx, "actor", None)
    ClosedDay.objects.bulk_create(
        [
            ClosedDay(tenant=tenant, date=day, reason=text, module=module, created_by=actor)
            for day in missing
        ],
        ignore_conflicts=True,  # a concurrent add of the same day is the same closure
    )
    rows = list(
        ClosedDay.objects.filter(tenant=tenant, date__in=missing, module=module).order_by("date")
        if module
        else ClosedDay.objects.filter(
            tenant=tenant, date__in=missing, module__isnull=True
        ).order_by("date")
    )
    skipped = len(wanted) - len(rows)
    if rows:
        write_audit(
            ctx=ctx,
            action=AuditAction.CALENDAR_CLOSED_DAY_CREATED,
            entity_type="platform_closed_day",
            entity_id=rows[0].pk,
            after={
                "dates": [row.date.isoformat() for row in rows],
                "reason": text,
                "module": module,
            },
        )
    return rows, skipped


@transaction.atomic
def delete_closed_day(*, ctx: Any, row: Any) -> None:
    """Hard-delete one closure (configuration, not evidence) and audit it."""
    snapshot = {"date": row.date.isoformat(), "reason": row.reason, "module": row.module}
    pk = row.pk
    row.delete()
    write_audit(
        ctx=ctx,
        action=AuditAction.CALENDAR_CLOSED_DAY_DELETED,
        entity_type="platform_closed_day",
        entity_id=pk,
        before=snapshot,
    )
