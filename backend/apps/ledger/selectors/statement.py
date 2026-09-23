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

from django.db.models import Case, DecimalField, F, Q, QuerySet, Sum, When, Window
from django.db.models.functions import Coalesce

from apps.common.constants import Direction
from apps.common.money import ZERO
from apps.common.pagination import keyset_after
from apps.ledger.models import LedgerEntry
from apps.ledger.selectors.entry import LIVE_ENTRIES, split_total_expressions, split_totals

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
