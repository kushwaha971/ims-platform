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

from apps.common.constants import Direction
from apps.common.money import ZERO
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

#: `Σ debit − Σ credit`, as a database expression over `LIVE_ENTRIES`.
SIGNED_AMOUNT = Sum(
    Case(
        When(direction=Direction.DEBIT, then=F("amount")),
        When(direction=Direction.CREDIT, then=-F("amount")),
        default=Decimal("0.00"),
        output_field=MONEY,
    ),
    filter=LIVE_ENTRIES,
)


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


def party_ledger_summary(*, tenant: Any, party_id: UUID | str) -> dict:
    """The khata header's figures that come from the LEDGER rather than the party row.

    Three of PTY-03 §14's seven. The other four — invoiced, paid against
    documents, overdue — are about `sales_document` and `payments_payment`,
    which have no tables, and they stay out for the reason the timeline stayed
    out of PTY-03: a zero this code cannot verify is indistinguishable from a
    real zero once it is on the screen.

    One aggregate, three numbers, over the same `LIVE_ENTRIES` predicate the
    balance uses — so "total you gave" and the balance can never tell different
    stories about the same rows.
    """
    if tenant is None:
        return {"total_debit": ZERO, "total_credit": ZERO, "entry_count": 0}
    aggregate = LedgerEntry.objects.filter(tenant=tenant, party_id=party_id).aggregate(
        total_debit=Coalesce(
            Sum("amount", filter=LIVE_ENTRIES & Q(direction=Direction.DEBIT)),
            Decimal("0.00"),
            output_field=MONEY,
        ),
        total_credit=Coalesce(
            Sum("amount", filter=LIVE_ENTRIES & Q(direction=Direction.CREDIT)),
            Decimal("0.00"),
            output_field=MONEY,
        ),
        entry_count=Count("id", filter=LIVE_ENTRIES),
    )
    return {
        "total_debit": aggregate["total_debit"],
        "total_credit": aggregate["total_credit"],
        "entry_count": aggregate["entry_count"],
    }
