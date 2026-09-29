"""Background work without a broker (ADR-012, Part 20 §20.8).

Asynchronous work is rows in `platform_job`, claimed by
`manage.py run_scheduler`. `enqueue()` is the seam: if Celery is ever adopted,
`enqueue()` changes and no caller does.
"""

from __future__ import annotations

import datetime as dt
import logging
import random
import secrets
from dataclasses import dataclass
from typing import Any, Callable

from django.apps import apps
from django.core.exceptions import ImproperlyConfigured
from django.db import IntegrityError, connection, transaction
from django.utils import timezone

from apps.common.constants import PRIORITY_MAINTENANCE, PRIORITY_NORMAL, JobStatus

logger = logging.getLogger("ub.jobs")

BASE_BACKOFF_SECONDS = 30
MAX_BACKOFF_SECONDS = 3600
VISIBILITY_GRACE_SECONDS = 60
IST = dt.timezone(dt.timedelta(hours=5, minutes=30))


def _job_model() -> Any:
    """Lazy model lookup — rule D1 forbids a module-level `apps.*` import."""
    return apps.get_model("platform", "Job")


# ── The registry (Part 20 §20.8.4) ───────────────────────────────────────────


@dataclass(frozen=True, slots=True)
class JobSpec:
    handler: Callable[[Any, Any], dict | None]
    max_attempts: int = 5
    timeout_seconds: int = 300
    requires_tenant: bool = True


REGISTRY: dict[str, JobSpec] = {}


def job_handler(
    job_type: str,
    *,
    max_attempts: int = 5,
    timeout_seconds: int = 300,
    requires_tenant: bool = True,
) -> Callable:
    """Register a handler.

    Handlers live in each app's `tasks.py`, which is imported by that app's
    `AppConfig.ready()`, so the registry is complete before the first claim.
    """

    def decorator(fn: Callable) -> Callable:
        if job_type in REGISTRY:
            raise ImproperlyConfigured(f"Duplicate job_type {job_type!r}")
        REGISTRY[job_type] = JobSpec(fn, max_attempts, timeout_seconds, requires_tenant)
        return fn

    return decorator


# ── enqueue (Part 20 §20.8.3) ────────────────────────────────────────────────


def enqueue(
    *,
    job_type: str,
    payload: dict,
    tenant: Any = None,
    priority: int = PRIORITY_NORMAL,
    run_after: Any = None,
    max_attempts: int = 5,
    idempotency_token: str | None = None,
    scheduled_key: str | None = None,
    created_by: Any = None,
    request_id: str | None = None,
) -> Any:
    """Queue background work. The only way anything becomes asynchronous.

    Called inside the caller's transaction, so the INSERT commits with the
    caller's work: a job never exists for a transaction that rolled back and
    never goes missing for one that committed. That is the transactional-outbox
    property that makes a broker unnecessary at this scale.
    """
    if job_type not in REGISTRY:
        raise ImproperlyConfigured(f"Unknown job_type {job_type!r}")
    if request_id:
        payload = {**payload, "_request_id": request_id}

    model = _job_model()
    try:
        with transaction.atomic():
            job = model.objects.create(
                tenant=tenant,
                job_type=job_type,
                payload=payload,
                priority=priority,
                run_after=run_after or timezone.now(),
                max_attempts=max_attempts,
                idempotency_token=idempotency_token,
                scheduled_key=scheduled_key,
                created_by=created_by,
                status=JobStatus.QUEUED,
            )
    except IntegrityError:
        # A live job with this token already exists — that IS the success case.
        logger.info(
            "job.deduplicated", extra={"job_type": job_type, "token": idempotency_token or ""}
        )
        return None

    from django.conf import settings

    if getattr(settings, "UB_JOBS_EAGER", False):
        # Local and test only (Part 20 §20.8.10): run inline after the current
        # transaction commits, so a test can assert job side effects without a loop.
        transaction.on_commit(lambda: run_job(model.objects.get(pk=job.pk), worker="eager"))
    return job


# ── The claim query (Part 20 §20.8.5) ────────────────────────────────────────

# `clock_timestamp()` rather than `now()`: `now()` is the *transaction start*
# timestamp, so a job enqueued inside the claiming transaction — which is what
# every test and every eager-mode run does — would be invisible until the next
# tick. In production the claim is its own single-statement transaction, so the
# two are the same instant; this spelling is correct in both.
CLAIM_SQL = """
WITH claimed AS (
    SELECT id
    FROM platform_job
    WHERE status = 'queued'
      AND run_after <= clock_timestamp()
      AND (%(job_types)s::text[] IS NULL OR job_type = ANY(%(job_types)s))
    ORDER BY priority ASC, run_after ASC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT %(batch)s
)
UPDATE platform_job j
   SET status      = 'running',
       attempts    = j.attempts + 1,
       locked_at   = now(),
       locked_by   = %(worker)s,
       started_at  = COALESCE(j.started_at, now()),
       updated_at  = now()
  FROM claimed
 WHERE j.id = claimed.id
RETURNING j.id;
"""


def claim_jobs(*, batch: int, worker: str, job_types: list[str] | None = None) -> list[Any]:
    """Claim up to `batch` due jobs with `FOR UPDATE SKIP LOCKED`.

    Any number of runners may run simultaneously and each claims a disjoint batch
    without blocking (rule S1). The CTE + `UPDATE … RETURNING` makes claim-and-mark
    a single round trip, so a runner that dies between the two cannot leave a row
    claimed-but-not-marked.
    """
    model = _job_model()
    with transaction.atomic(), connection.cursor() as cursor:
        cursor.execute(
            CLAIM_SQL,
            {"job_types": list(job_types) if job_types else None, "batch": batch, "worker": worker},
        )
        ids = [row[0] for row in cursor.fetchall()]
    if not ids:
        return []
    by_id = {job.id: job for job in model.objects.filter(id__in=ids).select_related("tenant")}
    return [by_id[i] for i in ids if i in by_id]


def reap_stuck_jobs(worker: str) -> int:
    """Return jobs whose lock has expired to the queue (Part 20 §20.8.8).

    The visibility timeout is per job type (`JobSpec.timeout_seconds`, default
    300 s) with a 60 s grace. Because `attempts` was already incremented at claim
    time, a job that repeatedly kills its runner still reaches `max_attempts` and
    dead-letters instead of looping forever.
    """
    model = _job_model()
    reaped = 0
    now = timezone.now()
    # One statement per *distinct timeout*, not one per registered job type. The
    # loop used to be `for job_type, spec in REGISTRY.items()`, which made the
    # reaper O(registry) on every tick of `run_scheduler` — including the tight
    # iterations where the queue is not empty and the loop does not sleep. The
    # registry is the thing that grows: 5 job types today, 20 named in the
    # specification's `SCHEDULES`, more after that. The number of distinct
    # visibility timeouts does not grow with it — today's five types share three
    # (120 s, 300 s, 600 s), so this is 3 statements per tick instead of 5, and
    # at the specified 20 types it is still ~3 instead of 20. Measured against
    # 200 running jobs: 0.176 ms per statement, so 0.88 ms -> 0.53 ms today.
    for timeout_seconds, job_types in _reaper_groups().items():
        cutoff = now - dt.timedelta(seconds=timeout_seconds + VISIBILITY_GRACE_SECONDS)
        reaped += model.objects.filter(
            status=JobStatus.RUNNING, job_type__in=job_types, locked_at__lt=cutoff
        ).update(
            status=JobStatus.QUEUED,
            locked_at=None,
            locked_by=None,
            run_after=now,
            error="reclaimed after visibility timeout",
            updated_at=now,
        )
    if reaped:
        logger.warning("job.reaped", extra={"count": reaped, "worker": worker})
    return reaped


def _reaper_groups() -> dict[int, list[str]]:
    """`{timeout_seconds: [job_type, ...]}` over the registry.

    Grouping rather than caching, because the registry is populated by app
    `ready()` hooks and by tests that register a throwaway type; a cache keyed on
    nothing would go stale the first time a test registered one.
    """
    groups: dict[int, list[str]] = {}
    for job_type, spec in REGISTRY.items():
        groups.setdefault(spec.timeout_seconds, []).append(job_type)
    return groups


def backoff_for(attempts: int) -> dt.timedelta:
    """30 s, 60 s, 120 s, 240 s … capped at 1 h, with ±20 % jitter.

    The jitter exists so a thousand SMS jobs failing at once do not retry in
    lockstep.
    """
    base = min(BASE_BACKOFF_SECONDS * (2 ** max(attempts - 1, 0)), MAX_BACKOFF_SECONDS)
    jitter = base * 0.2 * (random.random() * 2 - 1)  # noqa: S311 - jitter, not crypto
    return dt.timedelta(seconds=base + jitter)


def run_job(job: Any, *, worker: str) -> None:
    """Execute one job. Never raises: every outcome is written back to the row."""
    import time
    import traceback

    from apps.common.context import Ctx
    from apps.common.exceptions import PermanentJobError
    from apps.common.tenancy import TenantContext

    model = _job_model()
    spec = REGISTRY.get(job.job_type)
    if spec is None:
        _dead_letter(job, f"Unknown job_type {job.job_type!r}")
        return

    ctx = (
        Ctx.system(
            job.tenant,
            request_id=job.payload.get("_request_id"),
            job_id=str(job.id),
            job_type=job.job_type,
        )
        if job.tenant is not None
        else None
    )
    started = time.monotonic()
    try:
        with TenantContext(job.tenant):
            # Each handler owns its transaction: a failing handler must not roll
            # back the bookkeeping UPDATE that records the failure.
            result = spec.handler(job, ctx)
        model.objects.filter(pk=job.pk).update(
            status=JobStatus.SUCCEEDED,
            finished_at=timezone.now(),
            locked_at=None,
            locked_by=None,
            result=result or {},
            error=None,
            updated_at=timezone.now(),
        )
        logger.info(
            "job.succeeded",
            extra={
                "job_id": str(job.id),
                "job_type": job.job_type,
                "duration_ms": int((time.monotonic() - started) * 1000),
                "tenant_id": str(job.tenant_id or ""),
            },
        )
    except Exception as exc:  # noqa: BLE001 — a runner must never die
        permanent = isinstance(exc, PermanentJobError)
        attempts = job.attempts
        max_attempts = job.max_attempts or spec.max_attempts
        error = f"{type(exc).__name__}: {exc}\n{traceback.format_exc()[:8192]}"
        if permanent or attempts >= max_attempts:
            model.objects.filter(pk=job.pk).update(
                status=JobStatus.DEAD_LETTER,
                finished_at=timezone.now(),
                locked_at=None,
                locked_by=None,
                error=error,
                updated_at=timezone.now(),
            )
            logger.error(
                "job.dead_letter",
                extra={
                    "job_id": str(job.id),
                    "job_type": job.job_type,
                    "attempts": attempts,
                    "tenant_id": str(job.tenant_id or ""),
                    "error_class": type(exc).__name__,
                },
            )
        else:
            delay = backoff_for(attempts)
            model.objects.filter(pk=job.pk).update(
                status=JobStatus.QUEUED,
                locked_at=None,
                locked_by=None,
                run_after=timezone.now() + delay,
                error=error,
                updated_at=timezone.now(),
            )
            logger.warning(
                "job.retrying",
                extra={
                    "job_id": str(job.id),
                    "job_type": job.job_type,
                    "attempts": attempts,
                    "next_in_s": int(delay.total_seconds()),
                },
            )


def _dead_letter(job: Any, reason: str) -> None:
    _job_model().objects.filter(pk=job.pk).update(
        status=JobStatus.DEAD_LETTER,
        finished_at=timezone.now(),
        locked_at=None,
        locked_by=None,
        error=reason,
        updated_at=timezone.now(),
    )
    logger.error("job.dead_letter", extra={"job_id": str(job.id), "job_type": job.job_type})


# ── Recurring schedules (Part 20 §20.8.7) ────────────────────────────────────


@dataclass(frozen=True, slots=True)
class Schedule:
    """One periodic entry of the §20.8.4 registry.

    `grace_minutes` is how late a run may be before `platform.check_expected_runs`
    reports its absence (rule S4).
    """

    job_type: str
    period: str  # "hourly" | "daily" | "weekly"
    at_hour_ist: int = 0
    minute: int = 0
    weekday: int | None = None  # 0 = Monday … 6 = Sunday
    grace_minutes: int = 60

    def _now_ist(self, now: dt.datetime | None = None) -> dt.datetime:
        return (now or timezone.now()).astimezone(IST)

    def period_key(self, now: dt.datetime | None = None) -> str:
        local = self._now_ist(now)
        if self.period == "hourly":
            return f"{self.job_type}:{local:%Y-%m-%dT%H}"
        if self.period == "weekly":
            iso = local.isocalendar()
            return f"{self.job_type}:{iso[0]}-W{iso[1]:02d}"
        return f"{self.job_type}:{local:%Y-%m-%d}"

    def due_at(self, now: dt.datetime | None = None) -> dt.datetime:
        local = self._now_ist(now)
        if self.period == "hourly":
            return local.replace(minute=self.minute, second=0, microsecond=0)
        target = local.replace(hour=self.at_hour_ist, minute=self.minute, second=0, microsecond=0)
        if self.period == "weekly" and self.weekday is not None:
            target = target - dt.timedelta(days=(target.weekday() - self.weekday) % 7)
        return target

    def is_due(self, now: dt.datetime | None = None) -> bool:
        return self._now_ist(now) >= self.due_at(now)

    def run_after(self, now: dt.datetime | None = None) -> dt.datetime:
        return self.due_at(now).astimezone(dt.timezone.utc)


SCHEDULES: list[Schedule] = [
    Schedule("sales.refresh_overdue", period="daily", at_hour_ist=0, minute=15, grace_minutes=60),
    # SAL-01 FR-5 — `sent → expired` once `valid_until` has passed (tenant date).
    Schedule("sales.expire_estimates", period="daily", at_hour_ist=0, minute=20, grace_minutes=60),
    Schedule(
        "purchases.refresh_overdue", period="daily", at_hour_ist=0, minute=15, grace_minutes=60
    ),
    Schedule("inventory.scan_low_stock", period="daily", at_hour_ist=1, minute=0, grace_minutes=60),
    Schedule("reports.partner_usage", period="daily", at_hour_ist=1, minute=0, grace_minutes=120),
    Schedule("files.gc_orphans", period="daily", at_hour_ist=2, minute=0, grace_minutes=120),
    Schedule(
        "platform.reconcile_entitlements",
        period="daily",
        at_hour_ist=2,
        minute=0,
        grace_minutes=120,
    ),
    Schedule("platform.purge_jobs", period="daily", at_hour_ist=2, minute=30, grace_minutes=120),
    Schedule(
        "platform.purge_rate_limits", period="daily", at_hour_ist=2, minute=35, grace_minutes=120
    ),
    Schedule(
        "platform.check_invariants", period="daily", at_hour_ist=2, minute=45, grace_minutes=60
    ),
    Schedule("parties.recalc_balances", period="daily", at_hour_ist=3, minute=0, grace_minutes=120),
    Schedule("inventory.recalc_stock", period="daily", at_hour_ist=3, minute=10, grace_minutes=120),
    Schedule("reports.expire_exports", period="daily", at_hour_ist=3, minute=15, grace_minutes=120),
    # PLT-10 — BR-1's daily deletion selection and FR-1's export expiry.
    Schedule(
        "platform.execute_tenant_deletions",
        period="daily",
        at_hour_ist=2,
        minute=20,
        grace_minutes=120,
    ),
    Schedule(
        "platform.expire_tenant_exports",
        period="daily",
        at_hour_ist=3,
        minute=20,
        grace_minutes=120,
    ),
    Schedule("ops.check_certificates", period="daily", at_hour_ist=4, minute=0, grace_minutes=180),
    Schedule("ops.verify_backup", period="daily", at_hour_ist=4, minute=15, grace_minutes=180),
    Schedule(
        "ledger.schedule_auto_reminders", period="daily", at_hour_ist=9, minute=0, grace_minutes=30
    ),
    Schedule(
        "platform.purge_notifications",
        period="weekly",
        weekday=6,
        at_hour_ist=3,
        minute=45,
        grace_minutes=240,
    ),
    Schedule("reports.refresh_snapshots", period="hourly", grace_minutes=30),
    Schedule("platform.verify_hostnames", period="hourly", grace_minutes=60),
    Schedule("platform.purge_idempotency_keys", period="hourly", grace_minutes=60),
    Schedule("platform.purge_otp_challenges", period="hourly", grace_minutes=60),
    Schedule("platform.check_expected_runs", period="hourly", grace_minutes=60),
]


# ── A10 ── `register_schedule` (ADR-042, contracts §1.9, FRD 00 PLT-X13) ─────
#
# The literal list above is core's own work. Engines and verticals add theirs
# from `AppConfig.ready()` instead of editing it. A registered schedule is
# appended to `SCHEDULES`, so `enqueue_scheduled`, `check_expected_runs` and
# the double-run proof see it exactly as they see a core entry.
#
# One difference, on purpose: a core entry with no handler is skipped (it names
# work that has not been built yet, Sprint 0's rule), but a REGISTERED one has
# been built by the module that registered it, so a missing handler is a wiring
# defect and `materialise_due_schedules` raises rather than never running it.

_REGISTERED_SCHEDULES: set[str] = set()
_SCHEDULES_BASELINE: tuple[list[Schedule], set[str]] | None = None


def register_schedule(schedule: Schedule) -> None:
    """Add a module's recurring job. Idempotent by `job_type` for an equal
    schedule; a different schedule under a used job type (a core one
    included) raises `ImproperlyConfigured` (EC-1)."""
    existing = next((s for s in SCHEDULES if s.job_type == schedule.job_type), None)
    if existing is not None:
        if existing == schedule:
            return
        raise ImproperlyConfigured(
            f"Schedule {schedule.job_type!r} is already registered with a different period"
        )
    SCHEDULES.append(schedule)
    _REGISTERED_SCHEDULES.add(schedule.job_type)


def _reset_for_tests() -> None:  # pragma: no cover - test helper
    """Back to the start-up list (every `ready()` has run by the first call)."""
    global _SCHEDULES_BASELINE
    if _SCHEDULES_BASELINE is None:
        _SCHEDULES_BASELINE = (list(SCHEDULES), set(_REGISTERED_SCHEDULES))
    SCHEDULES[:] = _SCHEDULES_BASELINE[0]
    _REGISTERED_SCHEDULES.clear()
    _REGISTERED_SCHEDULES.update(_SCHEDULES_BASELINE[1])


def materialise_due_schedules(now: dt.datetime | None = None) -> int:
    """Insert one job row per (schedule, period) that is due and not yet created.

    `scheduled_key` plus its partial unique index make this safe to call from
    every runner on every tick: the second caller's INSERT fails and is swallowed.
    That is the entire distributed-cron implementation.
    """
    unwired = sorted(_REGISTERED_SCHEDULES - set(REGISTRY))
    if unwired:
        raise ImproperlyConfigured(
            f"Registered schedules with no job_handler: {', '.join(unwired)} — "
            f"import the module's tasks in its AppConfig.ready()"
        )
    model = _job_model()
    created = 0
    for schedule in SCHEDULES:
        if schedule.job_type not in REGISTRY:
            continue  # a core entry whose owning work has not been built yet (Sprint 0)
        if not schedule.is_due(now):
            continue
        try:
            with transaction.atomic():
                model.objects.create(
                    job_type=schedule.job_type,
                    payload={},
                    tenant=None,
                    priority=PRIORITY_MAINTENANCE,
                    scheduled_key=schedule.period_key(now),
                    status=JobStatus.QUEUED,
                    run_after=schedule.run_after(now),
                )
            created += 1
        except IntegrityError:
            continue  # already materialised — normal
    return created


# ── The advisory lock around the periodic-enqueue step (rule S2) ─────────────


class advisory_lock:  # noqa: N801 — a context manager spelled like a verb
    """`pg_try_advisory_lock` around `materialise_due_schedules()` and nothing else.

    Rule S2 (Part 20 §20.8.6.1): a runner that does not get the lock skips that
    step and proceeds straight to claiming. It never returns early and never
    waits — the lock must not serialise the queue behind its slowest job.
    """

    def __init__(self, lock_id: int, *, blocking: bool = False) -> None:
        self.lock_id = lock_id
        self.blocking = blocking
        self.held = False

    def __enter__(self) -> bool:
        with connection.cursor() as cursor:
            if self.blocking:
                cursor.execute("SELECT pg_advisory_lock(%s)", [self.lock_id])
                self.held = True
            else:
                cursor.execute("SELECT pg_try_advisory_lock(%s)", [self.lock_id])
                self.held = bool(cursor.fetchone()[0])
        return self.held

    def __exit__(self, *exc: object) -> bool:
        if self.held:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_unlock(%s)", [self.lock_id])
            self.held = False
        return False


HEARTBEAT_KEY = "platform.heartbeat"
HEARTBEAT_EVERY_SECONDS = 30
_last_heartbeat: list[float] = [0.0]


def record_heartbeat(worker: str, *, force: bool = False) -> bool:
    """PLT-14 FR-7 — one row, touched at most every 30 s by any live runner.

    A `platform_job` row rather than a table of its own (the FRD's own choice):
    `scheduled_key` is unique, so every runner updates the same row, and its
    status is `succeeded` so the claim query never sees it. The console's health
    view reads `updated_at` and turns red when it is older than two minutes —
    the "scheduler is stopped" alarm AC-5 asks for, which a queue that happens
    to be empty cannot give.
    """
    import time

    now_mono = time.monotonic()
    if not force and now_mono - _last_heartbeat[0] < HEARTBEAT_EVERY_SECONDS:
        return False
    _last_heartbeat[0] = now_mono
    now = timezone.now()
    model = _job_model()
    updated = model.objects.filter(scheduled_key=HEARTBEAT_KEY).update(
        updated_at=now, finished_at=now, locked_by=worker[:64]
    )
    if not updated:
        try:
            with transaction.atomic():
                model.objects.create(
                    job_type=HEARTBEAT_KEY,
                    payload={},
                    status=JobStatus.SUCCEEDED,
                    run_after=now,
                    finished_at=now,
                    scheduled_key=HEARTBEAT_KEY,
                    locked_by=worker[:64],
                    priority=PRIORITY_MAINTENANCE,
                )
        except IntegrityError:
            pass  # another runner created it first
    return True


def new_worker_id() -> str:
    """`{hostname}:{pid}:{runner_uuid}` — Part 21 §21.3.1 `platform_job.locked_by`."""
    import os
    import socket

    return f"{socket.gethostname()}:{os.getpid()}:{secrets.token_hex(4)}"[:64]
