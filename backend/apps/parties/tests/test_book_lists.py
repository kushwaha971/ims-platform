"""DEC-019 phase 2 — the Shop's Customers and Suppliers read the Shop's money only.

The owner, 12 Oct 2026: the Udhaar book (You gave / You got) is an app of its own,
like Khatabook, and the Shop keeps its own Customers and Suppliers — bills due —
in two tabs. One person can be in both: their name and mobile are shared, their
money is not. So the party list answers for ONE book per request: `?book=shop`
is the Shop's (`shop_balance`), anything else the Udhaar book's (`balance`).

Every test here names the defect it prevents: a Shop list that showed, filtered,
totalled or sorted by the Udhaar book's figure would put another app's money on
a Shop screen, which is the exact thing DEC-019 forbids.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db

LIST = "v1:party-list"
D = Decimal


def _people(tenant: Any) -> dict[str, Any]:
    """Three people whose two books disagree on purpose."""
    return {
        # Owes the udhaar book ₹500, owes the Shop ₹2,000 on bills.
        "ramesh": PartyFactory(
            tenant=tenant, name="Ramesh", balance=D("500.00"), shop_balance=D("2000.00")
        ),
        # Owes the udhaar book ₹3,000, nothing on bills.
        "sunita": PartyFactory(
            tenant=tenant, name="Sunita", balance=D("3000.00"), shop_balance=D("0.00")
        ),
        # The Shop owes this supplier ₹700; the udhaar book is settled.
        "gupta": PartyFactory(
            tenant=tenant,
            name="Gupta",
            balance=D("0.00"),
            shop_balance=D("-700.00"),
            is_customer=False,
            is_supplier=True,
        ),
    }


def _get(client: Any, query: str) -> dict:
    return client.get(reverse(LIST) + query).json()


def test_a_shop_row_shows_what_is_due_on_bills_not_the_udhaar_figure(
    tenant: Any, api_as: Any
) -> None:
    """Ramesh owes the Shop ₹2,000 and the udhaar book ₹500: the Shop's list says 2,000."""
    client, _ = api_as(tenant)
    _people(tenant)

    rows = {r["name"]: r["balance"] for r in _get(client, "?book=shop")["data"]}
    assert rows == {"Ramesh": "2000.00", "Sunita": "0.00", "Gupta": "-700.00"}

    udhaar = {r["name"]: r["balance"] for r in _get(client, "")["data"]}
    assert udhaar == {"Ramesh": "500.00", "Sunita": "3000.00", "Gupta": "0.00"}


def test_the_shop_header_adds_up_the_shop_column(tenant: Any, api_as: Any) -> None:
    """The header must total the column the rows show, or it contradicts them."""
    client, _ = api_as(tenant)
    _people(tenant)

    shop = _get(client, "?book=shop")["meta"]["totals"]
    assert (shop["receivable"], shop["payable"]) == ("2000.00", "700.00")
    udhaar = _get(client, "")["meta"]["totals"]
    assert (udhaar["receivable"], udhaar["payable"]) == ("3500.00", "0.00")


def test_the_shop_chips_filter_by_the_shop_figure(tenant: Any, api_as: Any) -> None:
    """"Owes me" on the Shop's list is who owes on bills — Sunita owes only the udhaar book."""
    client, _ = api_as(tenant)
    _people(tenant)

    owes = [r["name"] for r in _get(client, "?book=shop&balance=owes_me")["data"]]
    assert owes == ["Ramesh"]
    settled = [r["name"] for r in _get(client, "?book=shop&balance=settled")["data"]]
    assert settled == ["Sunita"]


def test_the_shop_list_sorts_by_the_shop_figure(tenant: Any, api_as: Any) -> None:
    """Sorted by "balance" on the Shop's list is sorted by what is due on bills."""
    client, _ = api_as(tenant)
    _people(tenant)

    names = [r["name"] for r in _get(client, "?book=shop&ordering=-balance")["data"]]
    assert names == ["Ramesh", "Sunita", "Gupta"]


def test_an_unknown_book_is_the_udhaar_book(tenant: Any, api_as: Any) -> None:
    """A stray `?book=` must never reveal another app's figure; it falls back."""
    client, _ = api_as(tenant)
    _people(tenant)

    rows = {r["name"]: r["balance"] for r in _get(client, "?book=library")["data"]}
    assert rows["Ramesh"] == "500.00"
