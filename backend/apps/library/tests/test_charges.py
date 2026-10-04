"""B10 — charges, waivers, the fine calculator and the charge target (LIB-07; T-LIB-07-1…10)."""

from __future__ import annotations

import datetime as dt
import random
from decimal import Decimal
from io import StringIO
from typing import Any

import pytest
from django.core.management import call_command
from django.db import DatabaseError, connection, transaction
from django.urls import reverse

from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.ledger.models import LedgerEntry
from apps.ledger.services.postings import LedgerPostingError, post_source_entry
from apps.library.constants import SOURCE_CHARGE, SOURCE_WAIVER
from apps.library.models import LibraryCharge
from apps.library.services.charges import OpenChargesCounter, derive_status
from apps.library.services.fines import calculate_fine
from apps.library.tests.factories import charge, member
from apps.parties.models import Party
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db
D = Decimal

SUN = {dt.date(2026, 10, 11), dt.date(2026, 10, 18), dt.date(2026, 10, 25), dt.date(2026, 11, 1)}
DIWALI = {dt.date(2026, 11, 8), dt.date(2026, 11, 9), dt.date(2026, 11, 10)}
CLOSED = SUN | DIWALI | {dt.date(2026, 11, 15)}
OCT10 = dt.date(2026, 10, 10)


def _fine(
    returned: dt.date,
    *,
    due: dt.date = OCT10,
    skip: bool = False,
    rate: str = "2.00",
    grace: int = 2,
    cap: str | None = "100.00",
    price: str | None = "250.00",
    already: str = "0.00",
    rounding: str = "rupee",
) -> Decimal:
    return calculate_fine(
        due_on=due,
        returned_on=returned,
        closed=CLOSED,
        skip_closed=skip,
        fine_per_day=D(rate),
        grace_days=grace,
        fine_cap=None if cap is None else D(cap),
        price=None if price is None else D(price),
        fallback_price=None,
        already_charged=D(already),
        rounding=rounding,
    ).amount


# ── T-LIB-07-1: the twelve worked examples ──────────────────────────────────


@pytest.mark.parametrize(
    "label, kwargs, expected",
    [
        ("1 within grace", {"returned": dt.date(2026, 10, 12)}, "0.00"),
        ("2 grace passed, from the due date", {"returned": dt.date(2026, 10, 13)}, "6.00"),
        ("3 Sunday skipped", {"returned": dt.date(2026, 10, 13), "skip": True}, "0.00"),
        ("4 Sunday skipped", {"returned": dt.date(2026, 10, 14), "skip": True}, "6.00"),
        ("5 capped by the rule", {"returned": dt.date(2026, 12, 9)}, "100.00"),
        ("7 lost a week later", {"returned": dt.date(2026, 10, 17)}, "14.00"),
        ("7a lost, Sunday skipped", {"returned": dt.date(2026, 10, 17), "skip": True}, "12.00"),
        (
            "8 capped by the price",
            {"returned": dt.date(2026, 12, 9), "cap": None, "price": "80.00"},
            "80.00",
        ),
        (
            "9 rupee rounding half up",
            {"returned": dt.date(2026, 10, 15), "rate": "0.50", "grace": 0},
            "3.00",
        ),
        (
            "9 with paise",
            {"returned": dt.date(2026, 10, 15), "rate": "0.50", "grace": 0, "rounding": "paise"},
            "2.50",
        ),
        (
            "11 Diwali and Sunday counted once",
            {"due": dt.date(2026, 11, 6), "returned": dt.date(2026, 11, 12), "skip": True},
            "6.00",
        ),
        (
            "11 counting all days",
            {"due": dt.date(2026, 11, 6), "returned": dt.date(2026, 11, 12)},
            "12.00",
        ),
        (
            "12 room after a renewal fine",
            {"returned": dt.date(2026, 12, 9), "already": "6.00"},
            "94.00",
        ),
    ],
)
def test_the_worked_examples(label: str, kwargs: dict, expected: str) -> None:
    """T-LIB-07-1 — every fine a member disputes at the counter is one of these."""
    assert _fine(**kwargs) == D(expected), label


def test_example_10_two_charges_at_renewal_and_return() -> None:
    """Example 10 — renewed while overdue (₹6), returned 3 open days after the new due (₹6)."""
    first = _fine(dt.date(2026, 10, 14), skip=True)
    second = _fine(dt.date(2026, 10, 31), due=dt.date(2026, 10, 28), skip=True, already=str(first))
    assert (first, second) == (D("6.00"), D("6.00"))


def test_the_cap_room_never_exceeds_the_cap_or_the_price() -> None:
    """T-LIB-07-2 — however many renewal fines a loan collects, they never sum past the cap."""
    rng = random.Random(7)
    for _ in range(200):
        cap = D(rng.choice(["30.00", "100.00"]))
        price = D(rng.choice(["25.00", "250.00"]))
        charged = D("0.00")
        due = OCT10
        for _ in range(rng.randint(1, 5)):
            back = due + dt.timedelta(days=rng.randint(0, 40))
            charged += calculate_fine(
                due_on=due,
                returned_on=back,
                closed=set(),
                skip_closed=False,
                fine_per_day=D("2.00"),
                grace_days=0,
                fine_cap=cap,
                price=price,
                fallback_price=None,
                already_charged=charged,
            ).amount
            due = back + dt.timedelta(days=14)
        assert charged <= min(cap, price)


@pytest.mark.parametrize(
    "paid, waived, refunded, reversed_, status",
    [
        ("0", "0", "0", False, "open"),
        ("10", "0", "0", False, "part_paid"),
        ("50", "0", "0", False, "paid"),
        ("0", "50", "0", False, "waived"),
        ("20", "30", "0", False, "paid"),
        ("50", "0", "50", False, "refunded"),
        ("0", "10", "0", False, "open"),
        ("0", "0", "0", True, "reversed"),
    ],
)
def test_status_is_derived_from_the_figures(
    paid: str, waived: str, refunded: str, reversed_: bool, status: str
) -> None:
    """T-LIB-07-3, BR-4 — one derivation; a toggled status is a lie the next payment exposes."""
    row = LibraryCharge(
        amount=D("50"),
        amount_paid=D(paid),
        waived_amount=D(waived),
        refunded_amount=D(refunded),
        amount_due=D("50") - D(paid) - D(waived),
        reversed_at=dt.datetime(2026, 10, 1) if reversed_ else None,
    )
    assert derive_status(row) == status


# ── posting ─────────────────────────────────────────────────────────────────


def test_a_charge_posts_one_charge_line_and_never_in_the_loan_bucket(tenant: Any) -> None:
    """T-LIB-07-5 — the source posts `charge` in main only; a loan-bucket post is refused."""
    party = PartyFactory(tenant=tenant)
    row = charge(tenant, member(tenant, party), "40.00")
    line = LedgerEntry.objects.get(source_type=SOURCE_CHARGE, source_id=row.id)
    assert (line.entry_type, line.amount, line.bucket) == ("charge", D("40.00"), "main")
    assert row.number.startswith("FIN/")
    with pytest.raises(LedgerPostingError), transaction.atomic():
        post_source_entry(
            ctx=Ctx.system(tenant),
            party=party,
            amount=D("1.00"),
            entry_date=tenant_today(tenant),
            entry_type="charge",
            source_type=SOURCE_CHARGE,
            source_id=row.id,
            bucket="loan",
        )


def test_a_party_over_its_credit_limit_still_gets_its_charge(tenant: Any) -> None:
    """D7 — a library fine is a fact; the limit governs what the shop lends, not what it bills."""
    party = PartyFactory(tenant=tenant)
    Party.objects.filter(pk=party.pk).update(credit_limit=D("1.00"))
    party.refresh_from_db()
    assert charge(tenant, member(tenant, party), "500.00").amount_due == D("500.00")


def test_the_ledger_line_cannot_be_edited(tenant: Any) -> None:
    """T-LIB-07-10 — the core trigger holds for this source too."""
    row = charge(tenant, member(tenant, PartyFactory(tenant=tenant)))
    with pytest.raises(DatabaseError), transaction.atomic(), connection.cursor() as cursor:
        cursor.execute("UPDATE ledger_entry SET amount = 1 WHERE id = %s", [row.ledger_entry_id])


# ── waive (FR-3, BR-5; T-LIB-07-6) ──────────────────────────────────────────


def _waive(client: Any, row: Any, amount: str, reason: str = "First time") -> Any:
    return client.post(
        reverse("v1:library-charge-waive", args=[row.id]),
        {"amount": amount, "reason": reason},
        format="json",
    )


def test_the_ceiling_is_a_role_and_cumulative(api_as: Any, library_on: Any) -> None:
    """T-LIB-07-6, T-LIB-14-5, G22 — staff granted the waive codename waive ₹100 and are refused
    ₹101; three small waivers cannot add up past the ceiling; an admin waives ₹250."""
    party = PartyFactory(tenant=library_on)
    membership = member(library_on, party)
    big = charge(library_on, membership, "300.00")
    staff, who = api_as(library_on, role="staff")
    who.permissions_override = {"allow": ["library.charge.waive"], "deny": []}
    who.save(update_fields=["permissions_override"])
    assert _waive(staff, big, "101.00").status_code == 403
    assert _waive(staff, big, "60.00").status_code == 200
    refused = _waive(staff, big, "60.00")
    assert refused.status_code == 403
    assert refused.json()["error"]["code"] == "library_waiver_over_ceiling"
    admin, _ = api_as(library_on, role="admin")
    other = charge(library_on, membership, "300.00")
    assert _waive(admin, other, "250.00").status_code == 200
    other.refresh_from_db()
    assert (other.amount_due, other.status) == (D("50.00"), "open")


def test_a_waiver_posts_a_credit_and_cannot_exceed_the_due(api_as: Any, library_on: Any) -> None:
    owner, _ = api_as(library_on, role="owner")
    row = charge(library_on, member(library_on, PartyFactory(tenant=library_on)), "6.00")
    assert _waive(owner, row, "6.01").status_code == 400
    assert _waive(owner, row, "6.00", reason="ok").status_code == 400  # reason ≥ 3 chars
    assert _waive(owner, row, "6.00").status_code == 200
    row.refresh_from_db()
    assert (row.status, row.amount_due) == ("waived", D("0.00"))
    credit = LedgerEntry.objects.get(source_type=SOURCE_WAIVER)
    assert (credit.entry_type, credit.amount) == ("adjustment_credit", D("6.00"))
    again = _waive(owner, row, "1.00")
    assert again.json()["error"]["code"] == "library_charge_not_open"


# ── reverse (FR-9, BR-11; T-LIB-07-8) ───────────────────────────────────────


def _pay(tenant: Any, party: Any, row: Any, amount: str) -> Any:
    from apps.payments.services.record import record_payment

    return record_payment(
        ctx=Ctx.system(tenant),
        payload={
            "direction": "in",
            "party_id": str(party.id),
            "mode_breakup": [{"mode": "cash", "amount": amount}],
            "allocations": [
                {"document_type": "library_charge", "document_id": str(row.id), "amount": amount}
            ],
        },
    )["payment"]


def test_reverse_is_refused_while_paid_and_nets_the_khata_to_zero_after_the_void(
    api_as: Any, library_on: Any
) -> None:
    from apps.payments.services.void import void_payment

    owner, _ = api_as(library_on, role="owner")
    party = PartyFactory(tenant=library_on)
    row = charge(library_on, member(library_on, party), "20.00")
    _waive(owner, row, "5.00")
    payment = _pay(library_on, party, row, "10.00")
    url = reverse("v1:library-charge-reverse", args=[row.id])
    refused = owner.post(url, {"reason": "Wrong return date"}, format="json")
    assert refused.status_code == 409
    assert refused.json()["error"]["details"]["payment_ids"] == [str(payment.id)]
    void_payment(ctx=Ctx.system(library_on), payment_id=payment.id, reason="Wrong charge")
    assert owner.post(url, {"reason": "Wrong return date"}, format="json").status_code == 200
    row.refresh_from_db()
    party.refresh_from_db()
    assert row.status == "reversed" and party.balance == D("0.00")
    assert row.waivers.filter(reversed_at__isnull=True).count() == 0


# ── the target in payments ──────────────────────────────────────────────────


def test_auto_settles_an_older_fine_before_a_newer_charge(library_on: Any) -> None:
    """R6 — "auto" is globally oldest first across targets; a fine of last month comes before
    this week's."""
    from apps.payments.services.record import record_payment

    party = PartyFactory(tenant=library_on)
    membership = member(library_on, party)
    today = tenant_today(library_on)
    old = charge(library_on, membership, "30.00", day=today - dt.timedelta(days=30))
    new = charge(library_on, membership, "30.00", day=today - dt.timedelta(days=2))
    record_payment(
        ctx=Ctx.system(library_on),
        payload={
            "direction": "in",
            "party_id": str(party.id),
            "mode_breakup": [{"mode": "cash", "amount": "30.00"}],
            "allocations": "auto",
        },
    )
    old.refresh_from_db()
    new.refresh_from_db()
    assert (old.status, new.status) == ("paid", "open")


def test_the_off_guard_counts_only_what_still_owes(library_on: Any) -> None:
    """G20 — a reversed or settled charge must never block switching the module off."""
    owner_ctx = Ctx.system(library_on)
    party = PartyFactory(tenant=library_on)
    membership = member(library_on, party)
    counter = OpenChargesCounter()
    open_row = charge(library_on, membership, "10.00")
    paid = charge(library_on, membership, "10.00")
    _pay(library_on, party, paid, "10.00")
    assert counter(library_on) == 1
    from apps.library.services.charges import reverse as reverse_charge

    with transaction.atomic():
        reverse_charge(ctx=owner_ctx, charge_id=open_row.id, data={"reason": "Raised twice"})
    assert counter(library_on) == 0


def test_a_manual_charge_on_a_closed_membership_is_refused(api_as: Any, library_on: Any) -> None:
    owner, _ = api_as(library_on, role="owner")
    closed = member(library_on, PartyFactory(tenant=library_on), status="closed")
    response = owner.post(
        reverse("v1:library-charges"),
        {"membership_id": str(closed.id), "kind": "other", "amount": "20", "description": "Card"},
        format="json",
        HTTP_IDEMPOTENCY_KEY="k-1",
    )
    assert response.json()["error"]["code"] == "library_membership_closed"


# ── T-LIB-07-9 (subset): replay ─────────────────────────────────────────────


def test_a_fuzzed_book_of_charges_payments_voids_waivers_and_reversals_replays(
    library_on: Any,
) -> None:
    """`amount_paid` = Σ live allocations, `waived_amount` = Σ standing waivers, and the khata
    agrees with `recalc_balances` after every kind of step."""
    from apps.library.services.charges import reverse as reverse_charge
    from apps.library.services.charges import waive as waive_charge
    from apps.payments.models import Allocation
    from apps.payments.services.void import void_payment

    rng = random.Random(11)
    ctx = Ctx.system(library_on)
    party = PartyFactory(tenant=library_on)
    membership = member(library_on, party)
    rows = [charge(library_on, membership, f"{rng.randint(5, 60)}.00") for _ in range(6)]
    payments: list[Any] = []
    for _ in range(40):
        row = rng.choice(rows)
        row.refresh_from_db()
        step = rng.random()
        due = row.amount_due
        if step < 0.35 and due > 0 and row.reversed_at is None:
            payments.append(_pay(library_on, party, row, str(min(due, D(rng.randint(1, 20))))))
        elif step < 0.55 and payments:
            void_payment(
                ctx=ctx, payment_id=payments.pop(rng.randrange(len(payments))).id, reason="Fuzz"
            )
        elif step < 0.75 and due > 0 and row.reversed_at is None:
            with transaction.atomic():
                waive_charge(
                    ctx=ctx,
                    charge_id=row.id,
                    data={"amount": str(min(due, D("3"))), "reason": "Fuzz"},
                )
        elif row.reversed_at is None and row.amount_paid == 0:
            with transaction.atomic():
                reverse_charge(ctx=ctx, charge_id=row.id, data={"reason": "Fuzz"})
    for row in rows:
        row.refresh_from_db()
        live = sum(
            (
                a.amount
                for a in Allocation.objects.filter(document_id=row.id, payment__status="recorded")
            ),
            D("0"),
        )
        standing = sum((w.amount for w in row.waivers.filter(reversed_at__isnull=True)), D("0"))
        assert row.amount_paid == live
        if row.reversed_at is None:
            assert row.waived_amount == standing
    out = StringIO()
    call_command("recalc_balances", "--check", f"--tenant={library_on.id}", stdout=out)
