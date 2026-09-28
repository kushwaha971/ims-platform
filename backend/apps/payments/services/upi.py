"""PAY-03 — the tenant's UPI intent and its QR, drawn locally (FR-4, FR-5, BR-2/BR-3).

`build_upi_url()` and the encoder live in `apps/common` (the sales track put
them there so SAL-03 can print an invoice QR without importing payments); this
is the payments side: a static QR (no amount — it never expires, BR-3) or a
dynamic one with the amount and a reconciliation reference, for the Collect
sheet and the receipt's "Pay next time" footer.

409 `upi_vpa_missing` when the tenant has no valid VPA — the Collect sheet's
empty state ("Add your UPI ID to show a QR on bills"), never a QR that pays
nobody.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any

from apps.common.exceptions import BusinessRuleViolation, ValidationFailed
from apps.common.qr import encode, matrix_rows
from apps.common.upi import build_upi_url, valid_vpa

#: PAY-03 §10 — the NPCI P2P cap is a caption, not a refusal (EC-2); this is a typo guard.
MAX_INTENT_AMOUNT = Decimal("99999999.99")


def _amount(raw: Any) -> Decimal | None:
    if raw in (None, ""):
        return None
    try:
        value = Decimal(str(raw))
        if not value.is_finite():
            raise InvalidOperation
    except (InvalidOperation, ValueError):
        raise ValidationFailed({"amount": ["Enter a valid amount."]}) from None
    if value <= 0 or value > MAX_INTENT_AMOUNT or value != value.quantize(Decimal("0.01")):
        raise ValidationFailed({"amount": ["Enter an amount greater than 0."]})
    return value


def upi_intent(*, tenant: Any, amount: Any = None, note: str = "", party_id: Any = None) -> dict:
    """`{upi_url, amount, vpa, payee, qr: {size, modules}}` — the Collect sheet's payload."""
    vpa = (tenant.upi_vpa or "").strip().lower()
    if not valid_vpa(vpa):
        raise BusinessRuleViolation(
            "upi_vpa_missing",
            "Add your UPI ID in Business profile to show a QR.",
            details={},
        )
    value = _amount(amount)
    payee = tenant.legal_name or tenant.name
    # FR-5 — `PTY-<short id>` for a party collection, so PAY-06/07 can match later.
    ref = f"PTY-{str(party_id).replace('-', '')[:8]}" if party_id and value else None
    url = build_upi_url(pa=vpa, pn=payee, am=value, tn=(note or "").strip()[:50] or None, tr=ref)
    matrix = encode(url)
    return {
        "upi_url": url,
        "amount": str(value) if value is not None else None,
        "vpa": vpa,
        "payee": payee,
        "qr": {"size": len(matrix), "modules": matrix_rows(matrix)},
    }
