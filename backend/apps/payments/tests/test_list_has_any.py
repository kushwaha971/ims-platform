"""`meta.has_any` on the payments list (approved designs, 12 Oct 2026): an
empty book hides its tabs, search and ₹0 totals; a filter that found nothing
keeps them."""

from __future__ import annotations

from typing import Any

import pytest
from django.urls import reverse

from apps.payments.tests.conftest import PAYMENTS, cash_lines, pay

pytestmark = pytest.mark.django_db


def test_no_payments_says_so(owner: Any) -> None:
    assert owner.get(reverse(PAYMENTS)).json()["meta"]["has_any"] is False


def test_a_filter_that_finds_nothing_still_says_payments_exist(owner: Any, make_party: Any) -> None:
    party = make_party()
    assert pay(owner, party_id=str(party.id), mode_breakup=cash_lines("100.00")).status_code == 201
    body = owner.get(reverse(PAYMENTS), {"q": "nobody-has-this-name"}).json()
    assert body["data"] == [] and body["meta"]["has_any"] is True
