"""`meta.has_any` on the sales register, purchase register and profit report
(approved designs, 12 Oct 2026).

Each screen shows ONE empty state, without its period picker, filters or void
toggle, only when the business has never recorded what it reads. A period
that found nothing, while the book has records elsewhere, keeps every control
— moving the period is how the merchant finds them. So the flag is computed
over the whole book, never the filtered set, and these tests pin both halves.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.urls import reverse

from apps.reports.tests import builders as b

pytestmark = pytest.mark.django_db

TODAY = dt.date(2026, 10, 6)
LAST_YEAR = dt.date(2025, 6, 1)
OCTOBER = {"date_from": "2026-10-01", "date_to": "2026-10-06"}
SALES = "v1:report-sales-register"
PURCHASES = "v1:report-purchase-register"
PROFIT = "v1:report-profit"


@pytest.fixture
def owner(tenant: Any, api_as: Any) -> Any:
    return api_as(tenant)[0]


def _meta(client: Any, url: str, **query: Any) -> dict:
    got = client.get(reverse(url), {**OCTOBER, **query})
    assert got.status_code == 200, got.content
    return got.json()


@pytest.mark.parametrize("url", [SALES, PURCHASES, PROFIT])
def test_a_new_business_has_an_empty_book(owner: Any, url: str) -> None:
    """The case the single empty state is for: nothing, ever."""
    body = _meta(owner, url)
    assert body["data"] == [] and body["meta"]["has_any"] is False


@pytest.mark.parametrize("url", [SALES, PROFIT])
def test_a_draft_bill_is_not_a_sale(owner: Any, tenant: Any, url: str) -> None:
    """Neither screen ever lists a draft, so a draft must not keep their controls up."""
    b.sale(tenant, TODAY, "100", status="draft")
    assert _meta(owner, url)["meta"]["has_any"] is False


@pytest.mark.parametrize("url", [SALES, PROFIT])
def test_a_quiet_month_keeps_the_controls(owner: Any, tenant: Any, url: str) -> None:
    """A bill last year and none this month: the period picker is how it is found."""
    b.sale(tenant, LAST_YEAR, "100", party=b.party(tenant))
    body = _meta(owner, url)
    assert body["data"] == [] and body["meta"]["has_any"] is True


def test_a_void_document_keeps_the_register_but_not_the_profit(owner: Any, tenant: Any) -> None:
    """ "Show void" reveals a void invoice in the register; profit never reads one."""
    b.sale(tenant, LAST_YEAR, "100", party=b.party(tenant), status="void")
    assert _meta(owner, SALES)["meta"]["has_any"] is True
    assert _meta(owner, PROFIT)["meta"]["has_any"] is False


def test_the_register_flag_ignores_its_filters(owner: Any, tenant: Any) -> None:
    """The flag is the book's, not the filtered set's — or a filter would hide itself."""
    b.sale(tenant, TODAY, "100", party=b.party(tenant))
    body = _meta(owner, SALES, kind="credit_note")
    assert body["data"] == [] and body["meta"]["has_any"] is True


def test_the_purchase_register_counts_a_recorded_bill_not_a_draft(owner: Any, tenant: Any) -> None:
    supplier = b.party(tenant, "Agarwal")
    b.purchase(tenant, TODAY, "100", party=supplier, status="draft")
    assert _meta(owner, PURCHASES)["meta"]["has_any"] is False
    b.purchase(tenant, LAST_YEAR, "100", party=supplier)
    body = _meta(owner, PURCHASES)
    assert body["data"] == [] and body["meta"]["has_any"] is True


def test_the_line_level_register_carries_the_flag_too(owner: Any, tenant: Any) -> None:
    """`level=line` is served by a sibling view; the screen reads the same meta from it."""
    assert _meta(owner, SALES, level="line")["meta"]["has_any"] is False
