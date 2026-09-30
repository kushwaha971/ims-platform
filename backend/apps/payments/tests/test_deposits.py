"""A4b — held deposits (FRD 00 PLT-X02, contracts §1.4, ADR-044).

Library, gym and hotel tenants take money that is NOT theirs: a refundable
deposit. The defects these tests exist to prevent are the ones a "You got" for
a deposit has always had — the member shows in advance, FIFO swallows the
deposit into the next bill, the cashbook counts an adjustment as cash, the
figures drift from the payments that made them, and a void of one half of an
adjustment leaves the other half standing.

The worked example (FRD §9) is walked step by step, every figure after every
step: `held`, the party's `deposit_held` and its trade `balance`.
"""

from __future__ import annotations

import random
import threading
import time
from decimal import Decimal
from typing import Any

import pytest
from django.db import connection

from apps.common.constants import PaymentMode
from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation, NotFound, ValidationFailed
from apps.expenses.selectors.cashbook import build_cashbook
from apps.parties.models import Party
from apps.payments.constants import DepositStatus
from apps.payments.models import Allocation, DepositApplication, HeldDeposit, Payment
from apps.payments.services import deposits
from apps.payments.services.record import record_payment
from apps.payments.services.void import void_payment
from apps.payments.tests.conftest import cash_lines, upi
from apps.sales.models import SalesDocument
from apps.sales.tests.conftest import recalc_clean

pytestmark = pytest.mark.django_db

SUBJECT = "01920000-0000-7000-8000-000000000001"


def _d(value: Any) -> Decimal:
    return Decimal(str(value))


@pytest.fixture
def ctx(shop: Any) -> Ctx:
    return Ctx.system(shop)


def _open(ctx: Ctx, party: Any, expected: str = "500.00", **extra: Any) -> HeldDeposit:
    return deposits.open_deposit(
        ctx=ctx,
        party_id=party.id,
        module=extra.pop("module", "library"),
        subject_type=extra.pop("subject_type", "library_membership"),
        subject_id=extra.pop("subject_id", SUBJECT),
        purpose=extra.pop("purpose", "Library deposit"),
        expected_amount=expected,
    )


def _figures(deposit: HeldDeposit) -> tuple[Decimal, Decimal, Decimal, str]:
    deposit.refresh_from_db()
    party = Party.objects.get(pk=deposit.party_id)
    return deposit.held_amount, party.deposit_held, party.balance, deposit.status


# ── T-PLT-X02-1: the worked example ───────────────────────────────────────────


def test_the_library_worked_example_step_by_step(
    ctx: Ctx, make_party: Any, invoice_for: Any
) -> None:
    """FRD 00 PLT-X02 §9: open 500 → receive 500 cash → a ₹120 charge → adjust
    120 from the deposit → return 380 by UPI → released. Returning 400 instead
    of 380 is 409 `deposit_insufficient` with the held amount."""
    member = make_party(name="Asha Rao")
    deposit = _open(ctx, member)
    assert _figures(deposit) == (_d("0.00"), _d("0.00"), _d("0.00"), DepositStatus.EXPECTED)

    received = deposits.receive_deposit(
        ctx=ctx, deposit_id=deposit.id, amount="500.00", mode_breakup=cash_lines("500.00")
    )
    receipt = received["payment"]
    assert receipt.bucket == "deposit" and receipt.number.startswith("RCT/")
    assert receipt.unallocated_amount == 0
    assert _figures(deposit) == (_d("500.00"), _d("500.00"), _d("0.00"), DepositStatus.HELD)

    fine = invoice_for(member, "120.00")
    assert _figures(deposit)[2] == _d("120.00")

    applied = deposits.apply_deposit(
        ctx=ctx,
        deposit_id=deposit.id,
        allocations=[
            {"document_type": "sales_document", "document_id": fine["id"], "amount": "120.00"}
        ],
        reason="Fine for a late return",
    )
    out, settle = applied["refund_payment"], applied["settle_payment"]
    assert (out.direction, out.primary_mode, out.bucket) == ("out", "adjustment", "deposit")
    assert (settle.direction, settle.primary_mode, settle.bucket) == ("in", "adjustment", "main")
    assert out.number.startswith("PAYOUT/") and settle.number.startswith("RCT/")  # R12
    assert SalesDocument.objects.get(pk=fine["id"]).status == "paid"
    assert applied["application"].amount == _d("120.00")
    assert _figures(deposit) == (_d("380.00"), _d("380.00"), _d("0.00"), DepositStatus.HELD)

    with pytest.raises(BusinessRuleViolation) as refused:
        deposits.refund_deposit(
            ctx=ctx,
            deposit_id=deposit.id,
            amount="400.00",
            mode_breakup=upi("400.00"),
            reason="Membership closed",
        )
    assert refused.value.code == "deposit_insufficient"
    assert refused.value.details["held_amount"] == "380.00"

    returned = deposits.refund_deposit(
        ctx=ctx,
        deposit_id=deposit.id,
        amount="380.00",
        mode_breakup=upi("380.00"),
        reason="Membership closed",
    )
    assert returned["payment"].number.startswith("PAYOUT/")
    assert _figures(deposit) == (_d("0.00"), _d("0.00"), _d("0.00"), DepositStatus.RELEASED)
    deposit.refresh_from_db()
    assert (deposit.received_amount, deposit.applied_amount, deposit.refunded_amount) == (
        _d("500.00"),
        _d("120.00"),
        _d("380.00"),
    )
    recalc_clean()  # the party caches equal a full replay of the ledger, every bucket


def test_a_deposit_taken_in_two_parts_is_held(ctx: Ctx, make_party: Any) -> None:
    """EC-1."""
    deposit = _open(ctx, make_party())
    for part in ("300.00", "200.00"):
        deposits.receive_deposit(
            ctx=ctx, deposit_id=deposit.id, amount=part, mode_breakup=cash_lines(part)
        )
    assert _figures(deposit)[0] == _d("500.00")
    assert Allocation.objects.filter(document_type="held_deposit").count() == 2


# ── T-PLT-X02-2: the caps ─────────────────────────────────────────────────────


def test_receive_is_capped_at_what_is_expected(ctx: Ctx, make_party: Any) -> None:
    """BR-3: 409 `over_allocated` — a vertical that wants more raises the
    expected amount first (R35)."""
    deposit = _open(ctx, make_party())
    with pytest.raises(BusinessRuleViolation) as refused:
        deposits.receive_deposit(
            ctx=ctx, deposit_id=deposit.id, amount="500.01", mode_breakup=cash_lines("500.01")
        )
    assert refused.value.code == "over_allocated"
    assert not Payment.objects.exists()
    deposits.adjust_expected(
        ctx=ctx, deposit_id=deposit.id, expected_amount="600.00", reason="Room upgraded"
    )
    deposits.receive_deposit(
        ctx=ctx, deposit_id=deposit.id, amount="600.00", mode_breakup=cash_lines("600.00")
    )
    assert _figures(deposit)[0] == _d("600.00")


def test_expected_cannot_go_below_what_was_received(ctx: Ctx, make_party: Any) -> None:
    """R35."""
    deposit = _open(ctx, make_party())
    deposits.receive_deposit(
        ctx=ctx, deposit_id=deposit.id, amount="300.00", mode_breakup=cash_lines("300.00")
    )
    with pytest.raises(ValidationFailed) as refused:
        deposits.adjust_expected(
            ctx=ctx, deposit_id=deposit.id, expected_amount="299.99", reason="Discount"
        )
    assert "expected_amount" in refused.value.details


def test_apply_is_capped_at_what_is_held(ctx: Ctx, make_party: Any, invoice_for: Any) -> None:
    """BR-4 and EC-7: ₹800 of damage, ₹500 held — adjust 500, the rest stays owed."""
    member = make_party()
    deposit = _open(ctx, member)
    deposits.receive_deposit(
        ctx=ctx, deposit_id=deposit.id, amount="500.00", mode_breakup=cash_lines("500.00")
    )
    damage = invoice_for(member, "800.00")
    row = {"document_type": "sales_document", "document_id": damage["id"]}
    with pytest.raises(BusinessRuleViolation) as refused:
        deposits.apply_deposit(
            ctx=ctx,
            deposit_id=deposit.id,
            allocations=[{**row, "amount": "800.00"}],
            reason="Damage",
        )
    assert refused.value.code == "deposit_insufficient"
    deposits.apply_deposit(
        ctx=ctx, deposit_id=deposit.id, allocations=[{**row, "amount": "500.00"}], reason="Damage"
    )
    assert SalesDocument.objects.get(pk=damage["id"]).amount_due == _d("300.00")
    assert _figures(deposit) == (_d("0.00"), _d("0.00"), _d("300.00"), DepositStatus.RELEASED)


def test_a_released_deposit_takes_nothing_more(ctx: Ctx, make_party: Any) -> None:
    deposit = _open(ctx, make_party())
    deposits.receive_deposit(
        ctx=ctx, deposit_id=deposit.id, amount="500.00", mode_breakup=cash_lines("500.00")
    )
    deposits.refund_deposit(
        ctx=ctx,
        deposit_id=deposit.id,
        amount="500.00",
        mode_breakup=cash_lines("500.00"),
        reason="Closed",
    )
    for act in (
        lambda: deposits.receive_deposit(
            ctx=ctx, deposit_id=deposit.id, amount="1.00", mode_breakup=cash_lines("1.00")
        ),
        lambda: deposits.refund_deposit(
            ctx=ctx,
            deposit_id=deposit.id,
            amount="1.00",
            mode_breakup=cash_lines("1.00"),
            reason="x",
        ),
    ):
        with pytest.raises(BusinessRuleViolation) as refused:
            act()
        assert refused.value.code == "deposit_released"


def test_an_application_settles_only_what_the_party_owes(
    ctx: Ctx, make_party: Any, invoice_for: Any
) -> None:
    """EC-2 (another party's bill is not found) and the bucket rule: a deposit
    is adjusted against MAIN charges, never against another deposit."""
    member, stranger = make_party(name="Member"), make_party(name="Stranger")
    deposit = _open(ctx, member)
    other = _open(ctx, member, subject_id="01920000-0000-7000-8000-000000000002")
    deposits.receive_deposit(
        ctx=ctx, deposit_id=deposit.id, amount="500.00", mode_breakup=cash_lines("500.00")
    )
    theirs = invoice_for(stranger, "100.00")
    with pytest.raises(NotFound):
        deposits.apply_deposit(
            ctx=ctx,
            deposit_id=deposit.id,
            allocations=[
                {"document_type": "sales_document", "document_id": theirs["id"], "amount": "100.00"}
            ],
            reason="x",
        )
    with pytest.raises(ValidationFailed) as refused:
        deposits.apply_deposit(
            ctx=ctx,
            deposit_id=deposit.id,
            allocations=[
                {"document_type": "held_deposit", "document_id": str(other.id), "amount": "100.00"}
            ],
            reason="x",
        )
    assert "allocations.0.document_type" in refused.value.details
    assert not DepositApplication.objects.exists()
    assert _figures(deposit)[0] == _d("500.00")


# ── T-PLT-X02-3 / -4: voids ───────────────────────────────────────────────────


def _held_with_application(ctx: Ctx, make_party: Any, invoice_for: Any) -> tuple:
    member = make_party()
    deposit = _open(ctx, member)
    receipt = deposits.receive_deposit(
        ctx=ctx, deposit_id=deposit.id, amount="500.00", mode_breakup=cash_lines("500.00")
    )["payment"]
    fine = invoice_for(member, "120.00")
    applied = deposits.apply_deposit(
        ctx=ctx,
        deposit_id=deposit.id,
        allocations=[
            {"document_type": "sales_document", "document_id": fine["id"], "amount": "120.00"}
        ],
        reason="Fine",
    )
    return deposit, receipt, fine, applied


@pytest.mark.parametrize("half", ["refund_payment", "settle_payment"])
def test_voiding_either_half_of_an_application_voids_both(
    ctx: Ctx, make_party: Any, invoice_for: Any, half: str
) -> None:
    """BR-7: the pair is one act; half an adjustment would leave the deposit
    down ₹120 with the fine unpaid, or the fine paid with money nobody moved."""
    deposit, _receipt, fine, applied = _held_with_application(ctx, make_party, invoice_for)
    void_payment(ctx=ctx, payment_id=applied[half].id, reason="Adjusted by mistake")
    for payment in (applied["refund_payment"], applied["settle_payment"]):
        payment.refresh_from_db()
        assert payment.status == "void", payment.number
    application = DepositApplication.objects.get(pk=applied["application"].id)
    assert application.voided_at is not None
    assert SalesDocument.objects.get(pk=fine["id"]).amount_due == _d("120.00")
    assert _figures(deposit) == (_d("500.00"), _d("500.00"), _d("120.00"), DepositStatus.HELD)
    deposit.refresh_from_db()
    assert deposit.applied_amount == _d("0.00")
    recalc_clean()


def test_voiding_a_receipt_after_an_application_is_refused_until_the_application_is_voided(
    ctx: Ctx, make_party: Any, invoice_for: Any
) -> None:
    """BR-8: the receipt cannot go first — the deposit would hold −₹120."""
    deposit, receipt, _fine, applied = _held_with_application(ctx, make_party, invoice_for)
    with pytest.raises(BusinessRuleViolation) as refused:
        void_payment(ctx=ctx, payment_id=receipt.id, reason="Wrong member")
    assert refused.value.code == "deposit_insufficient"
    receipt.refresh_from_db()
    assert receipt.status == "recorded"
    void_payment(ctx=ctx, payment_id=applied["settle_payment"].id, reason="Undo the fine")
    void_payment(ctx=ctx, payment_id=receipt.id, reason="Wrong member")
    assert _figures(deposit) == (_d("0.00"), _d("0.00"), _d("120.00"), DepositStatus.EXPECTED)
    recalc_clean()


def test_voiding_a_return_puts_the_money_back_in_the_deposit(ctx: Ctx, make_party: Any) -> None:
    """BR-2: a released deposit comes back to `held` only by a void."""
    deposit = _open(ctx, make_party())
    deposits.receive_deposit(
        ctx=ctx, deposit_id=deposit.id, amount="500.00", mode_breakup=cash_lines("500.00")
    )
    refund = deposits.refund_deposit(
        ctx=ctx,
        deposit_id=deposit.id,
        amount="500.00",
        mode_breakup=cash_lines("500.00"),
        reason="Closed",
    )["payment"]
    assert _figures(deposit)[3] == DepositStatus.RELEASED
    void_payment(ctx=ctx, payment_id=refund.id, reason="Not paid out yet")
    assert _figures(deposit) == (_d("500.00"), _d("500.00"), _d("0.00"), DepositStatus.HELD)


# ── R37: the opening deposit ─────────────────────────────────────────────────


def test_an_opening_deposit_is_an_adjustment_and_not_todays_cash(ctx: Ctx, make_party: Any) -> None:
    """R37: a deposit taken on paper before go-live must not appear as cash in
    today's drawer; it is held all the same."""
    deposit = _open(ctx, make_party())
    received = deposits.receive_deposit(
        ctx=ctx, deposit_id=deposit.id, amount="500.00", opening=True
    )
    payment = received["payment"]
    assert payment.primary_mode == PaymentMode.ADJUSTMENT
    assert payment.mode_breakup == [{"mode": "adjustment", "amount": "500.00"}]
    assert payment.meta["context"] == "deposit_opening"
    assert _figures(deposit)[:2] == (_d("500.00"), _d("500.00"))
    today = payment.payment_date
    book = build_cashbook(tenant=ctx.tenant, date_from=today, date_to=today)
    assert all(row["source_type"] != "payment" for day in book["days"] for row in day["rows"])


# ── T-PLT-X02-6: FIFO never reaches a deposit ────────────────────────────────


def test_an_auto_payment_never_touches_a_deposit(ctx: Ctx, make_party: Any) -> None:
    """BR-5: a party with a deposit still expected and no bills — an ordinary
    "auto" receipt stays an advance and the deposit does not move."""
    member = make_party()
    deposit = _open(ctx, member)
    result = record_payment(
        ctx=ctx,
        payload={
            "direction": "in",
            "party_id": str(member.id),
            "mode_breakup": cash_lines("500.00"),
        },
    )
    assert result["payment"].unallocated_amount == _d("500.00")
    assert result["payment"].bucket == "main"
    assert _figures(deposit)[0] == _d("0.00")
    deposit.refresh_from_db()
    assert deposit.received_amount == _d("0.00")


# ── T-PLT-X02-8: the cashbook ─────────────────────────────────────────────────


def test_the_cashbook_shows_deposit_cash_and_never_an_adjustment(
    ctx: Ctx, make_party: Any, invoice_for: Any
) -> None:
    """R4: +500 cash in, −380 bank out; the two adjustment payments absent,
    both from the day's rows and from the opening brought forward."""
    deposit, receipt, _fine, applied = _held_with_application(ctx, make_party, invoice_for)
    refund = deposits.refund_deposit(
        ctx=ctx, deposit_id=deposit.id, amount="380.00", mode_breakup=upi("380.00"), reason="Closed"
    )["payment"]
    today = receipt.payment_date
    book = build_cashbook(tenant=ctx.tenant, date_from=today, date_to=today)
    numbers = {row["number"] for day in book["days"] for row in day["rows"]}
    assert receipt.number in numbers and refund.number in numbers
    assert applied["refund_payment"].number not in numbers
    assert applied["settle_payment"].number not in numbers
    tomorrow = today.replace(year=today.year + 1)
    carried = build_cashbook(tenant=ctx.tenant, date_from=tomorrow, date_to=tomorrow)
    opening = carried["range"]["opening"]
    assert (_d(opening["cash"]), _d(opening["bank"])) == (_d("500.00"), _d("-380.00"))


# ── T-PLT-X02-9: concurrency ──────────────────────────────────────────────────


@pytest.mark.django_db(transaction=True)
def test_two_full_refunds_at_once_one_wins(shop: Any, make_party: Any) -> None:
    """Two counters return the whole deposit at the same moment: one 201, the
    other `deposit_insufficient` — never −₹500 held."""
    ctx = Ctx.system(shop)
    deposit = _open(ctx, make_party())
    deposits.receive_deposit(
        ctx=ctx, deposit_id=deposit.id, amount="500.00", mode_breakup=cash_lines("500.00")
    )
    barrier = threading.Barrier(2)
    outcomes: list[str] = []

    def run(delay: float) -> None:
        try:
            barrier.wait()
            time.sleep(delay)
            deposits.refund_deposit(
                ctx=Ctx.system(shop),
                deposit_id=deposit.id,
                amount="500.00",
                mode_breakup=cash_lines("500.00"),
                reason="Closed",
            )
            outcomes.append("ok")
        except BusinessRuleViolation as exc:
            outcomes.append(exc.code)
        finally:
            connection.close()

    threads = [threading.Thread(target=run, args=(d,)) for d in (0.0, 0.05)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)
    assert sorted(outcomes) == ["deposit_insufficient", "ok"] or sorted(outcomes) == [
        "deposit_released",
        "ok",
    ]
    deposit.refresh_from_db()
    assert deposit.held_amount == _d("0.00") and deposit.refunded_amount == _d("500.00")


# ── T-PLT-X02-10: the module-off guard ───────────────────────────────────────


def test_a_module_with_open_deposits_cannot_be_switched_off(ctx: Ctx, make_party: Any) -> None:
    from apps.platform_app.services.guards import blocking_rows_for_module_off

    assert blocking_rows_for_module_off(ctx.tenant, "library") == 0
    deposit = _open(ctx, make_party())
    assert blocking_rows_for_module_off(ctx.tenant, "library") == 1
    assert blocking_rows_for_module_off(ctx.tenant, "gym") == 0
    deposits.cancel_expected_deposit(ctx=ctx, deposit_id=deposit.id, reason="Membership ended")
    assert blocking_rows_for_module_off(ctx.tenant, "library") == 0


def test_payments_stays_on_while_a_deposit_holds_money(ctx: Ctx, make_party: Any) -> None:
    """With payments off, A6 skips the payments archive guard (BR-3) and the
    deposit panel disappears, so a member's ₹500 could be archived out of sight.
    An EXPECTED deposit holds nothing and does not block; a returned one no longer does."""
    from apps.platform_app.services.guards import blocking_rows_for_module_off

    deposit = _open(ctx, make_party())
    assert blocking_rows_for_module_off(ctx.tenant, "payments") == 0
    deposits.receive_deposit(
        ctx=ctx, deposit_id=deposit.id, amount="500.00", mode_breakup=cash_lines("500.00")
    )
    assert blocking_rows_for_module_off(ctx.tenant, "payments") == 1
    deposits.refund_deposit(
        ctx=ctx,
        deposit_id=deposit.id,
        amount="500.00",
        mode_breakup=upi("500.00"),
        reason="Closed",
    )
    assert blocking_rows_for_module_off(ctx.tenant, "payments") == 0


# ── open / cancel ─────────────────────────────────────────────────────────────


def test_opening_is_idempotent_by_subject_and_purpose(ctx: Ctx, make_party: Any) -> None:
    member = make_party()
    first = _open(ctx, member)
    assert _open(ctx, member).id == first.id
    assert _open(ctx, member, purpose="Locker deposit").id != first.id
    assert HeldDeposit.objects.count() == 2


def test_an_archived_party_cannot_be_given_a_deposit(ctx: Ctx, make_party: Any) -> None:
    member = make_party(status="archived")
    with pytest.raises(BusinessRuleViolation) as refused:
        _open(ctx, member)
    assert refused.value.code == "party_archived"


def test_opening_validates_its_fields(ctx: Ctx, make_party: Any) -> None:
    with pytest.raises(ValidationFailed) as refused:
        deposits.open_deposit(
            ctx=ctx,
            party_id=make_party().id,
            module="",
            subject_type="",
            subject_id=None,
            purpose="",
            expected_amount="0",
        )
    assert set(refused.value.details) == {
        "module",
        "subject_type",
        "subject_id",
        "purpose",
        "expected_amount",
    }


def test_an_expected_deposit_can_be_cancelled_and_a_received_one_cannot(
    ctx: Ctx, make_party: Any
) -> None:
    """EC-5."""
    member = make_party()
    unpaid = _open(ctx, member)
    deposits.cancel_expected_deposit(ctx=ctx, deposit_id=unpaid.id, reason="Never joined")
    assert _figures(unpaid)[3] == DepositStatus.RELEASED
    paid = _open(ctx, member, purpose="Room deposit")
    deposits.receive_deposit(
        ctx=ctx, deposit_id=paid.id, amount="10.00", mode_breakup=cash_lines("10.00")
    )
    with pytest.raises(BusinessRuleViolation):
        deposits.cancel_expected_deposit(ctx=ctx, deposit_id=paid.id, reason="x")


def test_another_tenants_deposit_is_not_found(ctx: Ctx, make_party: Any, other_tenant: Any) -> None:
    deposit = _open(ctx, make_party())
    with pytest.raises(NotFound):
        deposits.refund_deposit(
            ctx=Ctx.system(other_tenant),
            deposit_id=deposit.id,
            amount="1.00",
            mode_breakup=cash_lines("1.00"),
            reason="x",
        )


# ── T-PLT-X02-7: the replay property ─────────────────────────────────────────


def _replay(deposit: HeldDeposit) -> dict[str, Decimal]:
    """Every cache recomputed from the evidence: live allocations and applications."""
    live = Allocation.objects.filter(document_id=deposit.id, payment__status="recorded")
    received = sum(
        (row.amount for row in live.filter(document_type="held_deposit")), Decimal("0.00")
    )
    outs = live.filter(document_type="held_deposit_refund").select_related("payment")
    applied = sum(
        (row.amount for row in outs if row.payment.meta.get("context") == "deposit_adjustment"),
        Decimal("0.00"),
    )
    refunded = sum(
        (row.amount for row in outs if row.payment.meta.get("context") != "deposit_adjustment"),
        Decimal("0.00"),
    )
    applications = sum(
        (
            a.amount
            for a in DepositApplication.objects.filter(deposit=deposit, voided_at__isnull=True)
        ),
        Decimal("0.00"),
    )
    assert applications == applied
    return {
        "received_amount": received,
        "applied_amount": applied,
        "refunded_amount": refunded,
        "held_amount": received - applied - refunded,
    }


def test_the_caches_equal_their_replay_under_random_sequences(
    ctx: Ctx, make_party: Any, invoice_for: Any
) -> None:
    """T-PLT-X02-7: 120 random acts over three deposits of two parties —
    receive, apply to a fresh bill, return, void any live deposit payment —
    and after every act every cache equals its replay, each party's
    `deposit_held` equals Σ `held_amount` of its deposits, and at the end the
    ledger replay (`recalc_balances`) finds no drift in any bucket."""
    rng = random.Random(44)
    parties = [make_party(name="Replay A"), make_party(name="Replay B")]
    pool = [
        _open(ctx, parties[0], "900.00", subject_id="01920000-0000-7000-8000-00000000000a"),
        _open(ctx, parties[0], "300.00", subject_id="01920000-0000-7000-8000-00000000000b"),
        _open(ctx, parties[1], "700.00", subject_id="01920000-0000-7000-8000-00000000000c"),
    ]
    for _ in range(120):
        deposit = rng.choice(pool)
        deposit.refresh_from_db()
        act = rng.choice(("receive", "receive", "apply", "refund", "void"))
        amount = f"{rng.randint(1, 250)}.{rng.randint(0, 99):02d}"
        try:
            if act == "receive":
                deposits.receive_deposit(
                    ctx=ctx, deposit_id=deposit.id, amount=amount, mode_breakup=cash_lines(amount)
                )
            elif act == "apply":
                # Whole rupees: the shop rounds a bill off to the rupee, and the
                # fixture's bill must be exactly the figure it is asked for.
                amount = f"{rng.randint(1, 250)}.00"
                bill = invoice_for(Party.objects.get(pk=deposit.party_id), amount)
                deposits.apply_deposit(
                    ctx=ctx,
                    deposit_id=deposit.id,
                    allocations=[
                        {
                            "document_type": "sales_document",
                            "document_id": bill["id"],
                            "amount": amount,
                        }
                    ],
                    reason="Charge",
                )
            elif act == "refund":
                deposits.refund_deposit(
                    ctx=ctx,
                    deposit_id=deposit.id,
                    amount=amount,
                    mode_breakup=cash_lines(amount),
                    reason="Return",
                )
            else:
                live = list(
                    Payment.objects.filter(meta__deposit_id=str(deposit.id), status="recorded")
                )
                if live:
                    void_payment(ctx=ctx, payment_id=rng.choice(live).id, reason="Random void")
        except (BusinessRuleViolation, ValidationFailed):
            pass  # a refusal must leave every figure exactly as it was — checked below
        for row in pool:
            row.refresh_from_db()
            expected = _replay(row)
            assert {k: getattr(row, k) for k in expected} == expected, (act, row.id)
        for party in parties:
            party.refresh_from_db()
            held = sum((r.held_amount for r in pool if r.party_id == party.id), Decimal("0.00"))
            assert party.deposit_held == held
    recalc_clean()


def test_the_payment_list_totals_count_no_adjustment(
    ctx: Ctx, owner: Any, make_party: Any, invoice_for: Any
) -> None:
    """FRD 00 PLT-X02 §11: the payment register shows the adjustment pair (with
    their mode) but its "received"/"paid out" cards count only money that
    moved — ₹500 in, nothing out, not ₹620 in and ₹120 out."""
    from django.urls import reverse

    _held_with_application(ctx, make_party, invoice_for)
    body = owner.get(reverse("v1:payment-list")).json()
    totals = body["meta"]["totals"]
    assert (totals["amount_in"], totals["amount_out"]) == ("500.00", "0.00")
    assert (totals["count_in"], totals["count_out"]) == (1, 0)
    assert {row["primary_mode"] for row in body["data"]} == {"cash", "adjustment"}
