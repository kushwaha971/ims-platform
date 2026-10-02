"""Attendance engine fixtures: the test-only subject (`subject.py`), a clock, groups."""

from __future__ import annotations

import datetime as dt
from typing import Any
from zoneinfo import ZoneInfo

import pytest

from apps.attendance.tests.subject import attendance_subject  # noqa: F401  (fixture)
from apps.attendance.tests.subject import CONTEXT, TEST_MODULE, Clock
from apps.common.context import Ctx
from tests.factories.parties import PartyFactory

IST = ZoneInfo("Asia/Kolkata")
#: Monday 5 Oct 2026, 09:30 IST.
NOW = dt.datetime(2026, 10, 5, 9, 30, tzinfo=IST)
TODAY = NOW.date()


def ist(*args: int) -> dt.datetime:
    return dt.datetime(*args, tzinfo=IST)


@pytest.fixture
def clock(monkeypatch: Any) -> Clock:
    return Clock(monkeypatch, NOW)


@pytest.fixture
def ctx(tenant: Any, attendance_subject: Any) -> Ctx:  # noqa: F811
    return Ctx.system(tenant)


@pytest.fixture
def member(tenant: Any, system_roles: dict) -> Any:
    """An ADMIN of the tenant (holds neither fake codename until granted)."""
    from tests.factories.platform import MembershipFactory, UserFactory

    return MembershipFactory(user=UserFactory(), tenant=tenant, role=system_roles["admin"])


@pytest.fixture
def user_ctx(tenant: Any, member: Any, attendance_subject: Any) -> Ctx:  # noqa: F811
    return Ctx(tenant=tenant, actor=member.user)


@pytest.fixture
def make_party(tenant: Any) -> Any:
    def _make(**kwargs: Any) -> Any:
        return PartyFactory(tenant=tenant, **kwargs)

    return _make


@pytest.fixture
def desk(ctx: Ctx) -> Any:
    """A visit group like gym's "Front desk": dedupe 5 minutes."""
    from apps.attendance.services.groups import create_group

    return create_group(
        ctx=ctx, module=TEST_MODULE, data={"name": "Front desk", "mark_kind": "visit"}
    )


def batch_data(**overrides: Any) -> dict:
    """ "Morning yoga, Mon/Wed/Fri 6 am", 60 minutes, from today."""
    data = {
        "name": "Morning yoga",
        "mark_kind": "presence",
        "recurrence": {"freq": "weekly", "by_weekday": [0, 2, 4], "anchor": TODAY.isoformat()},
        "session_start": "06:00",
        "session_minutes": 60,
    }
    data.update(overrides)
    return data


@pytest.fixture
def batch(ctx: Ctx, clock: Any) -> Any:
    from apps.attendance.services.groups import create_group

    return create_group(ctx=ctx, module=TEST_MODULE, data=batch_data())


def visit(ctx: Ctx, party: Any, **kwargs: Any) -> Any:
    from apps.attendance.services.marks import check_in

    kwargs.setdefault("context_id", None)
    return check_in(ctx=ctx, module=TEST_MODULE, party_id=party.id, context_type=CONTEXT, **kwargs)
