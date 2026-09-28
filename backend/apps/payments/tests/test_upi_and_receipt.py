"""PAY-03 — the Collect QR from the tenant's VPA; PAY-04 — the receipt's share text."""

from __future__ import annotations

from typing import Any

import pytest

from apps.common.audit import AuditAction
from apps.payments.models import Payment
from apps.payments.tests.conftest import pay, payment_url
from apps.platform_app.models import AuditLog

pytestmark = pytest.mark.django_db


def test_the_collect_qr_carries_the_amount_and_a_party_reference(
    owner: Any, make_party: Any
) -> None:
    """AC-2 (PAY-03) — `am=2800.00` and `tr=PTY-<short id>`; the QR is local module data."""
    party = make_party()
    response = owner.post(
        "/api/v1/payments/upi-intent",
        {"amount": "2800", "party_id": str(party.id)},
        format="json",
    )
    assert response.status_code == 200, response.json()
    data = response.json()["data"]
    assert data["upi_url"].startswith("upi://pay?pa=sharma@okhdfc&")
    assert "am=2800.00" in data["upi_url"] and "tr=PTY-" in data["upi_url"]
    assert data["qr"]["size"] == len(data["qr"]["modules"]) > 20


def test_a_static_qr_has_no_amount_and_a_missing_vpa_is_409(owner: Any, shop: Any) -> None:
    """BR-3 — no `am`, `tn` or `tr` on the counter QR; without a VPA, `upi_vpa_missing`."""
    static = owner.post("/api/v1/payments/upi-intent", {}, format="json").json()["data"]
    assert "am=" not in static["upi_url"] and "tr=" not in static["upi_url"]
    shop.upi_vpa = ""
    shop.save(update_fields=["upi_vpa"])
    missing = owner.post("/api/v1/payments/upi-intent", {"amount": "10"}, format="json")
    assert missing.status_code == 409 and missing.json()["error"]["code"] == "upi_vpa_missing"


def test_the_share_text_says_what_was_paid_against_what_and_the_balance(
    owner: Any, make_party: Any, invoice_for: Any
) -> None:
    """PAY-04 AC-2 — "Rs 500", the date, "UPI", the UTR's last four, the bill number and
    "Balance: Rs 398 (you will give)"; audited as `payment.receipt_shared`."""
    party = make_party(mobile="+919812345678")
    inv = invoice_for(party, "898.00")
    paid = pay(
        owner,
        party_id=str(party.id),
        mode_breakup=[{"mode": "upi", "amount": "500.00", "reference": "UTR0000123"}],
    ).json()["data"]
    response = owner.post(
        payment_url(paid["id"], "share"),
        {"locale": "en"},
        format="json",
        HTTP_IDEMPOTENCY_KEY="share-1",
    )
    assert response.status_code == 200, response.json()
    text = response.json()["data"]["text"]
    assert text.startswith("Received Rs 500")
    assert "(UPI, UTR …0123)" in text and f"Against {inv['number']}." in text
    assert "Balance: Rs 398" in text and "(you will give)" in text
    assert response.json()["data"]["mobile"] == "+919812345678"
    assert AuditLog.objects.filter(action=AuditAction.PAYMENT_RECEIPT_SHARED).count() == 1


def test_the_accountant_prints_but_does_not_share(
    shop: Any, api_as: Any, owner: Any, make_party: Any
) -> None:
    """T-PAY-04-10 — the detail (print) is a read; the share is a write."""
    party = make_party()
    pay(owner, party_id=str(party.id), mode_breakup=[{"mode": "cash", "amount": "10"}])
    accountant, _ = api_as(shop, role="accountant")
    payment_id = Payment.objects.get().id
    detail = accountant.get(payment_url(payment_id))
    assert detail.status_code == 200
    assert detail.json()["data"]["party_balance_after"] == "-10.00"
    shared = accountant.post(
        payment_url(payment_id, "share"), {}, format="json", HTTP_IDEMPOTENCY_KEY="share-2"
    )
    assert shared.status_code == 403
