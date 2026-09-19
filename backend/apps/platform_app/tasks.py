"""Job handlers owned by the platform app (Part 20 §20.8.4, Part 26 §26.17)."""

from __future__ import annotations

from typing import Any

from django.utils import timezone

from apps.common.jobs import job_handler


@job_handler("platform.purge_idempotency_keys", requires_tenant=False, timeout_seconds=120)
def purge_idempotency_keys(job: Any, ctx: Any) -> dict:
    """Delete expired `platform_idempotency_key` rows. Runs hourly.

    Idempotent: it deletes by predicate, so running it twice deletes nothing the
    second time (Part 20 §20.8.9 mechanism 3).
    """
    from apps.common.idempotency import purge_expired

    return {"deleted": purge_expired()}


@job_handler("platform.purge_jobs", requires_tenant=False, timeout_seconds=300)
def purge_jobs(job: Any, ctx: Any) -> dict:
    """Retention sweep (Part 21 §21.3.1).

    `succeeded` rows are deleted after 14 days; `dead_letter` rows are kept 180
    days, because they are an operator's only record of work that never happened.
    Idempotent: deletion by predicate.
    """
    import datetime as dt

    from apps.common.constants import JobStatus
    from apps.platform_app.models import Job

    now = timezone.now()
    succeeded, _ = Job.objects.filter(
        status=JobStatus.SUCCEEDED, finished_at__lt=now - dt.timedelta(days=14)
    ).delete()
    dead, _ = Job.objects.filter(
        status=JobStatus.DEAD_LETTER, finished_at__lt=now - dt.timedelta(days=180)
    ).delete()
    return {"succeeded_deleted": succeeded, "dead_letter_deleted": dead}


@job_handler("platform.purge_otp_challenges", requires_tenant=False, timeout_seconds=120)
def purge_otp_challenges(job: Any, ctx: Any) -> dict:
    """OTP rows are purged after 24 h (Part 21 §21.3.1). Idempotent by predicate.

    Still scheduled with `UB_AUTH_OTP_ENABLED=0`: the table is empty, so the
    sweep is one indexed delete of nothing, and a retention job that stops
    running when a feature is paused is a retention job that has to be
    remembered when the feature comes back.
    """
    import datetime as dt

    from apps.platform_app.models import OtpChallenge

    deleted, _ = OtpChallenge.objects.filter(
        created_at__lt=timezone.now() - dt.timedelta(hours=24)
    ).delete()
    return {"deleted": deleted}


@job_handler("platform.check_expected_runs", requires_tenant=False, timeout_seconds=120)
def check_expected_runs(job: Any, ctx: Any) -> dict:
    """Report every schedule whose current period never reached `succeeded`.

    Rule S4 (Part 20 §20.8.6.1): a job that never ran is an alert. This is what
    makes silent non-delivery louder than a failure. Read-only, so idempotent.
    """
    import datetime as dt
    import logging

    from apps.common.constants import JobStatus
    from apps.common.jobs import SCHEDULES
    from apps.platform_app.models import Job

    log = logging.getLogger("ub.jobs")
    now = timezone.now()
    missing = []
    for schedule in SCHEDULES:
        due_at = schedule.due_at(now).astimezone(dt.timezone.utc)
        if now < due_at + dt.timedelta(minutes=schedule.grace_minutes):
            continue
        ok = Job.objects.filter(
            scheduled_key=schedule.period_key(now), status=JobStatus.SUCCEEDED
        ).exists()
        if not ok:
            missing.append(schedule.job_type)
            log.error("job.expected_run_missing", extra={"job_type": schedule.job_type})
    return {"checked": len(SCHEDULES), "missing": missing}


@job_handler("platform.reconcile_entitlements", requires_tenant=False, timeout_seconds=600)
def reconcile_entitlements(job: Any, ctx: Any) -> dict:
    """PLT-15 FR-8's nightly trim of `enabled_modules`. Never deletes data.

    Registered here rather than beside the command, because `tasks.py` is what
    `PlatformConfig.ready()` imports and a handler the registry never sees is a
    schedule that silently never runs (Part 20 §20.8.4).
    """
    from apps.platform_app.management.commands.reconcile_entitlements import reconcile

    return {"tenants_trimmed": len(reconcile())}
