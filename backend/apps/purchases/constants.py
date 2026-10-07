"""Enumerations and limits owned by the purchases app (Part 26 §26.16 R16.1)."""

from __future__ import annotations

from django.db import models
from django.utils.translation import gettext_lazy as _


class DocumentKind(models.TextChoices):
    """Part 21 §21.3.8 — this wave records purchase bills only (debit notes are PUR-07, P2)."""

    PURCHASE_BILL = "purchase_bill", _("Purchase bill")
    #: Shop item 3 — what the shop asked a supplier to send, before the bill.
    PURCHASE_ORDER = "purchase_order", _("Purchase order")
    #: Shop P0 — goods sent back to a supplier, or a price the supplier got wrong.
    DEBIT_NOTE = "debit_note", _("Debit note")


class DocumentStatus(models.TextChoices):
    """Canon §0.7 for bills. `overdue` is set only by the nightly job (PUR-01 FR-10)."""

    DRAFT = "draft", _("Draft")
    RECORDED = "recorded", _("Recorded")
    PARTIALLY_PAID = "partially_paid", _("Partially paid")
    PAID = "paid", _("Paid")
    OVERDUE = "overdue", _("Overdue")
    VOID = "void", _("Void")
    #: Purchase order: draft → sent (numbered) → billed | cancelled. Never payable.
    SENT = "sent", _("Sent")
    BILLED = "billed", _("Billed")
    CANCELLED = "cancelled", _("Cancelled")
    #: Debit note: issued (numbered, posted) → void. There is no draft.
    ISSUED = "issued", _("Issued")


#: Every bill read and write is limited to these, so an order never counts as a bill.
BILL_KINDS: tuple[str, ...] = ("purchase_bill",)
ORDER_KINDS: tuple[str, ...] = ("purchase_order",)
DEBIT_NOTE_KINDS: tuple[str, ...] = ("debit_note",)
#: The debit notes list's tabs. `open` still holds credit the bill could not take.
DEBIT_NOTE_TAB_STATUSES: dict[str, tuple[str, ...]] = {
    "all": ("issued", "void"),
    "issued": ("issued",),
    "void": ("void",),
}
#: PUR-07 FR-12 — why the note was written.
DEBIT_NOTE_REASONS: tuple[str, ...] = (
    "goods_returned",
    "damaged_goods",
    "short_supply",
    "rate_correction",
    "qty_correction",
    "discount_agreed",
    "other",
)
#: Shop item 3 — the purchase orders list's tabs. `sent` is what is still to arrive.
ORDER_TAB_STATUSES: dict[str, tuple[str, ...]] = {
    "all": ("draft", "sent", "billed", "cancelled"),
    "draft": ("draft",),
    "sent": ("sent",),
    "billed": ("billed",),
    "cancelled": ("cancelled",),
}


class DiscountType(models.TextChoices):
    PERCENT = "percent", _("Percent")
    AMOUNT = "amount", _("Amount")


#: PUR-03 FR-1 — the list's tabs as sets of statuses. `all` is literally all (FR-1),
#: drafts included with "—" for a number (BR-3); the payables TOTALS still exclude
#: drafts and voids (BR-1), whatever the tab.
TAB_STATUSES: dict[str, tuple[str, ...]] = {
    "all": ("draft", "recorded", "partially_paid", "paid", "overdue", "void"),
    "unpaid": ("recorded", "partially_paid", "overdue"),
    "overdue": ("overdue",),
    "paid": ("paid",),
    "draft": ("draft",),
    "void": ("void",),
}
#: Statuses the nightly job may move to `overdue`.
OPEN_STATUSES: tuple[str, ...] = ("recorded", "partially_paid")
#: PUR-04 FR-1 — what may be voided.
VOIDABLE_STATUSES: tuple[str, ...] = ("recorded", "partially_paid", "paid", "overdue")
#: Totals never sum these (PUR-03 BR-1).
NOT_PAYABLE_STATUSES: tuple[str, ...] = ("draft", "void")

#: Settings read with defaults (not in the PLT-06 catalogue — the CR-SAL-2 rule).
#: Free-text lines are the one switch sales and purchases share (FR-3 cites §21.3.7).
ROUND_OFF_SETTING = "documents.round_off"
FREE_TEXT_SETTING = "sales.allow_free_text_lines"

SUPPLIER_INVOICE_MAX = 48
NOTES_MAX = 2000
#: PUR-01 §10 — 1 to 200 lines.
LINES_MAX = 200
#: PUR-01 §10 — `document_date ≥ FY start − 2 years`.
BACKDATE_YEARS = 2
