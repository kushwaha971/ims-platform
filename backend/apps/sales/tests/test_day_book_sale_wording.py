"""UAT D4 — the day book describes a sale by what happened AT ISSUE.

A credit invoice later settled by a receipt read "₹903.00 paid" on the day it
was issued, because the row carried the invoice's CURRENT `amount_due`. The
row is the event, so its due is the grand total less the take-payment.
"""

from __future__ import annotations

from typing import Any

import pytest

from apps.common.dates import tenant_today
from apps.reports.selectors.day_book import DayBookQuery, day_book
from apps.reports.views.day_book import describe
from apps.sales.models import SalesDocument
from apps.sales.tests.conftest import cash, draft, issue, line

pytestmark = pytest.mark.django_db


def _sale_row(document_id: Any) -> Any:
    document = SalesDocument.objects.get(pk=document_id)
    today = tenant_today(document.tenant)
    book = day_book(
        tenant=document.tenant,
        query=DayBookQuery(date_from=today, date_to=today),
        page=1,
        page_size=50,
    )
    return next(row for row in book.rows if str(row.source_id) == str(document_id))


def test_a_credit_invoice_paid_later_still_reads_on_credit_uat_d4(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    """UAT D4 — nothing paid at issue → "on credit", even once a later receipt clears it."""
    party = make_party()
    created = draft(owner, party_id=str(party.id), lines=[line(make_item())]).json()["data"]
    issued = issue(owner, created["id"]).json()["data"]
    SalesDocument.objects.filter(pk=issued["id"]).update(amount_due=0, status="paid")
    row = _sale_row(issued["id"])
    assert row.amount_due == row.amount
    assert describe(row).endswith("credit")


def test_a_part_paid_and_a_fully_paid_sale_say_what_was_paid_uat_d4(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    """UAT D4 — part paid at issue names both halves; a walk-in paid in full reads "paid"."""
    party = make_party()
    created = draft(owner, party_id=str(party.id), lines=[line(make_item(), "2")]).json()["data"]
    part = issue(owner, created["id"], payment=cash("100.00")).json()["data"]
    row = _sale_row(part["id"])
    assert row.amount_due == row.amount - 100
    assert "₹100.00 paid" in describe(row) and describe(row).endswith("credit")

    walk = draft(owner, walk_in_name="Counter", lines=[line(make_item("Soap"))]).json()["data"]
    paid = issue(owner, walk["id"], payment=cash(walk["grand_total"])).json()["data"]
    row = _sale_row(paid["id"])
    assert row.amount_due == 0 and describe(row).endswith("paid")
