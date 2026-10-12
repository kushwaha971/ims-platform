"""`meta.has_any` on the bill lists (approved designs, 12 Oct 2026).

A shop that has never made a bill sees one sentence and one button, with no
tabs, date filter or ₹0 totals. That needs a fact the empty page cannot give:
the list's default range is this financial year, so a shop whose only bills
are from last year also gets an empty page — and must keep the filters that
would show them.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.urls import reverse

from apps.sales.tests.conftest import INVOICES, draft, line

pytestmark = pytest.mark.django_db


def test_a_shop_with_no_bills_says_so(owner: Any) -> None:
    assert owner.get(reverse(INVOICES)).json()["meta"]["has_any"] is False


def test_a_filter_that_finds_nothing_still_says_bills_exist(owner: Any, make_item: Any) -> None:
    assert draft(owner, lines=[line(make_item())]).status_code == 201
    body = owner.get(reverse(INVOICES), {"q": "nobody-has-this-name"}).json()
    assert body["data"] == [] and body["meta"]["has_any"] is True
