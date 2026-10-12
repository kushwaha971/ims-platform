"""DUE-02 — the run under contention and at size (T-DUE-02-6, -7, -9).

* T-DUE-02-6: the run and a payment on the same party at once, twenty times — no deadlock,
  because both start at the party; the cached balance equals the replay of the ledger.
* T-DUE-02-7: step 2's query reads `ix_dues_due_status`, asserted on `EXPLAIN` (the
  `tests/performance/test_party_list_plans.py` pattern: a plan that scans every due each night
  returns the same rows as one that walks the index, so only the plan can tell them apart).
* T-DUE-02-9: 5,000 schedules and 60,000 dues run in under a minute.
"""

from __future__ import annotations

import datetime as dt
import threading
import time
import uuid
from decimal import Decimal
from typing import Any

import pytest
from django.db import close_old_connections, connection

from apps.common.context import Ctx
from apps.dues.constants import DueStatus
from apps.dues.models import DuesDue, DuesSchedule
from apps.dues.services.run import postable_dues, run_for_tenant
from apps.dues.services.schedules import create_schedule
from apps.dues.tests.subject import SUBJECT, TEST_MODULE
from apps.parties.models import Party
from tests.factories.parties import PartyFactory

D = Decimal


def _start(ctx: Any, plan: Any, party: Any, start_on: dt.date) -> Any:
    return create_schedule(
        ctx=ctx,
        module=TEST_MODULE,
        plan_id=plan.id,
        party_id=party.id,
        subject_type=SUBJECT,
        subject_id=uuid.uuid4(),
        start_on=start_on,
    ).schedule


@pytest.mark.concurrency
@pytest.mark.django_db(transaction=True)
def test_run_and_payment_on_one_party_do_not_deadlock(ctx: Any, make_plan: Any, today: Any) -> None:
    """T-DUE-02-6 — a run that locked the schedule before the party would deadlock with a
    payment (party → documents) on the same member, answering one of them with a 500. Twenty
    races, each posting one daily due while ₹10 is received: every call succeeds and the cached
    balance is exactly the ledger's replay."""
    from apps.ledger.services.integrity import check_balances
    from apps.payments.services.record import record_payment

    party = PartyFactory(tenant=ctx.tenant)
    plan = make_plan(name="Daily", amount="100.00", recurrence={"freq": "daily"})
    _start(ctx, plan, party, today + dt.timedelta(days=1))
    races = 20

    for index in range(1, races + 1):
        barrier = threading.Barrier(2)
        outcomes: dict[str, Any] = {}

        def run_day(day: dt.date = today + dt.timedelta(days=index)) -> Any:
            return run_for_tenant(tenant=ctx.tenant, today=day)

        def receive() -> Any:
            return record_payment(
                ctx=Ctx.system(ctx.tenant),
                payload={
                    "direction": "in",
                    "party_id": str(party.id),
                    "mode_breakup": [{"mode": "cash", "amount": "10.00"}],
                    "allocations": "none",
                },
            )

        def go(name: str, call: Any) -> None:
            try:
                barrier.wait(timeout=10)
                outcomes[name] = call()
            except Exception as exc:  # pragma: no cover - reported below
                outcomes[name] = exc
            finally:
                close_old_connections()
                connection.close()

        threads = [
            threading.Thread(target=go, args=("run", run_day)),
            threading.Thread(target=go, args=("pay", receive)),
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=60)
        assert not any(t.is_alive() for t in threads), f"race {index} hung"
        assert not isinstance(outcomes["pay"], Exception), (index, outcomes["pay"])
        assert not isinstance(outcomes["run"], Exception), (index, outcomes["run"])
        assert outcomes["run"]["errors"] == [], (index, outcomes["run"])
        assert outcomes["run"]["posted"] == 1, (index, outcomes["run"])

    party.refresh_from_db()
    assert party.shop_balance == D("100.00") * races - D("10.00") * races
    assert check_balances(tenant_id=ctx.tenant.id)["ok"] is True


def _bulk_book(tenant: Any, plan: Any, *, schedules: int, dues_each: int, today: dt.date) -> None:
    """`schedules` monthly schedules of `dues_each` dues, written directly: the first due of
    each is dated `today`, the rest are already paid or still to come."""
    parties = Party.objects.bulk_create(
        [Party(tenant=tenant, name=f"Member {i:05d}") for i in range(schedules)]
    )
    rule = plan.recurrence
    rows = []
    for party in parties:
        row = DuesSchedule(
            tenant=tenant,
            module=TEST_MODULE,
            plan=plan,
            party=party,
            mode=plan.mode,
            posting=plan.posting,
            amount=plan.amount,
            grace_days=0,
            terms={"amount_rule": "fixed"},
            subject_type=SUBJECT,
            subject_id=uuid.uuid4(),
            start_on=today,
            materialised_until=today + dt.timedelta(days=31 * dues_each),
        )
        row.set_recurrence(rule)
        row.anchor, row.count = today, dues_each
        rows.append(row)
    DuesSchedule.objects.bulk_create(rows, batch_size=1000)
    dues = []
    for schedule in rows:
        for seq in range(1, dues_each + 1):
            due_on = today + dt.timedelta(days=31 * (seq - 1))
            dues.append(
                DuesDue(
                    tenant=tenant,
                    schedule=schedule,
                    module=TEST_MODULE,
                    party_id=schedule.party_id,
                    seq=seq,
                    period_start=due_on,
                    period_end=due_on + dt.timedelta(days=31),
                    period_label=f"P{seq}",
                    due_on=due_on,
                    amount=D("500.00"),
                    status=DueStatus.SCHEDULED,
                )
            )
    DuesDue.objects.bulk_create(dues, batch_size=5000)


@pytest.mark.slow
@pytest.mark.postgres
@pytest.mark.django_db
def test_step_two_query_uses_ix_dues_due_status(ctx: Any, make_plan: Any, today: Any) -> None:
    """T-DUE-02-7 — a sequential scan of every due every night grows with the whole history of
    the book. On 24,000 dues, of which 2,000 are postable today, the planner must reach them
    through `(tenant, status, due_on)`."""
    plan = make_plan(recurrence={"freq": "monthly", "by_month_day": 1, "count": 12})
    _bulk_book(ctx.tenant, plan, schedules=2000, dues_each=12, today=today)
    with connection.cursor() as cursor:
        cursor.execute("ANALYZE dues_due")
    sql, params = postable_dues(ctx.tenant, today).values("id").query.sql_with_params()
    with connection.cursor() as cursor:
        cursor.execute(f"EXPLAIN {sql}", params)
        plan_text = "\n".join(row[0] for row in cursor.fetchall())
    assert "ix_dues_due_status" in plan_text, plan_text
    assert "Seq Scan on dues_due" not in plan_text, plan_text


@pytest.mark.slow
@pytest.mark.postgres
@pytest.mark.django_db
def test_five_thousand_schedules_run_under_a_minute(ctx: Any, make_plan: Any, today: Any) -> None:
    """T-DUE-02-9 — a run that cannot finish in its night stops being a nightly run. 5,000
    schedules and 60,000 dues; 5,000 of them post today. One tenant's run must take < 60 s."""
    plan = make_plan(recurrence={"freq": "monthly", "by_month_day": 5, "count": 12})
    _bulk_book(ctx.tenant, plan, schedules=5000, dues_each=12, today=today)
    started = time.monotonic()
    report = run_for_tenant(tenant=ctx.tenant, today=today)
    elapsed = time.monotonic() - started
    assert report["errors"] == []
    assert report["posted"] == 5000
    assert elapsed < 60, f"{elapsed:.1f} s"
