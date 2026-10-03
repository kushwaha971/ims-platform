"""DUE-02 QA round 1 — failing tests for findings (independent QA; see the progress file).

Each test names the defect it exposes. They are written against the FRD and contracts, not
against the implementation, and are expected to FAIL until the finding is fixed.
"""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal
from typing import Any

import pytest

from apps.dues.constants import DueStatus
from apps.dues.models import DuesDue
from apps.dues.services.run import run_for_tenant
from apps.dues.services.schedules import create_schedule
from apps.dues.tests.subject import SUBJECT, TEST_MODULE
from apps.platform_app.models import ClosedDay

pytestmark = pytest.mark.django_db

D = Decimal
NOV1 = dt.date(2026, 11, 1)
LIVE = (DueStatus.SCHEDULED, DueStatus.DUE, DueStatus.OVERDUE, DueStatus.PAID)


def _start(ctx: Any, plan: Any, party: Any, start_on: dt.date = NOV1) -> Any:
    return create_schedule(
        ctx=ctx,
        module=TEST_MODULE,
        plan_id=plan.id,
        party_id=party.id,
        subject_type=SUBJECT,
        subject_id=uuid.uuid4(),
        start_on=start_on,
    ).schedule


def _live(schedule: Any) -> list[tuple]:
    return list(
        DuesDue.objects.filter(schedule=schedule, status__in=LIVE)
        .order_by("seq")
        .values_list("due_on", "amount")
    )


def test_a_closure_re_added_after_being_lifted_replaces_after_the_last_live_due(
    ctx: Any, make_plan: Any, party: Any, today: Any
) -> None:
    """R44 / EC-3 — a six-month plan (Nov–Apr) with January closed bills Nov, Dec, Feb, Mar,
    Apr and a replacement in May. Lifting the closure cancels May; closing January AGAIN must
    give back the same plan — a replacement in May. `_replacements` starts after the LATEST
    `period_start` of every due, cancelled ones included, so the second replacement lands in
    June and the plan has a hole in May that no agreement ever had. Every on/off cycle pushes
    the last instalment one more month out."""
    plan = make_plan(
        closed_day_rule="skip",
        grace_days=30,
        recurrence={"freq": "monthly", "by_month_day": 1, "count": 6},
    )
    schedule = _start(ctx, plan, party)
    jan = dt.date(2027, 1, 1)
    ClosedDay.objects.create(tenant=ctx.tenant, date=jan, reason="Holiday")
    run_for_tenant(tenant=ctx.tenant, today=dt.date(2026, 11, 10))
    first = _live(schedule)
    assert first[-1][0] == dt.date(2027, 5, 1)

    ClosedDay.objects.filter(tenant=ctx.tenant, date=jan).delete()
    run_for_tenant(tenant=ctx.tenant, today=dt.date(2026, 11, 11))
    ClosedDay.objects.create(tenant=ctx.tenant, date=jan, reason="Holiday")
    run_for_tenant(tenant=ctx.tenant, today=dt.date(2026, 11, 12))

    assert _live(schedule) == first
