"""Enumerations and limits owned by the sales app (Part 26 §26.16 R16.1)."""

from __future__ import annotations

from django.db import models
from django.utils.translation import gettext_lazy as _


class DocumentKind(models.TextChoices):
    """Part 21 §21.3.7 — the four kinds the MVP writes (orders and challans are P2/P3)."""

    INVOICE = "invoice", _("Invoice")
    BILL_OF_SUPPLY = "bill_of_supply", _("Bill of supply")
    ESTIMATE = "estimate", _("Estimate")
    CREDIT_NOTE = "credit_note", _("Credit note")


class DocumentStatus(models.TextChoices):
    """Canon §0.7, every kind in one column. `overdue` is set only by the nightly job (BR-17).

    Invoice: draft, issued, partially_paid, paid, overdue, void.
    Estimate (SAL-01): draft, sent, accepted, rejected, expired, converted.
    Credit note (SAL-04): draft, issued, applied, void.
    """

    DRAFT = "draft", _("Draft")
    ISSUED = "issued", _("Issued")
    PARTIALLY_PAID = "partially_paid", _("Partially paid")
    PAID = "paid", _("Paid")
    OVERDUE = "overdue", _("Overdue")
    VOID = "void", _("Void")
    SENT = "sent", _("Sent")
    ACCEPTED = "accepted", _("Accepted")
    REJECTED = "rejected", _("Rejected")
    EXPIRED = "expired", _("Expired")
    CONVERTED = "converted", _("Converted")
    APPLIED = "applied", _("Applied")


#: The tax-document kinds `/sales/invoices` serves; estimates and credit notes have their own routes.
INVOICE_KINDS: tuple[str, ...] = ("invoice", "bill_of_supply")
#: SAL-05 FR-1 — the statuses an invoice can be voided from.
VOIDABLE_STATUSES: tuple[str, ...] = ("issued", "partially_paid", "paid", "overdue")
#: SAL-04 §10 — the invoice statuses a credit note may be written against or applied to.
CREDITABLE_STATUSES: tuple[str, ...] = ("issued", "partially_paid", "paid", "overdue")
APPLICABLE_STATUSES: tuple[str, ...] = ("issued", "partially_paid", "overdue")
#: SAL-01 §9 — the estimate statuses that may be converted.
CONVERTIBLE_STATUSES: tuple[str, ...] = ("sent", "accepted", "expired")


class DiscountType(models.TextChoices):
    PERCENT = "percent", _("Percent")
    AMOUNT = "amount", _("Amount")


#: SAL-08 FR-2 — the list's tabs as sets of statuses. `all` excludes drafts and voids (BR-1).
TAB_STATUSES: dict[str, tuple[str, ...]] = {
    "all": ("issued", "partially_paid", "paid", "overdue"),
    "unpaid": ("issued", "partially_paid", "overdue"),
    "overdue": ("overdue",),
    "paid": ("paid",),
    "draft": ("draft",),
    "void": ("void",),
}
OPEN_STATUSES: tuple[str, ...] = ("issued", "partially_paid")

#: SAL-01 FR-10 — the estimates list's tabs.
ESTIMATE_TAB_STATUSES: dict[str, tuple[str, ...]] = {
    "all": ("draft", "sent", "accepted", "rejected", "expired", "converted"),
    "draft": ("draft",),
    "sent": ("sent",),
    "accepted": ("accepted",),
    "expired": ("expired",),
    "converted": ("converted",),
    "rejected": ("rejected",),
}
#: SAL-04 §14 — the credit notes list's tabs (`open` = issued with credit left to use).
CREDIT_NOTE_TAB_STATUSES: dict[str, tuple[str, ...]] = {
    "all": ("issued", "applied"),
    "open": ("issued",),
    "applied": ("applied",),
    "draft": ("draft",),
    "void": ("void",),
}


class CreditNoteReason(models.TextChoices):
    """SAL-04 FR-12 — why the credit note exists (stored in `meta.reason`)."""

    SALES_RETURN = "sales_return", _("Sales return")
    POST_SALE_DISCOUNT = "post_sale_discount", _("Post-sale discount")
    RATE_CORRECTION = "rate_correction", _("Rate correction")
    QTY_CORRECTION = "qty_correction", _("Quantity correction")
    DEFICIENCY = "deficiency", _("Deficiency in service")
    OTHER = "other", _("Other")


class CreditMode(models.TextChoices):
    """R51 / ADR-057 (A15) — how a credit-note line credits its invoice line.

    `qty` is SAL-04's return: a quantity of the line, priced at its snapshot,
    moving `returned_qty` and (for goods) stock. `value` is a value credit: an
    exact taxable value against the line, tax copied from it, moving neither —
    a gym upgrade's 77/92 of a membership, or a price correction on a service.
    Invoice and standalone lines are `qty` (the column's default)."""

    QTY = "qty", _("Quantity")
    VALUE = "value", _("Value")


class Settlement(models.TextChoices):
    """SAL-04 FR-7 — what happens to the credit the invoice does not absorb."""

    HOLD_ADVANCE = "hold_advance", _("Hold as advance")
    REFUND = "refund", _("Refund now")


#: SAL-01 FR-4 / BR-7 — default validity, and the setting a tenant may change it with.
ESTIMATE_DEFAULT_VALIDITY_DAYS = 15
ESTIMATE_VALIDITY_SETTING = "sales.estimate_validity_days"
#: SAL-05 FR-8 / §10 — the void reason's length.
VOID_REASON_MIN = 3
VOID_REASON_MAX = 160
REASON_NOTE_MAX = 160

#: BR-12 — the document kind a tenant's GST type produces.
KIND_FOR_GST_TYPE: dict[str, str] = {
    "regular": DocumentKind.INVOICE,
    "composition": DocumentKind.BILL_OF_SUPPLY,
    "unregistered": DocumentKind.INVOICE,
}

#: CR-SAL-2 settings keys read with defaults (not yet in the PLT-06 catalogue).
ROUND_OFF_SETTING = "sales.round_off_default"
DUE_DAYS_SETTING = "sales.default_due_days"
FREE_TEXT_SETTING = "sales.allow_free_text_lines"
REQUIRE_HSN_B2B_SETTING = "sales.require_hsn_b2b"
TERMS_SETTING = "documents.terms"
SHOW_UPI_QR_SETTING = "documents.show_upi_qr"
DEFAULT_DUE_DAYS = 15

WALK_IN_NAME_MAX = 120
NOTES_MAX = 2000
LINES_MAX = 100
#: SAL-02 BR-15 — Rule 46 "unregistered recipient, value ≥ ₹50,000" soft check.
RULE46_ADDRESS_THRESHOLD = "50000"
#: SAL-07 FR-6 — inter-state B2C large.
B2C_LARGE_THRESHOLD = "250000"
#: SAL-03 §10 / BR-4.
SHARE_DAYS_DEFAULT = 30
SHARE_DAYS_MAX = 90
