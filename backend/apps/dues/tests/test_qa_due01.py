"""DUE-01 QA — FAILING tests for the QA findings (QA-DUE-01-n). The developer makes them pass.

Each test names the finding it demonstrates and the rule it holds the code to.
"""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal
from typing import Any

import pytest

from apps.common.exceptions import ValidationFailed
from apps.dues.services.plans import create_plan, update_plan
from apps.dues.services.preview import compute_dues, terms_of_plan
from apps.dues.services.schedules import create_schedule, preview_schedule
from apps.dues.tests.conftest import monthly
from apps.dues.tests.subject import SUBJECT, TEST_MODULE

pytestmark = pytest.mark.django_db

D = Decimal


def test_qa_1_a_split_total_with_a_prorated_join_stub_still_sums_to_the_total(
    tenant: Any, make_plan: Any, today: Any
) -> None:
    """QA-DUE-01-1 (FRD DUE-01 BR-5, T-DUE-01-2 "Σ total_split = total exactly").

    A ₹10,000 course in 3 parts joined on 12 Oct with `by_days`: the stub is
    one of the 3 parts (C-5) and is then prorated, so the course bills
    ₹2,150 + ₹3,333 + ₹3,334 = ₹8,817 — ₹1,183 of an agreed total silently
    dropped. Whatever the join policy, the parts of a split total must add up
    to the total."""
    plan = make_plan(
        name="Course",
        amount_rule="total_split",
        amount=None,
        total="10000.00",
        join_policy="by_days",
        recurrence={"freq": "monthly", "by_month_day": 1, "count": 3},
    )
    rows = preview_schedule(tenant=tenant, plan=plan, start_on=dt.date(2026, 10, 12))
    live = [r["amount"] for r in rows if r["status"] != "skipped"]
    assert sum(live) == D("10000.00"), [(r["due_on"], r["amount"]) for r in rows]


def test_qa_2_a_start_after_the_plans_until_bills_nothing(
    tenant: Any, make_plan: Any, today: Any
) -> None:
    """QA-DUE-01-2 (contracts §1.8 `until` inclusive end; preview.py's own
    docstring "never past `until`").

    A plan "monthly on the 1st until 1 Dec 2026" started on 1 Jan 2027 must not
    produce a due: `_anchored` moves `until` up to the start, so the preview
    (and `create_schedule`) bills ₹1,200 for January, after the plan ended.
    Either no dues or a 400 on `start_on` is acceptable; a due past `until` is
    not."""
    plan = make_plan(
        name="Ends Dec",
        recurrence={"freq": "monthly", "by_month_day": 1, "until": "2026-12-01"},
    )
    try:
        rows = preview_schedule(tenant=tenant, plan=plan, start_on=dt.date(2027, 1, 1))
    except ValidationFailed:
        return
    assert [r for r in rows if r["due_on"] > dt.date(2026, 12, 1)] == []


def test_qa_3_a_truncated_series_does_not_record_a_horizon_past_its_last_due(
    tenant: Any, make_plan: Any, today: Any
) -> None:
    """QA-DUE-01-3 (FRD DUE-01 BR-4, C-9; recurrence.py "a silently truncated
    list is a schedule missing its last dues").

    A daily plan started a year back hits `MAX_DUES = 1000` and stops at
    26 Jun 2028, but `horizon` (persisted as `materialised_until`) says
    5 Oct 2028. DUE-02's extend reads `materialised_until` and resumes AFTER it,
    so 26 Jun – 5 Oct 2028 would never be billed. The horizon must not run past
    what was actually materialised (or the computation must refuse)."""
    plan = make_plan(name="Daily", amount="10.00", recurrence={"freq": "daily"})
    try:
        computed = compute_dues(
            tenant=tenant,
            terms=terms_of_plan(plan),
            start_on=dt.date(2025, 10, 1),
            today=today,
        )
    except Exception:  # noqa: BLE001 — refusing honestly is also a fix
        return
    last = computed.rows[-1]["due_on"]
    assert computed.horizon <= last, (len(computed.rows), last, computed.horizon)


@pytest.mark.parametrize("bad", ["abc", None, 1.5])
def test_qa_4_a_bad_supplied_component_amount_is_a_400_not_a_500(
    tenant: Any, make_plan: Any, today: Any, bad: Any
) -> None:
    """QA-DUE-01-4 (plans.py/preview.py: "every vertical relays this 400";
    FRD BR-5 validates `supplied`).

    `_validate_supplied` guards the row amount but not a component amount:
    `q2(D(comp.get("amount")))` raises `InvalidOperation`/`TypeError`, which the
    exception handler turns into a 500 for lending's request body."""
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
            "amount": "10.00",
            "components": [{"component": "principal", "amount": bad}],
        }
    ]
    with pytest.raises(ValidationFailed):
        preview_schedule(tenant=tenant, plan=plan, start_on=dt.date(2026, 11, 1), supplied=supplied)


@pytest.mark.parametrize(
    "overrides",
    [
        {"amount": "1000000000000.00"},  # numeric(14,2) holds 999,999,999,999.99
        {"penalty_kind": "flat_once", "penalty_value": "1000000"},  # numeric(10,4)
        {
            "amount_rule": "total_split",
            "amount": None,
            "total": "100.00",
            "split_weights": ["100000", "1"],  # numeric(9,4)
            "recurrence": {"freq": "monthly", "by_month_day": 1, "count": 2},
        },
    ],
)
def test_qa_5_out_of_range_plan_numbers_are_a_400_not_a_500(
    ctx: Any, dues_subject: Any, overrides: dict
) -> None:
    """QA-DUE-01-5 (plans.py module docstring: validation lives here so every
    vertical's 400 reads alike).

    A value the column cannot hold reaches `plan.save()` and raises
    `DataError: numeric field overflow` — a 500 instead of a field error."""
    with pytest.raises(ValidationFailed):
        create_plan(ctx=ctx, module=TEST_MODULE, data=monthly(**overrides))


def test_qa_5b_a_non_numeric_version_is_a_400_not_a_500(ctx: Any, make_plan: Any) -> None:
    """QA-DUE-01-5 (same rule): `int(data["version"])` on "x" is a ValueError (500)."""
    plan = make_plan()
    with pytest.raises(ValidationFailed):
        update_plan(ctx=ctx, plan_id=plan.id, data={"version": "x"})


def test_qa_6_posting_a_due_tells_the_subject_its_status_changed(
    ctx: Any, make_plan: Any, party: Any, today: Any, dues_subject: Any
) -> None:
    """QA-DUE-01-6 (contracts §5 listener table: `on_due_changed` is called by
    dues "when a due changes status"; contracts §2.1 registry signature
    `(ctx, due, before, after)`).

    `post_due` moves dues scheduled → overdue / due / paid and never calls the
    subject's `on_due_changed`, so a vertical (gym access, library borrowing
    block) never learns its member is overdue from a confirmed backdated start."""
    create_schedule(
        ctx=ctx,
        module=TEST_MODULE,
        plan_id=make_plan().id,
        party_id=party.id,
        subject_type=SUBJECT,
        subject_id=uuid.uuid4(),
        start_on=dt.date(2026, 9, 1),
        confirm_backdated=True,
    )
    assert len(dues_subject.changes) == 2  # 1 Sep and 1 Oct: scheduled → overdue


# ── QA round 2 (re-check of 4c45da2) ─────────────────────────────────────────


def test_qa_11_a_split_the_rounding_rule_cannot_honour_is_a_400_not_a_500(
    tenant: Any, make_plan: Any, today: Any
) -> None:
    """QA-DUE-01-11 (plans.py/preview.py: every vertical relays this 400).

    ₹1 in 12 parts by `ten_up` is accepted by `create_plan`, then
    `split_total` raises a bare `ValueError` ("leaves the last part negative")
    that `_compute` does not map (it catches only `ScheduleInputError`), so the
    preview and `create_schedule` answer 500. Refuse it as a field error, at
    `create_plan` or here."""
    plan = make_plan(
        name="Tiny",
        amount_rule="total_split",
        amount=None,
        total="1.00",
        rounding_rule="ten_up",
        recurrence={"freq": "monthly", "by_month_day": 1, "count": 12},
    )
    with pytest.raises(ValidationFailed):
        preview_schedule(tenant=tenant, plan=plan, start_on=dt.date(2026, 11, 1))


def test_qa_12_the_cap_never_leaves_past_dues_outside_the_confirmation(
    ctx: Any, make_plan: Any, party: Any, today: Any
) -> None:
    """QA-DUE-01-12 (FRD DUE-01 BR-7: ANY due before today needs confirmation,
    and the 409 shows them all with their total), a regression from the
    QA-DUE-01-3 fix.

    A daily ₹10 plan backdated to 1 Jan 2023 hits the 1,000-due cap on
    26 Sep 2025. The 409 shows 1,000 dues and ₹10,000; the merchant confirms;
    `materialised_until` is now 26 Sep 2025, so DUE-02's first run materialises
    and posts 27 Sep 2025 to today, about 374 more PAST dues (₹3,740), that
    nobody confirmed. When the cap stops the series before today, the start
    must be refused (400), not written short."""
    plan = make_plan(name="Daily", amount="10.00", recurrence={"freq": "daily"})
    with pytest.raises(ValidationFailed):
        create_schedule(
            ctx=ctx,
            module=TEST_MODULE,
            plan_id=plan.id,
            party_id=party.id,
            subject_type=SUBJECT,
            subject_id=uuid.uuid4(),
            start_on=dt.date(2023, 1, 1),
            confirm_backdated=True,
        )


def test_qa_13_a_start_that_leaves_no_due_before_until_is_refused(
    ctx: Any, make_plan: Any, party: Any, today: Any
) -> None:
    """QA-DUE-01-13 (the QA-DUE-01-2 fix's own comment: "refused rather than
    billed or silently left empty"; BR-8 one live schedule per subject).

    A plan "monthly on the 1st until 15 Dec 2026" started on 10 Dec passes the
    new `start > until` check, but has no occurrence in [10 Dec, 15 Dec]
    (with `full` join there is no stub either), so `create_schedule` writes an
    ACTIVE schedule with zero dues. It bills nothing for ever and still holds
    the subject's one live slot, so the vertical cannot start the right plan
    for that member. Refuse it (400 on `start_on`), or write at least one due."""
    plan = make_plan(
        name="Ends mid Dec",
        recurrence={"freq": "monthly", "by_month_day": 1, "until": "2026-12-15"},
    )
    try:
        result = create_schedule(
            ctx=ctx,
            module=TEST_MODULE,
            plan_id=plan.id,
            party_id=party.id,
            subject_type=SUBJECT,
            subject_id=uuid.uuid4(),
            start_on=dt.date(2026, 12, 10),
        )
    except ValidationFailed:
        return
    assert result.dues, "an active schedule with no dues holds the subject's live slot"
