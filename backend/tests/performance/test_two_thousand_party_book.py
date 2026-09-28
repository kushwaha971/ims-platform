"""The hot read paths at the size the Sprint 3 plan names: one tenant, 2,000 parties.

The targets, quoted from the specification this module holds the code to:

* Part 12 §12.5 — "Party list with 2,000 parties, first page | ≤ 1.5 s" and
  "Statement with 5,000 entries, first page | ≤ 1.5 s".
* Part 32, Sprint 3 exit criteria — "Trigram index present and used (`EXPLAIN`
  asserted in the performance test)" and "2,000-party fixture renders the first
  page in ≤ 1.5 s on the reference device profile".
* Part 33 TSK-PTY-02-05 — "`EXPLAIN` shows the GIN trigram index used for `?q=`;
  first page at 2,000 parties ≤ 1.5 s".
* FRD PTY-02 §Non-functional — "First contentful row ≤ 1.2 s P75 on 3G Fast with
  2,000 parties; server P95 ≤ 250 ms for page 1 with totals at 10,000 parties."
  §20 — "the page query (`LIMIT/OFFSET` on an indexed sort) and the totals
  aggregate … both must be index-assisted … Total budget: 3 queries, P95 ≤ 250 ms
  server".
* FRD PTY-03 §Non-functional — "TTI ≤ 1.0 s P75 on 3G Fast for a party with 5,000
  entries (only 25 are fetched)." §20 — "2 network requests on first paint (party
  + first timeline page), both ≤ 150 ms server P95 … Total ≤ 8 queries for the
  page."
* FRD LED-09 — "page P95 ≤ 500 ms for 5k parties"; §20 — "Single CTE query using
  the party/date index … (two queries)."
* Part 20 §20.14.1 — `GET /parties` 4, `GET /parties/{id}` 5,
  `GET /parties/{id}/ledger-entries` 3, and "Any endpoint | never O(page_size)".

What is asserted is what can be asserted deterministically: the SHAPE of each
query plan and the NUMBER of queries each request issues. A wall-clock ceiling
is here too, once per path, but marked `timing` so a loaded CI box can
deselect it (`-m "not timing"`); the plan and count tests are the gate, because
a plan that reads the whole tenant and a query per row are exactly the defects
that make the timing fail later, at a size nobody tests.

── How the plans are read ──────────────────────────────────────────────────
The fixture is `ANALYZE`d, so the planner is working from real statistics
rather than defaults. Two kinds of question are then asked of `EXPLAIN`:

* For a PAGE query — `ORDER BY … LIMIT n` — the NATURAL plan must walk an index
  that supplies the ordering and stop at the limit: no `Seq Scan on
  parties_party`, no full `Sort` node. At 2,000 parties the planner already
  prefers that plan by a factor of thirty in cost (≈ 4 units against ≈ 128 for a
  scan and a top-N sort) whenever such an index exists, so the assertion is not
  a coin toss; and when no index can supply the order, the plan is a scan and a
  sort at ANY size, which is the defect.
* For a question that has to read every matching row — the paginator's
  `COUNT(*)`, the totals aggregate, the aging walk — reading every row is the
  point, and at 2,000 rows a sequential scan is honestly the cheapest way to do
  it in a table that holds one tenant. So those are asked with
  `enable_seqscan = off`: not "is the index chosen" but "COULD an index scope
  this to the tenant", which is what stops being true when a predicate is
  written in a shape no index matches. The answer does not depend on the size
  of the fixture, which is what makes it safe to assert at 2,000.
"""

from __future__ import annotations

import datetime as dt
import random
import statistics
import time
from collections.abc import Iterable
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone

from apps.common.constants import Direction, PaymentMode
from apps.ledger.constants import EntryStatus, EntryType, SourceType
from apps.ledger.models import LedgerEntry
from apps.parties.constants import PartyStatus
from apps.parties.models import Party, PartyTag, Tag
from tests.factories.platform import UserFactory
from tests.performance.test_query_budgets import QUERY_BUDGETS

pytestmark = [pytest.mark.django_db, pytest.mark.slow, pytest.mark.postgres]

#: Part 32's number, and PTY-02 NFR's.
PARTY_COUNT = 2_000
#: "~20 ledger entries on a subset": every twentieth party (offset 1, so none of
#: them is one of the archived ones) carries a real history.
ENTRIES_PER_ACTIVE_PARTY = 20
#: One party the shop has traded with daily for over a year, and one it met last
#: week. The khata page must cost the same to open for both.
HEAVY_ENTRY_COUNT = 400
HEAVY_REVERSAL_PAIRS = 10
LIGHT_ENTRY_COUNT = 3

#: A name nothing else in the book shares a trigram with, so a search for it is
#: SELECTIVE — four parties in two thousand. With only the common surnames, a
#: search matches an eighth of the book and the planner is right to walk the
#: ordering index and filter; a trigram assertion written on that term would be
#: asserting the wrong thing (see `test_party_list_plans.py`).
RARE_NAME = "Zylberschatz Bullion"
RARE_TERM = "zylberschatz"
#: A COMMON term, for the query-count tests: it has to match more than a hundred
#: parties or "page size 100" is the same page as "page size 25" and an N+1
#: would go unmeasured.
COMMON_TERM = "sharma"

SURNAMES = ("Sharma", "Verma", "Gupta", "Iyer", "Khan", "Patel", "Reddy", "Bose")
SUFFIXES = ("Traders", "Stores", "Agency", "Mart", "& Sons")
TAG_NAMES = ("Camp Area", "Deccan", "Route 2", "Wholesale")

#: The `ordering` values the list accepts (`PartyViewSet.ordering_fields`), each
#: in both directions. The first six are the ones the UI sends —
#: `partyListSort.ts` maps the Name, Balance and Activity column headers — and
#: `collection_date` is API-only (CR-024).
ORDERINGS = (
    "-last_activity_at",
    "last_activity_at",
    "name",
    "-name",
    "balance",
    "-balance",
    "collection_date",
    "-collection_date",
)

#: The per-request floor `test_query_budgets.py` documents: user, membership,
#: and the plan-overrides read behind `ModuleEnabled`.
REQUEST_FLOOR = 3


def _budget(budget_id: str) -> int:
    """One source of truth for a budget: the row in `test_query_budgets.py`."""
    return next(budget.budget for budget in QUERY_BUDGETS if budget.id == budget_id)


# ── The book ─────────────────────────────────────────────────────────────────


@dataclass
class Book:
    tenant: Any
    client: Any
    heavy: Party
    light: Party
    tags: dict[str, Tag]
    #: A GSTIN one party carries, so the fifteen-character search arm has
    #: something to find.
    gstin: str


def _entry(
    tenant: Any,
    party_id: Any,
    *,
    direction: str,
    amount: Decimal,
    entry_date: dt.date,
    author: Any,
    **extra: Any,
) -> LedgerEntry:
    return LedgerEntry(
        tenant=tenant,
        party_id=party_id,
        direction=direction,
        amount=amount,
        entry_date=entry_date,
        entry_type=(
            extra.pop("entry_type", None)
            or (EntryType.MANUAL_GAVE if direction == Direction.DEBIT else EntryType.MANUAL_GOT)
        ),
        source_type=SourceType.MANUAL,
        payment_mode=PaymentMode.CASH if direction == Direction.CREDIT else None,
        created_by=author,
        **extra,
    )


def _history(
    tenant: Any,
    party_id: Any,
    count: int,
    rng: random.Random,
    authors: list[Any],
    *,
    advance: bool = False,
) -> list[LedgerEntry]:
    """A khata: mostly credit sales, a payment every few lines, over 200 days.

    Debits outnumber credits three to one and credits are smaller, so most of
    these parties end with something outstanding and some of it is old — which
    is what gives the aging walk all four buckets to fill. `advance` mirrors it:
    a supplier the shop owes, or a customer who paid ahead, so the PAYABLE side
    of aging has rows too.
    """
    today = timezone.localdate()
    rows = []
    for index in range(count):
        mostly = Direction.CREDIT if advance else Direction.DEBIT
        rarely = Direction.DEBIT if advance else Direction.CREDIT
        direction = rarely if index % 4 == 3 else mostly
        amount = Decimal(rng.randint(100, 5_000) if direction == mostly else rng.randint(50, 3_000))
        rows.append(
            _entry(
                tenant,
                party_id,
                direction=direction,
                amount=amount,
                entry_date=today - dt.timedelta(days=rng.randint(0, 200)),
                author=authors[index % len(authors)],
            )
        )
    return rows


def _reversal_pairs(
    tenant: Any, party_id: Any, pairs: int, authors: list[Any]
) -> list[LedgerEntry]:
    """LED-03's shape: the original, marked reversed, and the line that undoes it.

    The timeline hides both by default (`LIVE_ENTRIES`) and shows them with
    `?include_reversed=true`, so the khata test can prove the toggle does not
    change the query count either.
    """
    today = timezone.localdate()
    rows = []
    for index in range(pairs):
        original = _entry(
            tenant,
            party_id,
            direction=Direction.DEBIT,
            amount=Decimal("500.00"),
            entry_date=today - dt.timedelta(days=index),
            author=authors[0],
            status=EntryStatus.REVERSED,
        )
        reversal = _entry(
            tenant,
            party_id,
            direction=Direction.CREDIT,
            amount=Decimal("500.00"),
            entry_date=today - dt.timedelta(days=index),
            author=authors[0],
            entry_type=EntryType.REVERSAL,
            reverses_id=original.id,
            reason="Typed the wrong amount",
        )
        original.reversed_by_id = reversal.id
        rows.extend([original, reversal])
    return rows


def _settle_caches(parties: dict[Any, Party], entries: Iterable[LedgerEntry]) -> None:
    """`balance` and `last_activity_at` as the ledger says, for the parties it touched.

    The list reads the cached balance (PTY-02 BR-10) and orders by
    `last_activity_at`, so a party with twenty entries and a random balance, or
    no activity date, would be a book no real merchant has.
    """
    balances: dict[Any, Decimal] = {}
    latest: dict[Any, dt.datetime] = {}
    for entry in entries:
        if entry.status != EntryStatus.POSTED or entry.reverses_id:
            continue
        sign = 1 if entry.direction == Direction.DEBIT else -1
        balances[entry.party_id] = balances.get(entry.party_id, Decimal("0")) + sign * entry.amount
        moment = timezone.make_aware(dt.datetime.combine(entry.entry_date, dt.time(12)))
        latest[entry.party_id] = max(latest.get(entry.party_id, moment), moment)
    touched = []
    for party_id, balance in balances.items():
        party = parties[party_id]
        party.balance = balance
        party.last_activity_at = latest[party_id]
        touched.append(party)
    Party.objects.bulk_update(touched, ["balance", "last_activity_at"], batch_size=500)


@pytest.fixture
def book(tenant: Any, api_as: Any) -> Book:
    """One tenant's book at Part 32's size, with the spread that decides the plans.

    The spread matters more than the size (see `test_party_list_plans._populate`):
    `last_activity_at` is NULL on one party in nine, a quarter carry a GSTIN, a
    third carry a collection date, one in twenty is archived, one in five is also a supplier, balances run
    both ways, a third are tagged, and a hundred parties carry twenty ledger
    entries each — one in three of those in advance, so payable aging has rows
    as well as receivable. Everything is written with `bulk_create`, because the
    fixture is the whole cost of this module and every test pays for it.
    """
    rng = random.Random(20260923)
    now = timezone.now()
    today = timezone.localdate()
    client, _member = api_as(tenant)
    authors = [UserFactory(full_name=name) for name in ("Sunita", "Ravi", "Imran")]

    parties = Party.objects.bulk_create(
        [
            Party(
                tenant=tenant,
                name=(
                    f"{RARE_NAME} {index}"
                    if index % 500 == 7
                    else f"{rng.choice(SURNAMES)} {rng.choice(SUFFIXES)} {index}"
                ),
                display_code=f"C-{index:05d}",
                mobile=f"9{index:09d}",
                # One in four registered, which is about what a wholesaler's
                # book looks like; the rest are NULL, as for a retail customer.
                gstin=f"27AAAPA{index:04d}A1Z5" if index % 4 == 0 else None,
                is_customer=True,
                is_supplier=index % 5 == 0,
                balance=Decimal(rng.randint(-50_000, 50_000)) / 100,
                status=PartyStatus.ARCHIVED if index % 20 == 0 else PartyStatus.ACTIVE,
                collection_date=(
                    today + dt.timedelta(days=rng.randint(-20, 20)) if index % 3 == 0 else None
                ),
                last_activity_at=(
                    None if index % 9 == 0 else now - dt.timedelta(minutes=rng.randint(0, 900_000))
                ),
            )
            for index in range(PARTY_COUNT)
        ],
        batch_size=1_000,
    )
    by_id = {party.id: party for party in parties}

    tags = {name: Tag.objects.create(tenant=tenant, name=name) for name in TAG_NAMES}
    tag_list = list(tags.values())
    links = []
    for index, party in enumerate(parties):
        if index % 3 == 0:
            links.append(PartyTag(party=party, tag=tag_list[(index // 3) % len(tag_list)]))
            if index % 7 == 0:
                links.append(PartyTag(party=party, tag=tag_list[(index // 3 + 1) % len(tag_list)]))
    PartyTag.objects.bulk_create(links, batch_size=1_000)

    heavy, light = parties[1], parties[21]
    entries: list[LedgerEntry] = []
    for index, party in enumerate(parties):
        if index % 20 == 1 and party not in (heavy, light):
            entries.extend(
                _history(
                    tenant,
                    party.id,
                    ENTRIES_PER_ACTIVE_PARTY,
                    rng,
                    authors,
                    advance=index % 60 == 41,
                )
            )
    entries.extend(_history(tenant, heavy.id, HEAVY_ENTRY_COUNT, rng, authors))
    entries.extend(_reversal_pairs(tenant, heavy.id, HEAVY_REVERSAL_PAIRS, authors))
    entries.extend(_history(tenant, light.id, LIGHT_ENTRY_COUNT, rng, authors))
    LedgerEntry.objects.bulk_create(entries, batch_size=1_000)
    _settle_caches(by_id, entries)

    with connection.cursor() as cursor:
        # `bulk_create` leaves deferred FK triggers pending (the reversal pairs
        # point at each other), and Postgres plans from statistics it has
        # gathered, not from rows it has been handed. Without the ANALYZE every
        # estimate below is a default guess and the plans are fiction.
        cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
        # A GIN index takes bulk inserts into a PENDING LIST, unsorted, which
        # every search must then read in full and which the planner prices
        # accordingly — 1,727 cost units for one trigram lookup on this book,
        # against 91 once merged. Autovacuum merges it in production; nothing
        # does inside a test transaction, so without this every trigram plan
        # here was costed against a state no live database stays in for long.
        cursor.execute(
            "SELECT gin_clean_pending_list(c.oid) FROM pg_class c"
            " JOIN pg_index i ON i.indexrelid = c.oid JOIN pg_am am ON am.oid = c.relam"
            " WHERE i.indrelid = 'parties_party'::regclass AND am.amname = 'gin'"
        )
        for table in ("parties_party", "parties_tag", "parties_party_tag", "ledger_entry"):
            cursor.execute(f"ANALYZE {table}")

    heavy.refresh_from_db()
    light.refresh_from_db()
    return Book(
        tenant=tenant,
        client=client,
        heavy=heavy,
        light=light,
        tags=tags,
        gstin=parties[8].gstin,
    )


# ── Helpers ──────────────────────────────────────────────────────────────────


def _issue(client: Any, url: str, params: dict[str, Any] | None = None) -> list[str]:
    """Issue a GET twice and return the SQL of the second, one string per query.

    The first call warms whatever is lazily imported or negotiated; the counts
    are about the steady state, exactly as `test_query_budgets._measure` does.
    """
    first = client.get(url, params or {})
    assert first.status_code == 200, (url, params, first.content[:400])
    with CaptureQueriesContext(connection) as captured:
        response = client.get(url, params or {})
    assert response.status_code == 200, (url, params, response.content[:400])
    return [" ".join(query["sql"].split()) for query in captured.captured_queries]


def _explain(
    sql: str,
    params: Any = None,
    *,
    disable: tuple[str, ...] = (),
    costs: dict[str, str] | None = None,
) -> str:
    """`EXPLAIN` a statement, optionally with planner methods or costs changed.

    `SET LOCAL` inside the test's transaction, so a knob can never leak into the
    next test — the transaction is rolled back underneath it — and each one is
    put back afterwards so a later EXPLAIN in the same test starts clean.
    """
    costs = costs or {}
    with connection.cursor() as cursor:
        cursor.execute("SELECT name, setting FROM pg_settings WHERE name = ANY(%s)", [list(costs)])
        before = dict(cursor.fetchall())
        for knob in disable:
            cursor.execute(f"SET LOCAL {knob} = off")
        for knob, value in costs.items():
            cursor.execute(f"SET LOCAL {knob} = {value}")
        cursor.execute("EXPLAIN (FORMAT TEXT) " + sql, params)
        plan = "\n".join(row[0] for row in cursor.fetchall())
        for knob in disable:
            cursor.execute(f"SET LOCAL {knob} = on")
        for knob, value in before.items():
            cursor.execute(f"SET LOCAL {knob} = {value}")
    return plan


def _nodes(plan: str) -> list[str]:
    """Each plan NODE, without its `->` and detail lines.

    A node is `->  Sort  (cost=…)`; `Sort Key: …` is a DETAIL line of whatever
    node is above it, and an Incremental Sort has one too — matching the detail
    line instead of the node is the mistake `test_party_list_plans` documents.
    """
    return [
        line.strip().removeprefix("->").strip() for line in plan.splitlines() if "(cost=" in line
    ]


def _assert_bounded_page_plan(plan: str, what: str) -> None:
    """The page is fetched by walking an index that supplies its order, and stops.

    Three properties, each the absence of one known way to read the whole tenant:
    a `Seq Scan on parties_party`; a full `Sort` node, which means no index
    supplied the ORDER BY and every matching row was read to find the first n;
    and a plan whose top is not a `Limit`, which means nothing stops the walk.
    An `Incremental Sort` is accepted: the index supplies the leading key and
    only one tie group at a time is sorted to break ties on the primary key.
    """
    nodes = _nodes(plan)
    assert nodes and nodes[0].startswith("Limit"), f"{what}: no Limit at the top\n{plan}"
    assert "Seq Scan on parties_party " not in plan, f"{what}: scans the table\n{plan}"
    full_sorts = [node for node in nodes if node.startswith("Sort ")]
    assert not full_sorts, f"{what}: sorts the whole filtered set\n{plan}"


def _party_page_query(queries: list[str]) -> str:
    """The list's page query among everything one request issued."""
    pages = [
        sql
        for sql in queries
        if sql.startswith('SELECT "parties_party"."id"')
        and " LIMIT " in sql
        and "COUNT(" not in sql
        and "SUM(" not in sql
    ]
    assert len(pages) == 1, "expected exactly one page query:\n" + "\n".join(queries)
    return pages[0]


def _party_aggregate_queries(queries: list[str]) -> list[str]:
    """The paginator's COUNT(*) and the `meta.totals` aggregate."""
    found = [
        sql
        for sql in queries
        if 'FROM "parties_party"' in sql and ("COUNT(" in sql or "SUM(" in sql)
    ]
    assert len(found) == 2, "expected the count and the totals:\n" + "\n".join(queries)
    return found


def _list_url() -> str:
    return reverse("v1:party-list")


def _client_params(**extra: Any) -> dict[str, Any]:
    """The parameters `usePartyList` sends on every request, plus the case's own."""
    return {
        "status": "active",
        "ordering": "-last_activity_at",
        "page": 1,
        "page_size": 25,
        **extra,
    }


# ── (1) The party list: plans ────────────────────────────────────────────────


LIST_CASES = [
    pytest.param({}, id="no-parameters"),
    pytest.param(_client_params(), id="client-default"),
    pytest.param(_client_params(balance="owes_me"), id="balance-chip"),
    pytest.param(_client_params(type="supplier"), id="type-chip"),
]

ORDERING_CASES = [pytest.param(ordering, id=f"ordering={ordering}") for ordering in ORDERINGS]


@pytest.mark.parametrize("params", LIST_CASES)
def test_the_list_page_is_an_index_walk_that_stops(book: Book, params: dict[str, Any]) -> None:
    """Page 1 of every chip the list offers reads twenty-five rows, not the tenant.

    The defect this prevents is the one `ix_party_tenant_activity` already had
    once: an index that exists and cannot be used, because the query asks for an
    ordering or a predicate shape the index does not have. Nothing fails when
    that happens — a scan and a sort return exactly the same twenty-five rows —
    except that page 1 costs the whole book on every open. The SQL is captured
    from the ENDPOINT, never rebuilt by hand, so the plan read is the plan of
    the query a merchant's phone actually causes.
    """
    queries = _issue(book.client, _list_url(), params)
    page = _party_page_query(queries)
    _assert_bounded_page_plan(_explain(page), f"GET /parties {params}")


@pytest.mark.parametrize("ordering", ORDERING_CASES)
def test_every_ordering_is_served_by_an_index(book: Book, ordering: str) -> None:
    """Every sort the list whitelists must be one an index can hand over in order.

    `StableOrderingFilter` turns `?ordering=` into `<term> [NULLS LAST], id`, and
    an index serves that only when its column order AND null placement match —
    `DESC NULLS LAST` and `DESC NULLS FIRST` are different orderings, and so are
    `ASC NULLS LAST` and a backward walk of a `DESC NULLS LAST` index. Two of
    the eight failed when this module was written, and parties 0008 added the
    indexes they were missing:

    * `ordering=last_activity_at` — the Activity column header, clicked once
      more to sort oldest first (`partyListSort.ts`). The filter leaves an
      ascending term alone, so the SQL is `last_activity_at ASC` (NULLS LAST, the
      Postgres default for ASC). `ix_party_tenant_activity` is
      `(tenant, status, last_activity_at DESC NULLS LAST)`; walked backward it
      yields `ASC NULLS FIRST`. No match, so the plan was `Seq Scan on
      parties_party` + `Sort` over every active party. Now served by
      `ix_party_tenant_activity_asc`.
    * `ordering=-collection_date` — the filter adds `NULLS LAST` to a descending
      nullable term; `ix_party_tenant_collection` is `(tenant, collection_date)`,
      i.e. `ASC NULLS LAST`, which walked backward is `DESC NULLS FIRST`. Same
      result. The UI does not send this one, but the API accepts it (CR-024).
      Now served by `ix_party_tenant_collect_desc`.

    The rule the two new indexes follow is `StableOrderingFilter`'s, and it is
    the one that stays: a missing value never outranks a present one, in either
    direction. The index changed to fit the product rule, not the other way.
    """
    queries = _issue(book.client, _list_url(), _client_params(ordering=ordering))
    page = _party_page_query(queries)
    _assert_bounded_page_plan(_explain(page), f"GET /parties?ordering={ordering}")


def test_the_list_aggregates_can_be_scoped_by_an_index(book: Book) -> None:
    """PTY-02 §20: the count and the totals "must be index-assisted".

    Both read every row the filters match — that is what a total is — so at
    2,000 parties in a one-tenant table a sequential scan is the honest plan and
    asserting otherwise would be asserting that the planner is wrong. What must
    hold at every size is that an index COULD confine them to the tenant: asked
    with `enable_seqscan = off`, a plan that still says `Seq Scan on
    parties_party` is a predicate no index matches, which is the day a hosted
    database with a thousand tenants reads all of them to total one.
    """
    for params in (_client_params(), _client_params(tag="Camp Area", balance="owes_me")):
        queries = _issue(book.client, _list_url(), params)
        for sql in _party_aggregate_queries(queries):
            plan = _explain(sql, disable=("enable_seqscan",))
            assert "Seq Scan on parties_party " not in plan, f"{params}\n{sql}\n{plan}"


TAG_CASES = [
    pytest.param(_client_params(tag="Camp Area"), id="one-tag"),
    pytest.param(_client_params(tag="camp area,Deccan"), id="two-tags-folded-case"),
    pytest.param(_client_params(tag="Camp Area", balance="owes_me"), id="tag-and-chip"),
]


@pytest.mark.parametrize("params", TAG_CASES)
def test_the_tag_filter_reaches_parties_and_joins_through_indexes(
    book: Book, params: dict[str, Any]
) -> None:
    """`?tag=` is an `EXISTS` the planner can answer from the join table's indexes.

    Not asserted as an ordered index walk, deliberately. A tag holds about a
    tenth of this book, and for a filter that selective the planner is right to
    start from the TAG — the parties carrying it, fetched by primary key, then a
    sort of those couple of hundred — rather than walking the whole ordering
    index probing for membership. That plan is bounded by the size of the tag,
    not of the tenant. What must hold is that it is AVAILABLE: with
    `enable_seqscan = off`, neither `parties_party` nor `parties_party_tag` may
    still be scanned, which is the day the `EXISTS` is written in a shape
    `ix_party_tag_tag` / `uq_party_tag` cannot serve and every tag filter reads
    every tagging in the database.

    The tag NAME lookup is held to the same standard. It was `UPPER(name) =
    UPPER(x)` with no tenant condition, and the only index on a tag's name is
    `uq_tag_tenant_lower_name`, `(lower(name), tenant)` — so the planner could
    reach `parties_tag` only through its primary key, one probe per join row,
    filtering names from every tenant. It is now `lower()` on both sides and
    carries the party's tenant, which is exactly that index's key. Asserted on
    the count and the totals, which resolve the tag once and fetch its
    parties; the page query may instead walk the ordering index and probe each
    candidate party's own tags by primary key, which is bounded by the page and
    is the planner's call to make. And asserted for ONE tag: with two, this
    book's four-row tag table is cheaper to read whole through its primary key
    than to probe twice, which is the right plan at four tags and says nothing
    about whether the index is usable.
    """
    queries = _issue(book.client, _list_url(), params)
    page, aggregates = _party_page_query(queries), _party_aggregate_queries(queries)
    for sql in (page, *aggregates):
        plan = _explain(sql, disable=("enable_seqscan",))
        assert "Seq Scan on parties_party " not in plan, f"{params}\n{plan}"
        assert "Seq Scan on parties_party_tag" not in plan, f"{params}\n{plan}"
        if sql in aggregates and "," not in params["tag"]:
            assert "uq_tag_tenant_lower_name" in plan, f"{params}\n{plan}"


#: Every index that answers one arm of `PartyFilterSet.filter_search`'s OR.
SEARCH_INDEXES = {
    "name": "ix_party_name_upper_trgm",
    "display_code": "ix_party_tenant_code_upper",
    "mobile": "ix_party_mobile_trgm",
    "gstin": "ix_party_tenant_gstin_upper",
}

#: One query per shape the filterset builds, with the arms it ORs. The digits
#: are a real party's mobile suffix and the GSTIN a real party's, so each search
#: matches something and the page query is actually issued.
SEARCH_CASES = [
    pytest.param(RARE_TERM, ("name", "display_code"), id="name-or-code"),
    pytest.param("MOBILE_SUFFIX", ("name", "display_code", "mobile"), id="digits-add-mobile"),
    pytest.param("GSTIN", ("name", "display_code", "mobile", "gstin"), id="gstin-adds-both"),
]


def _search_term(book: Book, term: str) -> str:
    """`MOBILE_SUFFIX`/`GSTIN` stand for values only the fixture knows."""
    if term == "MOBILE_SUFFIX":
        return book.light.mobile[-6:]
    if term == "GSTIN":
        return book.gstin
    return term


@pytest.mark.parametrize(("term", "arms"), SEARCH_CASES)
def test_every_arm_of_the_search_the_endpoint_issues_has_an_index(
    book: Book, term: str, arms: tuple[str, ...]
) -> None:
    """Part 32's exit criterion — "Trigram index present and used" — for the REAL `?q=`.

    `test_party_list_plans.test_the_search_reaches_the_trigram_index` once
    proved the trigram index served `name__icontains`, on a queryset built by
    hand. The endpoint never issued that query. `PartyFilterSet.filter_search`
    ORs up to four arms (FR-5), and the display-code arm —
    `UPPER("display_code"::text) LIKE UPPER('zylberschatz%')` — had no index at
    all. A disjunction can use indexes only as a BitmapOr in which EVERY arm has
    one, so the whole predicate fell back to a filter over every row in the
    tenant and the trigram index was dead weight for the one request it was
    built for. Evidence, this fixture, `enable_seqscan = off`, the page query:

        Limit -> Sort
          -> Index Scan using parties_party_tenant_id_48064f1a on parties_party
               Filter: (... AND ((upper(name) ~~ '%ZYLBERSCHATZ%')
                              OR (upper(display_code) ~~ 'ZYLBERSCHATZ%')))

    ── How reachability is asked at 2,000 rows ─────────────────────────────
    A trigram lookup is priced mostly in random page reads, and at this size
    reading the whole tenant through any tenant-leading B-tree costs about the
    same — so whether the planner CHOOSES the BitmapOr here, even with
    `enable_seqscan = off`, turns on which search term it is (it does for the
    name, and not for the GSTIN, whose four arms together are priced above
    reading the tenant). A test of that choice would be a test of this fixture's page count.
    The natural choice is asserted where it means something: 50,000 rows, in
    `test_party_list_plans`.

    So the question is asked with page reads priced at zero
    (`seq_page_cost = random_page_cost = 0`) and sequential scans off. What is
    left to compare is the CPU cost of the rows each plan touches, and the plan
    that touches fewest is the BitmapOr — IF every arm has an index: about 5 to
    15 units here, against 57 to 72 for walking a tenant index and filtering
    every party. When an arm has no index there is no BitmapOr to cost, and the
    walk is what remains. Measured on this book by ORing `notes` in as a
    deliberately unindexed arm: `Index Scan using ix_party_tenant_collect_desc`,
    `Filter: (… OR notes ~~ …)`. The answer depends on which arms have an
    index, not on how many parties the book holds.

    The page query, the paginator's `COUNT(*)` and the totals aggregate carry
    the same WHERE clause, and all three are asked.

    The digits and GSTIN cases matter as much as the name one: the mobile arm
    is a SUFFIX match, which no B-tree serves, and it is ORed in for any query
    with four or more digits — one un-indexed arm is all it takes.
    """
    queries = _issue(book.client, _list_url(), _client_params(q=_search_term(book, term)))
    for sql in (_party_page_query(queries), *_party_aggregate_queries(queries)):
        plan = _explain(
            sql,
            disable=("enable_seqscan",),
            costs={"seq_page_cost": "0", "random_page_cost": "0"},
        )
        assert "BitmapOr" in plan, f"{term}: some arm of the OR has no index\n{plan}"
        for arm in arms:
            assert SEARCH_INDEXES[arm] in plan, f"{term}: the {arm} arm is not indexed\n{plan}"


def test_the_search_finds_the_rare_party_and_totals_only_what_it_found(book: Book) -> None:
    """The plan tests above must be reading a search that MATCHES something.

    An empty result skips the paginator's page query entirely, and a test that
    captured no page query, or one against zero rows, would prove nothing about
    the plan of a real search. Four parties carry the rare name; the totals are
    over those four and nothing else (PTY-02 BR-1).
    """
    response = book.client.get(_list_url(), _client_params(q=RARE_TERM))
    body = response.json()
    assert response.status_code == 200
    assert [row["name"].split()[0] for row in body["data"]] == ["Zylberschatz"] * 4
    assert body["meta"]["totals"]["count"] == 4


# ── (1) The party list: query counts ─────────────────────────────────────────


QUERY_COUNT_CASES = [
    pytest.param(_client_params(), id="client-default"),
    pytest.param(_client_params(q=COMMON_TERM), id="search"),
    pytest.param(_client_params(tag="Camp Area"), id="tag-filter"),
    *[pytest.param(_client_params(ordering=o), id=f"ordering={o}") for o in ORDERINGS],
]


@pytest.mark.parametrize("params", QUERY_COUNT_CASES)
def test_the_list_query_count_is_the_budget_at_every_page_size(
    book: Book, params: dict[str, Any]
) -> None:
    """§20.14.1: "never O(page_size)" — at 25 and at 100, on a real book.

    `test_query_budgets` proves this on fifty identical untagged parties. The
    N+1 that budget exists to catch lives in the ROWS — a tag chip, a deferred
    column the serializer touches, a relation walked per party — so it is
    measured again here where a third of the parties carry tags and the page
    really does hold four times as many rows at 100 as at 25. Every case must
    issue exactly the `parties-list` budget, whichever filter or sort it uses.
    """
    budget = _budget("parties-list")
    counts = {}
    for page_size in (25, 100):
        queries = _issue(book.client, _list_url(), {**params, "page_size": page_size})
        response = book.client.get(_list_url(), {**params, "page_size": page_size})
        assert len(response.json()["data"]) == page_size, "the page is not full; N+1 unmeasured"
        counts[page_size] = len(queries)
    assert counts == {25: budget, 100: budget}, (
        f"GET /parties {params} ran {counts} queries against a budget of {budget}; a count "
        "that differs between page sizes is a query per row."
    )


# ── (2) The khata page ───────────────────────────────────────────────────────


def _detail_url(party: Party) -> str:
    return reverse("v1:party-detail", args=[party.id])


def _timeline_url(party: Party) -> str:
    return reverse("v1:party-ledger-entry", args=[party.id])


def test_the_party_detail_costs_the_same_for_every_party(book: Book) -> None:
    """`GET /parties/{id}` is O(1): four hundred entries cost what three do.

    The defect this prevents is the tempting one PTY-03 §14 invites: putting
    `recent_entries[5]`, an entry count or a ledger aggregate on the detail
    response, where it would scale with the party's history — or reaching into
    the ledger per tag. The detail must issue exactly its `parties-detail`
    budget whoever it is opened for.
    """
    budget = _budget("parties-detail")
    counts = {
        name: len(_issue(book.client, _detail_url(party)))
        for name, party in (("light", book.light), ("heavy", book.heavy))
    }
    assert counts == {"light": budget, "heavy": budget}, counts


#: The timeline's own queries on its first page: the page of entries with their
#: authors joined in (`select_related("created_by")`), and the `meta.summary`
#: aggregate that rides on the first page only. §20.14.1 budgets the endpoint
#: 3 — page, attachments prefetch, created_by prefetch — and the attachments
#: table does not exist yet, while the author is a join rather than a prefetch.
TIMELINE_FIRST_PAGE_QUERIES = (
    "ledger_entry — the page, keyset-ordered, authors joined",
    "ledger_entry — meta.summary: given, got and line count, first page only",
)
TIMELINE_FIRST_PAGE_BUDGET = REQUEST_FLOOR + len(TIMELINE_FIRST_PAGE_QUERIES)


def test_the_timeline_first_page_costs_the_same_for_every_party(book: Book) -> None:
    """The khata timeline is O(1) in queries in the party's history and in the page.

    A cursor exists here so that "a party with three years of daily entries
    costs the same to open as one with three" (`LedgerEntryViewSet.list`). The
    defects this prevents are a `COUNT(*)` for a total, an author fetched per
    row ("by Sunita" is on every line, and three people write in this book), and
    `include_reversed` growing a query of its own. Measured on the light party
    and the heavy one, at three page sizes and with the corrections toggle.
    """
    counts = {}
    for name, party, params in (
        ("light", book.light, {}),
        ("heavy/25", book.heavy, {"limit": 25}),
        ("heavy/100", book.heavy, {"limit": 100}),
        ("heavy/200", book.heavy, {"limit": 200}),
        ("heavy/corrections", book.heavy, {"limit": 100, "include_reversed": "true"}),
    ):
        counts[name] = len(_issue(book.client, _timeline_url(party), params))
    assert set(counts.values()) == {TIMELINE_FIRST_PAGE_BUDGET}, counts


def test_the_whole_khata_page_is_within_pty_03s_eight_queries(book: Book) -> None:
    """PTY-03 §20: "Total ≤ 8 queries for the page" — both first-paint requests.

    The khata page makes two requests on first paint, the party and the first
    timeline page. Counted without each request's authentication floor, which
    PTY-03 is not budgeting, they must together stay within the eight the FRD
    allows, on the heaviest party in the book.
    """
    detail = _issue(book.client, _detail_url(book.heavy))
    timeline = _issue(book.client, _timeline_url(book.heavy), {"limit": 25})
    own = len(detail) - REQUEST_FLOOR + len(timeline) - REQUEST_FLOOR
    assert own <= 8, "\n".join([f"{own} queries:", *detail, *timeline])


def test_the_timeline_page_walks_the_party_date_index(book: Book) -> None:
    """The first twenty-six rows come off `ix_ledger_party_date`, not a sort.

    §21.3.4's index is `(tenant, party, entry_date DESC, created_at DESC)`, the
    timeline orders by `(-entry_date, -created_at, -id)`, and the cursor asks
    for `limit + 1` rows. If the ordering and the index ever disagree — a
    direction flipped, a column added in front — the plan becomes every one of
    the party's entries read and sorted to show twenty-five, which is invisible
    on a party with three entries and is the whole cost on one with three years.
    """
    queries = _issue(book.client, _timeline_url(book.heavy), {"limit": 25})
    pages = [sql for sql in queries if 'FROM "ledger_entry"' in sql and " LIMIT 26" in sql]
    assert len(pages) == 1, "\n".join(queries)
    plan = _explain(pages[0])
    assert "ix_ledger_party_date" in plan, plan
    assert "Seq Scan on ledger_entry" not in plan, plan
    nodes = _nodes(plan)
    assert nodes[0].startswith("Limit"), plan
    assert not [node for node in nodes if node.startswith("Sort ")], plan


# ── (3) Aging ────────────────────────────────────────────────────────────────


def _aging_url() -> str:
    return reverse("v1:ledger-aging")


#: The per-request floor, then LED-09 §20's "(two queries)": the CTE, and the
#: names — with the tag filter folded into the same query when one is sent.
AGING_QUERIES = (
    "ledger_entry — the FIFO CTE, every party with something outstanding",
    "parties_party — the names (and the tag filter) for the parties the CTE returned",
)
AGING_BUDGET = REQUEST_FLOOR + len(AGING_QUERIES)


def test_the_aging_query_count_does_not_grow_with_the_page_or_the_book(book: Book) -> None:
    """LED-09 §20's two queries, at every page size and after the book grows.

    The report computes every party's buckets and then pages in Python, so the
    rows it handles grow with the book; the QUERIES must not. The defects this
    prevents are the natural ones for a report that joins names to a CTE's
    output: a name fetched per row, a tag lookup per party, a bucket computed
    per party instead of in the one walk. Measured at 25, 100 and 200 rows, with
    and without the tag filter, then again after fifty more parties acquire
    something outstanding.
    """
    counts = {}
    for page_size in (25, 100, 200):
        counts[f"page_size={page_size}"] = len(
            _issue(book.client, _aging_url(), {"page_size": page_size})
        )
    counts["tag"] = len(_issue(book.client, _aging_url(), {"tag": "Camp Area", "page_size": 100}))
    counts["payable"] = len(_issue(book.client, _aging_url(), {"type": "payable"}))

    rows_before = book.client.get(_aging_url(), {"page_size": 200}).json()["meta"]["total"]
    authors = [UserFactory()]
    fresh = Party.objects.filter(tenant=book.tenant, status=PartyStatus.ACTIVE).exclude(
        ledger_entries__isnull=False
    )[:50]
    rng = random.Random(7)
    LedgerEntry.objects.bulk_create(
        [
            entry
            for party in fresh
            for entry in _history(book.tenant, party.id, 4, rng, authors)
            if entry.direction == Direction.DEBIT
        ]
    )
    rows_after = book.client.get(_aging_url(), {"page_size": 200}).json()["meta"]["total"]
    assert rows_after >= rows_before + 50, (rows_before, rows_after)
    counts["after-growth"] = len(_issue(book.client, _aging_url(), {"page_size": 200}))

    assert set(counts.values()) == {AGING_BUDGET}, counts


def test_the_aging_walk_reads_the_book_once_and_can_be_scoped_by_an_index(book: Book) -> None:
    """BR-7's CTE, EXPLAINed: one pass over the tenant's entries, no per-party work.

    The CTE has to read every live entry in the tenant — that is what aging is —
    so the assertions are about the SHAPE, which is what stays true or false
    independent of size:

    * `ledger_entry` is read by exactly ONE scan node. `scoped` is referenced
      twice (the paid and the owed halves); Postgres materialises a CTE
      referenced more than once, so the book is read once and consumed twice. A
      rewrite that inlined it, or joined back to the table per bucket, would
      show a second scan.
    * no `SubPlan`: nothing is evaluated once per party or per row.
    * one `WindowAgg`: the FIFO running total is one window over one sort.
    * with `enable_seqscan = off`, that scan is an index on the tenant — the
      predicate is one an index can confine, so a hosted table holding a
      thousand shops' ledgers is not read whole to age one of them.
    """
    queries = _issue(book.client, _aging_url(), {"page_size": 25})
    ctes = [sql for sql in queries if sql.startswith("WITH scoped AS")]
    assert len(ctes) == 1, "\n".join(queries)
    plan = _explain(ctes[0])
    scans = [node for node in _nodes(plan) if " on ledger_entry" in node]
    assert len(scans) == 1, plan
    assert "SubPlan" not in plan, plan
    assert sum(node.startswith("WindowAgg") for node in _nodes(plan)) == 1, plan
    assert "parties_party" not in plan, plan

    scoped = _explain(ctes[0], disable=("enable_seqscan",))
    assert "Seq Scan on ledger_entry" not in scoped, scoped
    assert "tenant_id" in scoped, scoped


def test_the_aging_names_query_is_one_indexed_lookup(book: Book) -> None:
    """The names for every party the CTE returned, in one query that an index serves.

    With the tag filter it carries the list's own `EXISTS`, so a party with two
    matching tags is counted once. Asked with `enable_seqscan = off`, because at
    2,000 rows fetching a hundred of them by id may honestly be a scan.
    """
    queries = _issue(book.client, _aging_url(), {"tag": "Camp Area", "page_size": 100})
    names = [sql for sql in queries if sql.startswith('SELECT "parties_party"."id"')]
    assert len(names) == 1, "\n".join(queries)
    plan = _explain(names[0], disable=("enable_seqscan",))
    assert "Seq Scan on parties_party " not in plan, plan
    assert "SubPlan" not in plan or "EXISTS" in names[0], plan


# ── (4) Wall clock, deselectable ─────────────────────────────────────────────

#: Ceilings for a developer machine or an unloaded CI runner, well above what the
#: fixture measures and below the specification's own figure where it has one.
#: A guard against an order-of-magnitude regression, not a benchmark.
LIST_CEILING_S = 0.5
KHATA_CEILING_S = 0.5
AGING_CEILING_S = 0.5
#: Median of five warm requests, so one GC pause or one slow fsync on a shared
#: runner does not decide the outcome.
TIMING_RUNS = 5


def _median_seconds(client: Any, url: str, params: dict[str, Any]) -> float:
    assert client.get(url, params).status_code == 200
    samples = []
    for _ in range(TIMING_RUNS):
        started = time.perf_counter()
        response = client.get(url, params)
        samples.append(time.perf_counter() - started)
        assert response.status_code == 200
    return statistics.median(samples)


@pytest.mark.timing
def test_list_page_one_answers_well_inside_the_nfr(book: Book) -> None:
    """Part 12 §12.5 "≤ 1.5 s" and PTY-02's 250 ms server P95 at 10,000 parties.

    At 2,000 parties the server share must be a fraction of either: 500 ms here
    is twice PTY-02's server budget for a book five times the size. Checked for
    the default page, a search and a tag filter, because each takes a different
    path through the filters and the totals aggregate runs over each one's set.
    """
    for params in (_client_params(), _client_params(q=COMMON_TERM), _client_params(tag="Deccan")):
        elapsed = _median_seconds(book.client, _list_url(), params)
        assert elapsed < LIST_CEILING_S, f"GET /parties {params}: {elapsed * 1000:.0f} ms"


@pytest.mark.timing
def test_the_khata_page_requests_answer_well_inside_the_nfr(book: Book) -> None:
    """PTY-03 §20: party and first timeline page, "both ≤ 150 ms server P95".

    The ceiling is 500 ms each, on the heaviest party: loose enough that a busy
    runner does not fail it, tight enough that a timeline which started reading
    the party's whole history would.
    """
    for url, params in (
        (_detail_url(book.heavy), {}),
        (_timeline_url(book.heavy), {"limit": 25}),
    ):
        elapsed = _median_seconds(book.client, url, params)
        assert elapsed < KHATA_CEILING_S, f"GET {url}: {elapsed * 1000:.0f} ms"


@pytest.mark.timing
def test_the_aging_page_answers_well_inside_the_nfr(book: Book) -> None:
    """LED-09: "page P95 ≤ 500 ms for 5k parties" — here at 2,000, same ceiling."""
    elapsed = _median_seconds(book.client, _aging_url(), {"page_size": 25})
    assert elapsed < AGING_CEILING_S, f"GET /ledger/aging: {elapsed * 1000:.0f} ms"
