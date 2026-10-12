"""DEC-019 phase 2 — a person's page reads ONE app's book.

The khata-shaped page (a timeline with a running balance, and a statement) is
shared by two apps: the Udhaar book (You gave / You got, the `main` bucket) and
the Shop (bills and the payments against them, the `shop` bucket). `?book=shop`
on the timeline and on the statement returns the Shop's lines only; anything
else is the Udhaar book's. A page that mixed them would show a shopkeeper's
bill inside someone's udhaar book — the defect DEC-019 exists to end — and its
closing figure would agree with neither cached balance.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.common.constants import Direction, LedgerBucket
from apps.ledger.constants import EntryStatus, EntryType, SourceType
from apps.ledger.models import LedgerEntry
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db

D = Decimal
PARTY_ENTRIES = "v1:party-ledger-entry"
STATEMENT = "v1:party-statement"


def _line(party: Any, day: int, direction: str, amount: str, bucket: str, kind: str) -> None:
    LedgerEntry.objects.create(
        tenant=party.tenant,
        party=party,
        direction=direction,
        amount=D(amount),
        entry_date=dt.date(2026, 4, day),
        entry_type=kind,
        source_type=SourceType.MANUAL,
        status=EntryStatus.POSTED,
        bucket=bucket,
    )


@pytest.fixture
def ramesh(tenant: Any) -> Any:
    """₹500 udhaar given, and a ₹2,000 Shop debit with ₹800 paid against it."""
    party = PartyFactory(tenant=tenant, balance=D("500.00"), shop_balance=D("1200.00"))
    _line(party, 1, Direction.DEBIT, "500.00", LedgerBucket.MAIN, EntryType.MANUAL_GAVE)
    _line(party, 2, Direction.DEBIT, "2000.00", LedgerBucket.SHOP, EntryType.MANUAL_GAVE)
    _line(party, 3, Direction.CREDIT, "800.00", LedgerBucket.SHOP, EntryType.MANUAL_GOT)
    return party


def test_the_shop_timeline_lists_only_the_shops_lines(
    tenant: Any, api_as: Any, ramesh: Any
) -> None:
    client, _ = api_as(tenant)
    url = reverse(PARTY_ENTRIES, args=[ramesh.id])

    shop = client.get(url, {"book": "shop"}).json()
    assert [r["amount"] for r in shop["data"]] == ["800.00", "2000.00"]
    # The newest row's running balance is the Shop's figure, not the udhaar book's.
    assert shop["data"][0]["running_balance"] == "1200.00"
    assert shop["meta"]["summary"]["entry_count"] == 2

    udhaar = client.get(url).json()
    assert [r["amount"] for r in udhaar["data"]] == ["500.00"]
    assert udhaar["meta"]["summary"]["entry_count"] == 1


def test_the_shop_statement_closes_on_the_shop_balance(
    tenant: Any, api_as: Any, ramesh: Any
) -> None:
    """BR-3 per book: an unbounded statement closes on that book's cached column."""
    client, _ = api_as(tenant)
    url = reverse(STATEMENT, args=[ramesh.id])

    shop = client.get(url, {"book": "shop"}).json()["data"]
    assert shop["closing_balance"] == "1200.00"
    assert [r["amount"] for r in shop["rows"]] == ["2000.00", "800.00"]

    udhaar = client.get(url).json()["data"]
    assert udhaar["closing_balance"] == "500.00"
    assert [r["amount"] for r in udhaar["rows"]] == ["500.00"]
