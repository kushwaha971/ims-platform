"""`register_schedule` (ADR-042, contracts §1.9, FRD 00 PLT-X13, task A10).

Until now `SCHEDULES` was a literal list in `common`, so every engine's daily run
would have been a core edit. The defects prevented: two modules claiming one
job type so one of them never runs (EC-1); a registered schedule whose handler
was never imported, which the literal list tolerates for unbuilt core work and
would silently never run a module's dues (T-PLT-X13-4 — it fails loudly); a
second `ready()` doubling a schedule; and a registration leaking from one test
into the rest of the suite.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.core.exceptions import ImproperlyConfigured

from apps.common import jobs
from apps.common.constants import JobStatus
from apps.common.jobs import REGISTRY, SCHEDULES, Schedule, job_handler, register_schedule

pytestmark = pytest.mark.django_db

PROBE = "tests.a10_daily_probe"
NOW = dt.datetime(2026, 10, 12, 4, 0, tzinfo=dt.UTC)  # 09:30 IST


@pytest.fixture(autouse=True)
def _restore() -> Any:
    jobs._reset_for_tests()
    yield
    jobs._reset_for_tests()
    REGISTRY.pop(PROBE, None)


def _handler() -> None:
    if PROBE not in REGISTRY:
        job_handler(PROBE, requires_tenant=False)(lambda job, ctx: None)


def test_a_registered_schedule_joins_the_list_the_scheduler_reads() -> None:
    schedule = Schedule(PROBE, period="daily", at_hour_ist=9, minute=0)
    register_schedule(schedule)
    assert schedule in SCHEDULES


def test_registration_is_idempotent_by_job_type() -> None:
    schedule = Schedule(PROBE, period="daily", at_hour_ist=9, minute=0)
    register_schedule(schedule)
    register_schedule(Schedule(PROBE, period="daily", at_hour_ist=9, minute=0))
    assert [s.job_type for s in SCHEDULES].count(PROBE) == 1


def test_a_different_schedule_under_a_used_job_type_refuses() -> None:
    """EC-1, including a core literal's job type."""
    register_schedule(Schedule(PROBE, period="daily", at_hour_ist=9))
    with pytest.raises(ImproperlyConfigured):
        register_schedule(Schedule(PROBE, period="hourly"))
    with pytest.raises(ImproperlyConfigured):
        register_schedule(Schedule("sales.refresh_overdue", period="hourly"))


def test_reset_restores_the_start_up_list() -> None:
    before = list(SCHEDULES)
    register_schedule(Schedule(PROBE, period="daily"))
    jobs._reset_for_tests()
    assert before == SCHEDULES


def test_a_registered_schedule_is_materialised_once_per_period() -> None:
    """T-PLT-X13-4: every runner calls this on every tick; one row per day."""
    _handler()
    register_schedule(Schedule(PROBE, period="daily", at_hour_ist=9, minute=0))
    jobs.materialise_due_schedules(now=NOW)
    jobs.materialise_due_schedules(now=NOW + dt.timedelta(minutes=5))
    rows = jobs._job_model().objects.filter(job_type=PROBE)
    assert rows.count() == 1
    assert rows.get().status == JobStatus.QUEUED
    jobs.materialise_due_schedules(now=NOW + dt.timedelta(days=1))
    assert rows.count() == 2


def test_a_registered_schedule_without_a_handler_fails_loudly() -> None:
    """T-PLT-X13-4: the core list tolerates an unbuilt handler (Sprint 0's
    rule); a module that registers a schedule has built it, so a missing
    handler is a wiring defect and must not be skipped in silence."""
    register_schedule(Schedule(PROBE, period="daily", at_hour_ist=0))
    with pytest.raises(ImproperlyConfigured, match=PROBE):
        jobs.materialise_due_schedules(now=NOW)
    assert not jobs._job_model().objects.filter(job_type=PROBE).exists()
