"""Job handlers of the dues engine (FRD 00 DUE-02 §6, contracts §2.1 "Daily run").

`dues.run` is the scheduled parent (00:30 IST, registered in `DuesConfig.ready()`
with the handlers, so `materialise_due_schedules` never meets a schedule with no
handler). It fans out one `dues.run_for_tenant` per active tenant, dated by the
TENANT's clock (BR-5) — the `ledger.schedule_auto_reminders` shape. The child's
idempotency token is `dues:<tenant>:<date>`; `uq_job_idem` covers queued,
running and succeeded, so a day that succeeded is never enqueued again and a
dead-lettered one is (C-15: an operator recovers a day with `manage.py dues_run`).
"""

from __future__ import annotations

from typing import Any

from apps.common.jobs import enqueue, job_handler

RUN = "dues.run"
RUN_FOR_TENANT = "dues.run_for_tenant"


def _tenants_with_dues(tenant_model: Any) -> Any:
    """Active tenants holding at least one live schedule — the rest have nothing to run."""
    from apps.dues.constants import LIVE_SCHEDULE_STATUSES
    from apps.dues.models import DuesSchedule

    live = DuesSchedule.objects.filter(status__in=LIVE_SCHEDULE_STATUSES).values("tenant_id")
    return tenant_model.objects.filter(status="active", pk__in=live).only("id", "timezone")


@job_handler(RUN, requires_tenant=False, max_attempts=3)
def run(job: Any, ctx: Any) -> dict:
    from django.apps import apps

    from apps.common.dates import tenant_today

    fanned = 0
    for tenant in _tenants_with_dues(apps.get_model("platform", "Tenant")):
        today = tenant_today(tenant)
        if enqueue(
            job_type=RUN_FOR_TENANT,
            payload={"date": today.isoformat()},
            tenant=tenant,
            max_attempts=3,
            idempotency_token=f"dues:{tenant.id}:{today.isoformat()}",
        ):
            fanned += 1
    return {"tenants": fanned}


@job_handler(RUN_FOR_TENANT, max_attempts=3)
def run_for_tenant(job: Any, ctx: Any) -> dict:
    """The RunReport is the job's `result` (FRD §5)."""
    import datetime as dt

    from apps.dues.services.run import run_for_tenant as _run

    return dict(_run(tenant=job.tenant, today=dt.date.fromisoformat(job.payload["date"])))
