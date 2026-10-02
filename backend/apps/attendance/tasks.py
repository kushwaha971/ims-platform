"""Job handlers and schedules of the attendance engine (ATT-01 §6, ATT-02 BR-5).

Two fan-outs, each enqueuing one child per tenant that has work, with an
idempotency token carrying the period so a second run of the parent enqueues
nothing new while the first children live (the `ledger.schedule_auto_reminders`
pattern, rule S3):

* `attendance.extend_sessions` — Mondays 01:30 IST — keeps every active
  group with a rule generated 8 weeks ahead;
* `attendance.close_open_visits` — daily 00:05 IST — closes the open visits
  of the tenant's previous local day (and any earlier night the job missed).
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from apps.common.jobs import Schedule, enqueue, job_handler, register_schedule

EXTEND = "attendance.extend_sessions"
EXTEND_FOR_TENANT = "attendance.extend_sessions_for_tenant"
CLOSE = "attendance.close_open_visits"
CLOSE_FOR_TENANT = "attendance.close_open_visits_for_tenant"


def register_schedules() -> None:
    register_schedule(
        Schedule(EXTEND, period="weekly", weekday=0, at_hour_ist=1, minute=30, grace_minutes=240)
    )
    register_schedule(Schedule(CLOSE, period="daily", at_hour_ist=0, minute=5, grace_minutes=60))


def _tenants(ids: Any) -> Any:
    from django.apps import apps

    return apps.get_model("platform", "Tenant").objects.filter(pk__in=ids, status="active")


@job_handler(EXTEND, requires_tenant=False, max_attempts=3)
def extend_sessions(job: Any, ctx: Any) -> dict:
    """One child per tenant with an ACTIVE group that has a rule — not every tenant."""
    from apps.attendance.models import Group
    from apps.common.dates import tenant_today

    ids = Group.objects.filter(is_active=True, freq__isnull=False).values("tenant_id")
    fanned = 0
    for tenant in _tenants(ids).only("id", "timezone"):
        year, week, _ = tenant_today(tenant).isocalendar()
        if enqueue(
            job_type=EXTEND_FOR_TENANT,
            payload={},
            tenant=tenant,
            idempotency_token=f"extend-sessions:{tenant.id}:{year}-W{week:02d}",
        ):
            fanned += 1
    return {"tenants": fanned}


@job_handler(EXTEND_FOR_TENANT, max_attempts=3)
def extend_sessions_for_tenant(job: Any, ctx: Any) -> dict:
    from apps.attendance.constants import GENERATE_AHEAD_DAYS
    from apps.attendance.models import Group
    from apps.attendance.services.groups import generate_sessions
    from apps.common.dates import tenant_today

    tenant = job.tenant
    until = tenant_today(tenant) + dt.timedelta(days=GENERATE_AHEAD_DAYS - 1)
    created = 0
    groups = Group.objects.for_tenant(tenant).filter(is_active=True, freq__isnull=False)
    for group_id in groups.values_list("id", flat=True):
        created += generate_sessions(tenant=tenant, group_id=group_id, until=until)
    return {"sessions": created}


@job_handler(CLOSE, requires_tenant=False, max_attempts=3)
def close_open_visits(job: Any, ctx: Any) -> dict:
    """One child per tenant with an open visit, for its previous local day."""
    from apps.attendance.models import Mark
    from apps.common.dates import tenant_today

    ids = Mark.objects.filter(
        status="visit", check_out_at__isnull=True, voided_at__isnull=True
    ).values("tenant_id")
    fanned = 0
    for tenant in _tenants(ids).only("id", "timezone"):
        on = tenant_today(tenant) - dt.timedelta(days=1)
        if enqueue(
            job_type=CLOSE_FOR_TENANT,
            payload={"on": on.isoformat()},
            tenant=tenant,
            idempotency_token=f"close-visits:{tenant.id}:{on.isoformat()}",
        ):
            fanned += 1
    return {"tenants": fanned}


@job_handler(CLOSE_FOR_TENANT, max_attempts=3)
def close_open_visits_for_tenant(job: Any, ctx: Any) -> dict:
    from apps.attendance.services.marks import close_open_visits as close

    on = dt.date.fromisoformat(job.payload["on"])
    return {"closed": close(tenant=job.tenant, on=on)}
