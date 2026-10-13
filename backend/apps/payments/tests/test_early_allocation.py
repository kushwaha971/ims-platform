"""QA B37 — a receipt dated before its bill requires explicit confirmation."""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest

from apps.common.dates import tenant_today
from apps.payments.models import Payment
from apps.payments.tests.conftest import cash_lines, pay
from apps.sales.models import SalesDocument

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize("automatic", [False, True])
@pytest.mark.parametrize("confirmed", [False, "true", True])
def test_early_allocation_requires_real_confirmation(
    owner: Any, make_party: Any, invoice_for: Any, automatic: bool, confirmed: Any
) -> None:
    """B37 prevents silent early allocation but preserves deliberately confirmed advances."""
    party = make_party()
    invoice = invoice_for(party, "100.00")
    before = Payment.objects.count()
    response = pay(
        owner,
        party_id=str(party.id),
        payment_date=(tenant_today(party.tenant) - dt.timedelta(days=1)).isoformat(),
        mode_breakup=cash_lines("10.00"),
        allocations=(
            "auto"
            if automatic
            else [
                {
                    "document_type": "sales_document",
                    "document_id": invoice["id"],
                    "amount": "10.00",
                }
            ]
        ),
        confirm_early_allocation=confirmed,
    )
    if confirmed is True:
        assert response.status_code == 201, response.json()
        assert SalesDocument.objects.get(pk=invoice["id"]).amount_due == 90
    else:
        assert response.status_code == 400, response.json()
        assert "payment_date" in response.json()["error"]["details"]
        assert Payment.objects.count() == before
        assert SalesDocument.objects.get(pk=invoice["id"]).amount_due == 100


def test_early_unallocated_receipt_remains_a_valid_advance(
    owner: Any, make_party: Any, invoice_for: Any
) -> None:
    """B37 guards allocation, without forbidding money received on account before a bill."""
    party = make_party()
    invoice = invoice_for(party, "100.00")
    response = pay(
        owner,
        party_id=str(party.id),
        payment_date=(tenant_today(party.tenant) - dt.timedelta(days=1)).isoformat(),
        mode_breakup=cash_lines("10.00"),
        allocations="none",
    )
    assert response.status_code == 201, response.json()
    assert response.json()["data"]["unallocated_amount"] == "10.00"
    assert SalesDocument.objects.get(pk=invoice["id"]).amount_due == 100
