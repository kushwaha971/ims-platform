"""DUE-02 — document posting through the port and the `dues_due` origin listener (contracts §1.5,
§2.1 "Modes and postings"; FRD DUE-02 step 2, EC-1, EC-2; C-2, C-13).

This module is the `dues_due` row of `tests/contracts/test_document_port.py::FACTORIES`: every
clause that suite holds an origin listener to — `check_void`, `on_void` inside the void's
transaction, `on_settlement_changed` after each move of the invoice — is proven here against the
real listener with a real sales document.
"""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal
from typing import Any

import pytest

from apps.common.seams import documents as port
from apps.dues.constants import SOURCE_DUE, DueStatus
from apps.dues.models import DuesDue
from apps.dues.services.run import run_for_tenant
from apps.dues.services.schedules import create_schedule
from apps.dues.tests.subject import SUBJECT, TEST_MODULE, entitle
from apps.ledger.models import LedgerEntry
from apps.sales.tests.conftest import reference, shop  # noqa: F401  (fixtures)
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db

D = Decimal
NOV1 = dt.date(2026, 11, 1)


@pytest.fixture(autouse=True)
def clock(monkeypatch: Any, today: Any) -> Any:
    """Sales refuses a document dated after ITS today, which is the real clock. The run is
    called for dates after the FRD's 5 Oct 2026, so the wall clock is moved with it — every
    module that asks `timezone.now()` sees the day the run is for."""
    from django.utils import timezone

    def _set(day: dt.date) -> None:
        moment = dt.datetime.combine(day, dt.time(6, 30), tzinfo=dt.timezone.utc)
        monkeypatch.setattr(timezone, "now", lambda: moment)

    _set(today)
    return _set


def _run(ctx: Any, clock: Any, day: dt.date) -> Any:
    clock(day)
    return run_for_tenant(tenant=ctx.tenant, today=day)


@pytest.fixture
def member(shop: Any) -> Any:  # noqa: F811
    """A customer of the GST shop with a tiny credit limit the dues invoice will cross."""
    return PartyFactory(tenant=shop, credit_limit=D("100.00"))


@pytest.fixture
def doc_plan(make_plan: Any, shop: Any) -> Any:  # noqa: F811
    """₹1,000 a month plus 18% GST (GST18, SAC 999723), invoiced through sales."""

    def _make(**overrides: Any) -> Any:
        data = {
            "name": "Gym GST",
            "posting": "document",
            "tax_code": "GST18",
            "hsn_sac": "999723",
            "tax_inclusive": False,
            "amount": "1000.00",
        }
        data.update(overrides)
        return make_plan(**data)

    return _make


def _start(ctx: Any, plan: Any, party: Any, start_on: dt.date = NOV1, **kwargs: Any) -> Any:
    return create_schedule(
        ctx=ctx,
        module=TEST_MODULE,
        plan_id=plan.id,
        party_id=party.id,
        subject_type=SUBJECT,
        subject_id=uuid.uuid4(),
        start_on=start_on,
        **kwargs,
    ).schedule


def _document(due: Any) -> Any:
    from apps.sales.models import SalesDocument

    return SalesDocument.objects.get(pk=due.document_id)


def test_document_due_issues_through_the_port_with_skip_and_own_date(
    clock: Any, ctx: Any, doc_plan: Any, member: Any, today: Any
) -> None:
    """A dues invoice dated the day the run happened to execute would misdate the tax period,
    and one refused by the customer's credit limit would leave an agreed fee unbilled (ADR-048):
    the invoice is dated the due's date, issued with `credit_check="skip"`, stamped with the
    origin, and the due takes the invoice's grand total."""
    schedule = _start(ctx, doc_plan(), member)
    report = _run(ctx, clock, dt.date(2026, 11, 3))
    assert report["posted"] == 1 and report["errors"] == []
    due = DuesDue.objects.get(schedule=schedule, seq=1)
    document = _document(due)
    assert document.document_date == NOV1
    assert (document.origin_type, str(document.origin_id), document.origin_module) == (
        SOURCE_DUE,
        str(due.id),
        "dues",
    )
    assert document.grand_total == D("1180.00")
    assert (due.amount, due.status, due.posted_entry_id) == (D("1180.00"), DueStatus.OVERDUE, None)
    [line] = list(document.lines.all())
    assert line.description.endswith("· Nov 2026")
    assert line.hsn_sac == "999723"
    entry = LedgerEntry.objects.get(source_type="sales_document", source_id=document.id)
    assert (entry.entry_date, entry.amount) == (NOV1, D("1180.00"))
    member.refresh_from_db()
    assert member.balance == D("1180.00")  # past its ₹100 limit, and billed all the same


def test_retry_after_a_crash_mid_document_returns_the_standing_invoice(
    clock: Any, ctx: Any, doc_plan: Any, member: Any, today: Any
) -> None:
    """Two invoices for one month's fee is a double charge on a tax document. If an invoice for
    the due already stands (an earlier attempt that issued and then lost its status update), the
    run takes it — the port answers per origin — and issues nothing new."""
    from apps.sales.models import SalesDocument

    schedule = _start(ctx, doc_plan(), member)
    due = DuesDue.objects.get(schedule=schedule, seq=1)
    clock(NOV1)
    standing = port.issue_document(
        ctx=ctx,
        request={
            "origin_type": SOURCE_DUE,
            "origin_id": due.id,
            "party_id": member.id,
            "document_date": NOV1,
            "lines": [
                {
                    "description": "Nov",
                    "qty": D("1"),
                    "unit_price": D("1000.00"),
                    "tax_code": "GST18",
                }
            ],
            "credit_check": "skip",
        },
    )
    _run(ctx, clock, NOV1)
    due.refresh_from_db()
    assert str(due.document_id) == str(standing["document_id"])
    assert SalesDocument.objects.filter(origin_type=SOURCE_DUE, origin_id=due.id).count() == 1


def test_heads_become_the_invoice_lines(
    clock: Any, ctx: Any, doc_plan: Any, member: Any, today: Any
) -> None:
    """R16 — a plan's named parts ("Tuition ₹800 + Locker ₹200") are what the customer's invoice
    lists; one lump line would hide what they are paying for."""
    plan = doc_plan(
        heads=[{"label": "Tuition", "amount": "800.00"}, {"label": "Locker", "amount": "200.00"}]
    )
    schedule = _start(ctx, plan, member)
    _run(ctx, clock, NOV1)
    document = _document(DuesDue.objects.get(schedule=schedule, seq=1))
    lines = sorted(document.lines.values_list("description", "unit_price"))
    assert [d.split(" · ")[-1] for d, _ in lines] == ["Locker", "Tuition"]
    assert sorted(p for _, p in lines) == [D("200.00"), D("800.00")]


def test_an_open_advance_pays_the_invoice_as_it_is_issued(
    clock: Any, ctx: Any, doc_plan: Any, member: Any, today: Any
) -> None:
    """`apply_open_advances` from the snapshot: money the member paid ahead settles the fee on
    its date, and the due says `paid` — not `due` with the money sitting unapplied."""
    from apps.payments.services.record import record_payment

    record_payment(
        ctx=ctx,
        payload={
            "direction": "in",
            "party_id": str(member.id),
            "mode_breakup": [{"mode": "cash", "amount": "2000.00"}],
            "allocations": "none",
        },
    )
    schedule = _start(ctx, doc_plan(), member)
    _run(ctx, clock, NOV1)
    due = DuesDue.objects.get(schedule=schedule, seq=1)
    assert (due.status, due.settled_amount, due.paid_on) == (DueStatus.PAID, D("1180.00"), NOV1)
    assert _document(due).amount_due == D("0.00")


# ── the listener (the contract clauses) ─────────────────────────────────────


def test_dues_due_origin_is_registered_under_contract() -> None:
    """A registered origin must have a contract factory row, or the shared suite fails; and it
    is registered with module "dues" (C-2 / Q-D1)."""
    from tests.contracts.test_document_port import FACTORIES

    origin = port.origin_for(SOURCE_DUE)
    assert origin is not None and origin.module == "dues"
    assert SOURCE_DUE in FACTORIES
    assert port.check_void(tenant=None, origin_type=SOURCE_DUE, origin_id=uuid.uuid4()) == {
        "block": None,
        "confirm": None,
    }


def test_voiding_the_invoice_cancels_the_due_inside_the_void(
    clock: Any, ctx: Any, doc_plan: Any, member: Any, today: Any, dues_subject: Any
) -> None:
    """An invoice voided while its due stays `due` would bill the member twice the next time a
    payment is matched (once on the due, nothing on the invoice). The void cancels the due in
    the same transaction, with the merchant's reason, and the subject hears of it."""
    from apps.sales.services.void import void_invoice

    schedule = _start(ctx, doc_plan(), member)
    _run(ctx, clock, NOV1)
    due = DuesDue.objects.get(schedule=schedule, seq=1)
    void_invoice(ctx=ctx, document_id=due.document_id, reason="Billed the wrong member")
    due.refresh_from_db()
    assert due.status == DueStatus.CANCELLED
    assert due.cancel_reason == "Invoice voided: Billed the wrong member"
    assert (due.id, DueStatus.DUE, DueStatus.CANCELLED) in dues_subject.changes
    # The run never re-bills a cancelled due.
    assert _run(ctx, clock, dt.date(2026, 11, 2))["posted"] == 0


def test_a_raising_listener_rolls_the_void_back(
    clock: Any, ctx: Any, doc_plan: Any, member: Any, today: Any, dues_subject: Any
) -> None:
    """The listener runs inside sales' void: if the subject refuses (raises), the invoice stays
    issued and the due stays `due` — neither half commits alone."""
    from django.db import transaction

    from apps.sales.services.void import void_invoice

    schedule = _start(ctx, doc_plan(), member)
    _run(ctx, clock, NOV1)
    due = DuesDue.objects.get(schedule=schedule, seq=1)

    def refuse(*_args: Any) -> None:
        raise RuntimeError("the membership refuses")

    from apps.dues import registry

    subject = registry.subject_for(SUBJECT)
    registry._SUBJECTS[SUBJECT] = type(subject)(**{**subject.__dict__, "on_due_changed": refuse})
    with pytest.raises(RuntimeError), transaction.atomic():
        void_invoice(ctx=ctx, document_id=due.document_id, reason="Wrong")
    due.refresh_from_db()
    assert due.status == DueStatus.DUE
    assert _document(due).status != "void"


def test_payments_move_the_due_with_the_invoice(
    clock: Any, ctx: Any, doc_plan: Any, member: Any, today: Any, monkeypatch: Any
) -> None:
    """`on_settlement_changed` after every move: a part payment settles part of the due, the
    rest pays it, and voiding that payment puts the due back to owed. A due that said `paid`
    while its invoice was owed again would drop out of every collection list."""
    from apps.dues import origins
    from apps.payments.services.record import record_payment
    from apps.payments.services.void import void_payment

    reading = {"day": NOV1}
    monkeypatch.setattr(origins, "tenant_today", lambda _t, **_k: reading["day"])
    schedule = _start(ctx, doc_plan(), member)
    _run(ctx, clock, NOV1)
    due = DuesDue.objects.get(schedule=schedule, seq=1)

    def pay(amount: str) -> Any:
        return record_payment(
            ctx=ctx,
            payload={
                "direction": "in",
                "party_id": str(member.id),
                "mode_breakup": [{"mode": "cash", "amount": amount}],
                "allocations": [
                    {
                        "document_type": "sales_document",
                        "document_id": str(due.document_id),
                        "amount": amount,
                    }
                ],
            },
        )

    pay("180.00")
    due.refresh_from_db()
    assert (due.settled_amount, due.status) == (D("180.00"), DueStatus.DUE)
    reading["day"] = dt.date(2026, 11, 2)
    rest = pay("1000.00")
    due.refresh_from_db()
    assert (due.settled_amount, due.status, due.paid_on) == (
        D("1180.00"),
        DueStatus.PAID,
        dt.date(2026, 11, 2),
    )
    payment = rest["payment"] if isinstance(rest, dict) else rest
    void_payment(ctx=ctx, payment_id=payment.id, reason="Bounced")
    due.refresh_from_db()
    # Back to owed — and late by now: 1 Nov with no grace, read on 2 Nov.
    assert (due.settled_amount, due.status, due.paid_on) == (
        D("180.00"),
        DueStatus.OVERDUE,
        None,
    )


def test_the_origin_labels_name_the_subject_and_period(
    ctx: Any, doc_plan: Any, member: Any, today: Any
) -> None:
    """A register filtered by origin reads "Subject · Nov 2026", not a bare module name."""
    schedule = _start(ctx, doc_plan(), member)
    due = DuesDue.objects.get(schedule=schedule, seq=1)
    labels = port.origin_for(SOURCE_DUE).listener.labels(tenant=ctx.tenant, ids={due.id})
    assert labels[due.id].endswith("· Nov 2026") and labels[due.id].startswith("Subject ")


# ── refusals become errors, not stopped runs (EC-1, EC-2, C-13) ─────────────


def test_an_archived_party_errors_the_document_due_and_the_rest_post(
    clock: Any, ctx: Any, doc_plan: Any, make_plan: Any, member: Any, today: Any
) -> None:
    """EC-1 / C-13 — sales refuses an invoice for an archived party, so the FRD's "posts anyway"
    cannot hold in document mode. That due errors (and is retried nightly) while a ledger-mode
    schedule of the same party still posts, because the khata accepts it."""
    from apps.parties.models import Party

    documents = _start(ctx, doc_plan(), member)
    ledger = _start(ctx, make_plan(name="Ledger fee"), member)
    Party.objects.filter(pk=member.pk).update(status="archived")
    report = _run(ctx, clock, NOV1)
    assert report["errors"] == [{"schedule_id": str(documents.id), "code": "party_archived"}]
    assert DuesDue.objects.get(schedule=ledger, seq=1).status == DueStatus.DUE
    assert DuesDue.objects.get(schedule=documents, seq=1).status == DueStatus.SCHEDULED


def test_sales_switched_off_errors_the_document_due(
    clock: Any, ctx: Any, doc_plan: Any, member: Any, today: Any
) -> None:
    """EC-2 — the port answers 403 `module_disabled` once sales is off: the schedule errors and
    the owner is told, instead of the run dying on the first such schedule."""
    schedule = _start(ctx, doc_plan(), member)
    entitle(ctx.tenant, "sales", enabled=False)
    report = _run(ctx, clock, NOV1)
    assert report["errors"] == [{"schedule_id": str(schedule.id), "code": "module_disabled"}]


def test_a_backdated_document_schedule_invoices_each_past_due_on_its_date(
    ctx: Any, doc_plan: Any, member: Any, today: Any
) -> None:
    """C-10 lifted — DUE-01 refused this; now each confirmed past due is its own invoice, dated
    its own day, issued in the schedule's transaction."""
    from apps.sales.models import SalesDocument

    _start(ctx, doc_plan(), member, dt.date(2026, 9, 1), confirm_backdated=True)
    dates = sorted(
        SalesDocument.objects.filter(origin_type=SOURCE_DUE).values_list("document_date", flat=True)
    )
    assert dates == [dt.date(2026, 9, 1), dt.date(2026, 10, 1)]
