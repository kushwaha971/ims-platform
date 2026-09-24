"""PUR-03 — the bills list: tabs, filters, search, and payables totals over the filtered set."""

from __future__ import annotations

from typing import Any

import pytest
from django.urls import reverse

from apps.purchases.models import PurchaseDocument
from apps.purchases.tests.conftest import BILLS, draft, line, recorded_bill, void

pytestmark = pytest.mark.django_db


@pytest.fixture
def book(owner: Any, make_item: Any, make_supplier: Any) -> dict:
    """Agro: two unpaid bills (₹105, ₹210) and one voided; Mills: one unpaid (₹52.50→₹53);
    plus a draft. Dates spread over September."""
    agro = make_supplier(name="Agro Traders")
    mills = make_supplier(name="Mills & Co")
    rice = make_item("Rice", "100.00")
    one = recorded_bill(
        owner,
        party_id=str(agro.id),
        supplier_invoice_number="AT/778",
        document_date="2026-09-02",
        lines=[line(rice, "1")],
    )
    two = recorded_bill(
        owner, party_id=str(agro.id), document_date="2026-09-10", lines=[line(rice, "2")]
    )
    gone = recorded_bill(
        owner, party_id=str(agro.id), document_date="2026-09-11", lines=[line(rice, "3")]
    )
    assert void(owner, gone["id"]).status_code == 200
    three = recorded_bill(
        owner, party_id=str(mills.id), document_date="2026-09-15", lines=[line(rice, "1", "50")]
    )
    pending = draft(owner, party_id=str(agro.id), lines=[line(rice, "9")]).json()["data"]
    return {"agro": agro, "mills": mills, "one": one, "two": two, "three": three, "draft": pending}


def get(client: Any, **params: Any) -> dict:
    response = client.get(reverse(BILLS), params)
    assert response.status_code == 200, response.json()
    return response.json()


def test_tabs_map_to_statuses_and_counts_ignore_the_tab(owner: Any, book: dict) -> None:
    """T-PUR-03-1 / AC-1 — Unpaid is recorded + partially paid + overdue; every tab's count is
    computed over the filters WITHOUT the tab, so the chips agree whichever one is pressed."""
    PurchaseDocument.objects.filter(pk=book["three"]["id"]).update(status="overdue")
    unpaid = get(owner, tab="unpaid")
    assert {row["id"] for row in unpaid["data"]} == {
        book["one"]["id"],
        book["two"]["id"],
        book["three"]["id"],
    }
    counts = unpaid["meta"]["counts"]
    assert counts == {"all": 5, "unpaid": 3, "overdue": 1, "paid": 0, "draft": 1, "void": 1}
    assert get(owner, tab="overdue")["meta"]["counts"] == counts
    assert [row["status"] for row in get(owner, tab="void")["data"]] == ["void"]
    drafts = get(owner, tab="draft")["data"]
    assert [(row["id"], row["number"]) for row in drafts] == [(book["draft"]["id"], None)]


def test_payables_totals_cover_every_page_and_never_sum_drafts_or_voids(
    owner: Any, book: dict
) -> None:
    """T-PUR-03-1 / AC-3 / BR-1 — "To pay" is Σ amount_due of the FILTERED set across pages
    (a page of one still reports all of Agro's), and a draft or a void never counts."""
    body = get(owner, party_id=str(book["agro"].id), page_size=1)
    assert len(body["data"]) == 1
    assert body["meta"]["totals"] == {"count": 4, "grand_total": "315.00", "amount_due": "315.00"}
    everyone = get(owner, tab="unpaid")["meta"]["totals"]
    assert everyone == {"count": 3, "grand_total": "368.00", "amount_due": "368.00"}


def test_search_finds_the_supplier_invoice_number_and_the_supplier(owner: Any, book: dict) -> None:
    """T-PUR-03-2 / AC-2 / FR-2 — "AT/778" finds the bill; "mills" finds Mills' bill; the
    bill's own number is searchable too."""
    assert [row["id"] for row in get(owner, q="AT/778")["data"]] == [book["one"]["id"]]
    assert [row["id"] for row in get(owner, q="mills")["data"]] == [book["three"]["id"]]
    number = book["two"]["number"]
    assert [row["id"] for row in get(owner, q=number)["data"]] == [book["two"]["id"]]


def test_a_date_range_filters_and_a_reversed_one_is_refused(owner: Any, book: dict) -> None:
    """FR-4 / §10 — `date_from ≤ date_to`; the range filters by the bill date; a bad ordering
    or tab is 400 rather than silently ignored."""
    rows = get(owner, tab="unpaid", date_from="2026-09-05", date_to="2026-09-12")["data"]
    assert [row["id"] for row in rows] == [book["two"]["id"]]
    for params in (
        {"date_from": "2026-09-12", "date_to": "2026-09-05"},
        {"ordering": "party"},
        {"tab": "everything"},
    ):
        assert owner.get(reverse(BILLS), params).status_code == 400


def test_a_row_carries_the_frozen_supplier_name_and_days_late(
    owner: Any, book: dict, shop: Any
) -> None:
    """EC-1 / BR-2 — a recorded bill keeps the supplier's name as it was; `is_overdue` is true
    for a past-due open bill before tonight's job has stored `overdue`."""
    book["agro"].name = "Agro Traders Pvt Ltd"
    book["agro"].save()
    PurchaseDocument.objects.filter(pk=book["one"]["id"]).update(due_on="2026-09-03")
    rows = {row["id"]: row for row in get(owner, tab="unpaid")["data"]}
    assert rows[book["one"]["id"]]["party"]["name"] == "Agro Traders"
    assert rows[book["one"]["id"]]["is_overdue"] is True
    assert rows[book["one"]["id"]]["supplier_invoice_number"] == "AT/778"


def test_another_tenant_sees_none_of_it(book: dict, other_tenant: Any, api_as: Any) -> None:
    """Canon §0.11 rule 2 — tenant scoping: another business lists nothing and gets 404."""
    client, _ = api_as(other_tenant)
    assert client.get(reverse(BILLS)).json()["data"] == []
    detail = reverse("v1:purchase-bill-detail", args=[book["one"]["id"]])
    assert client.get(detail).status_code == 404
