"""Shared enumerations (Part 26 §26.16 R16.2).

Every value matches canon §0.3, §0.7 and §0.9 exactly, string for string.
App-specific enumerations live in that app's `constants.py`.
"""

from __future__ import annotations

from django.db import models
from django.utils.translation import gettext_lazy as _


class ModuleCode(models.TextChoices):
    """Canon §0.3 module codes."""

    PLATFORM = "platform", _("Platform")
    PARTIES = "parties", _("Parties")
    LEDGER = "ledger", _("Ledger")
    INVENTORY = "inventory", _("Inventory")
    SALES = "sales", _("Sales")
    PURCHASES = "purchases", _("Purchases")
    PAYMENTS = "payments", _("Payments")
    EXPENSES = "expenses", _("Expenses")
    REPORTS = "reports", _("Reports")
    NOTIFICATIONS = "notifications", _("Notifications")
    IMPORT_EXPORT = "import_export", _("Import / export")
    HELP = "help", _("Help")
    TEAM = "team", _("Team")


class RoleCode(models.TextChoices):
    """Canon §0.9 system roles."""

    OWNER = "owner", _("Owner")
    ADMIN = "admin", _("Admin")
    STAFF = "staff", _("Staff")
    ACCOUNTANT = "accountant", _("Accountant")


class ActorType(models.TextChoices):
    """Canon §0.6 / Part 21 §21.3.1 `platform_audit_log.actor_type`."""

    USER = "user", _("User")
    SYSTEM = "system", _("System")
    WEBHOOK = "webhook", _("Webhook")
    SUPER_ADMIN = "super_admin", _("Super admin")


class Direction(models.TextChoices):
    """Canon §0.2 ledger direction."""

    DEBIT = "debit", _("Debit")
    CREDIT = "credit", _("Credit")


class PaymentMode(models.TextChoices):
    """Part 21 §21.3.4 `ledger_entry.payment_mode`."""

    CASH = "cash", _("Cash")
    UPI = "upi", _("UPI")
    BANK = "bank", _("Bank")
    CHEQUE = "cheque", _("Cheque")
    CARD = "card", _("Card")
    OTHER = "other", _("Other")


class DocumentKind(models.TextChoices):
    """Part 21 §21.3.1 `platform_document_sequence.kind`."""

    ESTIMATE = "estimate", _("Estimate")
    INVOICE = "invoice", _("Invoice")
    BILL_OF_SUPPLY = "bill_of_supply", _("Bill of supply")
    CREDIT_NOTE = "credit_note", _("Credit note")
    PURCHASE_BILL = "purchase_bill", _("Purchase bill")
    DEBIT_NOTE = "debit_note", _("Debit note")
    PAYMENT_IN = "payment_in", _("Payment in")
    PAYMENT_OUT = "payment_out", _("Payment out")
    PURCHASE_ORDER = "purchase_order", _("Purchase order")
    DELIVERY_CHALLAN = "delivery_challan", _("Delivery challan")
    STOCK_ADJUSTMENT = "stock_adjustment", _("Stock adjustment")
    STOCK_TRANSFER = "stock_transfer", _("Stock transfer")


class JobStatus(models.TextChoices):
    """Part 21 §21.3.1 `platform_job.status`."""

    QUEUED = "queued", _("Queued")
    RUNNING = "running", _("Running")
    SUCCEEDED = "succeeded", _("Succeeded")
    FAILED = "failed", _("Failed")
    DEAD_LETTER = "dead_letter", _("Dead letter")
    CANCELLED = "cancelled", _("Cancelled")


class IdempotencyStatus(models.TextChoices):
    """Part 21 §21.3.1 `platform_idempotency_key.status`."""

    IN_PROGRESS = "in_progress", _("In progress")
    COMPLETED = "completed", _("Completed")


# Job priority conventions (Part 20 §20.8.2).
PRIORITY_INTERACTIVE = 10
PRIORITY_NORMAL = 100
PRIORITY_MAINTENANCE = 200

# Pagination (Part 20 §20.14.3).
PAGE_SIZE_DEFAULT = 25
PAGE_SIZE_MAX = 100
CURSOR_LIMIT_DEFAULT = 50
CURSOR_LIMIT_MAX = 200
