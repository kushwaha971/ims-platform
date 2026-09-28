"""PAY-04 BR-4 — the receipt's WhatsApp text, rendered server-side.

The client never composes a sentence with money in it: it asks for this text
and hands it to the share sheet, which opens `wa.me` with it. The merchant's
own WhatsApp sends it (NTF-03), so nothing here says "sent" (DEC-012).

── What is not in the text, deliberately ────────────────────────────────────
`RECEIPT_SHARE` has a `Receipt: {link}` line for the public `/d/<token>` page.
That page renders a stub today (the sales track records the same gap), and a
link that opens a stub teaches a customer the receipt is not real. The line is
left out until `parties_share_link` and the public page exist; the rest of the
template — amount, date, modes, reference, bills, balance — is exactly §17's.
"""

from __future__ import annotations

from decimal import Decimal

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.money import ZERO
from apps.ledger.services.messaging import format_rs, message_locale, shop_name
from apps.payments.constants import PaymentDirection
from apps.payments.models import Payment
from apps.payments.selectors.payments import allocation_details, party_balance_after

MODE_WORDS = {
    "en": {
        "cash": "Cash",
        "upi": "UPI",
        "bank": "Bank",
        "cheque": "Cheque",
        "card": "Card",
        "other": "Other",
    },
    "hi": {
        "cash": "नकद",
        "upi": "UPI",
        "bank": "बैंक",
        "cheque": "चेक",
        "card": "कार्ड",
        "other": "अन्य",
    },
}
#: LED-08 BR-2 — from the CUSTOMER's side; never "you owe".
LABELS = {
    "en": {"receivable": "you will give", "payable": "we will give", "settled": "settled"},
    "hi": {"receivable": "आप देंगे", "payable": "हम देंगे", "settled": "बराबर"},
}
TEMPLATES = {
    ("in", "en"): (
        "Received Rs {amount} from you on {date} ({modes}{reference_part}). "
        "{against_line}Balance: Rs {balance} ({label}).\nThank you — {shop}"
    ),
    ("in", "hi"): (
        "{date} को आपसे Rs {amount} प्राप्त हुए ({modes}{reference_part})। "
        "{against_line}बाकी: Rs {balance} ({label})।\nधन्यवाद — {shop}"
    ),
    ("out", "en"): (
        "Paid Rs {amount} to you on {date} ({modes}{reference_part}). "
        "{against_line}Balance: Rs {balance} ({label}). — {shop}"
    ),
    ("out", "hi"): (
        "{date} को आपको Rs {amount} दिए ({modes}{reference_part})। "
        "{against_line}बाकी: Rs {balance} ({label})। — {shop}"
    ),
}
AGAINST = {"en": "Against {numbers}.\n", "hi": "बिल {numbers} के विरुद्ध।\n"}
WALK_IN_TAIL = {"en": "Thank you — {shop}", "hi": "धन्यवाद — {shop}"}


def _label(balance: Decimal, locale: str) -> str:
    labels = LABELS.get(locale, LABELS["en"])
    if balance > ZERO:
        return labels["receivable"]
    if balance < ZERO:
        return labels["payable"]
    return labels["settled"]


def receipt_share_text(payment: Payment, *, locale: str | None = None) -> str:
    """§17 `RECEIPT_SHARE` / `VOUCHER_SHARE`, without the link line (module docstring)."""
    tenant = payment.tenant
    locale = locale if locale in ("en", "hi") else message_locale(tenant)
    words = MODE_WORDS.get(locale, MODE_WORDS["en"])
    modes = " + ".join(words.get(line["mode"], line["mode"]) for line in payment.mode_breakup)
    reference_part = f", UTR …{payment.reference[-4:]}" if payment.reference else ""
    numbers = [row["number"] for row in allocation_details(payment) if row.get("number")]
    against_line = AGAINST[locale].format(numbers=", ".join(numbers)) if numbers else ""
    params = {
        "amount": format_rs(payment.amount),
        "date": payment.payment_date.strftime("%d/%m"),
        "modes": modes,
        "reference_part": reference_part,
        "against_line": against_line,
        "shop": shop_name(tenant),
    }
    balance = party_balance_after(payment)
    if balance is None:
        head = TEMPLATES[(PaymentDirection.IN, locale)].split("{against_line}")[0]
        return head.format(**params) + against_line + WALK_IN_TAIL[locale].format(**params)
    params["balance"] = format_rs(abs(balance))
    params["label"] = _label(balance, locale)
    return TEMPLATES[(payment.direction, locale)].format(**params)


def record_receipt_share(*, ctx: Ctx, payment: Payment, channel: str) -> None:
    """§16 `payment.receipt_shared` — who handed a receipt to whom, by which channel."""
    write_audit(
        ctx=ctx,
        action=AuditAction.PAYMENT_RECEIPT_SHARED,
        entity_type="payments_payment",
        entity_id=payment.id,
        after={"channel": channel},
        metadata={"number": payment.number},
    )
