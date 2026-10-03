"""T-DUE-02-3 — a run after an outage equals the nightly runs it replaces (ADR-048, seeded property).

Two tenants are given the same plans, schedules and calendar. Tenant A is run every night; tenant
B is not run during a random outage and is run once after it. Then every due (seq, dates, status,
amount, cancel reason), every ledger line (date, type, amount, bucket), every party balance and
every materialised horizon must be identical. Invoice numbers, `created_at` and notes (which carry
the random subject id) are ignored.

The cases are drawn from a fixed seed so a failure is reproducible: the case index and its
parameters are in the assertion message.
"""

from __future__ import annotations

import datetime as dt
import random
import uuid
from typing import Any

import pytest

from apps.common.context import Ctx
from apps.dues.models import DuesDue, DuesSchedule
from apps.dues.services.plans import create_plan
from apps.dues.services.run import run_for_tenant
from apps.dues.services.schedules import create_schedule
from apps.dues.tests.conftest import TODAY
from apps.dues.tests.subject import SUBJECT, TEST_MODULE, entitle
from apps.ledger.models import LedgerEntry
from apps.parties.models import Party
from apps.platform_app.models import ClosedDay
from tests.factories.parties import PartyFactory
from tests.factories.platform import TenantFactory

pytestmark = pytest.mark.django_db

SEED = 20261005
CASES = 6
DAYS = 60  # 6 Oct 2026 … 4 Dec 2026


def _random_plan(rng: random.Random, index: int) -> dict:
    freq = rng.choice(["monthly", "monthly", "weekly", "daily"])
    recurrence: dict[str, Any] = {"freq": freq}
    if freq == "monthly":
        recurrence["by_month_day"] = rng.choice([1, 5, 15, 28, 31, -1])
    elif freq == "weekly":
        recurrence["by_weekday"] = 1 << rng.randrange(7)
    else:
        recurrence["interval"] = rng.randint(2, 9)
    data: dict[str, Any] = {
        "name": f"Plan {index}",
        "mode": "charge",
        "posting": "ledger",
        "recurrence": recurrence,
        "grace_days": rng.choice([0, 0, 3, 10]),
        "closed_day_rule": rng.choice(["ignore", "move", "skip"]),
        "join_policy": rng.choice(["full", "by_days", "next_period"]),
    }
    if rng.random() < 0.4:
        count = rng.randint(2, 8)
        recurrence["count"] = count
        if rng.random() < 0.5:
            data.update(amount_rule="total_split", total=f"{rng.randint(5, 50) * 100}.00")
            data["join_policy"] = "full"
            return data
    data.update(amount_rule="fixed", amount=f"{rng.randint(1, 30) * 50}.00")
    return data


def _case(rng: random.Random) -> dict:
    outage_start = rng.randint(1, DAYS - 10)
    return {
        "plans": [_random_plan(rng, i) for i in range(rng.randint(2, 4))],
        "starts": [rng.randint(0, 40) for _ in range(4)],
        "closed": sorted({rng.randint(0, 120) for _ in range(rng.randint(0, 12))}),
        "outage": (outage_start, min(DAYS, outage_start + rng.randint(2, 20))),
    }


def _build(tenant: Any, case: dict) -> None:
    entitle(tenant, TEST_MODULE)
    ctx = Ctx.system(tenant)
    for offset in case["closed"]:
        ClosedDay.objects.create(
            tenant=tenant, date=TODAY + dt.timedelta(days=offset), reason="Holiday"
        )
    for index, data in enumerate(case["plans"]):
        plan = create_plan(ctx=ctx, module=TEST_MODULE, data=data)
        party = PartyFactory(tenant=tenant, name=f"Member {index}")
        create_schedule(
            ctx=ctx,
            module=TEST_MODULE,
            plan_id=plan.id,
            party_id=party.id,
            subject_type=SUBJECT,
            subject_id=uuid.uuid4(),
            start_on=TODAY + dt.timedelta(days=case["starts"][index]),
        )


def _picture(tenant: Any) -> dict:
    dues = {}
    for schedule in DuesSchedule.objects.filter(tenant=tenant).select_related("plan"):
        dues[schedule.plan.name] = (
            schedule.materialised_until,
            list(
                DuesDue.objects.filter(schedule=schedule)
                .order_by("seq")
                .values_list(
                    "seq", "period_start", "due_on", "status", "amount", "paid_on", "cancel_reason"
                )
            ),
        )
    entries = {}
    for party in Party.objects.filter(tenant=tenant):
        entries[party.name] = (
            party.balance,
            sorted(
                LedgerEntry.objects.filter(party=party).values_list(
                    "entry_date", "entry_type", "amount", "bucket"
                )
            ),
        )
    return {"dues": dues, "entries": entries}


def test_catch_up_equals_day_by_day(dues_subject: Any, today: Any, partner: Any, plan: Any) -> None:
    """T-DUE-02-3 — catch-up drift from on-time results: a missed week that bills on today's
    date, posts a due twice, skips one, or computes a status against the wrong day shows up as a
    difference between the tenant that was run nightly and the tenant that was not."""
    rng = random.Random(SEED)
    for index in range(CASES):
        case = _case(rng)
        nightly = TenantFactory(partner=partner, plan=plan)
        caught_up = TenantFactory(partner=partner, plan=plan)
        _build(nightly, case)
        _build(caught_up, case)
        low, high = case["outage"]
        for day in range(1, DAYS + 1):
            on = TODAY + dt.timedelta(days=day)
            report = run_for_tenant(tenant=nightly, today=on)
            assert report["errors"] == [], (index, case, on)
            if not low <= day < high:
                assert run_for_tenant(tenant=caught_up, today=on)["errors"] == []
        assert _picture(nightly) == _picture(caught_up), (index, case)
        # And the run really did something: every case bills something.
        assert LedgerEntry.objects.filter(tenant=nightly).exists(), (index, case)
