"""R24 — `adjustment` is a mode no public path accepts (A4b, contracts §1.4).

`PaymentMode.ADJUSTMENT` exists for one purpose: the two halves of applying a
held deposit, and an opening deposit taken before go-live, both written by
`payments.services.deposits`. The defect each test prevents is the same one on
a different door: a merchant (or a client bug) recording "₹5,000 received by
adjustment" — money that never moved, sitting in the books as money that did,
and invisible to the cashbook that R4 made blind to it on purpose.
"""

from __future__ import annotations

from typing import Any

import pytest

from apps.common.constants import MONEY_PAYMENT_MODES, PaymentMode
from apps.common.context import Ctx
from apps.common.exceptions import ValidationFailed
from apps.payments.services.record import record_payment, validate_mode_breakup
from apps.payments.tests.conftest import pay
from apps.sales.services.refund_seam import clean_refund

pytestmark = pytest.mark.django_db

ADJUSTMENT = [{"mode": "adjustment", "amount": "100.00"}]


def test_money_modes_are_every_mode_but_adjustment() -> None:
    assert PaymentMode.ADJUSTMENT.value == "adjustment"
    assert set(MONEY_PAYMENT_MODES) == set(PaymentMode.values) - {"adjustment"}


def test_post_payments_refuses_adjustment(owner: Any, make_party: Any) -> None:
    """T-PLT-X02-5, the HTTP half."""
    response = pay(owner, party_id=str(make_party().id), mode_breakup=ADJUSTMENT)
    assert response.status_code == 400
    assert response.json()["error"]["details"]["mode_breakup.0.mode"] == ["Choose a payment mode."]


def test_record_payment_refuses_adjustment_from_any_service_caller(
    shop: Any, make_party: Any
) -> None:
    """The service is public too (sales' issue seam, the port); only the
    deposits module may write an adjustment, through its private path."""
    with pytest.raises(ValidationFailed) as refused:
        record_payment(
            ctx=Ctx.system(shop),
            payload={
                "direction": "in",
                "party_id": str(make_party().id),
                "mode_breakup": ADJUSTMENT,
            },
        )
    assert "mode_breakup.0.mode" in refused.value.details
    with pytest.raises(ValidationFailed):
        validate_mode_breakup(ADJUSTMENT)


def test_a_credit_note_refund_refuses_adjustment() -> None:
    with pytest.raises(ValidationFailed) as refused:
        clean_refund({"mode_breakup": ADJUSTMENT})
    assert refused.value.details == {"refund.mode_breakup.0.mode": ["Choose a payment mode."]}
