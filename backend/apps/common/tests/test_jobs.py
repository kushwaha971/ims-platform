"""`platform_job`: enqueue, dedupe, claim under concurrency, reap, backoff.

Tasks S0-33 and S0-34. The concurrency test is `T-CONC-*`: two runners started
concurrently process each job exactly once.
"""

from __future__ import annotations

import datetime as dt
import threading
from typing import Any

import pytest
from django.db import connections
from django.test import TransactionTestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from apps.common.constants import JobStatus
from apps.common.jobs import (
    REGISTRY,
    Schedule,
    backoff_for,
    claim_jobs,
    enqueue,
    job_handler,
    materialise_due_schedules,
    new_worker_id,
    reap_stuck_jobs,
    run_job,
)
from apps.platform_app.models import Job

pytestmark = pytest.mark.django_db


def test_registry_contains_the_platform_handlers() -> None:
    for job_type in (
        "platform.purge_idempotency_keys",
        "platform.purge_jobs",
        "platform.purge_otp_challenges",
        "platform.check_expected_runs",
    ):
        assert job_type in REGISTRY


def test_enqueue_rejects_an_unregistered_job_type(tenant: Any) -> None:
    from django.core.exceptions import ImproperlyConfigured

    with pytest.raises(ImproperlyConfigured):
        enqueue(job_type="nobody.invented_this", payload={}, tenant=tenant)


def test_enqueue_dedupes_on_idempotency_token(tenant: Any, settings: Any) -> None:
    settings.UB_JOBS_EAGER = False
    first = enqueue(
        job_type="platform.purge_jobs",
        payload={},
        tenant=tenant,
        idempotency_token="purge:2026-09-19",
    )
    second = enqueue(
        job_type="platform.purge_jobs",
        payload={},
        tenant=tenant,
        idempotency_token="purge:2026-09-19",
    )
    assert first is not None
    assert second is None  # the dedupe IS the success case (Part 20 §20.8.3)
    assert Job.objects.filter(idempotency_token="purge:2026-09-19").count() == 1


def test_scheduled_key_unique_index_rejects_a_double_schedule(settings: Any) -> None:
    settings.UB_JOBS_EAGER = False
    key = "platform.purge_jobs:2026-09-19"
    assert enqueue(job_type="platform.purge_jobs", payload={}, scheduled_key=key) is not None
    assert enqueue(job_type="platform.purge_jobs", payload={}, scheduled_key=key) is None
    assert Job.objects.filter(scheduled_key=key).count() == 1


def test_materialise_due_schedules_is_idempotent(settings: Any) -> None:
    settings.UB_JOBS_EAGER = False
    first = materialise_due_schedules()
    second = materialise_due_schedules()
    assert first > 0
    assert second == 0  # the second caller's INSERTs all fail and are swallowed


@pytest.mark.postgres
def test_claim_marks_running_and_increments_attempts(tenant: Any, settings: Any) -> None:
    settings.UB_JOBS_EAGER = False
    enqueue(job_type="platform.purge_jobs", payload={}, tenant=tenant)
    worker = new_worker_id()
    claimed = claim_jobs(batch=10, worker=worker)
    assert len(claimed) == 1
    row = Job.objects.get(pk=claimed[0].pk)
    assert row.status == JobStatus.RUNNING
    assert row.attempts == 1
    assert row.locked_by == worker
    assert row.locked_at is not None


@pytest.mark.postgres
def test_claim_skips_jobs_that_are_not_yet_due(tenant: Any, settings: Any) -> None:
    settings.UB_JOBS_EAGER = False
    enqueue(
        job_type="platform.purge_jobs",
        payload={},
        tenant=tenant,
        run_after=timezone.now() + dt.timedelta(hours=1),
    )
    assert claim_jobs(batch=10, worker=new_worker_id()) == []


@pytest.mark.postgres
def test_reaper_returns_a_stuck_job_to_the_queue(tenant: Any, settings: Any) -> None:
    settings.UB_JOBS_EAGER = False
    job = enqueue(job_type="platform.purge_jobs", payload={}, tenant=tenant)
    Job.objects.filter(pk=job.pk).update(
        status=JobStatus.RUNNING,
        attempts=1,
        locked_at=timezone.now() - dt.timedelta(seconds=3600),
        locked_by="dead-runner",
    )
    assert reap_stuck_jobs("me") == 1
    row = Job.objects.get(pk=job.pk)
    assert row.status == JobStatus.QUEUED
    assert row.locked_at is None
    # `attempts` stays at 1: it was incremented at claim, so a job that keeps
    # killing its runner still reaches max_attempts and dead-letters.
    assert row.attempts == 1


@pytest.mark.postgres
def test_the_reaper_issues_one_statement_per_distinct_timeout_not_per_job_type(
    tenant: Any, settings: Any
) -> None:
    """The reaper must scale with the *timeouts*, not with the registry.

    `run_scheduler` calls it at the top of every loop iteration, including the
    tight iterations where the queue is not empty and the loop does not sleep.
    Five registered job types share three distinct visibility timeouts today
    (120 s, 300 s, 600 s); the specification's `SCHEDULES` names twenty types and
    will not name twenty timeouts.
    """
    settings.UB_JOBS_EAGER = False
    distinct_timeouts = {spec.timeout_seconds for spec in REGISTRY.values()}
    assert len(distinct_timeouts) < len(REGISTRY), "fixture assumption: types share timeouts"

    with CaptureQueriesContext(connections["default"]) as captured:
        reap_stuck_jobs("me")
    updates = [
        q for q in captured.captured_queries if q["sql"].lstrip().upper().startswith("UPDATE")
    ]
    assert len(updates) == len(distinct_timeouts), [q["sql"][:120] for q in updates]


@pytest.mark.postgres
def test_the_reaper_still_uses_each_type_own_timeout(tenant: Any, settings: Any) -> None:
    """Grouping must not flatten the per-type timeout into one shared number.

    `platform.reconcile_entitlements` is a 600 s job and `platform.purge_jobs` a
    300 s one; a lock 400 s old is expired for the second and live for the first.
    """
    settings.UB_JOBS_EAGER = False
    locked_at = timezone.now() - dt.timedelta(seconds=400)
    short = enqueue(job_type="platform.purge_jobs", payload={}, tenant=tenant)
    long = enqueue(job_type="platform.reconcile_entitlements", payload={}, tenant=tenant)
    Job.objects.filter(pk__in=[short.pk, long.pk]).update(
        status=JobStatus.RUNNING, attempts=1, locked_at=locked_at, locked_by="dead-runner"
    )

    assert reap_stuck_jobs("me") == 1
    assert Job.objects.get(pk=short.pk).status == JobStatus.QUEUED
    assert Job.objects.get(pk=long.pk).status == JobStatus.RUNNING


def test_backoff_doubles_and_caps_with_jitter() -> None:
    assert 24 <= backoff_for(1).total_seconds() <= 36  # 30 s ± 20 %
    assert 48 <= backoff_for(2).total_seconds() <= 72  # 60 s ± 20 %
    assert 96 <= backoff_for(3).total_seconds() <= 144
    for attempts in range(10, 20):
        assert backoff_for(attempts).total_seconds() <= 3600 * 1.2


def test_unknown_job_type_dead_letters_on_first_claim(tenant: Any, settings: Any) -> None:
    settings.UB_JOBS_EAGER = False
    job = Job.objects.create(
        tenant=tenant,
        job_type="ghost.job",
        payload={},
        status=JobStatus.RUNNING,
        run_after=timezone.now(),
        attempts=1,
    )
    run_job(job, worker="me")
    assert Job.objects.get(pk=job.pk).status == JobStatus.DEAD_LETTER


def test_failure_retries_until_max_attempts_then_dead_letters(tenant: Any, settings: Any) -> None:
    settings.UB_JOBS_EAGER = False

    @job_handler("tests.always_fails", max_attempts=2)
    def _always_fails(job: Any, ctx: Any) -> dict:
        raise RuntimeError("boom")

    try:
        job = enqueue(job_type="tests.always_fails", payload={}, tenant=tenant, max_attempts=2)
        Job.objects.filter(pk=job.pk).update(attempts=1, status=JobStatus.RUNNING)
        run_job(Job.objects.get(pk=job.pk), worker="me")
        assert Job.objects.get(pk=job.pk).status == JobStatus.QUEUED  # retry

        Job.objects.filter(pk=job.pk).update(attempts=2, status=JobStatus.RUNNING)
        run_job(Job.objects.get(pk=job.pk), worker="me")
        row = Job.objects.get(pk=job.pk)
        assert row.status == JobStatus.DEAD_LETTER
        assert "boom" in row.error
    finally:
        REGISTRY.pop("tests.always_fails", None)


def test_permanent_job_error_dead_letters_immediately(tenant: Any, settings: Any) -> None:
    settings.UB_JOBS_EAGER = False
    from apps.common.exceptions import PermanentJobError

    @job_handler("tests.permanent_failure", max_attempts=9)
    def _permanent(job: Any, ctx: Any) -> dict:
        raise PermanentJobError("template does not exist")

    try:
        job = enqueue(job_type="tests.permanent_failure", payload={}, tenant=tenant)
        Job.objects.filter(pk=job.pk).update(attempts=1, status=JobStatus.RUNNING)
        run_job(Job.objects.get(pk=job.pk), worker="me")
        assert Job.objects.get(pk=job.pk).status == JobStatus.DEAD_LETTER
    finally:
        REGISTRY.pop("tests.permanent_failure", None)


def test_schedule_period_keys_are_one_per_period() -> None:
    now = dt.datetime(2026, 9, 19, 14, 30, tzinfo=dt.timezone.utc)
    daily = Schedule("sales.refresh_overdue", period="daily", at_hour_ist=0, minute=15)
    hourly = Schedule("reports.refresh_snapshots", period="hourly")
    assert daily.period_key(now) == "sales.refresh_overdue:2026-09-19"
    assert hourly.period_key(now) == "reports.refresh_snapshots:2026-09-19T20"


class JobClaimConcurrencyTest(TransactionTestCase):
    """T-CONC: two runners started concurrently process each job exactly once.

    `FOR UPDATE SKIP LOCKED` is the whole concurrency story (rule S1). This test
    is the proof: it needs a real transactional database, so it is a
    `TransactionTestCase` rather than a `pytest.mark.django_db` function.
    """

    reset_sequences = True
    databases = {"default"}

    def setUp(self) -> None:
        from tests.factories.platform import JobFactory

        self.jobs = [JobFactory() for _ in range(40)]

    def test_two_runners_claim_disjoint_batches(self) -> None:
        claimed: dict[str, list] = {}
        barrier = threading.Barrier(2)

        def runner(name: str) -> None:
            try:
                barrier.wait(timeout=10)
                rows = claim_jobs(batch=40, worker=f"worker-{name}")
                claimed[name] = [str(job.id) for job in rows]
            finally:
                connections.close_all()

        threads = [threading.Thread(target=runner, args=(name,)) for name in ("a", "b")]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=30)

        all_claimed = claimed.get("a", []) + claimed.get("b", [])
        assert len(all_claimed) == len(set(all_claimed)), "a job was claimed twice"
        assert len(all_claimed) == 40, "not every job was claimed"
        assert Job.objects.filter(status=JobStatus.RUNNING).count() == 40
        assert Job.objects.filter(status=JobStatus.QUEUED).count() == 0
        assert {row.attempts for row in Job.objects.all()} == {1}


@pytest.mark.postgres
def test_the_payload_ceiling_is_enforced_by_the_database(tenant: Any) -> None:
    """Part 21 §21.3.1: `CHECK (pg_column_size(payload) < 65536)`.

    Payloads are ids and scalars only; a 64 KB payload means somebody serialised a
    model into the queue, and the database says no rather than the reviewer.
    """
    from django.db import DataError, IntegrityError, transaction

    with pytest.raises((IntegrityError, DataError)), transaction.atomic():
        Job.objects.create(
            tenant=tenant,
            job_type="platform.purge_jobs",
            payload={"blob": "x" * 70000},
            status=JobStatus.QUEUED,
            run_after=timezone.now(),
        )


@pytest.mark.postgres
def test_attempts_may_not_exceed_max_attempts_plus_one(tenant: Any) -> None:
    from django.db import IntegrityError, transaction

    with pytest.raises(IntegrityError), transaction.atomic():
        Job.objects.create(
            tenant=tenant,
            job_type="platform.purge_jobs",
            payload={},
            status=JobStatus.QUEUED,
            run_after=timezone.now(),
            attempts=7,
            max_attempts=5,
        )
