"""DUE-03 QA round 1 — failing tests for findings (Track D progress file)."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest

from apps.common.dates import tenant_today
from apps.dues.tests.factories import open_due
from apps.sales.tests.conftest import (  # noqa: F401  (fixtures)
    make_item,
    make_party,
    owner,
    reference,
    shop,
)

pytestmark = pytest.mark.django_db


def test_qa_due03_1_the_allocation_panel_lists_dues_and_invoices_oldest_first(
    shop: Any, make_party: Any, owner: Any, make_item: Any  # noqa: F811
) -> None:
    """QA-DUE-03-1 — `open_documents` concatenated targets in registration order, so with
    `dues_due` as a second main-bucket target the panel listed every invoice before any due,
    however old. The panel's FIFO preview walks that list, while the server's "auto" merges
    by date: a ₹500 payment previewed onto last week's invoice settled last month's due."""
    from apps.payments.selectors.payments import open_documents
    from apps.sales.tests.conftest import draft, issue, line

    party = make_party(name="Asha Rao")
    today = tenant_today(shop)
    old_due = open_due(shop, party, today - dt.timedelta(days=30))
    item = make_item(name="Notebook", price="500.00", tax_code="GST0")
    created = draft(
        owner,
        party_id=str(party.id),
        lines=[line(item)],
        document_date=(today - dt.timedelta(days=7)).isoformat(),
    ).json()["data"]
    assert issue(owner, created["id"]).status_code == 200

    rows = open_documents(tenant=shop, party_id=party.id, direction="in")

    assert [r["document_type"] for r in rows] == ["dues_due", "sales_document"]
    assert rows[0]["document_id"] == str(old_due.id)
    assert Decimal(rows[0]["amount_due"]) == Decimal("500.00")
