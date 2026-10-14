"""UX16 / DEC-019: automatic fee collection must retain its app at the API boundary."""

from decimal import Decimal
from typing import Any

import pytest
from django.test import override_settings

from apps.library.tests.conftest import entitle_library
from apps.library.tests.factories import charge, member
from apps.payments.tests.conftest import cash_lines, pay
from apps.sales.models import SalesDocument

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize("amount", ["200.00", "1000.00"])
@override_settings(UB_UNRELEASED_MODULES=True)
def test_library_auto_collection_never_settles_the_same_persons_shop_invoice(
    owner: Any, shop: Any, make_party: Any, invoice_for: Any, amount: str
) -> None:
    entitle_library(shop)
    party = make_party(balance=Decimal("777.00"))
    invoice = invoice_for(party, "100.00")
    fee = charge(shop, member(shop, party), "900.00")
    response = pay(
        owner,
        party_id=str(party.id),
        bucket="library",
        allocations="auto",
        mode_breakup=cash_lines(amount),
    )
    assert response.status_code == 201, response.json()
    data = response.json()["data"]
    assert data["bucket"] == "library"
    assert sum(Decimal(row["amount"]) for row in data["allocations"]) == min(
        Decimal(amount), Decimal("900.00")
    )
    assert {row["document_type"] for row in data["allocations"]} == {"library_charge"}
    assert data["unallocated_amount"] == f"{max(Decimal(amount) - Decimal('900.00'), 0):.2f}"
    fee.refresh_from_db()
    party.refresh_from_db()
    assert fee.amount_due == max(Decimal("900.00") - Decimal(amount), 0)
    assert SalesDocument.objects.get(pk=invoice["id"]).amount_due == Decimal("100.00")
    assert party.balance == Decimal("777.00")
    assert party.shop_balance == Decimal("100.00")


@pytest.mark.parametrize("bucket", ["main", "loan", "unknown"])
def test_invalid_automatic_payment_bucket_is_not_silently_replaced_with_shop(
    owner: Any, make_party: Any, bucket: str
) -> None:
    party = make_party()
    response = pay(
        owner,
        party_id=str(party.id),
        bucket=bucket,
        allocations="auto",
        mode_breakup=cash_lines("10.00"),
    )
    assert response.status_code == 400, response.json()
    assert "bucket" in response.json()["error"]["details"]
