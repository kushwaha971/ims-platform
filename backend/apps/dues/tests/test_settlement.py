"""DUE-03 — settling dues: the split, plan_allocation, payoff, void, BR-8, advances, replay
(T-DUE-03-2, -3, -4, -6, -7; BR-2…BR-8; EC-2).

Dues here are written by `factories.open_due` (one schedule each) or added to that schedule
directly, so each test states exactly the dues it is about; the daily run is exercised where
the rule is the run's (advances).
"""

from __future__ import annotations

import datetime as dt
import random
import uuid
from decimal import Decimal
from io import StringIO
from typing import Any

import pytest
from django.core.management import call_command

from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.common.exceptions import BusinessRuleViolation
from apps.dues.constants import DueStatus
from apps.dues.models import DuesDue, DuesDueComponent, DuesSettlement
from apps.dues.selectors.integrity import due_drift
from apps.dues.services.payment_target import DuesDueTarget, DuesInstalmentTarget
from apps.dues.services.settlement import outstanding, payoff, plan_allocation
from apps.dues.tests.factories import open_due

pytestmark = pytest.mark.django_db
D = Decimal


def _add_due(first: DuesDue, seq: int, day: dt.date, amount: str, parts: dict[str, str]) -> DuesDue:
    due = DuesDue.objects.create(
        tenant=first.tenant,
        schedule=first.schedule,
        module=first.module,
        party=first.party,
        seq=seq,
        period_start=day,
        period_end=day + dt.timedelta(days=30),
        period_label=day.strftime("%b %Y"),
        due_on=day,
        amount=D(amount),
        status=first.status,
    )
    for name, value in parts.items():
        DuesDueComponent.objects.create(tenant=due.tenant, due=due, component=name, amount=D(value))
    return due


def _loan(tenant: Any, party: Any, order: str) -> tuple[DuesDue, DuesDue]:
    """FRD DUE-03 §9's LN-0042: dues 3 and 4 overdue, ₹5,000 + ₹625 each, due 3 a ₹100 fee."""
    today = tenant_today(tenant)
    d3 = open_due(
        tenant,
        party,
        today - dt.timedelta(days=40),
        mode="expectation",
        amount="5725.00",
        components={"principal": "5000.00", "interest": "625.00", "fee": "100.00"},
        allocation_order=order,
        status="overdue",
    )
    d4 = _add_due(
        d3,
        2,
        today - dt.timedelta(days=10),
        "5625.00",
        {"principal": "5000.00", "interest": "625.00"},
    )
    return d3, d4


def _apply_plan(tenant: Any, plan: list[dict], payment_id: Any) -> None:
    target = DuesInstalmentTarget()
    today = tenant_today(tenant)
    for row in plan:
        [locked] = target.lock(tenant=tenant, ids=[row["document_id"]])
        target.apply(
            document=locked,
            amount=D(row["amount"]),
            today=today,
            payment_id=payment_id,
            ctx=Ctx.system(tenant),
        )


def _settled(due: DuesDue, payment_id: Any) -> dict[str, Decimal]:
    return dict(
        DuesSettlement.objects.filter(due=due, payment_id=payment_id).values_list(
            "component", "amount"
        )
    )


# ── T-DUE-03-2: the worked example, all three orders ────────────────────────


@pytest.mark.parametrize(
    "order, d3_amount, d4_amount, d3_split, d4_split",
    [
        (
            "fees_last",
            "5675.00",
            "5625.00",
            {"interest": D("625.00"), "principal": D("5000.00"), "fee": D("50.00")},
            {"interest": D("625.00"), "principal": D("5000.00")},
        ),
        (
            "oldest_first",
            "5725.00",
            "5575.00",
            {"interest": D("625.00"), "principal": D("5000.00"), "fee": D("100.00")},
            {"interest": D("625.00"), "principal": D("4950.00")},
        ),
        (
            "fees_first",
            "5725.00",
            "5575.00",
            {"fee": D("100.00"), "interest": D("625.00"), "principal": D("5000.00")},
            {"interest": D("625.00"), "principal": D("4950.00")},
        ),
    ],
)
def test_the_worked_example_in_every_order(
    tenant: Any,
    party: Any,
    order: str,
    d3_amount: str,
    d4_amount: str,
    d3_split: dict,
    d4_split: dict,
) -> None:
    """T-DUE-03-2 — a collection split in the wrong order moves the same rupees but leaves a
    loan whose interest and fees disagree with the borrower's passbook. The FRD's LN-0042 for
    every order, and `plan_allocation` agreeing with what `apply` writes, component by component."""
    d3, d4 = _loan(tenant, party, order)
    plan = plan_allocation(tenant=tenant, schedule_id=d3.schedule_id, amount="11300.00")

    assert [(r["document_id"], r["amount"]) for r in plan] == [
        (str(d3.id), d3_amount),
        (str(d4.id), d4_amount),
    ]
    payment_id = uuid.uuid4()
    _apply_plan(tenant, plan, payment_id)
    assert _settled(d3, payment_id) == d3_split
    assert _settled(d4, payment_id) == d4_split
    for row in plan:
        written = _settled(DuesDue.objects.get(pk=row["document_id"]), payment_id)
        assert {c["component"]: D(c["amount"]) for c in row["components"]} == written
    d3.refresh_from_db()
    d4.refresh_from_db()
    assert d3.settled_amount + d4.settled_amount == D("11300.00")
    if order == "fees_last":
        assert (d4.status, d3.status) == ("paid", "overdue")
        assert outstanding(d3) == D("50.00")
    assert list(due_drift(tenant_id=tenant.id)) == []


def test_a_remainder_after_every_open_due_is_left_out_of_the_plan(tenant: Any, party: Any) -> None:
    """BR-6 — what no due can take stays on the payment as an advance; a plan that put it on a
    due would over-settle it (and the CHECK would refuse the payment)."""
    d3, d4 = _loan(tenant, party, "oldest_first")
    plan = plan_allocation(tenant=tenant, schedule_id=d3.schedule_id, amount="20000.00")
    assert sum(D(r["amount"]) for r in plan) == D("11350.00")


def test_a_document_schedule_has_no_plan(tenant: Any, party: Any) -> None:
    """EC-3 — a document-mode due is settled through its invoice; planning a payment against
    the due itself would settle it twice."""
    from apps.common.exceptions import ValidationFailed
    from apps.dues.models import DuesSchedule

    due = open_due(tenant, party, tenant_today(tenant))
    DuesSchedule.objects.filter(pk=due.schedule_id).update(posting="document")
    with pytest.raises(ValidationFailed):
        plan_allocation(tenant=tenant, schedule_id=due.schedule_id, amount="100.00")


def test_payoff_counts_only_the_principal_of_dues_not_yet_due(tenant: Any, party: Any) -> None:
    """contracts §2.1 — a payoff quote that charged next year's interest today overstates what
    closes the loan."""
    d3, _ = _loan(tenant, party, "fees_last")
    future = _add_due(
        d3,
        3,
        tenant_today(tenant) + dt.timedelta(days=20),
        "5625.00",
        {"principal": "5000.00", "interest": "625.00"},
    )
    DuesDue.objects.filter(pk=future.pk).update(status=DueStatus.SCHEDULED)
    quote = payoff(tenant=tenant, schedule_id=d3.schedule_id, on=tenant_today(tenant))
    assert quote["principal"] == "15000.00"
    assert quote["interest"] == "1250.00"
    assert quote["fee"] == "100.00"
    assert quote["total"] == "16350.00"


# ── BR-2, T-DUE-03-3: void restores exactly ─────────────────────────────────


def test_a_closed_due_is_not_open(tenant: Any, party: Any) -> None:
    """BR-2 — a paid, skipped or cancelled due takes no money."""
    target = DuesDueTarget()
    for status in ("paid", "skipped", "cancelled"):
        due = open_due(tenant, party, tenant_today(tenant), status=status)
        assert not target.is_open(due)


def test_unapply_restores_every_cache_and_component(tenant: Any, party: Any) -> None:
    """T-DUE-03-3 — a void that left a component's `settled` behind would keep interest marked
    paid that the borrower now owes again."""
    d3, _ = _loan(tenant, party, "fees_last")
    before = {
        "due": DuesDue.objects.filter(pk=d3.pk).values().get(),
        "parts": list(DuesDueComponent.objects.filter(due=d3).order_by("component").values()),
    }
    target = DuesInstalmentTarget()
    payment_id = uuid.uuid4()
    [locked] = target.lock(tenant=tenant, ids=[d3.id])
    target.apply(
        document=locked, amount=D("700.00"), today=tenant_today(tenant), payment_id=payment_id
    )
    [locked] = target.lock(tenant=tenant, ids=[d3.id])
    was, now = target.unapply(
        document=locked, amount=D("700.00"), today=tenant_today(tenant), payment_id=payment_id
    )
    assert (was, now) == ("overdue", "overdue")
    after = {
        "due": DuesDue.objects.filter(pk=d3.pk).values().get(),
        "parts": list(DuesDueComponent.objects.filter(due=d3).order_by("component").values()),
    }
    for row in (before["due"], after["due"]):
        row.pop("updated_at", None)
    for rows in (before["parts"], after["parts"]):
        for row in rows:
            row.pop("updated_at", None)
    assert after == before
    assert not DuesSettlement.objects.filter(payment_id=payment_id).exists()


def test_settling_more_than_is_owed_is_refused(tenant: Any, party: Any) -> None:
    """The CHECK `settled ≤ owed` would fail the whole payment with a 500; the target says it."""
    due = open_due(tenant, party, tenant_today(tenant))
    [locked] = DuesDueTarget().lock(tenant=tenant, ids=[due.id])
    with pytest.raises(BusinessRuleViolation):
        DuesDueTarget().apply(
            document=locked, amount=D("500.01"), today=tenant_today(tenant), payment_id=uuid.uuid4()
        )


# ── Through payments: record, void, BR-8 ────────────────────────────────────


def _pay(tenant: Any, party: Any, due: DuesDue, amount: str, day: dt.date | None = None) -> dict:
    from apps.payments.services.record import record_payment

    payload = {
        "direction": "in",
        "party_id": str(party.id),
        "mode_breakup": [{"mode": "cash", "amount": amount}],
        "allocations": [
            {"document_type": "dues_due", "document_id": str(due.id), "amount": amount}
        ],
    }
    if day is not None:
        payload["payment_date"] = day.isoformat()
    return record_payment(ctx=Ctx.system(tenant), payload=payload)


def test_a_collection_settles_the_due_and_a_void_reopens_it(tenant: Any, party: Any) -> None:
    """T-DUE-03-8's engine half — collect, the due is paid; void the receipt, it reopens as
    late as its dates say (BR-4), and nothing of the payment is left on it."""
    from apps.payments.services.void import void_payment

    today = tenant_today(tenant)
    due = open_due(tenant, party, today - dt.timedelta(days=5), status="overdue")
    result = _pay(tenant, party, due, "500.00")
    due.refresh_from_db()
    assert (due.status, due.settled_amount, due.paid_on) == ("paid", D("500.00"), today)
    void_payment(ctx=Ctx.system(tenant), payment_id=result["payment"].id, reason="Wrong member")
    due.refresh_from_db()
    assert (due.status, due.settled_amount, due.paid_on) == ("overdue", D("0.00"), None)
    assert not DuesSettlement.objects.filter(due=due).exists()


def test_a_voided_payment_exempts_the_days_it_stood(tenant: Any, party: Any) -> None:
    """T-DUE-03-7, BR-8 — the member paid on day 10 and the receipt was voided today; DUE-04's
    penalty must not charge them for the days that receipt said they had paid."""
    from apps.payments.services.void import void_payment

    today = tenant_today(tenant)
    due = open_due(tenant, party, today - dt.timedelta(days=20), grace_days=2, status="overdue")
    result = _pay(tenant, party, due, "500.00", day=today - dt.timedelta(days=10))
    void_payment(ctx=Ctx.system(tenant), payment_id=result["payment"].id, reason="Bounced")
    due.refresh_from_db()
    assert due.penalty_exempt_days == 10


def test_a_partial_void_does_not_exempt_days(tenant: Any, party: Any) -> None:
    """BR-8 is about days a payment said the due was PAID; a part-payment never stopped the
    clock, so voiding it exempts nothing."""
    from apps.payments.services.void import void_payment

    today = tenant_today(tenant)
    due = open_due(tenant, party, today - dt.timedelta(days=20), status="overdue")
    result = _pay(tenant, party, due, "200.00", day=today - dt.timedelta(days=10))
    void_payment(ctx=Ctx.system(tenant), payment_id=result["payment"].id, reason="Bounced")
    due.refresh_from_db()
    assert due.penalty_exempt_days == 0


def test_two_collections_on_the_last_due_never_over_settle(tenant: Any, party: Any) -> None:
    """T-DUE-03-6, sequential form — the second ₹500 for a due that is already paid is an
    advance on the khata, never a second settlement (the CHECK holds)."""
    from apps.payments.services.record import record_payment

    due = open_due(tenant, party, tenant_today(tenant))
    _pay(tenant, party, due, "500.00")
    second = record_payment(
        ctx=Ctx.system(tenant),
        payload={
            "direction": "in",
            "party_id": str(party.id),
            "mode_breakup": [{"mode": "cash", "amount": "500.00"}],
            "allocations": "auto",
        },
    )
    due.refresh_from_db()
    assert due.settled_amount == D("500.00")
    assert second["payment"].unallocated_amount == D("500.00")


# ── DUE-02 step 6: advances (BR-6) ──────────────────────────────────────────


def test_the_run_applies_an_open_advance_to_the_due_it_posts(
    ctx: Any, make_plan: Any, party: Any, today: Any
) -> None:
    """BR-6 — a member who paid ahead must not see this month's due posted beside their
    advance and turn overdue; the run applies the advance to it, through allocate_existing."""
    from apps.dues.services.run import run_for_tenant
    from apps.dues.services.schedules import create_schedule
    from apps.dues.tests.subject import SUBJECT, TEST_MODULE
    from apps.payments.services.record import record_payment

    plan = make_plan()
    schedule = create_schedule(
        ctx=ctx,
        module=TEST_MODULE,
        plan_id=plan.id,
        party_id=party.id,
        subject_type=SUBJECT,
        subject_id=uuid.uuid4(),
        start_on=dt.date(2026, 11, 1),
    ).schedule
    advance = record_payment(
        ctx=ctx,
        payload={
            "direction": "in",
            "party_id": str(party.id),
            "mode_breakup": [{"mode": "cash", "amount": "2000.00"}],
            "allocations": "auto",
        },
    )["payment"]
    report = run_for_tenant(tenant=ctx.tenant, today=dt.date(2026, 11, 1))
    due = DuesDue.objects.get(schedule=schedule, seq=1)
    assert report["advances_applied"] == 1
    assert (due.status, due.settled_amount) == ("paid", D("1200.00"))
    assert DuesSettlement.objects.filter(due=due, payment_id=advance.id).exists()
    # Idempotent: the same day again applies nothing more.
    assert run_for_tenant(tenant=ctx.tenant, today=dt.date(2026, 11, 1))["advances_applied"] == 0


# ── T-DUE-03-4: replay ──────────────────────────────────────────────────────


def test_a_fuzzed_book_of_collections_and_voids_replays(tenant: Any, party: Any) -> None:
    """T-DUE-03-4 (a), (d) — after every step of a seeded run of part-payments, overpayments
    and voids across both targets, `settled_amount` equals its settlement rows, each component
    equals its rows, and `recalc_dues --check` and `recalc_balances --check` exit 0."""
    from apps.payments.services.record import record_payment
    from apps.payments.services.void import void_payment

    rng = random.Random(3)
    today = tenant_today(tenant)
    charge = open_due(tenant, party, today - dt.timedelta(days=9), amount="900.00")
    _add_due(charge, 2, today - dt.timedelta(days=3), "900.00", {})
    d3, d4 = _loan(tenant, party, "fees_last")
    recorded: list[Any] = []
    for step in range(25):
        if recorded and rng.random() < 0.3:
            payment_id = recorded.pop(rng.randrange(len(recorded)))
            void_payment(ctx=Ctx.system(tenant), payment_id=payment_id, reason=f"Fuzz {step}")
        else:
            amount = f"{rng.randint(1, 1200)}.00"
            if rng.random() < 0.5:
                payload = {"allocations": "auto"}
            else:
                plan = plan_allocation(tenant=tenant, schedule_id=d3.schedule_id, amount=amount)
                if not plan:
                    continue
                amount = str(sum(D(r["amount"]) for r in plan))
                payload = {
                    "allocations": [
                        {k: r[k] for k in ("document_type", "document_id", "amount")} for r in plan
                    ]
                }
            result = record_payment(
                ctx=Ctx.system(tenant),
                payload={
                    "direction": "in",
                    "party_id": str(party.id),
                    "mode_breakup": [{"mode": "cash", "amount": amount}],
                    **payload,
                },
            )
            recorded.append(result["payment"].id)
        assert list(due_drift(tenant_id=tenant.id)) == [], f"step {step}"
    out = StringIO()
    call_command("recalc_dues", "--check", f"--tenant={tenant.id}", stdout=out)
    call_command("recalc_balances", "--check", f"--tenant={tenant.id}", stdout=StringIO())
    assert "0 drifted" in out.getvalue()
