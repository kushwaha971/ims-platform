"""Money taken at issue goes through PAY-01's `record_payment` (SAL-07 FR-3/FR-4, SAL-02 FR-10).

Until PAY-01 this module was the whole of it: a walk-in payment lived in
`meta.payment` and a party payment at issue was refused (CR-2026-09-24-SAL-A).
Now both are real `payments_payment` rows with an allocation to the invoice,
so the receipt series, the cashbook's future payments source and PAY-05's void
see money taken at the counter exactly as they see money recorded later.

* A WALK-IN sale must be paid in full (SAL-07 BR-1) — Σ modes = grand total,
  allocated to this invoice; no ledger line, because there is no party.
* A PARTY sale may take any amount at issue (SAL-02 FR-10): up to the grand
  total settles the invoice, anything above it is an advance on the khata
  (PAY-02 EC-2). The khata gets TWO lines — the invoice debit and the receipt
  credit — so the statement mirrors the paper bill book (LED-10 BR-4).

`meta.payment` is still written — `{payment_date, mode_breakup, note}` plus the
`payment_id` and receipt `number` — because the printed invoice reads it
("PAID · UPI ₹700 + Cash ₹300").

Sales may not import payments at module level (Part 20 §20.1.4 — the one
permitted cycle, rule D5), so the calls into it are deferred imports.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from apps.common.context import Ctx
from apps.common.exceptions import ValidationFailed

ZERO = Decimal("0.00")


def validate_payment(*, payment: dict | None, grand_total: Decimal, walk_in: bool) -> dict | None:
    """Return the cleaned payment, or raise 400 `details.payment…` (FR-10, SAL-07 §10).

    Runs before anything is written, so a mistyped line refuses the issue
    rather than issuing the invoice and failing its receipt.
    """
    from apps.payments.services.record import mode_total, validate_mode_breakup

    rows = (payment or {}).get("mode_breakup") or []
    if not walk_in and not rows:
        return None  # a credit sale
    if walk_in and grand_total == ZERO:
        return None  # EC-5 — a free sample needs no payment of zero
    if walk_in and not rows:
        raise ValidationFailed({"payment": ["Walk-in sale must be paid in full"]})
    lines = validate_mode_breakup(rows, prefix="payment.mode_breakup")
    total = mode_total(lines)
    if walk_in and total != grand_total:
        raise ValidationFailed({"payment": ["Walk-in sale must be paid in full"]})
    raw_date = (payment or {}).get("payment_date")
    return {
        "payment_date": str(raw_date) if raw_date else "",
        "mode_breakup": lines,
        "note": str((payment or {}).get("note") or "")[:255],
        "total": total,
    }


def paid_at_issue(payment: dict | None, grand_total: Decimal) -> Decimal:
    """What the invoice itself will have received once the payment is recorded."""
    if payment is None:
        return ZERO
    return min(payment["total"], grand_total)


def record_issue_payment(*, ctx: Ctx, document: Any, payment: dict | None) -> dict | None:
    """Record the payment against the ISSUED document (already saved, debit posted).

    Returns `{payment_id, number, party_balance}` or None when nothing was paid.
    """
    if payment is None:
        return None
    from apps.payments.services.record import record_payment

    walk_in = document.party_id is None
    payment_date = payment["payment_date"] or document.document_date.isoformat()
    share = paid_at_issue(payment, document.grand_total)
    payload: dict[str, Any] = {
        "direction": "in",
        "party_id": str(document.party_id) if not walk_in else None,
        "payment_date": payment_date,
        "mode_breakup": payment["mode_breakup"],
        "note": payment["note"],
        "context": "walk_in" if walk_in else "issue",
        "meta": {"document_id": str(document.id), "document_number": document.number},
        "allocations": (
            []
            if share == ZERO
            else [
                {
                    "document_type": "sales_document",
                    "document_id": str(document.id),
                    "amount": str(share),
                }
            ]
        ),
    }
    result = record_payment(
        ctx=ctx, payload=payload, walk_in_document_id=document.id if walk_in else None
    )
    recorded = result["payment"]
    document.meta = {
        **(document.meta or {}),
        "payment": {
            "payment_date": payment_date,
            "mode_breakup": recorded.mode_breakup,
            "note": payment["note"],
            "payment_id": str(recorded.id),
            "number": recorded.number,
        },
    }
    type(document).objects.filter(pk=document.pk).update(meta=document.meta)
    return {
        "payment_id": str(recorded.id),
        "number": recorded.number,
        "party_balance": result["party_balance"],
    }
