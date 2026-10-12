"""`meta.has_any` on the purchase lists (approved designs, 12 Oct 2026).

A shop that has never recorded a supplier bill, order or debit note sees one
sentence and one button — no tabs, search or ₹0 totals. A filter that found
nothing must keep them, so the list says whether the kind exists at all.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.urls import reverse

from apps.purchases.tests.conftest import BILLS, line, recorded_bill

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize("name", [BILLS, "v1:purchase-order-list", "v1:purchase-debit-note-list"])
def test_a_shop_with_nothing_bought_says_so(owner: Any, name: str) -> None:
    assert owner.get(reverse(name)).json()["meta"]["has_any"] is False


def test_a_search_that_finds_nothing_still_says_bills_exist(
    owner: Any, make_item: Any, make_supplier: Any
) -> None:
    agro = make_supplier(name="Agro Traders")
    recorded_bill(owner, party_id=str(agro.id), lines=[line(make_item("Rice", "100.00"), "1")])
    body = owner.get(reverse(BILLS), {"q": "nobody-has-this-name"}).json()
    assert body["data"] == [] and body["meta"]["has_any"] is True
