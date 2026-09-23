"""PTY-02 — the filters, and the two figures the header answers.

The claim these tests exist to keep true is the one in the sprint's own exit
criteria: **`meta.totals` is over the FILTERED set, not the whole tenant and
not the page.** Everything else here is a filter predicate; that one is the
feature.
"""

from __future__ import annotations

import datetime as dt
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.common.dates import tenant_today
from apps.parties.constants import PartyStatus
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db

LIST = "v1:party-list"


def _book(tenant: Any) -> None:
    """A small book with one of everything the filters have to separate."""
    PartyFactory(tenant=tenant, name="Ramesh Traders", balance=Decimal("2300.00"), is_customer=True)
    PartyFactory(tenant=tenant, name="Sunita Stores", balance=Decimal("900.00"), is_customer=True)
    PartyFactory(
        tenant=tenant,
        name="Gupta Wholesale",
        balance=Decimal("-450.00"),
        is_customer=False,
        is_supplier=True,
    )
    PartyFactory(tenant=tenant, name="Settled Singh", balance=Decimal("0.00"), is_customer=True)


def _get(client: Any, query: str = "") -> dict:
    return client.get(reverse(LIST) + query).json()


# ── The totals ──────────────────────────────────────────────────────────────


def test_totals_cover_the_whole_filtered_set_not_the_page(tenant: Any, api_as: Any) -> None:
    """Thirty parties, a page of twenty-five, and one honest answer.

    The screen used to sum the twenty-five rows it had and label them "from the
    25 customers on this page" — which was true, and was an answer to a
    question nobody asks. A merchant looking at a filtered list wants to know
    what they are owed by everyone in it.
    """
    client, _ = api_as(tenant)
    PartyFactory.create_batch(30, tenant=tenant, balance=Decimal("100.00"))

    body = _get(client)

    assert len(body["data"]) == 25
    assert body["meta"]["totals"]["receivable"] == "3000.00"
    assert body["meta"]["totals"]["count"] == 30


def test_totals_are_strings_because_money_is(tenant: Any, api_as: Any) -> None:
    """Canon rule 3, asserted on the actual JSON type.

    `Decimal("0.00") == 0.0` is true in Python, so a dict comparison passed
    while the renderer was emitting a float and throwing precision away on the
    wire. The type is the assertion.
    """
    client, _ = api_as(tenant)
    PartyFactory(tenant=tenant, balance=Decimal("184300.55"))

    totals = _get(client)["meta"]["totals"]

    assert isinstance(totals["receivable"], str)
    assert isinstance(totals["payable"], str)
    assert totals["receivable"] == "184300.55"


def test_the_two_figures_are_two_conditional_sums_of_one_column(tenant: Any, api_as: Any) -> None:
    """Positives to `receivable`, negatives to `payable` AS A POSITIVE NUMBER.

    A merchant is not owed "minus four hundred and fifty rupees" — they owe
    four hundred and fifty. The sign lives in which figure it lands in, which
    is the same rule the row's own label follows.
    """
    client, _ = api_as(tenant)
    _book(tenant)

    totals = _get(client)["meta"]["totals"]

    assert totals["receivable"] == "3200.00"
    assert totals["payable"] == "450.00"
    # The settled party counts as a party and as no money.
    assert totals["count"] == 4


def test_an_empty_list_reports_zero_rather_than_nothing(tenant: Any, api_as: Any) -> None:
    """A screen that has to tell "no totals yet" from "totals are zero" draws a
    blank where a ₹0.00 belongs."""
    client, _ = api_as(tenant)
    totals = _get(client, "?q=nobody-by-this-name")["meta"]["totals"]
    assert totals == {
        "receivable": "0.00",
        "payable": "0.00",
        "count": 0,
        "over_limit": 0,
    }


# ── The chips ───────────────────────────────────────────────────────────────


def test_the_balance_chip_moves_the_totals_with_it(tenant: Any, api_as: Any) -> None:
    """The exit criterion, stated as one assertion per chip."""
    client, _ = api_as(tenant)
    _book(tenant)

    owed = _get(client, "?balance=owes_me")["meta"]["totals"]
    assert owed == {"receivable": "3200.00", "payable": "0.00", "count": 2, "over_limit": 0}

    owing = _get(client, "?balance=i_owe")["meta"]["totals"]
    assert owing == {"receivable": "0.00", "payable": "450.00", "count": 1, "over_limit": 0}

    settled = _get(client, "?balance=settled")["meta"]["totals"]
    assert settled == {"receivable": "0.00", "payable": "0.00", "count": 1, "over_limit": 0}


def test_a_rupee_is_money(tenant: Any, api_as: Any) -> None:
    """BR-3 — no tolerance band around zero.

    A merchant owed one paisa by forty people is owed forty paise, and the rows
    a collection round is for are exactly the small ones a "close enough"
    threshold would hide.
    """
    client, _ = api_as(tenant)
    PartyFactory(tenant=tenant, name="One Paisa", balance=Decimal("0.01"))

    assert _get(client, "?balance=owes_me")["meta"]["totals"]["count"] == 1
    assert _get(client, "?balance=settled")["meta"]["totals"]["count"] == 0


def test_a_party_who_is_both_answers_either_chip(tenant: Any, api_as: Any) -> None:
    """BR-5, and the reason the model carries two booleans rather than an enum."""
    client, _ = api_as(tenant)
    PartyFactory(tenant=tenant, name="Both Ways", is_customer=True, is_supplier=True)

    assert _get(client, "?type=customer")["meta"]["totals"]["count"] == 1
    assert _get(client, "?type=supplier")["meta"]["totals"]["count"] == 1


def test_the_overdue_chip_leaves_out_people_who_have_paid(tenant: Any, api_as: Any) -> None:
    """BR-7 — a date that has passed is not overdue if the money arrived.

    Without the balance predicate the overdue list fills with people who
    already paid, which is the fastest way to make a merchant stop opening it.
    """
    client, _ = api_as(tenant)
    yesterday = tenant_today(tenant) - timedelta(days=1)
    PartyFactory(
        tenant=tenant, name="Still Owes", collection_date=yesterday, balance=Decimal("500.00")
    )
    PartyFactory(tenant=tenant, name="Has Paid", collection_date=yesterday, balance=Decimal("0.00"))

    body = _get(client, "?collection=overdue")
    assert [row["name"] for row in body["data"]] == ["Still Owes"]


def test_upcoming_is_the_week_ahead_and_not_today(tenant: Any, api_as: Any) -> None:
    client, _ = api_as(tenant)
    today = tenant_today(tenant)
    PartyFactory(tenant=tenant, name="Due Today", collection_date=today)
    PartyFactory(tenant=tenant, name="Due Friday", collection_date=today + timedelta(days=3))
    PartyFactory(tenant=tenant, name="Due Next Month", collection_date=today + timedelta(days=30))

    assert [r["name"] for r in _get(client, "?collection=today")["data"]] == ["Due Today"]
    assert [r["name"] for r in _get(client, "?collection=upcoming")["data"]] == ["Due Friday"]


def test_the_collection_chips_use_the_tenants_today_not_the_servers(
    tenant: Any, api_as: Any, monkeypatch: Any
) -> None:
    """NEW-3 sweep: `_today()` fell back to `date.today()`, the SERVER's date.

    Its docstring said "against the tenant's own today", but the
    `request.business_date` it looked for first was never set anywhere. At
    20:00 UTC — 01:30 IST — a merchant opening "Due today" got yesterday's
    list, and the party due today sat under "Upcoming".
    """
    import types

    import apps.common.dates as dates_module

    server_today = date.today()  # Django runs the process in TIME_ZONE = UTC
    frozen = dt.datetime.combine(server_today, dt.time(20, 0), tzinfo=dt.UTC)
    monkeypatch.setattr(dates_module, "timezone", types.SimpleNamespace(now=lambda: frozen))
    india_today = server_today + timedelta(days=1)

    client, _ = api_as(tenant)
    PartyFactory(tenant=tenant, name="Due Today In India", collection_date=india_today)
    PartyFactory(
        tenant=tenant,
        name="Due Yesterday In India",
        collection_date=server_today,
        balance=Decimal("500.00"),
    )

    assert [r["name"] for r in _get(client, "?collection=today")["data"]] == ["Due Today In India"]
    assert [r["name"] for r in _get(client, "?collection=overdue")["data"]] == [
        "Due Yesterday In India"
    ]
    assert _get(client, "?collection=upcoming")["data"] == []


# ── The search ──────────────────────────────────────────────────────────────


def test_search_finds_a_party_four_ways(tenant: Any, api_as: Any) -> None:
    """FR-5 — a shopkeeper types whichever fragment they remember.

    Name only, which is what this was, means three of these four return nothing
    for a party that is plainly in the book — and an empty result for somebody
    you can see on the previous screen reads as data loss.
    """
    client, _ = api_as(tenant)
    PartyFactory(
        tenant=tenant,
        name="Ramesh Traders",
        display_code="C-042",
        mobile="+919812345678",
        gstin="27AAPFU0939F1ZV",
    )
    PartyFactory(tenant=tenant, name="Someone Else", display_code="C-099", mobile="+919800000000")

    for query in ("ramesh", "C-042", "5678", "27AAPFU0939F1ZV"):
        body = _get(client, f"?q={query}")
        assert [row["name"] for row in body["data"]] == ["Ramesh Traders"], query


def test_a_two_digit_query_is_not_a_phone_number(tenant: Any, api_as: Any) -> None:
    """Matching a mobile suffix on two digits returns most of the book.

    The gate is what keeps `?q=42` a search for a name containing "42" rather
    than for every number ending in it.
    """
    client, _ = api_as(tenant)
    PartyFactory(tenant=tenant, name="Alpha", mobile="+919800000042")
    PartyFactory(tenant=tenant, name="Shop 42", mobile="+919811111111")

    assert [r["name"] for r in _get(client, "?q=42")["data"]] == ["Shop 42"]


def test_search_never_reaches_the_notes(tenant: Any, api_as: Any) -> None:
    """BR-8 — notes are where a merchant writes things about a person.

    A search that reaches them turns a private field into an index.
    """
    client, _ = api_as(tenant)
    PartyFactory(tenant=tenant, name="Quiet Customer", notes="argued about the bill in March")

    assert _get(client, "?q=argued")["meta"]["totals"]["count"] == 0


# ── Ordering ────────────────────────────────────────────────────────────────


def test_never_transacted_parties_sort_last_not_first(tenant: Any, api_as: Any) -> None:
    """FR-7 and BR-6 — `NULLS LAST`, and the defect it fixes.

    Postgres sorts NULLs FIRST on a DESC order, so every party who has never
    had an entry was arriving above the customer who bought something this
    morning. On a tenant with bulk-imported contacts that is the whole first
    page.
    """
    from django.utils import timezone

    client, _ = api_as(tenant)
    PartyFactory(tenant=tenant, name="Never Traded", last_activity_at=None)
    PartyFactory(tenant=tenant, name="Bought Today", last_activity_at=timezone.now())

    assert [row["name"] for row in _get(client)["data"]] == ["Bought Today", "Never Traded"]


def test_an_ordering_outside_the_whitelist_is_ignored(tenant: Any, api_as: Any) -> None:
    """An ordering parameter is a column name arriving from the wire.

    `notes` is not on the list, so asking to sort by it sorts by the default
    instead of leaking the column into an ORDER BY.
    """
    client, _ = api_as(tenant)
    _book(tenant)

    body = _get(client, "?ordering=notes")
    assert body["meta"]["totals"]["count"] == 4


@pytest.mark.parametrize("ordering", ["name", "-name", "balance", "-balance", "collection_date"])
def test_every_whitelisted_ordering_is_accepted(tenant: Any, api_as: Any, ordering: str) -> None:
    client, _ = api_as(tenant)
    _book(tenant)
    assert _get(client, f"?ordering={ordering}")["meta"]["totals"]["count"] == 4


# ── Tenancy, still ──────────────────────────────────────────────────────────


def test_the_totals_never_cross_a_tenant(tenant: Any, two_tenants_full: Any, api_as: Any) -> None:
    """The one number on this screen that could silently aggregate another
    business's book, asserted rather than assumed."""
    client, _ = api_as(tenant)
    PartyFactory(tenant=tenant, balance=Decimal("100.00"))
    PartyFactory(tenant=two_tenants_full["a"]["tenant"], balance=Decimal("999999.00"))

    assert _get(client)["meta"]["totals"]["receivable"] == "100.00"


def test_archived_parties_are_out_of_the_totals_unless_asked_for(tenant: Any, api_as: Any) -> None:
    """BR-4, and the reason it is a contract default rather than a UI one.

    A request that does not mention status is asking about the book the
    merchant is working in. A ₹500 balance on a party archived last year
    appearing in today's header total is a wrong number, not a generous one —
    and it would have, because the list had no default at all.
    """
    client, _ = api_as(tenant)
    PartyFactory(tenant=tenant, name="Active One", balance=Decimal("100.00"))
    PartyFactory(
        tenant=tenant,
        name="Archived One",
        status=PartyStatus.ARCHIVED,
        balance=Decimal("500.00"),
    )

    silent = _get(client)["meta"]["totals"]
    assert silent == {"receivable": "100.00", "payable": "0.00", "count": 1, "over_limit": 0}

    asked = _get(client, "?status=archived")["meta"]["totals"]
    assert asked == {"receivable": "500.00", "payable": "0.00", "count": 1, "over_limit": 0}

    # And never both at once: the two are separate views of the book.
    assert _get(client, "?status=active")["meta"]["totals"]["count"] == 1


def test_search_does_not_reach_an_archived_party(tenant: Any, api_as: Any) -> None:
    """BR-8's second half, which falls out of BR-4 rather than needing its own
    rule — worth asserting because it would be easy to "fix" the status default
    in a way that quietly reopened it."""
    client, _ = api_as(tenant)
    PartyFactory(tenant=tenant, name="Old Supplier", status=PartyStatus.ARCHIVED)

    assert _get(client, "?q=Old Supplier")["meta"]["totals"]["count"] == 0
    assert _get(client, "?q=Old Supplier&status=archived")["meta"]["totals"]["count"] == 1
