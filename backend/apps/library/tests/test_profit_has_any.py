"""`meta.has_any` on Income & expenses (approved designs, 12 Oct 2026).

A reading room that has never taken a fee nor recorded an expense sees one
empty state — no This month / Last month / This year chips, no ₹0.00 tiles. A
quiet period in a room that HAS money keeps its chips, so the owner can move
the period. Only the server can tell the two apart.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.urls import reverse

from apps.common.dates import tenant_today
from apps.expenses.models import ExpenseCategory
from apps.library.tests import test_profit

#: The reading room `test_profit` builds (owner client, seeded categories, a
#: Monthly plan and `admit`), reused rather than copied.
room = test_profit.room
spend = test_profit.spend

pytestmark = pytest.mark.django_db


def profit_page(room: dict, **params: Any) -> dict:
    response = room["client"].get(reverse("v1:library-profit"), params)
    assert response.status_code == 200, response.json()
    return response.json()


def last_month(room: dict) -> dict:
    first = tenant_today(room["tenant"]).replace(day=1)
    end = first - dt.timedelta(days=1)
    return {"from": end.replace(day=1).isoformat(), "to": end.isoformat()}


def test_a_room_with_no_money_says_so(room: dict) -> None:
    assert profit_page(room)["meta"]["has_any"] is False


def test_a_charged_but_unpaid_fee_is_not_money(room: dict) -> None:
    """A fee charged and not paid is not income (the profit rule), so it must not
    make the screen show chips over ₹0.00."""
    room["admit"]("Imran", "9876500012", collect=False)
    assert profit_page(room)["meta"]["has_any"] is False


def test_a_paid_fee_counts_even_in_a_quiet_period(room: dict) -> None:
    """The defect this prevents: last month's empty figures read as an empty room,
    hiding the chips the owner needs to get back to this month."""
    room["admit"]("Rahul", "9876500011", collect=True)
    body = profit_page(room, **last_month(room))
    assert body["data"]["income_total"] == "0.00" and body["meta"]["has_any"] is True


def test_an_expense_alone_counts(room: dict) -> None:
    code = ExpenseCategory.objects.for_tenant(room["tenant"]).first().system_code
    spend(room, "120.00", code)
    body = profit_page(room, **last_month(room))
    assert body["data"]["expenses_total"] == "0.00" and body["meta"]["has_any"] is True
