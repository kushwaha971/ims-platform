"""`run_scheduler` drains and the eager mode runs inline (tasks S0-34, §20.8.10)."""

from __future__ import annotations

import logging
from io import StringIO
from typing import Any

import pytest
from django.core.management import call_command

from apps.common.constants import JobStatus
from apps.common.jobs import REGISTRY, advisory_lock, enqueue, job_handler
from apps.platform_app.models import Job

pytestmark = pytest.mark.django_db


def test_drain_mode_runs_the_queue_and_exits(tenant: Any, settings: Any) -> None:
    settings.UB_JOBS_EAGER = False
    enqueue(job_type="platform.purge_idempotency_keys", payload={})
    call_command("run_scheduler", "--interval", "0", "--batch", "10", stdout=StringIO())
    assert (
        Job.objects.filter(job_type="platform.purge_idempotency_keys")
        .exclude(status=JobStatus.SUCCEEDED)
        .count()
        == 0
    )


def test_the_first_tick_survives_info_logging_when_schedules_materialise(settings: Any) -> None:
    """A fresh database has every schedule due, so the first tick materialises.

    The runner logged that with `extra={"created": n}`, and `created` is a
    reserved `LogRecord` attribute: with `ub.jobs` at INFO (local settings),
    `makeRecord` raised KeyError and the scheduler died on its first tick, so
    no job ever ran. The test suite logs at WARNING, which is why every other
    test here passed straight through it; this one sets INFO.
    """
    settings.UB_JOBS_EAGER = False
    jobs_logger = logging.getLogger("ub.jobs")  # does not propagate, so caplog is blind
    seen: list[logging.LogRecord] = []
    handler = logging.Handler(level=logging.INFO)
    handler.emit = seen.append  # type: ignore[method-assign]
    previous = jobs_logger.level
    jobs_logger.addHandler(handler)
    jobs_logger.setLevel(logging.INFO)
    try:
        call_command("run_scheduler", "--interval", "0", "--batch", "1", stdout=StringIO())
    finally:
        jobs_logger.removeHandler(handler)
        jobs_logger.setLevel(previous)
    assert any(r.getMessage() == "scheduler.materialised" for r in seen)
    assert Job.objects.exclude(scheduled_key=None).exists()


def test_eager_mode_executes_the_handler_after_commit(
    tenant: Any, settings: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """`UB_JOBS_EAGER=1` is how a test asserts job side effects without a loop.

    It runs the handler through `transaction.on_commit`, exactly as the real
    runner only ever sees committed rows — so the assertion runs the captured
    callbacks rather than pretending the enqueue was synchronous.
    """
    settings.UB_JOBS_EAGER = True
    calls: list[str] = []

    @job_handler("tests.eager_probe")
    def _probe(job: Any, ctx: Any) -> dict:
        calls.append(str(job.id))
        return {"ok": True}

    try:
        with django_capture_on_commit_callbacks(execute=True):
            job = enqueue(job_type="tests.eager_probe", payload={}, tenant=tenant)
        assert calls == [str(job.id)]
        assert Job.objects.get(pk=job.pk).status == JobStatus.SUCCEEDED
    finally:
        REGISTRY.pop("tests.eager_probe", None)


def test_the_result_of_a_handler_is_stored_for_observability(
    tenant: Any, settings: Any, django_capture_on_commit_callbacks: Any
) -> None:
    settings.UB_JOBS_EAGER = True

    @job_handler("tests.returns_a_summary")
    def _summary(job: Any, ctx: Any) -> dict:
        return {"rows": 3}

    try:
        with django_capture_on_commit_callbacks(execute=True):
            job = enqueue(job_type="tests.returns_a_summary", payload={}, tenant=tenant)
        assert Job.objects.get(pk=job.pk).result == {"rows": 3}
    finally:
        REGISTRY.pop("tests.returns_a_summary", None)


def test_the_handler_receives_a_system_context_for_its_tenant(
    tenant: Any, settings: Any, django_capture_on_commit_callbacks: Any
) -> None:
    settings.UB_JOBS_EAGER = True
    seen: dict = {}

    @job_handler("tests.records_its_ctx")
    def _record(job: Any, ctx: Any) -> None:
        seen["tenant"] = ctx.tenant
        seen["actor_type"] = ctx.actor_type

    try:
        with django_capture_on_commit_callbacks(execute=True):
            enqueue(job_type="tests.records_its_ctx", payload={}, tenant=tenant)
        assert seen["tenant"] == tenant
        assert seen["actor_type"] == "system"
    finally:
        REGISTRY.pop("tests.records_its_ctx", None)


@pytest.mark.postgres
def test_the_advisory_lock_is_non_blocking_and_released(settings: Any) -> None:
    """Rule S2: a runner that does not get the lock must not wait."""
    lock_id = settings.UB_SCHEDULER_ENQUEUE_LOCK_ID
    with advisory_lock(lock_id, blocking=False) as held:
        assert held is True
    with advisory_lock(lock_id, blocking=False) as held_again:
        assert held_again is True  # released on exit


def test_enqueue_scheduled_command_is_idempotent(settings: Any) -> None:
    settings.UB_JOBS_EAGER = False
    out = StringIO()
    call_command("enqueue_scheduled", "--period", "all", stdout=out)
    first = Job.objects.exclude(scheduled_key=None).count()
    call_command("enqueue_scheduled", "--period", "all", stdout=out)
    assert Job.objects.exclude(scheduled_key=None).count() == first


def test_scheduler_health_reports_a_wedged_queue(tenant: Any, settings: Any) -> None:
    """A scheduler process that is alive but not draining is the failure this catches."""
    import datetime as dt

    from django.utils import timezone

    settings.UB_JOBS_EAGER = False
    job = enqueue(job_type="platform.purge_jobs", payload={}, tenant=tenant)
    Job.objects.filter(pk=job.pk).update(run_after=timezone.now() - dt.timedelta(hours=1))

    with pytest.raises(SystemExit) as exc:
        call_command("scheduler_health", "--max-age", "300", stdout=StringIO(), stderr=StringIO())
    assert exc.value.code == 1


def test_scheduler_health_is_ok_on_an_empty_queue() -> None:
    out = StringIO()
    call_command("scheduler_health", "--max-age", "300", stdout=out)
    assert out.getvalue().strip() == "ok"
