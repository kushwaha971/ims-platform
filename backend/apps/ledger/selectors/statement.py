"""LED-04 — the statement, and the running balance that makes it a passbook.

A khata's timeline answers "what happened"; a statement answers "and what did
the balance become each time". That second number is the whole artefact: it is
what a merchant points at across a counter when a customer disagrees, and it is
why FRD §1 calls the statement "the trust artefact that ends disputes".

── Why the running balance is computed and never stored ─────────────────────
`ledger_entry.running_balance_after` exists in Part 21 §21.3.4 as an optional
cache and is deliberately left NULL — `apps/ledger/models.py` says why, and this
module is the other half of that sentence. A running balance is a property of an
ORDERING, not of a row: insert one backdated entry, which FR-3 of LED-01 exists
to allow, and every cached figure after it is silently wrong for ever. Computed
over the statement's own ordering it is true by construction, and the only cost
is a window function over one party's rows.

── The ordering, and why it is ASCENDING here ───────────────────────────────
BR-1: `(entry_date, created_at, id)`. The timeline reads the same three columns
DESCENDING, because a merchant opening a khata wants today at the top; a
statement reads them ascending, because a passbook is read from the beginning
and a running balance only means anything in the direction it accumulates. The
index `ix_ledger_party_date` serves both — Postgres walks a b-tree either way.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any
from uuid import UUID

from django.db.models import Case, DecimalField, F, Q, QuerySet, RowRange, Sum, Value, When, Window
from django.db.models.functions import Coalesce

from apps.common.constants import Direction
from apps.common.money import ZERO
from apps.common.pagination import keyset_after
from apps.ledger.models import LedgerEntry
from apps.ledger.selectors.entry import (
    LIVE_ENTRIES,
    TIMELINE_ORDERING,
    split_total_expressions,
    split_totals,
)

MONEY = DecimalField(max_digits=14, decimal_places=2)

#: BR-1. The statement's ordering, ascending, and the tuple the cursor pages by.
#:
#: `id` last and never reached in practice — uuid7 embeds the millisecond — but
#: a keyset over a non-unique tuple can return a row on two pages, and "unique
#: in practice" is not a guarantee. The same reasoning as `TIMELINE_ORDERING`,
#: which is this tuple reversed.
STATEMENT_ORDERING: tuple[str, ...] = ("entry_date", "created_at", "id")

#: `+amount` for a debit, `−amount` for a credit — canon §0.2's signed sum, as a
#: database expression. The amount column carries no sign, so this is the one
#: place the direction becomes arithmetic.
SIGNED = Case(
    When(direction=Direction.DEBIT, then=F("amount")),
    default=-F("amount"),
    output_field=MONEY,
)

#: Everything a statement may show when the merchant asks to see corrections:
#: the standing rows AND both halves of every reversal pair (LED-03 BR-5).
#:
#: `status__in` rather than "no filter at all", because a future status — a
#: draft, a scheduled entry — would otherwise appear in a customer's statement
#: the day it is added. The set is named so that adding one is a decision.
ALL_POSTED_OR_REVERSED = Q(status__in=("posted", "reversed"))


def statement_predicate(*, include_corrections: bool) -> Q:
    """Which rows the statement is over.

    Off — the default — is `LIVE_ENTRIES`, the SAME predicate the balance is
    summed over and the timeline filtered by. That identity is BR-3: the closing
    balance of an unbounded statement must equal `parties_party.balance`, and it
    can only be relied on to if both are the same set of rows. A second, similar
    predicate here would be a second thing to keep true.

    On, both halves of every reversal pair come back so an accountant can audit
    what was changed — and the closing balance is IDENTICAL, because the pair
    nets to zero. T-LED-04-3 asserts exactly that, and it is the arithmetic
    canon §0.2 rests on.
    """
    return ALL_POSTED_OR_REVERSED if include_corrections else LIVE_ENTRIES


def _scoped(
    *, tenant: Any, party_id: UUID | str, include_corrections: bool
) -> QuerySet[LedgerEntry]:
    """One party's rows, tenant first (canon §0.11 rule 2)."""
    if tenant is None:
        return LedgerEntry.objects.none()
    return LedgerEntry.objects.filter(tenant=tenant, party_id=party_id).filter(
        statement_predicate(include_corrections=include_corrections)
    )


def _signed_total(queryset: QuerySet[LedgerEntry]) -> Decimal:
    return (
        queryset.aggregate(total=Coalesce(Sum(SIGNED), Decimal("0.00"), output_field=MONEY))[
            "total"
        ]
        or ZERO
    )


def opening_balance(
    *,
    tenant: Any,
    party_id: UUID | str,
    date_from: dt.date | None,
    include_corrections: bool = False,
) -> Decimal:
    """BR-2 — what the party owed the instant before this period began.

    The signed sum of every qualifying row dated STRICTLY before `date_from`.
    With no `date_from` there is nothing before the period, so the opening is
    zero and the closing is the party's whole-life balance — which is BR-3, and
    the reason an unbounded statement is the one a merchant can check against
    the figure on the khata page.

    One aggregate, on the same index the rows are read from (§20).

    A note on the predicate, because it looks like it should not matter: with
    corrections excluded the pair nets to zero, so the two predicates give the
    same number here. It is applied anyway, and BR-2 says why — consistency
    "to avoid off-by-one on same-day reversals". A reversal dated the same day
    as `date_from` is in one set and out of the other, and an opening computed
    over a different set from the rows beneath it is an opening that will
    eventually disagree with the first row's running balance by exactly one
    entry, on exactly one day, for exactly one party.
    """
    if date_from is None:
        return ZERO
    scoped = _scoped(tenant=tenant, party_id=party_id, include_corrections=include_corrections)
    return _signed_total(scoped.filter(entry_date__lt=date_from))


def carried_forward(
    *,
    tenant: Any,
    party_id: UUID | str,
    date_from: dt.date | None,
    position: dict | None,
    include_corrections: bool = False,
) -> Decimal:
    """The running balance the FIRST row of this page carries in from.

    On page one this is just the opening. On page two and after it is the
    opening plus everything in the period the merchant has already scrolled
    past, and computing it is not an optimisation — it is the correctness of
    every page but the first.

    ── The trap this exists to avoid ────────────────────────────────────────
    The obvious implementation is `.annotate(Window(...)).filter(keyset)` and it
    is WRONG, silently. Django 5 does not wrap that in a subquery: the keyset
    goes into the WHERE clause, so the window is computed over the rows that
    survive it and the page's first row restarts from zero. Page one is correct,
    which is the page every unit test and every screenshot looks at. Measured on
    five rows: paging from the third returned 100, 200, 300 where the true
    running balances are 300, 400, 500.

    So the window runs over the page (below) and this scalar is added to it.
    `~keyset_after(...)` is "not strictly after the cursor", which INCLUDES the
    cursor row itself — correct, because the cursor is the last row of the
    previous page and its own amount is part of what this page carries in.
    """
    opening = opening_balance(
        tenant=tenant,
        party_id=party_id,
        date_from=date_from,
        include_corrections=include_corrections,
    )
    if not position:
        return opening
    scoped = _scoped(tenant=tenant, party_id=party_id, include_corrections=include_corrections)
    if date_from is not None:
        scoped = scoped.filter(entry_date__gte=date_from)
    return opening + _signed_total(scoped.filter(~keyset_after(position, STATEMENT_ORDERING)))


def statement_rows(
    *,
    tenant: Any,
    party_id: UUID | str,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    include_corrections: bool = False,
) -> QuerySet[LedgerEntry]:
    """The period's rows, ascending, each annotated with `running_delta`.

    `running_delta` is the window's own figure — the signed sum from the first
    row this query returns up to and including that row. It is NOT the running
    balance: the view adds `carried_forward` to it, for the reason that function
    documents at length. The name says so, because a field called
    `running_balance` that is only a running balance after somebody adds
    something to it is the kind of name that ships a wrong number.

    The filters run BEFORE the window, which FR-3 requires explicitly. Excluding
    a reversal pair after the window would leave every intermediate running
    balance wrong while the closing figure came out right — the subtle half of
    the bug, and the one a merchant would find rather than a test.
    """
    scoped = _scoped(tenant=tenant, party_id=party_id, include_corrections=include_corrections)
    if date_from is not None:
        scoped = scoped.filter(entry_date__gte=date_from)
    if date_to is not None:
        scoped = scoped.filter(entry_date__lte=date_to)
    return (
        scoped.select_related("created_by")
        .annotate(
            running_delta=Window(
                expression=Sum(SIGNED),
                order_by=[F("entry_date").asc(), F("created_at").asc(), F("id").asc()],
            )
        )
        .order_by(*STATEMENT_ORDERING)
    )


def statement_totals(
    *,
    tenant: Any,
    party_id: UUID | str,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    include_corrections: bool = False,
) -> dict:
    """BR-5 — what was given and what came back, over the period.

    Over the whole period rather than the page: a merchant reading "You gave in
    all ₹4,500" under a table showing the first fifty of two hundred rows is
    reading a figure about the table, and the figure they want is about the
    period. One aggregate, two conditional sums.

    `net_change` is deliberately NOT here. It is `closing − opening` and it is
    also `debit − credit + written_off.debit − written_off.credit`; a third
    place to compute it is a third place for the three to disagree, and the
    client can subtract (CR-125).

    `debit` and `credit` are "You gave" and "You got" and so EXCLUDE write-offs,
    which are neither (LED-11 §8, BR-3); they arrive as `written_off {debit,
    credit}` so the strip can print a third line and still add up —
    CR-2026-09-24-A, and `selectors/entry.py` has the whole rule.
    """
    scoped = _scoped(tenant=tenant, party_id=party_id, include_corrections=include_corrections)
    if date_from is not None:
        scoped = scoped.filter(entry_date__gte=date_from)
    if date_to is not None:
        scoped = scoped.filter(entry_date__lte=date_to)
    return split_totals(scoped.aggregate(**split_total_expressions()))


#: The signed amount of a row that COUNTS, and zero for one that does not.
#:
#: `SIGNED` filtered by `LIVE_ENTRIES` inside the expression rather than in the
#: WHERE clause, because the timeline's "Show corrections" returns rows that do
#: not count (both halves of every reversal pair) and each of them still needs
#: a running balance. Canon §0.2 says neither half is in the balance, so each
#: contributes nothing and carries the figure as it stood — see
#: `with_running_balance` for why that, rather than `null`.
#:
#: `Value(0)` rather than no default: `SUM` over a run of NULLs is NULL, and a
#: party whose first row is a struck-through one would start its timeline with
#: a balance of nothing.
LIVE_SIGNED = Case(
    When(LIVE_ENTRIES & Q(direction=Direction.DEBIT), then=F("amount")),
    When(LIVE_ENTRIES, then=-F("amount")),
    default=Value(Decimal("0.00")),
    output_field=MONEY,
)


def with_running_balance(queryset: QuerySet[LedgerEntry]) -> QuerySet[LedgerEntry]:
    """CR-027 / PTY-03 FR-6 — the timeline's page, with what each row's running balance needs.

    The running balance of a row is the balance AFTER it in the ledger's own
    order — `STATEMENT_ORDERING`, ascending, the direction a balance
    accumulates — in the statement's sign convention (debit positive). It is
    assembled from three parts, exactly as the statement's is from a window
    and a carried scalar:

        running_balance(r) = carried − timeline_delta(r) + timeline_own(r)

    · `carried` — `timeline_carried()`: the signed total of every counting row
      at or older than the page's first row. Page one: the party's whole live
      total. Page two onwards: everything older than the cursor.
    · `timeline_delta` — a window over the page's rows, NEWEST first, summing
      from the page's first row down to and including this one.
    · `timeline_own` — this row's own contribution.

    Subtracting what is newer than a row from what is at-or-older than the
    page's top leaves precisely what is at-or-older than the row, which is the
    ascending running balance. `test_the_newest_running_balance_is_the_party_
    balance_on_a_fuzzed_book` replays it oldest-first in Python and compares
    every row.

    ── Why the window runs NEWEST first, when FR-6 describes it ascending ────
    FR-6's window `SUM(...) OVER (ORDER BY entry_date, created_at, id)` is the
    DEFINITION, and it is what the figure equals. Computed literally, on a page
    served newest-first, Postgres must read every one of the party's rows,
    window them ascending, then sort them back descending to find the first
    twenty-five — `test_the_timeline_page_walks_the_party_date_index` caught
    exactly that plan (Bitmap Heap Scan → Sort → WindowAgg → Sort → Limit) on
    the first attempt, on the screen a merchant opens most. Ordered the way the
    page is served, the window streams off `ix_ledger_party_date` and stops at
    `LIMIT`; the one O(n) piece left is a plain SUM (`timeline_carried`), which
    on page one is not even a query of its own.

    ── The carried_forward trap, and why page two is where it bites ─────────
    `.annotate(Window).filter(keyset)` computes the window over the rows the
    keyset LEAVES (Django 5 does not wrap it in a subquery). Here that is the
    point: the window restarts at the page's first row by design, and
    `carried` is recomputed per page from the cursor. A page-two request that
    reused page one's carried figure, or none, would be wrong by everything the
    merchant had scrolled past — `test_page_boundaries_are_continuous_with_
    ties_on_the_date` pages two rows at a time across a run of equal dates.

    ── Struck-through rows ───────────────────────────────────────────────────
    `LIVE_SIGNED` makes both halves of a reversal pair contribute zero, so with
    `include_reversed=true` each carries the balance as it stood rather than
    `null`. PTY-03 BR-3 and T-PTY-03-15 require that flipping "Show
    corrections" changes no displayed running balance, and a zero contribution
    is the only rule under which every standing row keeps its figure AND the
    newest row still equals the header when the newest row is a reversal.

    (The statement with `include_corrections=true` sums both halves inside its
    window instead — the closing is identical because the pair nets to zero,
    but a row posted between the two halves reads a figure that includes the
    struck original. That divergence is recorded in CR-LOG, not changed here.)

    ── What must never be added to this queryset's WHERE ────────────────────
    `carried` is computed over the party's rows with only the cursor applied. A
    display filter the page honours and `carried` does not — PTY-03 FR-7's
    `date_from`, `date_to` or `type`, none of them built — would make the two
    disagree about which rows exist. When one lands it has to be applied to
    both, or expressed as a zero contribution the way `include_reversed` is.
    """
    return queryset.annotate(
        timeline_own=LIVE_SIGNED,
        timeline_delta=Window(
            expression=Sum(LIVE_SIGNED),
            order_by=[F("entry_date").desc(), F("created_at").desc(), F("id").desc()],
            frame=RowRange(start=None, end=0),
        ),
    )


def timeline_carried(*, tenant: Any, party_id: UUID | str, position: dict | None) -> Decimal:
    """The signed total of every counting row at or older than a timeline page's top.

    `keyset_after(position, TIMELINE_ORDERING)` is "strictly after the cursor
    in newest-first order", which is strictly OLDER than the cursor row — the
    rows the page starts from. The cursor row itself is excluded, correctly: it
    was the last row of the previous page, and it is newer than everything
    here. With no cursor it is the party's whole live balance, which is BR-1's
    other side.

    `LIVE_ENTRIES` whatever `include_reversed` says, because a row outside it
    contributes zero on the page too (`LIVE_SIGNED`). One aggregate, on the
    party's own rows.
    """
    if tenant is None:
        return ZERO
    scoped = LedgerEntry.objects.filter(tenant=tenant, party_id=party_id).filter(LIVE_ENTRIES)
    if position:
        scoped = scoped.filter(keyset_after(position, TIMELINE_ORDERING))
    return _signed_total(scoped)


def live_total_from_summary(summary: dict) -> Decimal:
    """Page one's `carried`, read off the `meta.summary` aggregate already made.

    `party_ledger_summary` splits the party's `LIVE_ENTRIES` into gave, got and
    written-off by direction, and those four buckets are mutually exclusive and
    exhaustive (`selectors/entry.py`), so their signed sum is exactly
    `timeline_carried(position=None)`. Reusing it keeps the first page — the
    one every khata opens on — at the query budget it had before CR-027.
    """
    written_off = summary["written_off"]
    return (
        summary["total_debit"]
        - summary["total_credit"]
        + written_off["debit"]
        - written_off["credit"]
    )


def has_entries_before_opening(*, tenant: Any, party_id: UUID | str) -> bool:
    """FR-11 / LED-02 BR-3 — is there a row dated before the opening balance?

    A merchant who types an opening dated 1 April and then backdates an entry to
    March has a statement whose first figure is not the whole story, and no
    arithmetic can tell them so — both numbers are right. The warning is the
    only thing that can.

    `exists()` on an indexed range, and only when there IS an opening: a party
    with no opening entry has nothing for a row to be before.
    """
    if tenant is None:
        return False
    opening = (
        LedgerEntry.objects.filter(
            tenant=tenant, party_id=party_id, entry_type="opening", status="posted"
        )
        .values_list("entry_date", flat=True)
        .first()
    )
    if opening is None:
        return False
    return (
        LedgerEntry.objects.filter(tenant=tenant, party_id=party_id, entry_date__lt=opening)
        .filter(LIVE_ENTRIES)
        .exists()
    )
