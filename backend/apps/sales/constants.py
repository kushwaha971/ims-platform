"""Enumerations and limits owned by the sales app (Part 26 §26.16 R16.1)."""

from __future__ import annotations

from django.db import models
from django.utils.translation import gettext_lazy as _


class DocumentKind(models.TextChoices):
    """Part 21 §21.3.7 — this wave issues the two tax-document kinds only."""

    INVOICE = "invoice", _("Invoice")
    BILL_OF_SUPPLY = "bill_of_supply", _("Bill of supply")


class DocumentStatus(models.TextChoices):
    """Canon §0.7 for invoices. `overdue` is set only by the nightly job (BR-17)."""

    DRAFT = "draft", _("Draft")
    ISSUED = "issued", _("Issued")
    PARTIALLY_PAID = "partially_paid", _("Partially paid")
    PAID = "paid", _("Paid")
    OVERDUE = "overdue", _("Overdue")
    VOID = "void", _("Void")


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
