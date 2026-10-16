"""`meta.has_any` on the cashbook (approved designs, 12 Oct 2026).

A business that has never moved money sees one empty state — no period picker,
no bucket switch, no ₹0.00 opening and closing. A quiet range in a book that
HAS money keeps every control, so the merchant can move the range. The client
holds one range at a time and cannot tell the two apart; these tests pin the
server fact that does, across all three sources.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.urls import reverse

from apps.expenses.tests.helpers import CASHBOOK, record
from apps.expenses.tests.test_cashbook import got
from apps.reports.tests import builders as b
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db


def meta(client: Any) -> dict:
    response = client.get(reverse(CASHBOOK))
    assert response.status_code == 200, response.json()
    return response.json()


def test_a_business_that_never_moved_money_says_so(owner: Any) -> None:
    """The empty book: the screen may hide its period picker and ₹0 tiles."""
    assert meta(owner)["meta"]["has_any"] is False


def test_an_unpaid_expense_is_not_money_in_the_book(
    tenant: Any, owner: Any, categories: dict
) -> None:
    """BR-4: an unpaid expense is not a cash event, so it does not make the book
    non-empty — otherwise the screen would show controls over nothing but ₹0."""
    from tests.factories.parties import PartyFactory

    landlord = PartyFactory(tenant=tenant, is_customer=False, is_supplier=True)
    # An unpaid expense names who is owed; it posts a credit with no mode.
    unpaid = record(
        owner, categories["food"], paid=False, party_id=str(landlord.id), due_on="2026-04-05"
    )
    assert unpaid.status_code == 201, unpaid.json()
    assert meta(owner)["meta"]["has_any"] is False


def test_a_quiet_today_in_a_book_with_an_old_expense_keeps_its_controls(
    owner: Any, categories: dict
) -> None:
    """The defect this prevents: an empty TODAY read as an empty BOOK, hiding the
    period picker the merchant needs to reach April's expense."""
    assert record(owner, categories["food"], expense_date="2026-04-01").status_code == 201
    body = meta(owner)
    assert body["data"]["days"] == [] and body["meta"]["has_any"] is True


def test_the_udhaar_books_you_got_is_not_the_shops_cash(tenant: Any, owner: Any) -> None:
    """DEC-019 / WP-06 Finding 4 — the cashbook is the Shop's till. An Udhaar-book
    "You got ₹250, cash" is that app's money, so it neither appears here nor
    makes the Shop's book look non-empty."""
    party = PartyFactory(tenant=tenant, balance="0.00")
    got(owner, party, "250.00", "2026-04-02")
    assert meta(owner)["meta"]["has_any"] is False


def test_a_payment_counts_through_the_registered_source(tenant: Any, owner: Any) -> None:
    """The payments source lives in `reports`; it must answer `exists` too, or a
    business whose only money is receipts would be told it has none."""
    b.payment(tenant, dt.date(2026, 4, 3), {"upi": 400}, party=b.party(tenant))
    assert meta(owner)["meta"]["has_any"] is True


def test_a_void_or_adjustment_only_payment_does_not_count(tenant: Any, owner: Any) -> None:
    """Neither ever appears as a cashbook row (FR-12, R4), so neither may make
    the book look non-empty."""
    ramesh = b.party(tenant)
    b.payment(tenant, dt.date(2026, 4, 3), {"cash": 100}, party=ramesh, status="void")
    b.payment(tenant, dt.date(2026, 4, 3), {"adjustment": 100}, party=ramesh)
    assert meta(owner)["meta"]["has_any"] is False
