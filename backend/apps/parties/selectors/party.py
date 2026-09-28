"""Read-only party queries (Part 26 §26.5).

A selector takes the tenant explicitly and scopes first; it never writes and
never opens a transaction (rule D8).
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any
from uuid import UUID

from django.db.models import Case, Count, DecimalField, F, Q, QuerySet, Sum, When
from django.db.models.functions import Coalesce

from apps.common.money import ZERO
from apps.parties.models import Party

#: The columns `PartyListSerializer` reads, and the only ones the list page
#: fetches. The model has 30; the list row needs these 9, and the three it does
#: not need are the wide ones — `notes` (TEXT), `billing_address` and
#: `shipping_address` (JSONB). §20.14.2 allows `only()` exactly here, on a hot
#: list path, and warns about the deferred-field footgun: a field left out and
#: then touched is a query *per row*. `test_list_columns_cover_the_list_row`
#: keeps this tuple and the serializer from drifting apart, and the query-budget
#: test would catch the N+1 if they ever did.
#:
#: Measured at a page of 100 on a 98 000-row tenant: 0.575 ms (`SELECT *`,
#: planner row width 897) -> 0.181 ms (width 81).
LIST_COLUMNS = (
    "id",
    "name",
    "display_code",
    "mobile",
    "is_customer",
    "is_supplier",
    "balance",
    "status",
    "last_activity_at",
    "collection_date",
)


def list_parties(*, tenant: Any, search: str | None = None) -> QuerySet[Party]:
    """The party list, scoped and ordered, ready for the paginator.

    Scoping is the first operation, so a `None` tenant yields the empty set
    rather than every tenant's rows (canon §0.11 rule 2).

    The ordering ends in `id` because the paginator is offset-based: a sort that
    is not total lets a tied row appear on two pages. `last_activity_at` is
    nullable, so ties are the common case, not the rare one. DRF's ordering
    backend replaces this tuple when the client sends `?ordering=`, which is why
    `StableOrderingFilter` re-appends the key rather than trusting this line.
    """
    qs = Party.objects.for_tenant(tenant)
    if search:
        qs = qs.filter(name__icontains=search.strip())
    # PTY-05 — one extra query for every tag on the page, instead of one per
    # row. Without it a page of 25 parties with tags is 26 queries and the
    # query budget fails, which is the point of having a budget.
    return (
        qs.prefetch_related("tags")
        .only(*LIST_COLUMNS)
        .order_by(
            # ── `NULLS LAST`, which FR-7 and BR-6 both require ──────────────────
            # Postgres sorts NULLs FIRST on a DESC order, so every party that has
            # never had an entry was arriving at the TOP of the list — above the
            # customer who bought something this morning. On a tenant with
            # bulk-imported contacts that is the entire first page.
            #
            # It is also the performance story, and the half that was got wrong.
            # The planner cannot walk an index to answer a query whose null
            # placement disagrees with the index's own — and
            # `ix_party_tenant_activity` was declared `-last_activity_at`, which is
            # `DESC NULLS FIRST`, while this asks for `DESC NULLS LAST`. So the
            # index this ordering depends on was unreachable from the moment
            # `nulls_last=True` was written here, and page 1 went back to scanning
            # the tenant and sorting all of it. Nothing failed, because the rows
            # come back correct either way; `tests/performance/test_party_list_plans.py`
            # now reads the plan instead of the rows.
            #
            # Migration 0004 rebuilds the index with the null placement spelled
            # out. Measured on a 100,000-party tenant: a parallel sequential scan
            # of 55,845 rows and a full sort, against an index scan and an
            # incremental sort over one tie group — 29 buffers, 0.088 ms.
            #
            # CLAUDE.md recorded the ordering itself as an open decision "that
            # changes visible ordering and wants a decision". It was not open: FR-7
            # says `NULLS LAST` and BR-6 repeats it.
            F("last_activity_at").desc(nulls_last=True),
            "name",
            "id",
        )
    )


#: The two figures the header answers, over the FILTERED set.
#:
#: Two conditional sums of ONE column, not two columns. `parties_party` does
#: carry cached `receivable_total` and `payable_total`, and using them here
#: would be wrong twice over: they belong to a different feature and are not
#: proven fresh against this query's filters, and a party's `balance` is the
#: number the list row itself displays — so a header computed from a different
#: column can disagree with the rows underneath it, which is the one thing a
#: total must never do.
TOTALS_ZERO = {"receivable": Decimal("0.00"), "payable": Decimal("0.00"), "count": 0}


def party_totals(queryset: QuerySet[Party]) -> dict:
    """`meta.totals` — one aggregate over the filtered, UNPAGINATED set.

    The aggregate runs on the queryset the filters produced and before the
    paginator slices it, which is the whole point: a merchant who filters to
    "they owe me" is asking how much, in total, they are owed — not how much
    the twenty-five rows on this page happen to add up to. The page sum was
    what the screen showed until now, and it said so, but "From the 25
    customers on this page" is an answer to a question nobody asked.

    `Coalesce` because `SUM` over no rows is NULL, and a filtered-empty list
    must report ₹0.00 rather than a missing key.
    """
    money = DecimalField(max_digits=14, decimal_places=2)
    # One aggregate, three numbers. `count` rides along rather than taking a
    # `queryset.count()` of its own: the page query already costs a COUNT for
    # `meta.total`, and a third trip for a number this same scan can produce is
    # a query budget spent on nothing.
    aggregate = queryset.aggregate(
        receivable=Coalesce(
            Sum(
                Case(
                    When(balance__gt=0, then=F("balance")),
                    default=Decimal("0.00"),
                    output_field=money,
                )
            ),
            Decimal("0.00"),
            output_field=money,
        ),
        payable=Coalesce(
            Sum(
                Case(
                    When(balance__lt=0, then=-F("balance")),
                    default=Decimal("0.00"),
                    output_field=money,
                )
            ),
            Decimal("0.00"),
            output_field=money,
        ),
        count=Count("id"),
        # PTY-06 FR-12 — how many of these are past their credit limit.
        #
        # In THIS aggregate rather than in a request of its own, and that is
        # §15's constraint being honoured rather than dodged: `balance >
        # credit_limit` compares two columns, so no index helps, and a separate
        # count on every list load is exactly the "on every list load" the spec
        # rules out. Riding along in a scan that is already happening costs the
        # comparison and nothing else.
        #
        # It therefore counts the FILTERED set, which is what the chip then
        # says: on the default unfiltered list that is the whole book, which is
        # the case the number is for, and on a narrowed one it answers the
        # narrower question the merchant just asked.
        over_limit=Count(
            "id",
            filter=Q(credit_limit__isnull=False, balance__gt=F("credit_limit")),
        ),
    )
    return {
        "receivable": aggregate["receivable"],
        "payable": aggregate["payable"],
        "count": aggregate["count"],
        "over_limit": aggregate["over_limit"],
    }


def get_party(*, tenant: Any, party_id: UUID | str) -> Party | None:
    """One party, or None. The caller decides whether None is a 404."""
    return Party.objects.for_tenant(tenant).filter(pk=party_id).first()


def party_detail_queryset(*, tenant: Any) -> QuerySet[Party]:
    """The scoped queryset `retrieve` looks an id up in — every column, no `only()`.

    The list path defers 21 of the model's 30 columns. The detail path must not:
    the serializer it feeds today happens to be the list serializer, but a detail
    serializer that grows one more field would turn each deferred column into a
    second query, which is the trap §20.14.2 names.
    """
    return Party.objects.for_tenant(tenant).prefetch_related("tags")


def party_summary(party: Party) -> dict:
    """The detail header's figures, read off the party that is already loaded.

    No query: `retrieve` has the row in hand, and a second trip to compute a
    column it is already holding is the kind of thing a query budget catches one
    sprint later.

    `receivable` and `payable` are DERIVED from the balance beside them (BR-3)
    rather than read from the `receivable_total` / `payable_total` columns.
    Those columns exist and `parties/services/balance.py` keeps them current,
    and reading them here would look like the obvious thing. It is the same
    mistake `party_totals` documents one function up: a header figure computed
    from a DIFFERENT column can disagree with the number printed next to it. A
    party whose balance was set by an import, a fixture or a migration — by
    anything that did not go through `apply_entry` — would render "You will get
    ₹2,300" above "Receivable ₹0.00", and both would be sincerely reported. The
    caches are for summing ACROSS parties, which is not a question this response
    asks; here it is two comparisons on a number already in hand.

    The ledger's own figures — how much has been given and got in all, and how
    many lines there are — are NOT here. They live in `meta.summary` on
    `/parties/{id}/ledger-entries`, because `parties` may not import `ledger`
    (Part 20 §20.1.4) and because the khata page requests that endpoint anyway
    for the timeline.
    """
    balance = party.balance or ZERO
    return {
        "balance": balance,
        "receivable": max(balance, ZERO),
        "payable": max(-balance, ZERO),
    }


# PTY-03 shipped a `party_credit()` selector here that returned
# `{limit, used, available}`. PTY-06 replaced it with `credit_snapshot()` in
# `services/credit.py`, which is where the rest of the rule lives — the
# exposure formula, the percentage, the three-state status and the tenant's
# mode all belong together, and a selector that computed half of them would be
# a second opinion about the same thing. Nothing calls the old name; it is
# removed rather than deprecated, because a dead function with a docstring that
# is slightly wrong is worse than no function at all.
