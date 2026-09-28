"""An invoice's `amount_due` and status, recomputed rather than incremented (SAL-02 BR-9).

`amount_due = grand_total − amount_paid − Σ sales_credit_application.amount`
(BR-9). Every writer that moves one of the three terms — a credit note applied
or voided here, a payment allocated in PAY-01 — calls `refresh_invoice_amounts`
on the LOCKED invoice afterwards, so the cache is a function of the rows and
never a running sum two writers could each move from a stale read.

── The seam PAY-01 uses ─────────────────────────────────────────────────────
`payments` may import `sales` (Part 20 §20.1.4), not the other way round. When
PAY-01 allocates a payment it sets `amount_paid` from Σ allocations and calls
`refresh_invoice_amounts(invoice, amount_paid=…)`; the credit half of the sum
stays here, where `sales_credit_application` lives.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from django.db.models import Sum

from apps.sales.constants import DocumentStatus

ZERO = Decimal("0.00")


def credits_applied(invoice: Any) -> Decimal:
    """Σ open credit used against this invoice."""
    from apps.sales.models import SalesCreditApplication

    total = SalesCreditApplication.objects.filter(invoice=invoice).aggregate(s=Sum("amount"))["s"]
    return total or ZERO


def credit_used(credit_note: Any) -> Decimal:
    """Σ of this credit note applied to invoices."""
    from apps.sales.models import SalesCreditApplication

    rows = SalesCreditApplication.objects.filter(credit_note=credit_note)
    return rows.aggregate(s=Sum("amount"))["s"] or ZERO


def invoice_status_for(
    *, amount_due: Decimal, settled: Decimal, due_on: dt.date | None, today: dt.date
) -> str:
    """Canon §0.7 — paid at zero due; partly settled; overdue kept once the due date passed."""
    if amount_due == ZERO:
        return DocumentStatus.PAID
    if due_on is not None and due_on < today:
        return DocumentStatus.OVERDUE
    return DocumentStatus.PARTIALLY_PAID if settled > ZERO else DocumentStatus.ISSUED


def refresh_invoice_amounts(invoice: Any, *, amount_paid: Decimal | None = None) -> None:
    """Recompute `amount_due` and the status of a LOCKED, non-void invoice, and save them."""
    from apps.common.dates import tenant_today

    if invoice.status in (DocumentStatus.VOID, DocumentStatus.DRAFT):
        return
    if amount_paid is not None:
        invoice.amount_paid = amount_paid
    credits = credits_applied(invoice)
    due = invoice.grand_total - invoice.amount_paid - credits
    invoice.amount_due = max(due, ZERO)
    invoice.status = invoice_status_for(
        amount_due=invoice.amount_due,
        settled=invoice.amount_paid + credits,
        due_on=invoice.due_on,
        today=tenant_today(invoice.tenant),
    )
    invoice.version += 1
    invoice.save(update_fields=["amount_paid", "amount_due", "status", "version", "updated_at"])


def refresh_credit_note(credit_note: Any) -> None:
    """SAL-04 FR-8 — `applied` once applications + refund use it all; open credit is `amount_due`."""
    if credit_note.status in (DocumentStatus.VOID, DocumentStatus.DRAFT):
        return
    used = credit_used(credit_note) + credit_note.amount_paid
    credit_note.amount_due = max(credit_note.grand_total - used, ZERO)
    credit_note.status = (
        DocumentStatus.APPLIED if credit_note.amount_due == ZERO else DocumentStatus.ISSUED
    )
    credit_note.version += 1
    credit_note.save(update_fields=["amount_due", "status", "version", "updated_at"])
