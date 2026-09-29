"""A2 / PLT-X01 — ledger buckets, the party caches, the posting registry and two entry types.

ADR-043: one party balance, with a `loan` bucket and a `deposit` bucket on the ledger line.
`party.balance = Σ main + Σ loan`, `loan_balance = Σ loan`, `deposit_held = Σ credit(deposit) −
Σ debit(deposit)`, and a deposit never touches the balance. Every test here names the defect it
prevents; T-PLT-X01-n numbers are FRD 00's.

No vertical exists yet, so the rows in other buckets are posted through a test-only posting
source (`test_charge`, module `test`) and through the core `payment` source, which payments
registers with all three buckets.
"""

from __future__ import annotations

import datetime as dt
import random
import threading
from decimal import Decimal
from io import StringIO
from typing import Any

import pytest
from django.core.exceptions import ImproperlyConfigured
from django.core.management import call_command
from django.db import DatabaseError, IntegrityError, connection, transaction

from apps.common.constants import Direction, LedgerBucket
from apps.common.context import Ctx
from apps.ledger.constants import EntryType, SourceType
from apps.ledger.models import LedgerEntry
from apps.ledger.selectors.entry import (
    computed_balance,
    computed_deposit_held,
    computed_loan_balance,
    party_ledger_summary,
)
from apps.ledger.services import postings
from apps.ledger.services.postings import (
    LedgerPostingError,
    post_source_entry,
    register_posting_source,
    reverse_source_entries,
)
from apps.parties.models import Party
from apps.parties.services.balance import apply_entry, lock_party
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db

TEST_SOURCE = "test_charge"
D = Decimal


@pytest.fixture
def test_source() -> Any:
    """A test-only posting source in the `main` and `loan` buckets (the dues/lending shape)."""
    postings._reset_for_tests()
    register_posting_source(
        TEST_SOURCE,
        module="test",
        entry_types={
            EntryType.CHARGE: Direction.DEBIT,
            EntryType.INTEREST: Direction.DEBIT,
            EntryType.ADJUSTMENT_CREDIT: Direction.CREDIT,
        },
        buckets=frozenset({LedgerBucket.MAIN, LedgerBucket.LOAN}),
    )
    yield TEST_SOURCE
    postings._reset_for_tests()


def _ctx(party: Party) -> Ctx:
    return Ctx.system(party.tenant)


def post(
    party: Party,
    entry_type: str,
    amount: str,
    *,
    source_type: str,
    bucket: str = "main",
    day: dt.date = dt.date(2026, 4, 1),
    source_id: Any = None,
) -> tuple[LedgerEntry, Decimal]:
    """One posting through the real service, the party locked first as every caller does."""
    import uuid

    locked = lock_party(tenant=party.tenant, party_id=party.id)
    return post_source_entry(
        ctx=_ctx(party),
        party=locked,
        amount=D(amount),
        entry_date=day,
        entry_type=entry_type,
        source_type=source_type,
        source_id=source_id or uuid.uuid4(),
        bucket=bucket,
    )


def caches(party: Party) -> tuple[Decimal, Decimal, Decimal]:
    party.refresh_from_db()
    return party.balance, party.loan_balance, party.deposit_held


def replay(party: Party) -> tuple[Decimal, Decimal, Decimal]:
    return (
        computed_balance(tenant=party.tenant, party_id=party.id),
        computed_loan_balance(tenant=party.tenant, party_id=party.id),
        computed_deposit_held(tenant=party.tenant, party_id=party.id),
    )


# ── The column and the trigger ──────────────────────────────────────────────


def test_every_existing_and_new_row_is_main_by_default(tenant: Any) -> None:
    """A row written by code that has never heard of buckets (LED-01, the opening, the
    write-off) is `main` — the migration's default and the model's agree."""
    party = PartyFactory(tenant=tenant)
    row = LedgerEntry.objects.create(
        tenant=tenant,
        party=party,
        direction=Direction.DEBIT,
        amount=D("10.00"),
        entry_date=dt.date(2026, 4, 1),
        entry_type=EntryType.MANUAL_GAVE,
    )
    row.refresh_from_db()
    assert row.bucket == LedgerBucket.MAIN


def test_the_database_refuses_to_change_a_posted_bucket(tenant: Any) -> None:
    """T-PLT-X01-1 — without `bucket` in the re-created trigger, `QuerySet.update(bucket=
    'loan')` would silently move a shop invoice out of aging and into a loan, an edit in
    place on the table whose whole point is that there are none."""
    party = PartyFactory(tenant=tenant)
    row = LedgerEntry.objects.create(
        tenant=tenant,
        party=party,
        direction=Direction.DEBIT,
        amount=D("10.00"),
        entry_date=dt.date(2026, 4, 1),
        entry_type=EntryType.MANUAL_GAVE,
    )
    with pytest.raises(DatabaseError, match="immutable"), transaction.atomic():
        LedgerEntry.objects.filter(pk=row.pk).update(bucket=LedgerBucket.LOAN)
    row.refresh_from_db()
    assert row.bucket == LedgerBucket.MAIN


def test_the_database_refuses_an_unknown_bucket(tenant: Any) -> None:
    """T-PLT-X01-2 — `ck_ledger_entry_bucket`: a fourth bucket is a CHECK change, never a
    typo that a writer outside the service could introduce."""
    party = PartyFactory(tenant=tenant)
    with pytest.raises(IntegrityError, match="ck_ledger_entry_bucket"), transaction.atomic():
        LedgerEntry.objects.create(
            tenant=tenant,
            party=party,
            direction=Direction.DEBIT,
            amount=D("10.00"),
            entry_date=dt.date(2026, 4, 1),
            entry_type=EntryType.MANUAL_GAVE,
            bucket="other",
        )


def test_a_registered_source_type_is_a_valid_model_value(tenant: Any, test_source: str) -> None:
    """R8 — `source_type` lost its `choices`: a registered source such as `dues_due` is not a
    `SourceType` member, and model validation must not reject it."""
    party = PartyFactory(tenant=tenant)
    row = LedgerEntry(
        tenant=tenant,
        party=party,
        direction=Direction.DEBIT,
        amount=D("10.00"),
        entry_date=dt.date(2026, 4, 1),
        entry_type=EntryType.CHARGE,
        source_type=test_source,
    )
    row.full_clean(exclude=["created_by"])


def test_the_two_new_entry_types_have_their_labels() -> None:
    """ADR-048 — `charge` (a debit) and `adjustment_credit` (a credit, labelled "Credit")."""
    assert EntryType.CHARGE.value == "charge"
    assert EntryType.CHARGE.label == "Charge"
    assert EntryType.ADJUSTMENT_CREDIT.value == "adjustment_credit"
    assert EntryType.ADJUSTMENT_CREDIT.label == "Credit"


# ── The posting registry ────────────────────────────────────────────────────


def test_the_four_existing_sources_are_registered_by_their_owners() -> None:
    """T-PLT-X01-10 — after `django.setup()` the matrix that used to be a literal is the
    registry's, and `payment` alone is registered in all three buckets."""
    sources = postings.registered_posting_sources()
    assert sources[SourceType.SALES_DOCUMENT].module == "sales"
    assert dict(sources[SourceType.SALES_DOCUMENT].entry_types) == {
        EntryType.INVOICE: Direction.DEBIT,
        EntryType.CREDIT_NOTE: Direction.CREDIT,
    }
    assert sources[SourceType.PURCHASE_DOCUMENT].module == "purchases"
    assert sources[SourceType.EXPENSE].module == "expenses"
    assert sources[SourceType.PAYMENT].module == "payments"
    assert sources[SourceType.PAYMENT].buckets == frozenset({"main", "loan", "deposit"})
    for name in (SourceType.SALES_DOCUMENT, SourceType.PURCHASE_DOCUMENT, SourceType.EXPENSE):
        assert sources[name].buckets == frozenset({"main"})


def test_registration_is_idempotent_and_refuses_a_different_shape() -> None:
    """T-PLT-X01-10, BR-10 — a second `ready()` is harmless; two owners disagreeing about one
    source is a start-up error, not whichever imported last."""
    postings._reset_for_tests()
    try:
        register_posting_source(
            SourceType.PAYMENT,
            module="payments",
            entry_types={
                EntryType.PAYMENT_IN: Direction.CREDIT,
                EntryType.PAYMENT_OUT: Direction.DEBIT,
            },
            buckets=frozenset({"main", "loan", "deposit"}),
        )
        with pytest.raises(ImproperlyConfigured):
            register_posting_source(
                SourceType.PAYMENT,
                module="payments",
                entry_types={
                    EntryType.PAYMENT_IN: Direction.CREDIT,
                    EntryType.PAYMENT_OUT: Direction.DEBIT,
                },
                buckets=frozenset({"main"}),
            )
    finally:
        postings._reset_for_tests()


@pytest.mark.parametrize(
    "kwargs",
    [
        {"source_type": "x" * 33},
        {"entry_types": {EntryType.CHARGE: Direction.CREDIT}},
        {"entry_types": {EntryType.MANUAL_GAVE: Direction.DEBIT}},
        {"entry_types": {}},
        {"buckets": frozenset({"rent"})},
        {"buckets": frozenset()},
    ],
    ids=["too-long", "wrong-direction", "manual-type", "no-types", "bad-bucket", "no-buckets"],
)
def test_registration_refuses_a_malformed_source(kwargs: dict) -> None:
    """BR-7, BR-8 — the direction stays a function of the entry type (`charge` is always a
    debit), the name fits `ledger_entry.source_type varchar(32)`, and a bucket is one of three."""
    base: dict[str, Any] = {
        "source_type": "test_bad",
        "module": "test",
        "entry_types": {EntryType.CHARGE: Direction.DEBIT},
        "buckets": frozenset({"main"}),
    }
    base.update(kwargs)
    postings._reset_for_tests()
    try:
        with pytest.raises(ImproperlyConfigured):
            register_posting_source(
                base.pop("source_type"),
                **base,
            )
    finally:
        postings._reset_for_tests()


@pytest.mark.parametrize(
    "entry_type,source_type,bucket",
    [
        (EntryType.CHARGE, "never_registered", "main"),
        (EntryType.PAYMENT_IN, TEST_SOURCE, "main"),
        (EntryType.CHARGE, TEST_SOURCE, "deposit"),
        (EntryType.INVOICE, SourceType.SALES_DOCUMENT, "loan"),
    ],
    ids=["unregistered-source", "unregistered-type", "bucket-outside-set", "sales-in-loan"],
)
def test_a_posting_outside_the_registration_writes_nothing(
    tenant: Any, test_source: str, entry_type: str, source_type: str, bucket: str
) -> None:
    """T-PLT-X01-3, BR-7 — refused with `LedgerPostingError` BEFORE any row or cache moves."""
    party = PartyFactory(tenant=tenant)
    with pytest.raises(LedgerPostingError):
        post(party, entry_type, "100.00", source_type=source_type, bucket=bucket)
    assert LedgerEntry.objects.filter(party=party).count() == 0
    assert caches(party) == (D("0.00"), D("0.00"), D("0.00"))


# ── apply_entry by bucket, and the worked example ───────────────────────────


def test_the_worked_example_moves_each_cache_row_by_row(tenant: Any, test_source: str) -> None:
    """T-PLT-X01-4 — FRD 00 PLT-X01 §9's table: a party who buys, borrows and leaves a
    deposit. Each figure after each line, in paise-exact rupees."""
    party = PartyFactory(tenant=tenant)
    steps = [
        (EntryType.INVOICE, "2300.00", SourceType.SALES_DOCUMENT, "main", ("2300.00", "0", "0")),
        (
            EntryType.PAYMENT_OUT,
            "50000.00",
            SourceType.PAYMENT,
            "loan",
            ("52300.00", "50000.00", "0"),
        ),
        (EntryType.INTEREST, "625.00", TEST_SOURCE, "loan", ("52925.00", "50625.00", "0")),
        (
            EntryType.PAYMENT_IN,
            "4000.00",
            SourceType.PAYMENT,
            "loan",
            ("48925.00", "46625.00", "0"),
        ),
        (
            EntryType.PAYMENT_IN,
            "1000.00",
            SourceType.PAYMENT,
            "deposit",
            ("48925.00", "46625.00", "1000.00"),
        ),
    ]
    for entry_type, amount, source, bucket, expected in steps:
        row, balance = post(party, entry_type, amount, source_type=source, bucket=bucket)
        assert row.bucket == bucket
        assert caches(party) == tuple(D(value) for value in expected), entry_type
        assert balance == D(expected[0])
    assert replay(party) == caches(party)
    party.refresh_from_db()
    assert party.balance - party.loan_balance == D("2300.00")  # the trade figure
    assert party.receivable_total == D("48925.00")
    assert party.payable_total == D("0.00")


def test_a_deposit_leaves_the_balance_and_the_collection_date_alone(tenant: Any) -> None:
    """BR-3 — a deposit received is not a payment: it must not clear the promise date a
    merchant set for money still owed, as `clear_collection_date_if_settled` would."""
    party = PartyFactory(tenant=tenant, collection_date=dt.date(2026, 10, 5))
    with transaction.atomic():
        locked = lock_party(tenant=tenant, party_id=party.id)
        balance = apply_entry(
            party=locked, direction=Direction.CREDIT, amount=D("1000.00"), bucket="deposit"
        )
    party.refresh_from_db()
    assert balance == D("0.00")
    assert party.deposit_held == D("1000.00")
    assert party.collection_date == dt.date(2026, 10, 5)
    assert party.last_activity_at is not None


def test_apply_entry_without_a_bucket_is_main(tenant: Any) -> None:
    """EC-4 — every caller written before buckets passes none and keeps today's behaviour."""
    party = PartyFactory(tenant=tenant)
    with transaction.atomic():
        locked = lock_party(tenant=tenant, party_id=party.id)
        apply_entry(party=locked, direction=Direction.DEBIT, amount=D("250.00"))
    assert caches(party) == (D("250.00"), D("0.00"), D("0.00"))


def test_apply_entry_refuses_an_unknown_bucket(tenant: Any) -> None:
    """A typo in a caller must not quietly land in `main`."""
    party = PartyFactory(tenant=tenant)
    with pytest.raises(ValueError), transaction.atomic():
        locked = lock_party(tenant=tenant, party_id=party.id)
        apply_entry(party=locked, direction=Direction.DEBIT, amount=D("1.00"), bucket="loans")


def test_the_database_refuses_a_negative_deposit_held(tenant: Any) -> None:
    """`ck_party_deposit_held_non_negative` — handing back more than is held is a defect the
    deposits service refuses first; the database is the last line."""
    party = PartyFactory(tenant=tenant)
    with pytest.raises(IntegrityError), transaction.atomic():
        locked = lock_party(tenant=tenant, party_id=party.id)
        apply_entry(party=locked, direction=Direction.DEBIT, amount=D("1.00"), bucket="deposit")


def test_a_loan_payment_reversal_restores_both_figures_in_its_bucket(
    tenant: Any, test_source: str
) -> None:
    """T-PLT-X01-9 — `reverse_source_entries` writes each reversal in its original's bucket;
    a void of a loan collection that reversed into `main` would leave the loan understated
    and the shop balance overstated by the same amount."""
    import uuid

    party = PartyFactory(tenant=tenant)
    post(party, EntryType.PAYMENT_OUT, "5000.00", source_type=SourceType.PAYMENT, bucket="loan")
    payment_id = uuid.uuid4()
    post(
        party,
        EntryType.PAYMENT_IN,
        "1200.00",
        source_type=SourceType.PAYMENT,
        bucket="loan",
        source_id=payment_id,
    )
    assert caches(party) == (D("3800.00"), D("3800.00"), D("0.00"))
    with transaction.atomic():
        reversals, balance = reverse_source_entries(
            ctx=_ctx(party), source_type=SourceType.PAYMENT, source_id=payment_id, reason="Wrong"
        )
    assert [r.bucket for r in reversals] == ["loan"]
    assert balance == D("5000.00")
    assert caches(party) == (D("5000.00"), D("5000.00"), D("0.00"))
    assert replay(party) == caches(party)


def test_a_deposit_reversal_lowers_what_is_held(tenant: Any) -> None:
    """EC-1 — a void of a deposit receipt reverses into `deposit` and `deposit_held` falls."""
    import uuid

    party = PartyFactory(tenant=tenant)
    receipt = uuid.uuid4()
    post(
        party,
        EntryType.PAYMENT_IN,
        "1000.00",
        source_type=SourceType.PAYMENT,
        bucket="deposit",
        source_id=receipt,
    )
    with transaction.atomic():
        reverse_source_entries(
            ctx=_ctx(party), source_type=SourceType.PAYMENT, source_id=receipt, reason="Wrong"
        )
    assert caches(party) == (D("0.00"), D("0.00"), D("0.00"))


# ── The replay (T-PLT-X01-5) ────────────────────────────────────────────────


def test_five_hundred_random_mixed_bucket_postings_replay_exactly(
    tenant: Any, test_source: str
) -> None:
    """T-PLT-X01-5 — the incremental path (`apply_entry`, one bucket at a time) against the
    full replay (three aggregates over `LIVE_ENTRIES`), after 500 random postings across three
    buckets, three sources and both directions, with random reversals. A cache is trusted
    only when a second route re-derives it (ADR-031, the LED-03 lesson)."""
    import uuid

    rng = random.Random(20260930)
    parties = [PartyFactory(tenant=tenant) for _ in range(4)]
    held = {party.id: D("0.00") for party in parties}
    posted: list[tuple[Any, str]] = []
    for _ in range(500):
        party = rng.choice(parties)
        amount = D(rng.randint(1, 500_000)) / 100
        kind = rng.random()
        if kind < 0.3:
            bucket = "deposit"
            if held[party.id] >= amount and rng.random() < 0.4:
                entry_type = EntryType.PAYMENT_OUT
                held[party.id] -= amount
            else:
                entry_type = EntryType.PAYMENT_IN
                held[party.id] += amount
            source = SourceType.PAYMENT
        elif kind < 0.6:
            bucket = "loan"
            entry_type, source = rng.choice(
                [
                    (EntryType.PAYMENT_OUT, SourceType.PAYMENT),
                    (EntryType.PAYMENT_IN, SourceType.PAYMENT),
                    (EntryType.INTEREST, TEST_SOURCE),
                    (EntryType.ADJUSTMENT_CREDIT, TEST_SOURCE),
                ]
            )
        else:
            bucket = "main"
            entry_type, source = rng.choice(
                [
                    (EntryType.INVOICE, SourceType.SALES_DOCUMENT),
                    (EntryType.CREDIT_NOTE, SourceType.SALES_DOCUMENT),
                    (EntryType.PAYMENT_IN, SourceType.PAYMENT),
                    (EntryType.CHARGE, TEST_SOURCE),
                ]
            )
        source_id = uuid.uuid4()
        post(
            party,
            entry_type,
            str(amount),
            source_type=source,
            bucket=bucket,
            source_id=source_id,
            day=dt.date(2026, 4, 1) + dt.timedelta(days=rng.randint(0, 150)),
        )
        # A deposit IN may only be reversed while it is still covered.
        if bucket != "deposit" or entry_type == EntryType.PAYMENT_OUT:
            posted.append((party, source, source_id, bucket, entry_type, amount))
    for party, source, source_id, bucket, entry_type, amount in rng.sample(posted, 60):
        if bucket == "deposit" and entry_type == EntryType.PAYMENT_OUT:
            held[party.id] += amount
        with transaction.atomic():
            reverse_source_entries(
                ctx=_ctx(party), source_type=source, source_id=source_id, reason="Fuzz"
            )
    for party in parties:
        assert replay(party) == caches(party), party.name
        assert caches(party)[2] == held[party.id]
    out = StringIO()
    call_command("recalc_balances", "--check", tenant=str(tenant.id), stdout=out)
    assert "0 found" in out.getvalue()


def test_recalc_balances_reports_and_repairs_a_drifted_loan_or_deposit_cache(
    tenant: Any, test_source: str
) -> None:
    """`recalc_balances` replays all three caches: a `loan_balance` or `deposit_held` that a
    writer moved without its row is reported, exits 1 under `--check`, and `--apply` repairs
    it — the balance column alone agreeing is not a clean book."""
    party = PartyFactory(tenant=tenant)
    post(party, EntryType.PAYMENT_OUT, "900.00", source_type=SourceType.PAYMENT, bucket="loan")
    post(party, EntryType.PAYMENT_IN, "300.00", source_type=SourceType.PAYMENT, bucket="deposit")
    Party.all_objects.filter(pk=party.pk).update(loan_balance=D("1.00"), deposit_held=D("2.00"))

    out = StringIO()
    with pytest.raises(SystemExit) as exit_info:
        call_command("recalc_balances", "--check", tenant=str(tenant.id), stdout=out)
    assert exit_info.value.code == 1
    assert "loan" in out.getvalue() and "deposit" in out.getvalue()

    call_command("recalc_balances", "--apply", tenant=str(tenant.id), stdout=StringIO())
    assert caches(party) == (D("900.00"), D("900.00"), D("300.00"))


# ── Readers of the balance ──────────────────────────────────────────────────


def test_aging_reads_the_main_bucket_only(tenant: Any, test_source: str) -> None:
    """BR-6 — a disbursal is not "90+ days overdue" trade credit, and a deposit is not a
    payment that ages the oldest invoice away (ADR-043)."""
    from apps.ledger.selectors.aging import aging_rows

    party = PartyFactory(tenant=tenant)
    old = dt.date(2026, 1, 5)
    post(party, EntryType.INVOICE, "1000.00", source_type=SourceType.SALES_DOCUMENT, day=old)
    post(
        party,
        EntryType.PAYMENT_OUT,
        "50000.00",
        source_type=SourceType.PAYMENT,
        bucket="loan",
        day=old,
    )
    post(
        party,
        EntryType.PAYMENT_IN,
        "600.00",
        source_type=SourceType.PAYMENT,
        bucket="deposit",
        day=old,
    )
    rows = aging_rows(tenant=tenant, as_of=dt.date(2026, 9, 1))
    assert rows[str(party.id)]["total"] == D("1000.00")
    assert rows[str(party.id)]["90_plus"] == D("1000.00")


def test_the_khata_totals_exclude_deposits(tenant: Any) -> None:
    """BR-4 — "You got in all" on the khata header is money that settled what was owed; a
    deposit is held and returnable, and counting it there tells the merchant they were paid."""
    party = PartyFactory(tenant=tenant)
    post(party, EntryType.INVOICE, "1000.00", source_type=SourceType.SALES_DOCUMENT)
    post(party, EntryType.PAYMENT_IN, "400.00", source_type=SourceType.PAYMENT)
    post(party, EntryType.PAYMENT_IN, "700.00", source_type=SourceType.PAYMENT, bucket="deposit")
    summary = party_ledger_summary(tenant=tenant, party_id=party.id)
    assert summary["total_debit"] == D("1000.00")
    assert summary["total_credit"] == D("400.00")
    # The timeline still SHOWS the deposit line (three rows, not two).
    assert summary["entry_count"] == 3


def test_the_trade_figure_decides_the_credit_limit(tenant: Any, test_source: str) -> None:
    """T-PLT-X01-7, BR-5 — the worked example: ₹2,300 owed to the shop plus a ₹46,625 loan,
    ₹5,000 limit in block mode, a new ₹2,000 invoice. Compared against the whole balance it
    is refused; against the trade figure (₹4,300 after) it is allowed."""
    from apps.parties.services.credit import CREDIT_MODE_BLOCK, check_credit, credit_exposure

    party = PartyFactory(tenant=tenant, credit_limit=D("5000.00"))
    post(party, EntryType.INVOICE, "2300.00", source_type=SourceType.SALES_DOCUMENT)
    post(party, EntryType.PAYMENT_OUT, "50000.00", source_type=SourceType.PAYMENT, bucket="loan")
    post(party, EntryType.INTEREST, "625.00", source_type=TEST_SOURCE, bucket="loan")
    post(party, EntryType.PAYMENT_IN, "4000.00", source_type=SourceType.PAYMENT, bucket="loan")
    post(party, EntryType.PAYMENT_IN, "1000.00", source_type=SourceType.PAYMENT, bucket="deposit")
    party.refresh_from_db()
    assert credit_exposure(party) == D("2300.00")
    decision = check_credit(party=party, amount=D("2000.00"), mode=CREDIT_MODE_BLOCK)
    assert decision["status"] == "ok"
    assert decision["exposure_after"] == D("4300.00")


def test_the_over_limit_filter_uses_the_trade_figure(tenant: Any, test_source: str) -> None:
    """The list's credit chips and the khata's bar must agree (`limit_status`'s own rule):
    a borrower whose loan dwarfs their limit but whose shop balance is small is not "over"."""
    from apps.parties.filters import PartyFilterSet

    borrower = PartyFactory(tenant=tenant, credit_limit=D("5000.00"))
    post(borrower, EntryType.INVOICE, "1000.00", source_type=SourceType.SALES_DOCUMENT)
    post(borrower, EntryType.PAYMENT_OUT, "50000.00", source_type=SourceType.PAYMENT, bucket="loan")
    queryset = Party.objects.filter(tenant=tenant)
    over = PartyFilterSet(data={"credit": "over"}, queryset=queryset).qs
    ok = PartyFilterSet(data={"credit": "ok"}, queryset=queryset).qs
    assert borrower.id not in {p.id for p in over}
    assert borrower.id in {p.id for p in ok}


def test_a_shop_write_off_is_capped_at_the_trade_figure(tenant: Any) -> None:
    """R23 / EC-7 (owner Q3 default) — LED-11's write-off defaults to and is capped at the
    trade figure, so one tap on a shop screen can never forgive a loan. The loan stands, and
    archive is then refused by the ordinary non-zero balance guard."""
    from apps.common.exceptions import BusinessRuleViolation
    from apps.ledger.services.write_off import write_off_party_balance

    party = PartyFactory(tenant=tenant)
    post(party, EntryType.INVOICE, "2300.00", source_type=SourceType.SALES_DOCUMENT)
    post(party, EntryType.PAYMENT_OUT, "50000.00", source_type=SourceType.PAYMENT, bucket="loan")

    with pytest.raises(BusinessRuleViolation) as refused, transaction.atomic():
        locked = lock_party(tenant=tenant, party_id=party.id)
        write_off_party_balance(
            ctx=_ctx(party), party=locked, request={"reason": "Bad debt", "amount": "52300.00"}
        )
    assert refused.value.code == "balance_changed"
    assert refused.value.details["amount"] == "2300.00"

    with transaction.atomic():
        locked = lock_party(tenant=tenant, party_id=party.id)
        result = write_off_party_balance(
            ctx=_ctx(party), party=locked, request={"reason": "Bad debt"}
        )
    assert result["amount"] == "2300.00"
    assert result["direction"] == Direction.CREDIT
    assert caches(party) == (D("50000.00"), D("50000.00"), D("0.00"))
    assert LedgerEntry.objects.get(pk=result["entry_id"]).bucket == "main"


def test_a_write_off_with_only_a_loan_left_has_nothing_to_write_off(tenant: Any) -> None:
    """The trade figure is zero: the shop is owed nothing, so there is nothing for a SHOP
    write-off to do, even though the balance is not zero."""
    from apps.common.exceptions import BusinessRuleViolation
    from apps.ledger.services.write_off import write_off_party_balance

    party = PartyFactory(tenant=tenant)
    post(party, EntryType.PAYMENT_OUT, "800.00", source_type=SourceType.PAYMENT, bucket="loan")
    with pytest.raises(BusinessRuleViolation) as refused, transaction.atomic():
        locked = lock_party(tenant=tenant, party_id=party.id)
        write_off_party_balance(ctx=_ctx(party), party=locked, request={"reason": "Bad debt"})
    assert refused.value.code == "nothing_to_write_off"


# ── The statement and the timeline ──────────────────────────────────────────


def test_a_deposit_is_outside_the_running_balance_and_in_its_own_block(
    tenant: Any, api_as: Any
) -> None:
    """T-PLT-X01-8 — the statement's running balance and closing exclude the deposit line,
    the closing still equals `party.balance` (LED-04 BR-3), and the line is printed in a
    separate "Deposit held" block with what is held."""
    party = PartyFactory(tenant=tenant)
    post(
        party,
        EntryType.INVOICE,
        "1000.00",
        source_type=SourceType.SALES_DOCUMENT,
        day=dt.date(2026, 4, 1),
    )
    post(
        party,
        EntryType.PAYMENT_IN,
        "1500.00",
        source_type=SourceType.PAYMENT,
        bucket="deposit",
        day=dt.date(2026, 4, 2),
    )
    post(
        party,
        EntryType.PAYMENT_IN,
        "400.00",
        source_type=SourceType.PAYMENT,
        day=dt.date(2026, 4, 3),
    )
    client, _member = api_as(tenant)

    body = client.get(f"/api/v1/parties/{party.id}/statement").json()
    data, meta = body["data"], body["meta"]
    assert [row["amount"] for row in data["rows"]] == ["1000.00", "400.00"]
    assert [row["running_balance"] for row in data["rows"]] == ["1000.00", "600.00"]
    assert {row["bucket"] for row in data["rows"]} == {"main"}
    assert data["closing_balance"] == "600.00"
    party.refresh_from_db()
    assert D(data["closing_balance"]) == party.balance
    assert data["totals"]["credit"] == "400.00"
    assert meta["deposit"]["held"] == "1500.00"
    assert [row["amount"] for row in meta["deposit"]["rows"]] == ["1500.00"]
    assert meta["deposit"]["rows"][0]["bucket"] == "deposit"
    assert meta["deposit"]["rows"][0]["direction"] == "credit"


def test_a_statement_without_deposits_has_no_deposit_block(tenant: Any, api_as: Any) -> None:
    """The block is absent rather than `{rows: [], held: "0.00"}` — every existing statement
    stays byte-identical (the golden file) and a zero the merchant never asked about is noise."""
    party = PartyFactory(tenant=tenant)
    post(party, EntryType.INVOICE, "1000.00", source_type=SourceType.SALES_DOCUMENT)
    client, _member = api_as(tenant)
    meta = client.get(f"/api/v1/parties/{party.id}/statement").json()["meta"]
    assert "deposit" not in meta


def test_the_deposit_block_honours_the_period(tenant: Any, api_as: Any) -> None:
    """`held` is what was held at the period's end, and the rows are the period's."""
    party = PartyFactory(tenant=tenant)
    post(
        party,
        EntryType.PAYMENT_IN,
        "1000.00",
        source_type=SourceType.PAYMENT,
        bucket="deposit",
        day=dt.date(2026, 4, 2),
    )
    post(
        party,
        EntryType.PAYMENT_OUT,
        "300.00",
        source_type=SourceType.PAYMENT,
        bucket="deposit",
        day=dt.date(2026, 5, 2),
    )
    client, _member = api_as(tenant)
    april = client.get(
        f"/api/v1/parties/{party.id}/statement?date_from=2026-04-01&date_to=2026-04-30"
    ).json()["meta"]["deposit"]
    assert april["held"] == "1000.00"
    assert [row["amount"] for row in april["rows"]] == ["1000.00"]
    may = client.get(
        f"/api/v1/parties/{party.id}/statement?date_from=2026-05-01&date_to=2026-05-31"
    ).json()["meta"]["deposit"]
    assert may["held"] == "700.00"
    assert [row["amount"] for row in may["rows"]] == ["300.00"]


def test_the_timeline_shows_a_deposit_line_without_moving_the_running_balance(
    tenant: Any, api_as: Any
) -> None:
    """The khata lists every line (with its `bucket`), but a deposit contributes nothing to
    the running balance, so the newest row still equals the header (PTY-03 FR-6)."""
    party = PartyFactory(tenant=tenant)
    post(
        party,
        EntryType.INVOICE,
        "1000.00",
        source_type=SourceType.SALES_DOCUMENT,
        day=dt.date(2026, 4, 1),
    )
    post(
        party,
        EntryType.PAYMENT_IN,
        "1500.00",
        source_type=SourceType.PAYMENT,
        bucket="deposit",
        day=dt.date(2026, 4, 2),
    )
    client, _member = api_as(tenant)
    body = client.get(f"/api/v1/parties/{party.id}/ledger-entries").json()
    rows = body["data"]
    assert [(row["amount"], row["bucket"], row["running_balance"]) for row in rows] == [
        ("1500.00", "deposit", "1000.00"),
        ("1000.00", "main", "1000.00"),
    ]
    assert body["meta"]["summary"]["total_credit"] == "0.00"


def test_the_public_statement_helpers_build_a_module_ledger(tenant: Any, test_source: str) -> None:
    """R48 — a vertical builds its own read (lending's `loan_ledger`) over the ledger's window
    and carry helpers, on a queryset of its own choosing; the core statement gains no filter."""
    from apps.ledger.selectors import statement

    party = PartyFactory(tenant=tenant)
    for day, amount in ((1, "100.00"), (2, "200.00"), (3, "300.00")):
        post(
            party,
            EntryType.INTEREST,
            amount,
            source_type=TEST_SOURCE,
            bucket="loan",
            day=dt.date(2026, 4, day),
        )
    post(party, EntryType.INVOICE, "999.00", source_type=SourceType.SALES_DOCUMENT)
    loan_rows = LedgerEntry.objects.filter(tenant=tenant, party=party, bucket="loan")
    rows = list(statement.running_rows(loan_rows))
    assert [str(row.running_delta) for row in rows] == ["100.00", "300.00", "600.00"]
    # A decoded cursor after the first row, as the paginator mints it.
    position = {
        "entry_date__gt": rows[0].entry_date,
        "created_at__gt": rows[0].created_at,
        "id__gt": rows[0].id,
    }
    assert statement.carried_before(loan_rows, position=position) == D("100.00")
    assert statement.signed_total(loan_rows) == D("600.00")


# ── The party detail ────────────────────────────────────────────────────────


def test_the_party_detail_omits_the_new_figures_for_todays_tenants(
    tenant: Any, api_as: Any
) -> None:
    """PTY-03's rule: a key that is always empty is a claim the code cannot verify. With no
    module that writes a loan or a deposit switched on, and zero in both, the keys are absent."""
    party = PartyFactory(tenant=tenant)
    client, _member = api_as(tenant)
    data = client.get(f"/api/v1/parties/{party.id}").json()["data"]
    assert "loan_balance" not in data
    assert "trade_balance" not in data
    assert "deposit_held" not in data


def test_the_party_detail_shows_the_figures_when_there_are_any(
    tenant: Any, api_as: Any, test_source: str
) -> None:
    """When a loan or a deposit exists the figures are there, as strings, with the trade
    figure beside the loan."""
    party = PartyFactory(tenant=tenant)
    post(party, EntryType.INVOICE, "2300.00", source_type=SourceType.SALES_DOCUMENT)
    post(party, EntryType.PAYMENT_OUT, "5000.00", source_type=SourceType.PAYMENT, bucket="loan")
    post(party, EntryType.PAYMENT_IN, "1000.00", source_type=SourceType.PAYMENT, bucket="deposit")
    client, _member = api_as(tenant)
    data = client.get(f"/api/v1/parties/{party.id}").json()["data"]
    assert data["balance"] == "7300.00"
    assert data["loan_balance"] == "5000.00"
    assert data["trade_balance"] == "2300.00"
    assert data["deposit_held"] == "1000.00"


# ── Concurrency (T-PLT-X01-11) ──────────────────────────────────────────────


@pytest.mark.concurrency
@pytest.mark.django_db(transaction=True)
def test_loan_and_deposit_postings_to_one_party_serialise_on_the_party_lock(
    tenant: Any,
) -> None:
    """T-PLT-X01-11 — two transactions posting a loan line and a deposit line to one party at
    the same moment each lock the party first, so neither reads a stale row: the caches end
    equal to the replay. Without the lock one save would overwrite the other's figure."""
    import uuid

    party = PartyFactory(tenant=tenant)
    barrier = threading.Barrier(2)
    errors: list[str] = []

    def run(entry_type: str, bucket: str) -> None:
        try:
            barrier.wait()
            for _ in range(10):
                with transaction.atomic():
                    locked = lock_party(tenant=tenant, party_id=party.id)
                    post_source_entry(
                        ctx=Ctx.system(tenant),
                        party=locked,
                        amount=D("10.00"),
                        entry_date=dt.date(2026, 4, 1),
                        entry_type=entry_type,
                        source_type=SourceType.PAYMENT,
                        source_id=uuid.uuid4(),
                        bucket=bucket,
                    )
        except Exception as exc:  # noqa: BLE001 — the outcome IS the assertion
            errors.append(f"{type(exc).__name__}: {exc}")
        finally:
            connection.close()

    threads = [
        threading.Thread(target=run, args=(EntryType.PAYMENT_OUT, "loan")),
        threading.Thread(target=run, args=(EntryType.PAYMENT_IN, "deposit")),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=60)
    assert errors == []
    assert caches(party) == (D("100.00"), D("100.00"), D("100.00"))
    assert replay(party) == caches(party)


def test_the_migration_reverse_restores_the_previous_trigger_exactly() -> None:
    """10-architecture §10 rule 7 — 0006's reverse must leave the database as 0005 left it:
    its restored function body is 0004's, character for character, and its forward body is
    that plus exactly one frozen column."""
    import importlib

    m0004 = importlib.import_module("apps.ledger.migrations.0004_entry_upi_app")
    m0006 = importlib.import_module("apps.ledger.migrations.0006_entry_bucket")
    assert m0006.RESTORE_0004 == m0004.FREEZE_UPI_APP
    extra = set(m0006.FREEZE_BUCKET.splitlines()) - set(m0004.FREEZE_UPI_APP.splitlines())
    assert extra == {"       OR NEW.bucket IS DISTINCT FROM OLD.bucket"}


def test_a_switched_on_writer_module_shows_verified_zeros(
    tenant: Any, api_as: Any, monkeypatch: Any
) -> None:
    """When a module that writes the bucket is effective, a zero IS a verified zero and is
    sent. Simulated by naming an enabled core module as the writer, since no vertical exists."""
    from apps.parties.services import balance

    monkeypatch.setattr(
        balance,
        "BUCKET_WRITER_MODULES",
        {"loan": frozenset({"sales"}), "deposit": frozenset({"sales"})},
    )
    party = PartyFactory(tenant=tenant)
    client, _member = api_as(tenant)
    data = client.get(f"/api/v1/parties/{party.id}").json()["data"]
    assert (data["loan_balance"], data["trade_balance"], data["deposit_held"]) == (
        "0.00",
        "0.00",
        "0.00",
    )


def test_the_nightly_drift_sample_names_a_loan_or_deposit_figure(tenant: Any) -> None:
    """The nightly job's sample names WHICH cache drifted when it is not the balance, so an
    operator is not left reading two equal balance figures for a party reported as drifted."""
    from apps.ledger.services.integrity import check_balances

    party = PartyFactory(tenant=tenant)
    post(party, EntryType.PAYMENT_OUT, "900.00", source_type=SourceType.PAYMENT, bucket="loan")
    Party.all_objects.filter(pk=party.pk).update(loan_balance=D("1.00"))
    summary = check_balances(tenant_id=tenant.id)
    assert summary["drifted"] == 1
    assert summary["sample"][0]["figures"] == ["loan_balance"]
    assert summary["sample"][0]["cached"] == summary["sample"][0]["ledger"] == "900.00"
