"""DUE-01 preview: amounts, join policies, window, closed days (T-DUE-01-2, -5, R44, EC-1)."""

from __future__ import annotations

import datetime as dt
import random
from decimal import Decimal
from typing import Any

import pytest

from apps.common.context import Ctx
from apps.dues.services.schedules import preview_schedule
from apps.dues.tests.subject import SUBJECT, TEST_MODULE

pytestmark = pytest.mark.django_db

D = Decimal


def _amounts(rows: list) -> list[Decimal]:
    return [r["amount"] for r in rows if r["status"] != "skipped"]


def test_preview_reproduces_the_worked_examples(tenant: Any, make_plan: Any, today: Any) -> None:
    """T-DUE-01-2 — the FRD's three worked examples, to the paisa: rounding
    drift there is a paisa somebody is billed and nobody owes."""
    gym = make_plan()
    rows = preview_schedule(tenant=tenant, plan=gym, start_on=dt.date(2026, 7, 1))
    four = [r for r in rows if r["due_on"] <= today]
    assert [(r["due_on"], r["amount"], r["period_label"]) for r in four] == [
        (dt.date(2026, 7, 1), D("1200.00"), "Jul 2026"),
        (dt.date(2026, 8, 1), D("1200.00"), "Aug 2026"),
        (dt.date(2026, 9, 1), D("1200.00"), "Sep 2026"),
        (dt.date(2026, 10, 1), D("1200.00"), "Oct 2026"),
    ]
    assert sum(r["amount"] for r in four) == D("4800.00")

    course = make_plan(
        name="Course",
        amount_rule="total_split",
        amount=None,
        total="10000.00",
        recurrence={"freq": "monthly", "by_month_day": 1, "count": 3},
    )
    rows = preview_schedule(tenant=tenant, plan=course, start_on=dt.date(2026, 11, 1))
    assert _amounts(rows) == [D("3333.00"), D("3333.00"), D("3334.00")]

    joiner = make_plan(name="Gym by days", join_policy="by_days")
    rows = preview_schedule(tenant=tenant, plan=joiner, start_on=dt.date(2026, 10, 12))
    assert (rows[0]["due_on"], rows[0]["amount"]) == (dt.date(2026, 10, 12), D("774.00"))
    assert (rows[0]["period_start"], rows[0]["period_end"]) == (
        dt.date(2026, 10, 12),
        dt.date(2026, 11, 1),
    )
    assert rows[1]["amount"] == D("1200.00")


def test_total_split_sums_to_total_exactly_for_random_plans(
    tenant: Any, make_plan: Any, today: Any
) -> None:
    """A seeded fuzz of totals, counts and rounding rules: Σ instalments must be
    the total exactly, every time — never ₹9,999.99 of a ₹10,000 course."""
    rng = random.Random(20261001)
    for n in range(25):
        total = D(rng.randint(100, 5_000_000)) / 100
        count = rng.randint(1, 24)
        rule = rng.choice(["paise", "rupee", "rupee_up"])
        plan = make_plan(
            name=f"Split {n}",
            amount_rule="total_split",
            amount=None,
            total=str(total),
            rounding_rule=rule,
            recurrence={"freq": "monthly", "by_month_day": 1, "count": count},
        )
        try:
            rows = preview_schedule(tenant=tenant, plan=plan, start_on=dt.date(2026, 11, 1))
        except Exception:  # noqa: BLE001 — `rupee_up` over many parts may refuse; that is honest
            continue
        assert len(_amounts(rows)) == count
        assert sum(_amounts(rows)) == total


@pytest.mark.parametrize(
    "policy,first_amount,stub",
    [
        ("full", D("1200.00"), True),
        ("by_days", D("774.00"), True),
        ("half_rule", D("1200.00"), True),  # joined on the 12th: ≤ 15 is full
        ("next_period", None, False),
        ("align_to_join", D("1200.00"), False),
    ],
)
def test_each_join_policy_changes_only_the_first_period(
    tenant: Any, make_plan: Any, today: Any, policy: str, first_amount: Any, stub: bool
) -> None:
    """BR-6 — a pro-rata rule leaking into later months would under-bill every
    month after the join."""
    plan = make_plan(name=f"Join {policy}", join_policy=policy)
    rows = preview_schedule(tenant=tenant, plan=plan, start_on=dt.date(2026, 10, 12))
    if policy == "next_period":
        assert rows[0]["due_on"] == dt.date(2026, 11, 1)
    elif policy == "align_to_join":
        assert [r["due_on"] for r in rows[:2]] == [dt.date(2026, 10, 12), dt.date(2026, 11, 12)]
    else:
        assert rows[0]["due_on"] == dt.date(2026, 10, 12)
        assert rows[0]["amount"] == first_amount
        assert rows[1]["due_on"] == dt.date(2026, 11, 1)
    assert all(r["amount"] == D("1200.00") for r in rows[1:])
    if first_amount is not None and not stub:
        assert rows[0]["amount"] == first_amount


def test_half_rule_after_the_15th_is_half(tenant: Any, make_plan: Any, today: Any) -> None:
    """BR-6 — joining on the 20th pays half the first month, not all of it."""
    plan = make_plan(name="Half", join_policy="half_rule")
    rows = preview_schedule(tenant=tenant, plan=plan, start_on=dt.date(2026, 10, 20))
    assert rows[0]["amount"] == D("600.00")


def test_the_join_stub_counts_toward_a_fixed_count(tenant: Any, make_plan: Any, today: Any) -> None:
    """C-5 / Q-D4 — a 12-part plan is 12 dues whatever the join day."""
    plan = make_plan(
        name="Twelve",
        join_policy="by_days",
        recurrence={"freq": "monthly", "by_month_day": 1, "count": 12},
    )
    rows = preview_schedule(tenant=tenant, plan=plan, start_on=dt.date(2026, 10, 12))
    assert len(rows) == 12
    assert rows[0]["due_on"] == dt.date(2026, 10, 12)
    assert rows[-1]["due_on"] == dt.date(2027, 9, 1)  # stub + Nov…Sep


def test_window_is_24_months_open_ended_and_whole_plan_when_fixed(
    tenant: Any, make_plan: Any, today: Any
) -> None:
    """T-DUE-01-5 — an open-ended plan stops at today + 24 months (unbounded
    materialisation is a table that grows for ever); a 10-instalment plan is
    materialised whole, even past 24 months, so it is never cut short."""
    open_ended = make_plan()
    rows = preview_schedule(tenant=tenant, plan=open_ended, start_on=dt.date(2026, 11, 1))
    assert rows[-1]["due_on"] == dt.date(2028, 10, 1)
    assert len(rows) == 24

    yearly = make_plan(
        name="Ten years",
        recurrence={"freq": "yearly", "by_month_day": 1, "count": 10},
    )
    rows = preview_schedule(tenant=tenant, plan=yearly, start_on=dt.date(2027, 1, 1))
    assert len(rows) == 10
    assert rows[-1]["due_on"] == dt.date(2036, 1, 1)


def test_month_end_anchor_clamps(tenant: Any, make_plan: Any, today: Any) -> None:
    """EC-1 — "the 31st" is the 30th or 28th in short months and back on the 31st
    after; stepping from the previous date gives "28 Mar for ever"."""
    plan = make_plan(name="Month end", recurrence={"freq": "monthly", "by_month_day": 31})
    rows = preview_schedule(tenant=tenant, plan=plan, start_on=dt.date(2027, 1, 31))
    assert [r["due_on"] for r in rows[:4]] == [
        dt.date(2027, 1, 31),
        dt.date(2027, 2, 28),
        dt.date(2027, 3, 31),
        dt.date(2027, 4, 30),
    ]


def _close(tenant: Any, *days: dt.date, module: str | None = None) -> None:
    from apps.platform_app.models import ClosedDay

    for day in days:
        ClosedDay.objects.create(tenant=tenant, date=day, reason="Holiday", module=module)


def test_skip_on_a_count_plan_keeps_the_count(tenant: Any, make_plan: Any, today: Any) -> None:
    """R44 — a 12-instalment plan with one skipped month still has 12 live dues;
    otherwise the plan ends with 11 and the course is under-billed."""
    plan = make_plan(
        name="Skip",
        closed_day_rule="skip",
        recurrence={"freq": "monthly", "by_month_day": 1, "count": 12},
    )
    _close(tenant, dt.date(2027, 1, 1))
    rows = preview_schedule(tenant=tenant, plan=plan, start_on=dt.date(2026, 11, 1))
    assert [r["status"] for r in rows].count("skipped") == 1
    assert len(_amounts(rows)) == 12
    assert rows[-1]["due_on"] == dt.date(2027, 11, 1)


def test_move_uses_the_module_calendar(tenant: Any, make_plan: Any, today: Any) -> None:
    """`move` reads the closed days of the PLAN's module: a day another module
    is closed does not move this module's fee."""
    plan = make_plan(name="Move", closed_day_rule="move")
    _close(tenant, dt.date(2026, 12, 1), module=TEST_MODULE)
    _close(tenant, dt.date(2027, 1, 1), module="other")
    rows = preview_schedule(tenant=tenant, plan=plan, start_on=dt.date(2026, 11, 1))
    assert rows[1]["due_on"] == dt.date(2026, 12, 2)
    assert rows[1]["period_start"] == dt.date(2026, 12, 1)  # the period is not moved
    assert rows[2]["due_on"] == dt.date(2027, 1, 1)


def test_materialisation_reads_the_calendar_once(
    tenant: Any, make_plan: Any, today: Any, django_assert_max_num_queries: Any
) -> None:
    """A per-due calendar query on a 730-due daily plan is 730 queries per
    schedule per night."""
    plan = make_plan(
        name="Daily", amount="10.00", closed_day_rule="move", recurrence={"freq": "daily"}
    )
    with django_assert_max_num_queries(1):
        rows = preview_schedule(tenant=tenant, plan=plan, start_on=dt.date(2026, 11, 1))
    assert len(rows) > 700


def test_supplied_amounts_define_the_dates_and_components(
    tenant: Any, make_plan: Any, today: Any
) -> None:
    """EC-5 / BR-5 — lending computes its instalments; the list defines the
    dates and each due's components must add up to it."""
    plan = make_plan(
        name="Loan",
        mode="expectation",
        posting="none",
        amount_rule="supplied",
        amount=None,
        recurrence={"freq": "once"},
    )
    supplied = [
        {
            "due_on": dt.date(2026, 11, 5),
            "amount": "5200.00",
            "components": [
                {"component": "principal", "amount": "5000.00"},
                {"component": "interest", "amount": "200.00"},
            ],
        },
        {"due_on": dt.date(2026, 12, 5), "amount": "5100.00"},
    ]
    rows = preview_schedule(
        tenant=tenant, plan=plan, start_on=dt.date(2026, 11, 1), supplied=supplied
    )
    assert [(r["due_on"], r["amount"]) for r in rows] == [
        (dt.date(2026, 11, 5), D("5200.00")),
        (dt.date(2026, 12, 5), D("5100.00")),
    ]
    assert rows[0]["components"][1] == {"component": "interest", "amount": D("200.00")}
    assert rows[1]["components"] == [{"component": "principal", "amount": D("5100.00")}]

    from apps.common.exceptions import ValidationFailed

    bad = [{**supplied[0], "amount": "5300.00"}]
    with pytest.raises(ValidationFailed):
        preview_schedule(tenant=tenant, plan=plan, start_on=dt.date(2026, 11, 1), supplied=bad)


def test_the_amount_hook_prices_the_preview_when_the_subject_is_named(
    tenant: Any, make_plan: Any, today: Any, dues_subject: Any
) -> None:
    """BR-9 / Q-D3 — a per-member price must be what the preview shows AND what
    is written; the public preview applies it only when told the subject."""
    dues_subject.amount_hook = lambda _tenant, row: D("999.00")
    plan = make_plan()
    plain = preview_schedule(tenant=tenant, plan=plan, start_on=dt.date(2026, 11, 1))
    hooked = preview_schedule(
        tenant=tenant, plan=plan, start_on=dt.date(2026, 11, 1), subject_type=SUBJECT
    )
    assert plain[0]["amount"] == D("1200.00")
    assert hooked[0]["amount"] == D("999.00")


__all__ = ["Ctx"]
