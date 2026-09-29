"""Read-only ledger queries (Part 26 §26.5).

A selector takes the tenant explicitly and scopes first; it never writes and
never opens a transaction (rule D8).
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any
from uuid import UUID

from django.db.models import Case, Count, DecimalField, F, Q, QuerySet, Sum, When
from django.db.models.functions import Coalesce

from apps.common.constants import BALANCE_BUCKET_VALUES, Direction, LedgerBucket
from apps.common.money import ZERO
from apps.ledger.constants import EntryType
from apps.ledger.models import LedgerEntry

MONEY = DecimalField(max_digits=14, decimal_places=2)

# ── The balance rule, and a conflict in the spec worth stating ───────────────
#
# Canon §0.2 defines a party's balance as "Σ debit − Σ credit of **non-reversed**
# entries". Part 21 §21.3.4 writes it as a sum over every row with
# `status='posted'` and argues that reversal pairs cancel. Those are not the
# same formula, and §21.3.4's is wrong:
#
#     original  debit 500, later reversed  -> status becomes 'reversed'
#     reversal  credit 500                 -> status stays 'posted'
#
# Summing the posted rows counts the reversal and skips the original, so the
# pair nets to −500 rather than to zero — the reversal applied twice, once by
# excluding what it undid and once by its own line. The arithmetic cancels only
# if BOTH rows are counted or NEITHER is.
#
# Canon's precedence rule settles it ("if a later chapter conflicts with this
# part, this part wins and the later chapter is a defect"), and canon's formula
# is the one a merchant would recognise: a reversed line and the line that
# reversed it are both struck through in the statement and neither is in the
# total. Recorded in the change-request register as a defect against §21.3.4.
#
# Nothing in LED-01 can produce a reversal — LED-03 does — so the two formulas
# agree on every row this sprint writes. The rule is stated now because
# `recalc_balances` is built on it, and a cache rebuilt with the wrong formula
# is worse than no cache at all.

#: The rows that count towards a party's balance: posted, and neither half of a
#: reversal pair. The original carries `reversed_by_id`, the reversal carries
#: `reverses_id`, and a correction's REPLACEMENT row carries neither and counts.
#:
#: One `Q`, used by both the incremental path and the full replay, so the two
#: cannot drift apart.
LIVE_ENTRIES = Q(status="posted", reversed_by__isnull=True, reverses__isnull=True)

# ── Buckets (A2, ADR-043, FRD 00 PLT-X01 BR-1 and BR-4) ──────────────────────
#
# `party.balance` is Σ signed over the `main` and `loan` buckets; a `deposit` line is
# money HELD for the party and is never in it. Every reader of the balance — this
# module's aggregates, the statement's window and carry, the timeline's running
# balance, the drift check and `recalc_balances` — narrows by the ONE constant below,
# imported rather than restated (the LED-04 rule: a replay written from the same prose
# is not a check). For a tenant whose every row is `main` the narrowing changes no row.

#: The rows `party.balance` is summed over, beside `LIVE_ENTRIES`.
BALANCE_BUCKETS = Q(bucket__in=BALANCE_BUCKET_VALUES)
#: The loan part of the balance (`party.loan_balance`).
LOAN_BUCKET = Q(bucket=LedgerBucket.LOAN)
#: Deposits held (`party.deposit_held`), outside the balance.
DEPOSIT_BUCKET = Q(bucket=LedgerBucket.DEPOSIT)

_SIGNED = Case(
    When(direction=Direction.DEBIT, then=F("amount")),
    When(direction=Direction.CREDIT, then=-F("amount")),
    default=Decimal("0.00"),
    output_field=MONEY,
)

#: `Σ debit − Σ credit`, as a database expression over `LIVE_ENTRIES` in the balance
#: buckets — `party.balance`.
SIGNED_AMOUNT = Sum(_SIGNED, filter=LIVE_ENTRIES & BALANCE_BUCKETS)

#: The same over the `loan` bucket alone — `party.loan_balance`.
LOAN_SIGNED_AMOUNT = Sum(_SIGNED, filter=LIVE_ENTRIES & LOAN_BUCKET)

#: `Σ credit − Σ debit` over the `deposit` bucket — `party.deposit_held`. The opposite
#: sign to the balance on purpose: a deposit received is a credit, and it INCREASES
#: what is held (BR-1).
DEPOSIT_HELD_AMOUNT = Sum(-_SIGNED, filter=LIVE_ENTRIES & DEPOSIT_BUCKET)


def computed_balance(*, tenant: Any, party_id: Any) -> Decimal:
    """A party's balance re-derived from the ledger. The cache's ground truth.

    One aggregate over one party. This is what `recalc_balances` compares the
    cache against and what a test asserts after a run of random entries — the
    only honest way to know a cache is right is to compute the thing it caches,
    by a different route from the one that maintains it.
    """
    total = LedgerEntry.objects.filter(tenant=tenant, party_id=party_id).aggregate(
        balance=Coalesce(SIGNED_AMOUNT, Decimal("0.00"), output_field=MONEY)
    )["balance"]
    return total or ZERO


def computed_loan_balance(*, tenant: Any, party_id: Any) -> Decimal:
    """`party.loan_balance` re-derived from the ledger — the loan bucket's ground truth."""
    total = LedgerEntry.objects.filter(tenant=tenant, party_id=party_id).aggregate(
        loan=Coalesce(LOAN_SIGNED_AMOUNT, Decimal("0.00"), output_field=MONEY)
    )["loan"]
    return total or ZERO


def computed_deposit_held(*, tenant: Any, party_id: Any) -> Decimal:
    """`party.deposit_held` re-derived from the ledger — the deposit bucket's ground truth."""
    total = LedgerEntry.objects.filter(tenant=tenant, party_id=party_id).aggregate(
        held=Coalesce(DEPOSIT_HELD_AMOUNT, Decimal("0.00"), output_field=MONEY)
    )["held"]
    return total or ZERO


#: The ordering the timeline reads and the cursor pages by, in one place because
#: the two must agree exactly or the cursor skips rows.
#:
#: `entry_date` first, because BR-5 makes it the business date and a merchant
#: reads their khata by when things HAPPENED. `created_at` second, because a
#: date is not unique — a shop posts a dozen entries on a Saturday — and it
#: breaks the tie by when they were written down, which is the order they were
#: written down in. `id` last and never reached in practice: uuid7 embeds the
#: millisecond, so two entries share a `created_at` only if they were created in
#: the same microsecond. It is there because a keyset over a non-unique tuple
#: can return a row on two pages, and "in practice unique" is not a guarantee.
TIMELINE_ORDERING: tuple[str, ...] = ("-entry_date", "-created_at", "-id")


def party_entries(
    *, tenant: Any, party_id: UUID | str, include_reversed: bool = False
) -> QuerySet[LedgerEntry]:
    """One party's khata, newest first, ready for the cursor paginator.

    Scoping is the first operation, so a `None` tenant yields the empty set
    rather than every tenant's rows (canon §0.11 rule 2).

    `select_related("created_by")` because FR-8 puts "by Sunita" on every row a
    different person wrote, and a timeline of fifty entries would otherwise be
    fifty-one queries — the exact shape the query-budget test exists to catch.

    ── `include_reversed` (LED-03 BR-5) ──────────────────────────────────────
    By default the timeline shows only the rows that COUNT — the same
    `LIVE_ENTRIES` the balance is summed over, so what a merchant reads adds up
    to the figure in the header. A correction otherwise turns one ₹500 line into
    three (the mistake, the reversal, the ₹550 replacement), and a khata that
    grows by three lines every time somebody fixes a typo is one nobody can read
    at the counter.

    The struck-through history is one tap away rather than gone: `?include_
    reversed=true` returns every row, which is what FR-7's "Show corrections"
    toggle asks for and what an accountant checking a disputed figure needs.
    Nothing is ever hidden from the API without a parameter that reveals it.
    """
    if tenant is None:
        return LedgerEntry.objects.none()
    queryset = LedgerEntry.objects.filter(tenant=tenant, party_id=party_id)
    if not include_reversed:
        queryset = queryset.filter(LIVE_ENTRIES)
    return queryset.select_related("created_by").order_by(*TIMELINE_ORDERING)


def recent_entries(*, tenant: Any, party_id: UUID | str, limit: int = 5) -> list[LedgerEntry]:
    """The khata header's first few rows, for the detail response (PTY-03 §14).

    A separate function rather than `party_entries(...)[:5]` at the call site,
    because the number is a contract with the client — PTY-03 documents
    `recent_entries[5]` — and a slice written at the call site is a number two
    readers have to agree on.
    """
    return list(party_entries(tenant=tenant, party_id=party_id)[:limit])


# ── Gave, got, and written off (CR-2026-09-24-A) ─────────────────────────────
#
# A write-off (PTY-04 FR-3, LED-11) is a ledger line with a direction — `credit`
# when a receivable is forgiven, `debit` when a payable is — and it moves the
# balance exactly as a payment would. It is NOT a payment: LED-11 BR-3 keeps it
# out of every "collections" total and §8 paints it "neither gave nor got". So a
# khata that summed it into "You got in all" told the merchant they had been
# paid ₹2,500 they will never see, over a row that reads "Written off".
#
# The fix keeps the arithmetic and moves the figure: every total the ledger
# reports is split into THREE mutually exclusive buckets over one set of rows —
#
#     debit       Σ amount, direction=debit,  entry_type ≠ write_off
#     credit      Σ amount, direction=credit, entry_type ≠ write_off
#     written_off {debit, credit} — the write-off rows, by direction
#
# so `debit − credit + written_off.debit − written_off.credit` is still exactly
# the signed sum of the rows (and, on an unbounded statement, the balance). The
# server carries the components and NEVER the net (CR-125): the client adds the
# third line to the two it already shows.
#
# Classified by the row's OWN `entry_type`, and only that. A correction's
# replacement keeps `write_off` (LED-11 BR-4, `PRESERVED_ENTRY_TYPES`) and so
# stays in the bucket; a reversal row is `entry_type='reversal'` and is out of
# every live total anyway (both halves of a pair are excluded by
# `LIVE_ENTRIES`). With corrections shown on a statement the reversal sits in
# gave/got as every reversal does — the same column its row is printed in.
#
# Opening entries are unchanged: an `opening` debit counts in `debit` ("You gave
# in all") and an `opening` credit in `credit`, as they always have. LED-02 says
# nothing to the contrary and the khata header has read that way since LED-02.

#: The write-off rows. One `Q`, used by the timeline summary and the statement.
WRITE_OFF_ENTRIES = Q(entry_type=EntryType.WRITE_OFF)


def _money_sum(condition: Q) -> Coalesce:
    return Coalesce(Sum("amount", filter=condition), Decimal("0.00"), output_field=MONEY)


def split_total_expressions(within: Q | None = None) -> dict[str, Coalesce]:
    """The four conditional sums behind every gave / got / written-off figure.

    `within` narrows the rows (the timeline passes `LIVE_ENTRIES`; the statement
    has already filtered its queryset). Returned as expressions rather than a
    result so a caller can add its own aggregate — `entry_count` — to the SAME
    query instead of making a second trip.
    """
    # A2 BR-4 — gave, got and written-off are figures about what is OWED, so a deposit
    # line is in none of them; it is reported in its own block (the statement's
    # "Deposit held") and by `party.deposit_held`.
    base = (within if within is not None else Q()) & BALANCE_BUCKETS
    debit, credit = Q(direction=Direction.DEBIT), Q(direction=Direction.CREDIT)
    return {
        "debit": _money_sum(base & debit & ~WRITE_OFF_ENTRIES),
        "credit": _money_sum(base & credit & ~WRITE_OFF_ENTRIES),
        "written_off_debit": _money_sum(base & debit & WRITE_OFF_ENTRIES),
        "written_off_credit": _money_sum(base & credit & WRITE_OFF_ENTRIES),
    }


def split_totals(aggregate: dict) -> dict:
    """Shape `split_total_expressions`' result as the wire carries it."""
    return {
        "debit": aggregate["debit"] or ZERO,
        "credit": aggregate["credit"] or ZERO,
        "written_off": {
            "debit": aggregate["written_off_debit"] or ZERO,
            "credit": aggregate["written_off_credit"] or ZERO,
        },
    }


def party_ledger_summary(*, tenant: Any, party_id: UUID | str) -> dict:
    """The khata header's figures that come from the LEDGER rather than the party row.

    Three of PTY-03 §14's seven. The other four — invoiced, paid against
    documents, overdue — are about `sales_document` and `payments_payment`,
    which have no tables, and they stay out for the reason the timeline stayed
    out of PTY-03: a zero this code cannot verify is indistinguishable from a
    real zero once it is on the screen.

    One aggregate over the same `LIVE_ENTRIES` predicate the balance uses — so
    "total you gave" and the balance can never tell different stories about the
    same rows. `total_debit` / `total_credit` exclude write-offs, which arrive
    beside them as `written_off {debit, credit}`; the three together still sum
    to the balance (see the block above).
    """
    if tenant is None:
        return {
            "total_debit": ZERO,
            "total_credit": ZERO,
            "written_off": {"debit": ZERO, "credit": ZERO},
            "entry_count": 0,
        }
    aggregate = LedgerEntry.objects.filter(tenant=tenant, party_id=party_id).aggregate(
        **split_total_expressions(LIVE_ENTRIES),
        # Every live line, deposits included: the count decides whether the khata shows a
        # timeline or a first-use empty state, and the timeline lists a deposit line.
        entry_count=Count("id", filter=LIVE_ENTRIES),
    )
    totals = split_totals(aggregate)
    return {
        "total_debit": totals["debit"],
        "total_credit": totals["credit"],
        "written_off": totals["written_off"],
        "entry_count": aggregate["entry_count"],
    }
