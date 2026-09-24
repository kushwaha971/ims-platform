"""CR-027 — the running balance on the khata timeline (PTY-03 FR-5/FR-6, BR-1–BR-3).

The statement has carried a running balance since LED-04; the khata timeline —
the screen a merchant opens more than any other — did not, so the one question
that screen exists to answer ("where did this number come from?") had to be
taken to another page. These tests are about the number being RIGHT on the
timeline, which reads the ledger newest-first and pages by cursor, while the
figure only means anything in the order it accumulates (oldest-first).

Three defects are the shape of what can go wrong, and each has a test here:

· page two restarting from zero — the `carried_forward` trap LED-04 found in
  the statement, where Django computes a window after the keyset filter;
· a struck-through row moving the balance with "Show corrections" on, so the
  same khata shows two different running balances depending on a switch;
· a window that costs a query per row, or whose query count grows with the
  book.
"""

from __future__ import annotations

import datetime as dt
import random
from decimal import Decimal
from typing import Any

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse

from apps.common.constants import Direction
from apps.ledger.constants import EntryStatus, EntryType, SourceType
from apps.ledger.models import LedgerEntry
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db

ENTRIES = "v1:ledger-entry-list"
PARTY_ENTRIES = "v1:party-ledger-entry"
DETAIL = "v1:ledger-entry-detail"


def post(client: Any, party: Any, **extra: Any) -> Any:
    """One entry through the real write path, so `parties_party.balance` moves."""
    direction = extra.get("direction", Direction.DEBIT)
    body = {
        "party_id": str(party.id),
        "direction": direction,
        "amount": "100.00",
        "entry_date": "2026-04-10",
        **({"payment_mode": "cash"} if direction == Direction.CREDIT else {}),
        **extra,
    }
    response = client.post(reverse(ENTRIES), body, format="json")
    assert response.status_code == 201, response.json()
    return response.json()["data"]


def timeline(client: Any, party: Any, **params: Any) -> dict:
    """One page of `GET /parties/{id}/ledger-entries` — the route the khata calls."""
    return client.get(reverse(PARTY_ENTRIES, args=[party.id]), params).json()


def whole_timeline(client: Any, party: Any, *, limit: int, **params: Any) -> list[dict]:
    """Every row, walked page by page with the cursor the server hands back."""
    rows: list[dict] = []
    cursor = None
    for _ in range(200):
        page = timeline(
            client, party, limit=limit, **params, **({"cursor": cursor} if cursor else {})
        )
        rows.extend(page["data"])
        if not page["meta"]["has_more"]:
            return rows
        cursor = page["meta"]["next_cursor"]
    raise AssertionError("the cursor never ran out")


def signed(row: dict) -> Decimal:
    amount = Decimal(row["amount"])
    return amount if row["direction"] == Direction.DEBIT else -amount


def counts(row: dict) -> bool:
    """`LIVE_ENTRIES`, read off a wire row: posted, and neither half of a pair."""
    return row["status"] == "posted" and not row["reverses_id"] and not row["reversed_by_id"]


def expected_running(rows_newest_first: list[dict]) -> list[str]:
    """The balance after each row, replayed oldest-first in Python.

    An independent route to the same figure: the server uses a SQL window, this
    walks the list the client was given. A row that does not count contributes
    nothing, and still gets the balance as it stood — the decision the timeline
    takes for struck-through rows, asserted here rather than only described.
    """
    running = Decimal("0.00")
    out: list[str] = []
    for row in reversed(rows_newest_first):
        if counts(row):
            running += signed(row)
        out.append(str(running))
    return list(reversed(out))


@pytest.fixture
def book(tenant: Any, api_as: Any) -> dict:
    """AC-1's party, posted through the route: ₹2,300 opening, ₹500 given, ₹300 got."""
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")
    post(
        client,
        party,
        entry_type=EntryType.OPENING,
        amount="2300.00",
        entry_date="2026-04-01",
    )
    post(client, party, amount="500.00", entry_date="2026-04-18")
    post(client, party, direction=Direction.CREDIT, amount="300.00", entry_date="2026-04-18")
    return {"client": client, "party": party}


# ── The figure itself ───────────────────────────────────────────────────────


def test_each_row_carries_the_balance_after_it_newest_first(book: dict) -> None:
    """FR-5 / US-PTY-03-3 — "Bal ₹2,800" under the ₹500 line, on the khata itself.

    Newest first, as the timeline is read, and each figure is the balance AFTER
    that row in the statement's sign convention (debit positive, canon §0.2) —
    so the same row reads the same number on both screens.
    """
    body = timeline(book["client"], book["party"])

    assert [(row["amount"], row["running_balance"]) for row in body["data"]] == [
        ("300.00", "2500.00"),
        ("500.00", "2800.00"),
        ("2300.00", "2300.00"),
    ]


def test_both_routes_carry_it(book: dict) -> None:
    """FRD §14 names two routes and the khata uses one; neither may lack the field.

    The `?party=` route shares the viewset with the party-scoped one, and a
    field added through a `get_queryset` override on only one of them is the
    shape of defect that passes every test written against the other.
    """
    body = book["client"].get(reverse(ENTRIES), {"party": str(book["party"].id)}).json()

    assert [row["running_balance"] for row in body["data"]] == ["2500.00", "2800.00", "2300.00"]


def test_a_credit_only_khata_runs_negative(tenant: Any, api_as: Any) -> None:
    """A supplier's khata: the balance is what the merchant owes, so it is negative.

    The sign is the statement's (debit positive); the client turns it into
    words ("to give") and never shows a minus to a shopkeeper.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")
    post(client, party, direction=Direction.CREDIT, amount="300.00", entry_date="2026-04-01")
    post(client, party, direction=Direction.CREDIT, amount="200.00", entry_date="2026-04-02")

    body = timeline(client, party)

    assert [row["running_balance"] for row in body["data"]] == ["-500.00", "-300.00"]


def test_rows_carry_a_null_source_until_documents_exist(book: dict) -> None:
    """CR-027's other key. Every row today is manual, so `source` is `null`.

    The KEY is in the shape so that the day an invoice posts a ledger line the
    client gains a link rather than a response it has never seen.
    """
    body = timeline(book["client"], book["party"])

    assert all("source" in row and row["source"] is None for row in body["data"])


# ── BR-1: the newest row IS the header ──────────────────────────────────────


def test_the_newest_running_balance_is_the_party_balance_on_a_fuzzed_book(
    tenant: Any, api_as: Any
) -> None:
    """PTY-03 BR-1 / T-PTY-03-5 and T-PTY-03-6 — LED-04 BR-3's twin, on the timeline.

    Two independent calculations have to meet: `post_entry` moving the cached
    `parties_party.balance` one entry at a time, and a window function replaying
    every row. A fuzzed sequence of dates (so backdated entries interleave) plus
    corrections and reversals, because a correction moves the cache by the
    DIFFERENCE between two rows and is the likeliest thing to split them.

    Every row, not just the newest, is also checked against a replay in Python
    over the rows the client was handed — in both modes of the switch.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")
    random.seed(20260924)
    posted: list[dict] = []
    for _ in range(25):
        direction = random.choice([Direction.DEBIT, Direction.CREDIT])
        posted.append(
            post(
                client,
                party,
                direction=direction,
                amount=f"{random.randint(1, 4000)}.{random.randint(0, 99):02d}",
                entry_date=f"2026-04-{random.randint(1, 20):02d}",
            )
        )
    for victim in random.sample(posted, 3):
        response = client.post(
            f"{reverse(DETAIL, args=[victim['id']])}/reverse",
            {"reason": "Duplicate"},
            format="json",
        )
        assert response.status_code == 200, response.json()
    survivors = [row for row in posted if LedgerEntry.objects.get(pk=row["id"]).status == "posted"]
    for victim in random.sample(survivors, 2):
        response = client.post(
            f"{reverse(DETAIL, args=[victim['id']])}/correct",
            {"amount": "777.77", "reason": "Typed wrong"},
            format="json",
        )
        assert response.status_code == 200, response.json()

    party.refresh_from_db()
    clean = whole_timeline(client, party, limit=50)
    raw = whole_timeline(client, party, limit=50, include_reversed="true")

    assert clean[0]["running_balance"] == str(party.balance)
    assert raw[0]["running_balance"] == str(party.balance)
    assert [row["running_balance"] for row in clean] == expected_running(clean)
    assert [row["running_balance"] for row in raw] == expected_running(raw)


# ── Paging: the carried_forward trap, on a newest-first cursor ──────────────


def test_page_boundaries_are_continuous_with_ties_on_the_date(tenant: Any, api_as: Any) -> None:
    """The page-two defect, which is the one every screenshot of page one misses.

    LED-04 measured it on the statement: `.annotate(Window).filter(keyset)` runs
    the window over the rows the keyset LEAVES, so a page restarts from zero.
    Here the pages are two rows each over seven entries, five of them on one
    Saturday — so a boundary falls inside a run of equal `entry_date`s and the
    tie is broken by `created_at`, the exact place a wrong keyset or a window
    over the wrong set would show.

    The paged figures must equal the single-page figures row for row, and each
    must be the one below it plus its own amount.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")
    post(client, party, amount="1000.00", entry_date="2026-04-01")
    for amount in ("10.00", "20.00", "40.00", "80.00", "160.00"):
        post(client, party, amount=amount, entry_date="2026-04-18")
    post(client, party, direction=Direction.CREDIT, amount="5.00", entry_date="2026-04-19")

    paged = whole_timeline(client, party, limit=2)
    single = timeline(client, party, limit=50)["data"]

    assert [row["id"] for row in paged] == [row["id"] for row in single]
    assert [row["running_balance"] for row in paged] == [row["running_balance"] for row in single]
    assert [row["running_balance"] for row in paged] == [
        "1305.00",
        "1310.00",
        "1150.00",
        "1070.00",
        "1030.00",
        "1010.00",
        "1000.00",
    ]
    for newer, older in zip(paged, paged[1:]):
        assert Decimal(newer["running_balance"]) == Decimal(older["running_balance"]) + signed(
            newer
        )


def test_a_backdated_entry_shifts_every_balance_after_it(book: dict) -> None:
    """PTY-03 BR-2 — why the figure is computed and never stored.

    An entry dated before the others lands in its date position and every
    running balance after it moves. A cached `running_balance_after` would be
    wrong on every row from there to today, silently, for ever.
    """
    post(book["client"], book["party"], amount="50.00", entry_date="2026-04-05")

    body = timeline(book["client"], book["party"])

    assert [(row["amount"], row["running_balance"]) for row in body["data"]] == [
        ("300.00", "2550.00"),
        ("500.00", "2850.00"),
        ("50.00", "2350.00"),
        ("2300.00", "2300.00"),
    ]


# ── Corrections: struck rows contribute zero ────────────────────────────────


def test_a_struck_row_shows_the_balance_as_if_it_did_not_count(book: dict) -> None:
    """The decision for "Show corrections", and T-PTY-03-15's server half.

    Canon §0.2: neither half of a reversal pair is in the balance. So with the
    pair revealed, each struck row carries the running balance AS IT STOOD —
    its own contribution is zero — rather than `null` or a figure that
    includes it. Two consequences, both asserted:

    · every standing row reads the SAME number with the switch on and off
      (PTY-03 BR-3), so flipping it never changes a figure the merchant has
      already read out;
    · the newest row still equals the header (BR-1) even when the newest row
      is the reversal itself.
    """
    client, party = book["client"], book["party"]
    gave = LedgerEntry.objects.get(party=party, amount=Decimal("500.00"))
    response = client.post(
        f"{reverse(DETAIL, args=[gave.id])}/reverse", {"reason": "Wrong party"}, format="json"
    )
    assert response.status_code == 200, response.json()

    clean = timeline(client, party)["data"]
    raw = timeline(client, party, include_reversed="true")["data"]
    party.refresh_from_db()

    assert [(row["amount"], row["running_balance"]) for row in clean] == [
        ("300.00", "2000.00"),
        ("2300.00", "2300.00"),
    ]
    by_id = {row["id"]: row for row in raw}
    assert by_id[str(gave.id)]["status"] == EntryStatus.REVERSED
    assert by_id[str(gave.id)]["running_balance"] == "2300.00"
    # The reversal is dated with the original (LED-03 BR-7) but WRITTEN after the
    # ₹300, so it sorts newest and carries the balance after the ₹300: ₹2,000.
    reversal = next(row for row in raw if row["reverses_id"] == str(gave.id))
    assert raw[0]["id"] == reversal["id"]
    assert reversal["running_balance"] == "2000.00"
    for row in clean:
        assert by_id[row["id"]]["running_balance"] == row["running_balance"]
    assert raw[0]["running_balance"] == str(party.balance) == "2000.00"


def test_a_corrections_replacement_carries_the_net_effect(book: dict) -> None:
    """PTY-03 BR-3 — "the superseding entry carries the net effect".

    ₹500 corrected to ₹550: with the pair hidden the khata reads as though ₹550
    had been written when the correction was — same business date as the
    original, ordered after the ₹300 because it was written after it — and the
    header agrees.
    """
    client, party = book["client"], book["party"]
    gave = LedgerEntry.objects.get(party=party, amount=Decimal("500.00"))
    response = client.post(
        f"{reverse(DETAIL, args=[gave.id])}/correct",
        {"amount": "550.00", "reason": "Typed 500 for 550"},
        format="json",
    )
    assert response.status_code == 200, response.json()

    clean = timeline(client, party)["data"]
    party.refresh_from_db()

    assert [(row["amount"], row["running_balance"]) for row in clean] == [
        ("550.00", "2550.00"),
        ("300.00", "2000.00"),
        ("2300.00", "2300.00"),
    ]
    assert clean[0]["running_balance"] == str(party.balance)


# ── Cost ────────────────────────────────────────────────────────────────────


def _queries_for(client: Any, party: Any, **params: Any) -> int:
    with CaptureQueriesContext(connection) as captured:
        response = client.get(reverse(PARTY_ENTRIES, args=[party.id]), params)
    assert response.status_code == 200
    return len(captured.captured_queries)


def test_the_running_balance_costs_no_query_per_row_or_per_page(tenant: Any, api_as: Any) -> None:
    """O(1) queries — a window is one clause on the page query, not a loop.

    The same count for a three-row khata and a thirty-row one, and page two
    costs no more than page one did without its summary: the carried figure a
    newest-first page needs is zero by construction (see the selector), so
    there is no second aggregate to add, and there must not be one per row.
    """
    client, _ = api_as(tenant)
    small = PartyFactory(tenant=tenant, balance="0.00")
    large = PartyFactory(tenant=tenant, balance="0.00")
    for day in range(1, 4):
        post(client, small, entry_date=f"2026-04-{day:02d}")
    for index in range(30):
        post(client, large, entry_date=f"2026-04-{index % 28 + 1:02d}")

    assert _queries_for(client, small) == _queries_for(client, large)

    first = timeline(client, large, limit=10)
    page_two = _queries_for(client, large, limit=10, cursor=first["meta"]["next_cursor"])
    page_one = _queries_for(client, large, limit=10)
    assert page_two <= page_one


def test_an_entry_the_window_has_never_seen_is_not_invented(tenant: Any) -> None:
    """The selectors, directly: rows written outside the HTTP path still add up.

    A factory row (an import, a job) goes through no service, so this is the
    window and the carried sum reading the table as it is rather than any
    figure a write left behind. Page two is built from the cursor exactly as
    the view builds it.
    """
    from apps.common.pagination import decode_cursor, encode_cursor
    from apps.ledger.selectors.entry import TIMELINE_ORDERING, party_entries
    from apps.ledger.selectors.statement import timeline_carried, with_running_balance

    party = PartyFactory(tenant=tenant, balance="0.00")
    for day, amount in ((1, "100.00"), (2, "50.00"), (3, "25.00")):
        LedgerEntry.objects.create(
            tenant=tenant,
            party=party,
            direction=Direction.DEBIT,
            amount=Decimal(amount),
            entry_date=dt.date(2026, 4, day),
            entry_type=EntryType.MANUAL_GAVE,
            source_type=SourceType.MANUAL,
            status=EntryStatus.POSTED,
        )

    rows = list(with_running_balance(party_entries(tenant=tenant, party_id=party.id)))
    carried = timeline_carried(tenant=tenant, party_id=party.id, position=None)
    assert [carried - row.timeline_delta + row.timeline_own for row in rows] == [
        Decimal("175.00"),
        Decimal("150.00"),
        Decimal("100.00"),
    ]

    position = decode_cursor(encode_cursor(rows[0], TIMELINE_ORDERING))
    assert timeline_carried(tenant=tenant, party_id=party.id, position=position) == Decimal(
        "150.00"
    )
