"""The party list's query plans, asserted rather than assumed (FRD PTY-02 NFR-1).

An index that the planner never chooses is not a slow index, it is a missing
one that also costs disk and write time — and nothing in the suite could tell
the difference, because a plan that reads every row in the tenant and sorts it
returns exactly the same rows as one that walks an index and stops. That is how
`ix_party_tenant_activity` came to be declared `-last_activity_at`
(`DESC NULLS FIRST` in Postgres) while the query asked for `DESC NULLS LAST`:
two different orderings, an index the planner could not use, and a green suite.

So these tests read `EXPLAIN` and assert the SHAPE of the plan. They need
enough rows that an index is genuinely the cheaper option — on a table small
enough to sit in a couple of pages a sequential scan wins and deserves to — so
they build a fixture and are marked `slow`.
"""

from __future__ import annotations

import random
import time
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

import pytest
from django.db import connection
from django.db.models import F
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone

from apps.parties.constants import PartyStatus
from apps.parties.models import Party
from apps.parties.selectors.party import list_parties

pytestmark = [pytest.mark.django_db, pytest.mark.slow, pytest.mark.postgres]

#: Each claim gets the SMALLEST fixture that makes it true, because building
#: rows is the whole cost of this module and every test pays its fixture again.
#:
#: Below its size a sequential scan is genuinely the cheaper plan and asserting
#: otherwise would be asserting that the planner is wrong. The ordering index
#: starts winning at about 20,000 rows; a GIN scan for a two-row match only
#: beats reading the table at around 50,000, which is why the search test costs
#: two and a half times what the ordering tests do. Raising either number makes
#: the tests slower, never more true.
ORDERING_FIXTURE_SIZE = 20_000
SEARCH_FIXTURE_SIZE = 50_000

#: FRD PTY-02 NFR-1's own number: the list must answer in 1.5 s on a merchant
#: with 2,000 parties.
NFR_FIXTURE_SIZE = 2_000
NFR_BUDGET_SECONDS = 1.5

SURNAMES = ("Sharma", "Verma", "Gupta", "Iyer", "Khan", "Patel", "Reddy", "Bose")
SUFFIXES = ("Traders", "Stores", "Agency", "Mart", "& Sons")


def _populate(tenant: Any, count: int) -> None:
    """A tenant's book, with the distribution that decides the plan.

    The spread matters more than the size. An earlier draft left
    `last_activity_at` NULL on every row, which makes the entire set one tie
    group on the leading sort key and forces a full sort by name no matter what
    index exists — so it "reproduced" the seq scan even against a correct
    index, and would have gone on passing after the fix. Roughly one party in
    nine has never transacted, which is what a real book looks like.
    """
    rng = random.Random(20250917)
    now = timezone.now()
    today = date.today()
    Party.objects.bulk_create(
        [
            Party(
                tenant=tenant,
                # Every thousandth party gets a name no other party shares a
                # trigram with, so the search test has a SELECTIVE term to look
                # for. With only the eight common surnames below, `?q=sharma`
                # matches an eighth of the book, and the planner is right to
                # walk the ordering index and filter rather than to go through
                # the trigram index — a search test written on that term
                # asserts the wrong thing.
                name=(
                    f"Zylberschatz Bullion {index}"
                    if index % 1_000 == 0
                    else f"{rng.choice(SURNAMES)} {rng.choice(SUFFIXES)} {index}"
                ),
                display_code=f"C-{index:06d}",
                mobile=f"9{index:09d}",
                is_customer=True,
                is_supplier=index % 5 == 0,
                balance=Decimal(rng.randint(-50_000, 50_000)) / 100,
                status=PartyStatus.ARCHIVED if index % 20 == 0 else PartyStatus.ACTIVE,
                collection_date=(
                    today + timedelta(days=rng.randint(-20, 20)) if index % 3 == 0 else None
                ),
                last_activity_at=(
                    None if index % 9 == 0 else now - timedelta(minutes=rng.randint(0, 900_000))
                ),
            )
            for index in range(count)
        ],
        batch_size=2_000,
    )
    with connection.cursor() as cursor:
        # `bulk_create` leaves deferred FK triggers pending, and Postgres will
        # not plan against statistics it has not gathered. Without the ANALYZE
        # every estimate below is the default guess and the plans are fiction.
        cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
        cursor.execute("ANALYZE parties_party")


def _plan(queryset: Any) -> str:
    sql, params = queryset.query.sql_with_params()
    with connection.cursor() as cursor:
        cursor.execute("EXPLAIN (FORMAT TEXT) " + sql, params)
        return "\n".join(row[0] for row in cursor.fetchall())


@pytest.fixture
def ordering_tenant(tenant: Any) -> Any:
    _populate(tenant, ORDERING_FIXTURE_SIZE)
    return tenant


@pytest.fixture
def search_tenant(tenant: Any) -> Any:
    _populate(tenant, SEARCH_FIXTURE_SIZE)
    return tenant


def _default_list(tenant: Any) -> Any:
    """The queryset the endpoint builds for the request THE CLIENT ACTUALLY MAKES.

    Not the one for a client that sends no parameters. That distinction turned
    out to be the whole story: `partyListDefaults.DEFAULT_ORDERING` is
    `-last_activity_at` and the list sends it on every request, so the endpoint
    essentially never takes the selector's own `order_by` — DRF's
    `OrderingFilter` replaces it. An earlier version of this module built the
    parameterless queryset and proved an index was used by a query shape that
    is never issued.

    So the ordering is spelled the way `StableOrderingFilter` now produces it:
    explicit `NULLS LAST`, plus the primary key as the tie-breaker, which is
    also what `ix_party_tenant_activity` holds.
    """
    return (
        list_parties(tenant=tenant)
        .filter(status=PartyStatus.ACTIVE)
        .order_by(F("last_activity_at").desc(nulls_last=True), "pk")[:25]
    )


def test_the_default_page_walks_the_index_instead_of_sorting_the_tenant(
    ordering_tenant: Any,
) -> None:
    """Page 1 must not read the whole book to show twenty-five rows.

    The defect this pins: `ix_party_tenant_activity` held
    `last_activity_at DESC NULLS FIRST` and the query wanted `NULLS LAST`, so
    the plan was a parallel sequential scan of every active party in the tenant
    followed by a sort of all of them — 5,728 cost units at 100,000 parties —
    to return the twenty-five the merchant can see.
    """
    plan = _plan(_default_list(ordering_tenant))
    assert "ix_party_tenant_activity" in plan, plan
    assert "Seq Scan" not in plan, plan


def test_the_default_page_does_not_sort_the_whole_result(ordering_tenant: Any) -> None:
    """A full `Sort` node here means the index supplied no usable ordering.

    An `Incremental Sort` is fine and is what this plan actually does: the
    index orders by `last_activity_at` and the query breaks ties on the primary
    key, so one tie group at a time gets sorted — twenty-five rows' worth, not
    the tenant's worth. Asserting "no Sort at all" would demand the tie-breaker
    ride along in the index, which measured at 9.3 MB against 4.3 MB to save 13
    microseconds.
    """
    plan = _plan(_default_list(ordering_tenant))
    for line in plan.splitlines():
        # A plan NODE is `->  Sort  (cost=...)`; `Sort Key: ...` is a detail
        # line belonging to whichever sort node is above it, and an earlier
        # draft of this matched that instead — failing against the very plan it
        # is meant to accept, because an Incremental Sort has a `Sort Key` too.
        node = line.strip().removeprefix("->").strip()
        if node.startswith("Sort ") and "(cost=" in node:
            pytest.fail(f"full sort of the result set:\n{plan}")
    if "Incremental Sort" in plan:
        assert "Presorted Key: last_activity_at" in plan, plan


def test_the_search_reaches_the_trigram_index(search_tenant: Any) -> None:
    """`?q=` must not turn into a scan of every name in the tenant.

    `icontains` compiles to `UPPER(name) LIKE UPPER(%s)`, which only
    `ix_party_name_upper_trgm` — a GIN index on the same expression — can
    serve. A bare-column index cannot, which is why that one is built on
    `Upper("name")`.
    """
    queryset = (
        list_parties(tenant=search_tenant)
        .filter(status=PartyStatus.ACTIVE, name__icontains="zylberschatz")
        .order_by(F("last_activity_at").desc(nulls_last=True), "pk")[:25]
    )
    plan = _plan(queryset)
    assert "ix_party_name_upper_trgm" in plan, plan
    assert "Seq Scan" not in plan, plan


def test_the_dead_index_is_gone() -> None:
    """`ix_party_tenant_recent` must not come back.

    It was `(tenant, -last_activity_at)` for "the default list, which sends no
    status at all" — a query shape BR-4 removed. Left in place it is 4.6 MB per
    100,000 parties, rewritten on every ledger entry, serving nothing. If a
    later change reintroduces a list query without a status predicate, this
    test is the wrong thing to delete: the index and its justification come
    back together.

    No fixture: this reads the catalogue, and rows would only buy build time.
    """
    with connection.cursor() as cursor:
        cursor.execute("SELECT indexname FROM pg_indexes WHERE tablename = 'parties_party'")
        names = {row[0] for row in cursor.fetchall()}
    assert "ix_party_tenant_recent" not in names
    assert "ix_party_tenant_activity" in names


def test_page_one_answers_within_the_nfr_on_a_two_thousand_party_book(
    tenant: Any, api_as: Any
) -> None:
    """FRD PTY-02 NFR-1, measured end to end rather than asserted in prose.

    The budget is deliberately loose against what this actually costs; it is a
    guard against an order-of-magnitude regression — an N+1 in the serializer,
    a filter that stops using an index, a totals aggregate that grows a join —
    not a benchmark. A tight bound here would fail on a loaded CI box and teach
    everyone to rerun the suite until it passes.
    """
    _populate(tenant, NFR_FIXTURE_SIZE)
    client, _member = api_as(tenant)

    started = time.perf_counter()
    response = client.get(reverse("v1:party-list"))
    elapsed = time.perf_counter() - started

    assert response.status_code == 200
    body = response.json()
    assert len(body["data"]) == 25
    # The totals travel with the page and are computed over the whole filtered
    # set, so this timing covers the aggregate too — which is the half that
    # cannot stop at twenty-five rows.
    assert body["meta"]["totals"]["count"] == body["meta"]["total"]
    assert elapsed < NFR_BUDGET_SECONDS, f"page 1 took {elapsed:.3f}s"


def test_the_plan_of_the_sql_the_ENDPOINT_emits(ordering_tenant: Any, api_as: Any) -> None:
    """The same claim, made against the request rather than a rebuilt queryset.

    Every other test here builds the queryset by hand, which is fast to write
    and one refactor away from proving something about a query nobody issues —
    exactly what happened once already: the module measured the plan for a list
    with no `ordering` parameter while the client sent one on every request,
    and so certified an index that the real request could not use.

    This one drives the endpoint with the parameters `usePartyList` sends,
    captures the SQL the ORM produced, and EXPLAINs that. It is slower and less
    precise about WHICH query it caught, and it cannot drift away from the
    application, which is worth more.
    """
    client, _member = api_as(ordering_tenant)

    with CaptureQueriesContext(connection) as captured:
        response = client.get(
            reverse("v1:party-list"),
            {"status": "active", "ordering": "-last_activity_at", "page": 1, "page_size": 25},
        )
    assert response.status_code == 200

    page_queries = [
        query["sql"]
        for query in captured.captured_queries
        if "parties_party" in query["sql"] and "LIMIT 25" in query["sql"]
    ]
    assert page_queries, "no page query was captured; the shape of the list query changed"

    with connection.cursor() as cursor:
        cursor.execute("EXPLAIN (FORMAT TEXT) " + page_queries[-1])
        plan = "\n".join(row[0] for row in cursor.fetchall())

    assert "ix_party_tenant_activity" in plan, plan
    assert "Seq Scan" not in plan, plan
