"""Job handlers owned by the ledger app (Part 26 §26.17).

A handler is registered with `@job_handler`, takes `(job, ctx)`, returns a
small JSON-serialisable dict or None, is idempotent, and calls services
rather than reimplementing them.

The four here are LED-07's fan-out (`schedule_auto_reminders` → one
`auto_reminders_for_tenant` per tenant → one `send_auto_reminder` per row),
LED-06's provider SMS for a manual reminder, and LED-08's transaction SMS.
"""

from __future__ import annotations

from typing import Any

from apps.common.jobs import enqueue, job_handler

#: LED-07 FR-5 NFR — sends retry with the runner's backoff, then fail for good.
SEND_ATTEMPTS = 5


def _final(job: Any, default: int = SEND_ATTEMPTS) -> bool:
    return job.attempts >= (job.max_attempts or default)


@job_handler("ledger.schedule_auto_reminders", requires_tenant=False, max_attempts=3)
def schedule_auto_reminders(job: Any, ctx: Any) -> dict:
    """FR-2 — daily at 09:00 IST (`SCHEDULES`): one child job per active tenant (rule S3).

    The child's idempotency token carries the date, so a second run of this
    parent on the same day enqueues nothing new while the first children live.
    """
    from django.apps import apps

    from apps.common.dates import tenant_today

    tenant_model = apps.get_model("platform", "Tenant")
    fanned = 0
    for tenant in tenant_model.objects.filter(status="active").only("id", "timezone"):
        today = tenant_today(tenant)
        if enqueue(
            job_type="ledger.auto_reminders_for_tenant",
            payload={"date": today.isoformat()},
            tenant=tenant,
            idempotency_token=f"auto-reminders:{tenant.id}:{today.isoformat()}",
        ):
            fanned += 1
    return {"tenants": fanned}


@job_handler("ledger.auto_reminders_for_tenant", max_attempts=3)
def auto_reminders_for_tenant(job: Any, ctx: Any) -> dict:
    import datetime as dt

    from apps.ledger.services.auto_reminders import schedule_for_tenant

    raw = job.payload.get("date")
    return schedule_for_tenant(tenant=job.tenant, today=dt.date.fromisoformat(raw) if raw else None)


@job_handler("ledger.send_auto_reminder", max_attempts=SEND_ATTEMPTS)
def send_auto_reminder(job: Any, ctx: Any) -> dict:
    from apps.ledger.services.auto_reminders import send_auto_reminder as _send

    return _send(
        reminder_id=job.payload["reminder_id"], tenant=job.tenant, final_attempt=_final(job)
    )


@job_handler("ledger.send_reminder_sms", max_attempts=SEND_ATTEMPTS)
def send_reminder_sms(job: Any, ctx: Any) -> dict:
    """LED-06 FR-3 — a manual reminder on the provider channel.

    The same send path as an automated one, minus the date checks: the merchant
    chose to send it today, so the collection date does not gate it.
    """
    from apps.ledger.services.manual_sms import send_manual_sms

    return send_manual_sms(
        reminder_id=job.payload["reminder_id"], tenant=job.tenant, final_attempt=_final(job)
    )


@job_handler("ledger.send_entry_sms", max_attempts=4)
def send_entry_sms(job: Any, ctx: Any) -> dict:
    from apps.ledger.services.entry_sms import send_entry_sms as _send

    return _send(job=job, tenant=job.tenant, final_attempt=_final(job, 4))
