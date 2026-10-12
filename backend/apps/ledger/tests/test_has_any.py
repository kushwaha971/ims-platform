"""`meta.has_any` on `/ledger/aging` and `/ledger/summary` (owner, 12 Oct 2026).

Old dues and Reminders reduce an EMPTY book to one plain empty state — no as-of
date, export, tabs or "₹0.00 from 0 customers" — but a book whose filters found
nobody keeps its controls. The figures cannot tell those apart (a settled book
and an empty one both total ₹0.00), so the server says which it is.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.common.constants import Direction
from apps.ledger.constants import EntryStatus, EntryType, SourceType
from apps.ledger.models import LedgerEntry
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db

AGING = "v1:ledger-aging"
SUMMARY = "v1:ledger-summary"


def _entry(party: Any, direction: str, amount: str, days_ago: int = 5) -> LedgerEntry:
    return LedgerEntry.objects.create(
        tenant=party.tenant,
        party=party,
        direction=direction,
        amount=Decimal(amount),
        entry_date=dt.date.today() - dt.timedelta(days=days_ago),
        entry_type=(
            EntryType.MANUAL_GAVE if direction == Direction.DEBIT else EntryType.MANUAL_GOT
        ),
        source_type=SourceType.MANUAL,
        status=EntryStatus.POSTED,
        **({"payment_mode": "cash"} if direction == Direction.CREDIT else {}),
    )


def test_a_new_business_has_no_book(tenant: Any, api_as: Any) -> None:
    """The defect: a new shop's Old dues showed "As of …", an export and two
    ₹0.00 tabs over "All settled" — a report about a book that does not exist.
    A party with no entry is not a book either."""
    PartyFactory(tenant=tenant, balance="0.00")
    client, _ = api_as(tenant)

    assert client.get(reverse(AGING)).json()["meta"]["has_any"] is False
    assert client.get(reverse(SUMMARY)).json()["meta"]["has_any"] is False


def test_a_settled_book_still_has_a_book(tenant: Any, api_as: Any) -> None:
    """Nobody owes anything, but entries exist: the empty REPORT keeps its
    controls ("All settled" is good news, not a first-use screen)."""
    party = PartyFactory(tenant=tenant, balance="0.00")
    _entry(party, Direction.DEBIT, "500.00", days_ago=20)
    _entry(party, Direction.CREDIT, "500.00", days_ago=2)
    client, _ = api_as(tenant)

    body = client.get(reverse(AGING)).json()
    assert body["data"] == [] and body["meta"]["has_any"] is True
    assert client.get(reverse(SUMMARY)).json()["meta"]["has_any"] is True


def test_a_filter_that_finds_nobody_still_says_the_book_exists(tenant: Any, api_as: Any) -> None:
    """`has_any` is whole-book, never filtered: a tag that matches nobody must
    not collapse the screen and take away the control that set it."""
    party = PartyFactory(tenant=tenant, balance="700.00")
    _entry(party, Direction.DEBIT, "700.00")
    client, _ = api_as(tenant)

    body = client.get(reverse(AGING), {"tag": "no-such-tag"}).json()
    assert body["data"] == [] and body["meta"]["has_any"] is True


def test_another_business_entries_do_not_count(tenant: Any, other_tenant: Any, api_as: Any) -> None:
    """Tenant-scoped: one shop's ledger must not give another shop its tabs."""
    _entry(PartyFactory(tenant=other_tenant, balance="100.00"), Direction.DEBIT, "100.00")
    client, _ = api_as(tenant)

    assert client.get(reverse(AGING)).json()["meta"]["has_any"] is False
    assert client.get(reverse(SUMMARY)).json()["meta"]["has_any"] is False
