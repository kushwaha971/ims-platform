"""Job handlers of the library (LIB-08 BR-4, LIB-09 FR-8; tasks B11, B12).

`library.expire_holds` is the scheduled parent (06:15 IST, registered in
`LibraryConfig.ready()` beside the handlers); it fans out one child per tenant
that has ready holds, dated by the tenant's own clock, with the idempotency token
`library_holds:<tenant>:<date>` (the `dues.run` shape). An operator recovers a day
with `manage.py library_expire_holds`.
"""

from __future__ import annotations

from typing import Any

from apps.common.jobs import enqueue, job_handler

EXPIRE = "library.expire_holds"
EXPIRE_FOR_TENANT = "library.expire_holds_for_tenant"
OVERDUE_TODAY = "library.overdue_today"


@job_handler(EXPIRE, requires_tenant=False, max_attempts=3)
def expire(job: Any, ctx: Any) -> dict:
    from django.apps import apps

    from apps.common.dates import tenant_today
    from apps.library.models import LibraryHold

    tenants = apps.get_model("platform", "Tenant").objects.filter(
        status="active", pk__in=LibraryHold.objects.filter(status="ready").values("tenant_id")
    )
    fanned = 0
    for tenant in tenants.only("id", "timezone"):
        today = tenant_today(tenant)
        if enqueue(
            job_type=EXPIRE_FOR_TENANT,
            payload={"date": today.isoformat()},
            tenant=tenant,
            max_attempts=3,
            idempotency_token=f"library_holds:{tenant.id}:{today.isoformat()}",
        ):
            fanned += 1
    return {"tenants": fanned}


@job_handler(EXPIRE_FOR_TENANT, max_attempts=3)
def expire_for_tenant(job: Any, ctx: Any) -> dict:
    import datetime as dt

    from apps.library.services.holds import expire_holds

    return expire_holds(tenant=job.tenant, today=dt.date.fromisoformat(job.payload["date"]))


@job_handler(OVERDUE_TODAY, requires_tenant=False, max_attempts=3)
def overdue_today(job: Any, ctx: Any) -> dict:
    """LIB-09 FR-8 — one bell row per tenant: the loans that became overdue today.

    Cheap enough to run inline (one count per tenant with open loans); a tenant
    whose library is switched off is skipped, since its members cannot see the row.
    """
    from django.apps import apps

    from apps.common.dates import tenant_today
    from apps.library.models import LibraryLoan
    from apps.library.services.reminders import notify_overdue_today
    from apps.platform_app.services.entitlements import effective_modules

    tenants = apps.get_model("platform", "Tenant").objects.filter(
        status="active", pk__in=LibraryLoan.objects.filter(status="open").values("tenant_id")
    )
    notified = 0
    for tenant in tenants:
        if "library" in effective_modules(tenant) and notify_overdue_today(
            tenant, tenant_today(tenant)
        ):
            notified += 1
    return {"tenants": notified}
