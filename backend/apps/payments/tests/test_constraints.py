"""The money invariants hold against a writer that skips the service (migration 0002).

The service refuses each of these with a 400 (see `test_record.py`); these tests
prove the DATABASE refuses them too, which is what protects the books from an
import, a psql session, or next year's aggregator webhook.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest
from django.db import IntegrityError, connection, transaction

from apps.payments.models import Allocation, Payment

pytestmark = pytest.mark.django_db


def _payment(tenant: Any, party: Any, **extra: Any) -> Payment:
    fields: dict[str, Any] = {
        "tenant": tenant,
        "number": "RCT/26-27/9001",
        "direction": "in",
        "party": party,
        "payment_date": dt.date(2026, 9, 1),
        "amount": Decimal("1000.00"),
        "mode_breakup": [{"mode": "upi", "amount": "700.00"}, {"mode": "cash", "amount": "300.00"}],
        "primary_mode": "upi",
        "unallocated_amount": Decimal("1000.00"),
    }
    fields.update(extra)
    return Payment.objects.create(**fields)


def test_modes_that_do_not_sum_to_the_amount_are_refused_by_the_database(
    shop: Any, make_party: Any
) -> None:
    """PAY-02 BR-1 — `ck_payment_modes_sum_to_amount`."""
    party = make_party()
    with pytest.raises(IntegrityError), transaction.atomic():
        _payment(shop, party, mode_breakup=[{"mode": "upi", "amount": "700.00"}])
    assert _payment(shop, party).amount == Decimal("1000.00")


def test_allocations_above_the_payment_are_refused_at_commit(shop: Any, make_party: Any) -> None:
    """PAY-01 BR-2 — the deferred constraint trigger. `SET CONSTRAINTS ALL IMMEDIATE`
    makes it fire inside the test's transaction, as COMMIT would."""
    party = make_party()
    payment = _payment(shop, party)
    import uuid

    with pytest.raises(IntegrityError), transaction.atomic():
        Allocation.objects.create(
            tenant=shop,
            payment=payment,
            document_type="sales_document",
            document_id=uuid.uuid4(),
            amount=Decimal("600.00"),
        )
        Allocation.objects.create(
            tenant=shop,
            payment=payment,
            document_type="sales_document",
            document_id=uuid.uuid4(),
            amount=Decimal("600.00"),
        )
        with connection.cursor() as cursor:
            cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")


def test_unallocated_cannot_exceed_the_amount_and_a_void_needs_a_reason(
    shop: Any, make_party: Any
) -> None:
    party = make_party()
    with pytest.raises(IntegrityError), transaction.atomic():
        _payment(shop, party, unallocated_amount=Decimal("1000.01"))
    with pytest.raises(IntegrityError), transaction.atomic():
        _payment(shop, party, status="void")
    with pytest.raises(IntegrityError), transaction.atomic():
        _payment(shop, None, direction="out")
