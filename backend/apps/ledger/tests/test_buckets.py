"""A2 / PLT-X01, DEC-019 — ledger buckets, the party caches, the posting registry.

DEC-019 (owner, 12 Oct 2026): each app keeps only its own money. `party.balance = Σ main` (the
udhaar book), `shop_balance = Σ shop`, `loan_balance = Σ loan`, `library_balance = Σ library`,
`deposit_held = Σ credit(deposit) − Σ debit(deposit)`, and no cache includes another's. Every
test here names the defect it prevents; T-PLT-X01-n numbers are FRD 00's.

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
    bucket: str | None = None,
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


def caches(party: Party) -> tuple[Decimal, ...]:
    """`(balance, shop, loan, library, deposit_held)` as the party row holds them."""
    party.refresh_from_db()
    return (
        party.balance,
        party.shop_balance,
        party.loan_balance,
        party.library_balance,
        party.deposit_held,
    )


def replay(party: Party) -> tuple[Decimal, ...]:
    """The same five, re-derived from the ledger by `ledger.selectors.drift`."""
    from apps.ledger.selectors.drift import iter_balances

    for row, figures in iter_balances(tenant_id=party.tenant_id):
        if row.pk == party.pk:
            return (
                figures.balance,
                figures.shop_balance,
                figures.loan_balance,
                figures.library_balance,
                figures.deposit_held,
            )
    raise AssertionError("party not replayed")


def money(*values: str) -> tuple[Decimal, ...]:
    return tuple(D(value) for value in values)


ZEROS = money("0", "0", "0", "0", "0")


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
    """T-PLT-X01-10, DEC-019 — after `django.setup()` the matrix that used to be a literal is
    the registry's; the Shop's documents post in `shop`, and `payment` alone in every bucket."""
    sources = postings.registered_posting_sources()
    assert sources[SourceType.SALES_DOCUMENT].module == "sales"
    assert dict(sources[SourceType.SALES_DOCUMENT].entry_types) == {
        EntryType.INVOICE: Direction.DEBIT,
        EntryType.CREDIT_NOTE: Direction.CREDIT,
    }
    assert sources[SourceType.PURCHASE_DOCUMENT].module == "purchases"
    assert sources[SourceType.EXPENSE].module == "expenses"
    assert sources[SourceType.PAYMENT].module == "payments"
    assert sources[SourceType.PAYMENT].buckets == frozenset(LedgerBucket.values)
    for name in (SourceType.SALES_DOCUMENT, SourceType.PURCHASE_DOCUMENT, SourceType.EXPENSE):
        assert sources[name].buckets == frozenset({"shop"})
    assert sources["library_charge"].buckets == frozenset({"library"})


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
            buckets=frozenset(LedgerBucket.values),
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
    assert caches(party) == ZEROS


# ── apply_entry by bucket, and the worked example ───────────────────────────


def test_the_worked_example_moves_each_cache_row_by_row(tenant: Any, test_source: str) -> None:
    """T-PLT-X01-4, DEC-019 — a person who keeps a khata, buys on a bill, borrows and leaves a
    deposit. Each line moves its OWN app's figure and nothing else: QA B3 found a borrower's
    loan showing as "You will get" on a Shop page because it was inside `balance`."""
    party = PartyFactory(tenant=tenant)
    steps = [
        # (entry type, amount, source, bucket, (balance, shop, loan, library, deposit))
        (EntryType.CHARGE, "500.00", TEST_SOURCE, "main", ("500", "0", "0", "0", "0")),
        (
            EntryType.INVOICE,
            "2300.00",
            SourceType.SALES_DOCUMENT,
            None,
            ("500", "2300", "0", "0", "0"),
        ),
        (
            EntryType.PAYMENT_OUT,
            "50000.00",
            SourceType.PAYMENT,
            "loan",
            ("500", "2300", "50000", "0", "0"),
        ),
        (EntryType.INTEREST, "625.00", TEST_SOURCE, "loan", ("500", "2300", "50625", "0", "0")),
        (
            EntryType.PAYMENT_IN,
            "4000.00",
            SourceType.PAYMENT,
            "loan",
            ("500", "2300", "46625", "0", "0"),
        ),
        (
            EntryType.PAYMENT_IN,
            "1000.00",
            SourceType.PAYMENT,
            "deposit",
            ("500", "2300", "46625", "0", "1000"),
        ),
        (
            EntryType.PAYMENT_IN,
            "300.00",
            SourceType.PAYMENT,
            "shop",
            ("500", "2000", "46625", "0", "1000"),
        ),
    ]
    for entry_type, amount, source, bucket, expected in steps:
        row, moved = post(party, entry_type, amount, source_type=source, bucket=bucket)
        assert row.bucket == (bucket or "shop")
        assert caches(party) == money(*expected), entry_type
        # The figure returned is the one this line moved.
        assert moved in money(*expected)
    assert replay(party) == caches(party)
    party.refresh_from_db()
    assert party.receivable_total == D("500.00")
    assert party.payable_total == D("0.00")


def test_a_deposit_leaves_the_balance_and_the_collection_date_alone(tenant: Any) -> None:
    """BR-3 — a deposit received is not a payment: it must not clear the promise date a
    merchant set for money still owed, as `clear_collection_date_if_settled` would. Nor, since
    DEC-019, does it move the udhaar book's "Last entry": nothing happened in the khata."""
    party = PartyFactory(tenant=tenant, collection_date=dt.date(2026, 10, 5))
    with transaction.atomic():
        locked = lock_party(tenant=tenant, party_id=party.id)
        balance = apply_entry(
            party=locked, direction=Direction.CREDIT, amount=D("1000.00"), bucket="deposit"
        )
    party.refresh_from_db()
    assert balance == D("1000.00")  # the figure it moved
    assert party.balance == D("0.00")
    assert party.deposit_held == D("1000.00")
    assert party.collection_date == dt.date(2026, 10, 5)
    assert party.last_activity_at is None


def test_apply_entry_without_a_bucket_is_main(tenant: Any) -> None:
    """EC-4 — every caller written before buckets passes none and keeps today's behaviour."""
    party = PartyFactory(tenant=tenant)
    with transaction.atomic():
        locked = lock_party(tenant=tenant, party_id=party.id)
        apply_entry(party=locked, direction=Direction.DEBIT, amount=D("250.00"))
    assert caches(party) == money("250", "0", "0", "0", "0")


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
    and the udhaar book overstated by the same amount."""
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
    assert caches(party) == money("0", "0", "3800", "0", "0")
    with transaction.atomic():
        reversals, balance = reverse_source_entries(
            ctx=_ctx(party), source_type=SourceType.PAYMENT, source_id=payment_id, reason="Wrong"
        )
    assert [r.bucket for r in reversals] == ["loan"]
    assert balance == D("5000.00")
    assert caches(party) == money("0", "0", "5000", "0", "0")
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
    assert caches(party) == ZEROS


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
        elif kind < 0.8:
            bucket = "shop"
            entry_type, source = rng.choice(
                [
                    (EntryType.INVOICE, SourceType.SALES_DOCUMENT),
                    (EntryType.CREDIT_NOTE, SourceType.SALES_DOCUMENT),
                    (EntryType.PAYMENT_IN, SourceType.PAYMENT),
                ]
            )
        else:
            bucket = "main"
            entry_type, source = rng.choice(
                [
                    (EntryType.CHARGE, TEST_SOURCE),
                    (EntryType.ADJUSTMENT_CREDIT, TEST_SOURCE),
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
        assert caches(party)[4] == held[party.id]
    out = StringIO()
    call_command("recalc_balances", "--check", tenant=str(tenant.id), stdout=out)
    assert "0 found" in out.getvalue()


def test_recalc_balances_reports_and_repairs_a_drifted_loan_or_deposit_cache(
    tenant: Any, test_source: str
) -> None:
    """`recalc_balances` replays every cache: a `loan_balance` or `deposit_held` that a
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
    assert caches(party) == money("0", "0", "900", "0", "300")


# ── Readers of the balance ──────────────────────────────────────────────────


def test_aging_reads_the_udhaar_book_only(tenant: Any, test_source: str) -> None:
    """BR-6, DEC-019 — Old dues ages the udhaar book: a bill, a disbursal or a deposit is not
    "90+ days overdue" khata credit. QA B36: the headline counted three loans its own age table
    did not, and the two disagreed by ₹6,114."""
    from apps.ledger.selectors.aging import aging_rows

    party = PartyFactory(tenant=tenant)
    old = dt.date(2026, 1, 5)
    post(party, EntryType.CHARGE, "1000.00", source_type=TEST_SOURCE, bucket="main", day=old)
    post(party, EntryType.INVOICE, "700.00", source_type=SourceType.SALES_DOCUMENT, day=old)
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


def test_the_khata_totals_and_count_are_the_udhaar_books_own(tenant: Any, test_source: str) -> None:
    """BR-4, DEC-019 — "You gave in all" and "You got in all" on the khata header are the udhaar
    book's own lines. QA B9: a library fee showed there as "You gave in all ₹500"; a bill or a
    deposit counted there tells the merchant something happened in the khata that did not."""
    party = PartyFactory(tenant=tenant)
    post(party, EntryType.CHARGE, "1000.00", source_type=TEST_SOURCE, bucket="main")
    post(party, EntryType.ADJUSTMENT_CREDIT, "400.00", source_type=TEST_SOURCE, bucket="main")
    post(party, EntryType.INVOICE, "900.00", source_type=SourceType.SALES_DOCUMENT)
    post(party, EntryType.PAYMENT_IN, "700.00", source_type=SourceType.PAYMENT, bucket="deposit")
    summary = party_ledger_summary(tenant=tenant, party_id=party.id)
    assert summary["total_debit"] == D("1000.00")
    assert summary["total_credit"] == D("400.00")
    assert summary["entry_count"] == 2


def test_each_app_s_own_figure_decides_its_credit_limit(tenant: Any, test_source: str) -> None:
    """T-PLT-X01-7, DEC-019 — ₹2,300 owed in the khata, a ₹46,625 loan and a ₹9,000 bill, under
    a ₹5,000 limit in block mode. A new ₹2,000 khata entry is tested against the khata's ₹2,300
    alone (allowed); a new bill against the Shop's ₹9,000 alone (refused). Compared against the
    whole of what the person owes, both would be refused."""
    from apps.parties.services.credit import CREDIT_MODE_BLOCK, check_credit, credit_exposure

    party = PartyFactory(tenant=tenant, credit_limit=D("5000.00"))
    post(party, EntryType.CHARGE, "2300.00", source_type=TEST_SOURCE, bucket="main")
    post(party, EntryType.INVOICE, "9000.00", source_type=SourceType.SALES_DOCUMENT)
    post(party, EntryType.PAYMENT_OUT, "50000.00", source_type=SourceType.PAYMENT, bucket="loan")
    post(party, EntryType.INTEREST, "625.00", source_type=TEST_SOURCE, bucket="loan")
    post(party, EntryType.PAYMENT_IN, "4000.00", source_type=SourceType.PAYMENT, bucket="loan")
    post(party, EntryType.PAYMENT_IN, "1000.00", source_type=SourceType.PAYMENT, bucket="deposit")
    party.refresh_from_db()
    assert credit_exposure(party) == D("2300.00")
    assert credit_exposure(party, "shop") == D("9000.00")
    khata = check_credit(party=party, amount=D("2000.00"), mode=CREDIT_MODE_BLOCK)
    assert khata["status"] == "ok"
    assert khata["exposure_after"] == D("4300.00")
    bill = check_credit(party=party, amount=D("2000.00"), mode=CREDIT_MODE_BLOCK, bucket="shop")
    assert bill["status"] == CREDIT_MODE_BLOCK


def test_the_over_limit_filter_reads_the_khata_figure(tenant: Any, test_source: str) -> None:
    """The list's credit chips and the khata's bar must agree (`limit_status`'s own rule): a
    person whose loan or bills dwarf the limit but whose khata balance is small is not "over"."""
    from apps.parties.filters import PartyFilterSet

    borrower = PartyFactory(tenant=tenant, credit_limit=D("5000.00"))
    post(borrower, EntryType.CHARGE, "1000.00", source_type=TEST_SOURCE, bucket="main")
    post(borrower, EntryType.INVOICE, "9000.00", source_type=SourceType.SALES_DOCUMENT)
    post(borrower, EntryType.PAYMENT_OUT, "50000.00", source_type=SourceType.PAYMENT, bucket="loan")
    queryset = Party.objects.filter(tenant=tenant)
    over = PartyFilterSet(data={"credit": "over"}, queryset=queryset).qs
    ok = PartyFilterSet(data={"credit": "ok"}, queryset=queryset).qs
    assert borrower.id not in {p.id for p in over}
    assert borrower.id in {p.id for p in ok}


def test_a_khata_write_off_never_forgives_a_loan_or_a_bill(tenant: Any, test_source: str) -> None:
    """R23 / EC-7, DEC-019 — LED-11's write-off defaults to and is capped at the udhaar book's
    balance, so one tap there can never forgive a loan or a Shop bill: neither is in it."""
    from apps.common.exceptions import BusinessRuleViolation
    from apps.ledger.services.write_off import write_off_party_balance

    party = PartyFactory(tenant=tenant)
    post(party, EntryType.CHARGE, "2300.00", source_type=TEST_SOURCE, bucket="main")
    post(party, EntryType.INVOICE, "900.00", source_type=SourceType.SALES_DOCUMENT)
    post(party, EntryType.PAYMENT_OUT, "50000.00", source_type=SourceType.PAYMENT, bucket="loan")

    with pytest.raises(BusinessRuleViolation) as refused, transaction.atomic():
        locked = lock_party(tenant=tenant, party_id=party.id)
        write_off_party_balance(
            ctx=_ctx(party), party=locked, request={"reason": "Bad debt", "amount": "53200.00"}
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
    assert caches(party) == money("0", "900", "50000", "0", "0")
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


def test_another_app_s_money_refuses_the_archive_in_its_own_words(
    tenant: Any, api_as: Any, test_source: str
) -> None:
    """DEC-019 — a loan used to refuse an archive only by being inside `balance`, and the dialog
    then offered "Write off ₹2,300" for money that was mostly a loan. Now the udhaar book's own
    non-zero balance is the ordinary refusal, and a Shop bill left unpaid is refused by the
    Shop's guard, with its own sentence and no write-off offer."""
    client, _member = api_as(tenant)
    khata = PartyFactory(tenant=tenant)
    post(khata, EntryType.CHARGE, "300.00", source_type=TEST_SOURCE, bucket="main")
    buyer = PartyFactory(tenant=tenant)
    post(buyer, EntryType.INVOICE, "300.00", source_type=SourceType.SALES_DOCUMENT)

    plain = client.post(f"/api/v1/parties/{khata.id}/archive", {}, format="json")
    assert plain.status_code == 409 and plain.json()["error"]["code"] == "party_balance_nonzero"
    assert set(plain.json()["error"]["details"]) == {"balance", "balance_label", "suggestion"}

    shop = client.post(f"/api/v1/parties/{buyer.id}/archive", {}, format="json")
    assert shop.status_code == 409
    assert shop.json()["error"]["code"] == "party_has_open_records"
    assert shop.json()["error"]["details"] == {
        "module": "sales",
        "count": 1,
        "label_id": "parties.archive.owesOnBills",
    }


# ── The statement and the timeline ──────────────────────────────────────────


def test_the_statement_and_timeline_are_the_udhaar_book_s_own(
    tenant: Any, api_as: Any, test_source: str
) -> None:
    """T-PLT-X01-8, DEC-019 — the statement a merchant hands a customer and the khata timeline
    list only the udhaar book's lines; the closing still equals `party.balance` (LED-04 BR-3).
    A bill, a deposit or a loan is not printed there, and there is no "Deposit held" block."""
    party = PartyFactory(tenant=tenant)
    post(
        party,
        EntryType.CHARGE,
        "1000.00",
        source_type=TEST_SOURCE,
        bucket="main",
        day=dt.date(2026, 4, 1),
    )
    post(
        party,
        EntryType.INVOICE,
        "800.00",
        source_type=SourceType.SALES_DOCUMENT,
        day=dt.date(2026, 4, 2),
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
        EntryType.ADJUSTMENT_CREDIT,
        "400.00",
        source_type=TEST_SOURCE,
        bucket="main",
        day=dt.date(2026, 4, 3),
    )
    client, _member = api_as(tenant)

    body = client.get(f"/api/v1/parties/{party.id}/statement").json()
    data, meta = body["data"], body["meta"]
    assert [row["amount"] for row in data["rows"]] == ["1000.00", "400.00"]
    assert [row["running_balance"] for row in data["rows"]] == ["1000.00", "600.00"]
    assert data["closing_balance"] == "600.00"
    party.refresh_from_db()
    assert D(data["closing_balance"]) == party.balance
    assert "deposit" not in meta

    timeline = client.get(f"/api/v1/parties/{party.id}/ledger-entries").json()
    assert [(row["amount"], row["bucket"]) for row in timeline["data"]] == [
        ("400.00", "main"),
        ("1000.00", "main"),
    ]
    assert timeline["meta"]["summary"]["entry_count"] == 2


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


def test_the_party_detail_never_sends_another_app_s_money(
    tenant: Any, api_as: Any, test_source: str
) -> None:
    """DEC-019 — QA B3/B9: a Shop page showed "Loan left ₹964" and library fees, because the
    detail sent `loan_balance`, `trade_balance` and `deposit_held`. It now sends the udhaar
    book's `balance` and the Shop's `shop_balance` (the two apps that read this page), and
    nothing from lending, the library or a deposit."""
    party = PartyFactory(tenant=tenant)
    post(party, EntryType.CHARGE, "100.00", source_type=TEST_SOURCE, bucket="main")
    post(party, EntryType.INVOICE, "2300.00", source_type=SourceType.SALES_DOCUMENT)
    post(party, EntryType.PAYMENT_OUT, "5000.00", source_type=SourceType.PAYMENT, bucket="loan")
    post(party, EntryType.PAYMENT_IN, "1000.00", source_type=SourceType.PAYMENT, bucket="deposit")
    client, _member = api_as(tenant)
    data = client.get(f"/api/v1/parties/{party.id}").json()["data"]
    assert data["balance"] == "100.00"
    assert data["shop_balance"] == "2300.00"
    for key in ("loan_balance", "trade_balance", "deposit_held", "library_balance"):
        assert key not in data


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
    assert caches(party) == money("0", "0", "100", "0", "100")
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
    # `cached`/`ledger` are the udhaar book's figure, which agrees (DEC-019: no loan in it).
    assert summary["sample"][0]["cached"] == summary["sample"][0]["ledger"] == "0.00"


def test_the_migration_moves_old_rows_into_their_app_s_bucket(tenant: Any) -> None:
    """DEC-019's 0009 — every line written before the rule sat in `main`: a bill, a library fee
    and a khata entry added up into one balance. The migration's SQL moves each into its app's
    bucket, despite the immutability trigger, and rebuilds the caches so `recalc_balances`
    finds nothing to correct."""
    import importlib
    import uuid

    migration = importlib.import_module("apps.ledger.migrations.0009_rebucket_by_app")
    party = PartyFactory(tenant=tenant)

    def old_row(entry_type: str, source_type: str, amount: str) -> LedgerEntry:
        return LedgerEntry.objects.create(
            tenant=tenant,
            party=party,
            direction=Direction.DEBIT,
            amount=D(amount),
            entry_date=dt.date(2026, 4, 1),
            entry_type=entry_type,
            source_type=source_type,
            source_id=None if source_type == "manual" else uuid.uuid4(),
            bucket="main",
        )

    bill = old_row(EntryType.INVOICE, SourceType.SALES_DOCUMENT, "900.00")
    fee = old_row(EntryType.CHARGE, "library_charge", "500.00")
    gave = old_row(EntryType.MANUAL_GAVE, "manual", "200.00")
    Party.all_objects.filter(pk=party.pk).update(balance=D("1600.00"))

    with connection.cursor() as cursor:
        cursor.execute(migration.FORWARD)

    assert LedgerEntry.objects.get(pk=bill.pk).bucket == "shop"
    assert LedgerEntry.objects.get(pk=fee.pk).bucket == "library"
    assert LedgerEntry.objects.get(pk=gave.pk).bucket == "main"
    assert caches(party) == money("200", "900", "0", "500", "0")
    assert replay(party) == caches(party)
    # The trigger is back: no service may move a line afterwards.
    with pytest.raises(DatabaseError), transaction.atomic():
        LedgerEntry.objects.filter(pk=gave.pk).update(bucket="shop")
