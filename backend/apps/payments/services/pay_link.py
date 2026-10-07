"""The UPI pay link — one https link and one QR for any amount owed, in every module
(Shop P0; owner, 7 Oct 2026: "send the QR with every WhatsApp reminder about payments").

A WhatsApp message opened from the app can carry only text, and `upi://` is not
tappable on every phone, so a payment message carries an https link instead:
`{UB_PUBLIC_BASE_URL}/pay/<token>`. That page shows the business's name, the
amount, the UPI QR and a "Pay by UPI" button that opens the payer's UPI app with
the amount filled in. The same payload drives the desk's "Show UPI QR" dialog,
so a student or a borrower at the counter scans the same code.

── Why a signed token and no table ──────────────────────────────────────────
The link names an amount and a business, nothing else, and must not be editable:
`django.core.signing` signs `<tenant>_<amount>_<reference>`, so changing the
amount in the URL breaks the signature, and nothing is stored. The VPA is read
when the page opens, so a UPI ID changed in settings is what every older link
pays to. Links die after `MAX_AGE_DAYS`, like a share link — a reminder is not a
standing invitation to pay a figure that may since have changed.

The page is the customer's, so it carries the business's name only, never the
product's (`customerDocumentsCarryNoProductName`).
"""

from __future__ import annotations

import uuid
from decimal import Decimal, InvalidOperation
from typing import Any

from django.conf import settings
from django.core import signing

from apps.common.exceptions import NotFound
from apps.common.money import q2
from apps.common.qr import encode, matrix_rows
from apps.common.upi import build_upi_url, valid_vpa

SALT = "ub.payments.pay-link"
MAX_AGE_DAYS = 90
NOTE_MAX = 50
REFERENCE_MAX = 12
EXPIRED = "This link has expired."


def business_name(tenant: Any) -> str:
    return (getattr(tenant, "legal_name", "") or getattr(tenant, "name", "") or "").strip()


def has_upi(tenant: Any) -> bool:
    return valid_vpa(getattr(tenant, "upi_vpa", None))


def _intent(tenant: Any, amount: Decimal, note: str, reference: str) -> dict:
    url = build_upi_url(
        pa=str(tenant.upi_vpa),
        pn=business_name(tenant),
        am=amount,
        tn=note or None,
        tr=reference or None,
    )
    matrix = encode(url)
    return {
        "upi_url": url,
        "vpa": str(tenant.upi_vpa),
        "qr": {"size": len(matrix), "modules": matrix_rows(matrix)},
    }


def _note(tenant: Any) -> str:
    return f"Payment to {business_name(tenant)}"[:NOTE_MAX]


def make_pay_link(*, tenant: Any, amount: Any, reference: str = "") -> dict | None:
    """`{url, upi_url, vpa, amount, note, qr}` for `amount`, or None without a valid UPI ID
    or a positive amount — the caller then says "pay at the shop", never a broken link."""
    try:
        value = q2(Decimal(str(amount)))
    except (InvalidOperation, TypeError, ValueError):
        return None
    if value <= 0 or not has_upi(tenant):
        return None
    reference = "".join(ch for ch in str(reference or "") if ch.isalnum())[:REFERENCE_MAX]
    # Positional and unencoded on purpose — the link rides in SMS too, so it is
    # `<tenant>_<amount>_<reference>.<time>.<signature>` — no `:`, which
    # a browser percent-encodes in a path and the page would then encode a second time, about a hundred characters.
    token = signing.TimestampSigner(salt=SALT, sep=".").sign(f"{tenant.id.hex}_{value}_{reference}")
    base = str(getattr(settings, "UB_PUBLIC_BASE_URL", "")).rstrip("/")
    note = _note(tenant)
    return {
        "url": f"{base}/pay/{token}",
        "amount": str(value),
        "note": note,
        **_intent(tenant, value, note, reference),
    }


def pay_url(*, tenant: Any, amount: Any, reference: str = "") -> str | None:
    """Just the https link, for a message's text."""
    link = make_pay_link(tenant=tenant, amount=amount, reference=reference)
    return link["url"] if link else None


def resolve_pay_link(token: str) -> dict:
    """`GET /public/pay/{token}` — the page's payload, or 404 for anything not a live link."""
    from apps.platform_app.models import Tenant

    if not token or len(token) > 256:
        raise NotFound(EXPIRED)
    try:
        value = signing.TimestampSigner(salt=SALT, sep=".").unsign(
            token, max_age=MAX_AGE_DAYS * 86400
        )
        tenant_hex, raw_amount, reference = value.split("_", 2)
        tenant_id = uuid.UUID(hex=tenant_hex)
        amount = q2(Decimal(raw_amount))
    except (signing.BadSignature, InvalidOperation, ValueError) as error:
        raise NotFound(EXPIRED) from error
    tenant = Tenant.objects.filter(pk=tenant_id).exclude(status="deleted").first()
    if tenant is None or not has_upi(tenant) or amount <= 0:
        raise NotFound(EXPIRED)
    note = _note(tenant)
    return {
        "business_name": business_name(tenant),
        "amount": str(amount),
        "note": note,
        "reference": reference,
        **_intent(tenant, amount, note, reference),
    }
