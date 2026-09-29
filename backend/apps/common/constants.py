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
    # ── A1 ── Platform verticals (ADR-041, contracts §1.1). Each is listed in
    # `apps.platform_app.constants.UNRELEASED_MODULES` until its release CR, so
    # no merchant sees, enables or reaches one before it is built (vision §4).
    LENDING = "lending", _("Lending & collections")
    LIBRARY = "library", _("Library")
    GYM = "gym", _("Gym & fitness")
    HOSPITALITY = "hospitality", _("Hotel & stays")


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


class UpiApp(models.TextChoices):
    """`ledger_entry.upi_app` — which app a UPI payment was made with.

    The APP and not the PSP handle (`@ybl`, `@okaxis`, `@paytm`…), because the
    app is what both sides of the counter actually know. The customer says
    "PhonePe kiya", the merchant sees a PhonePe notification or a Paytm
    soundbox announce it, and that is the word they will look for when a
    customer disputes a payment a month later. A handle is a bank routing detail
    most merchants have never read, one app maps to several handles, and a
    handle names the PAYER's bank rather than anything the merchant saw.

    Only meaningful when `payment_mode == PaymentMode.UPI`. The service drops it
    silently for every other mode (the client may keep it in form state after
    the mode is switched), and `ck_ledger_entry_upi_app_needs_upi` is what makes
    that silence safe.

    Ordered roughly by how often a merchant will hear the name, not
    alphabetically, and with the two catch-alls last — a client renders the
    picker in this order.
    """

    PHONEPE = "phonepe", _("PhonePe")
    GPAY = "gpay", _("Google Pay")
    PAYTM = "paytm", _("Paytm")
    BHIM = "bhim", _("BHIM")
    AMAZONPAY = "amazonpay", _("Amazon Pay")
    CRED = "cred", _("CRED")
    WHATSAPP = "whatsapp", _("WhatsApp Pay")
    NAVI = "navi", _("Navi")
    SUPERMONEY = "supermoney", _("super.money")
    BANK_APP = "bank_app", _("Bank's own app")
    OTHER = "other", _("Other UPI app")


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


# ── A2 ── ledger buckets (ADR-043, contracts §1.2) ─────────────────────────────


class LedgerBucket(models.TextChoices):
    """Which kind of money a ledger line is — `ledger_entry.bucket`, `payments_payment.bucket`.

    Here rather than in `apps.ledger` for `Direction`'s reason: the ledger is not its only
    reader. `parties` moves a different cache per bucket and may not import the ledger, and
    `payments` stores the bucket its payment posted in.

    * `main` — the trade khata: sales, purchases, fees, fines, charges, manual entries. Moves
      `party.balance`, and is the only bucket aging reads.
    * `loan` — lending: disbursal, interest, loan charges, collections, waivers. Moves
      `party.balance` AND `party.loan_balance`; never in aging.
    * `deposit` — money held for the party and returnable. Moves `party.deposit_held` only,
      never the balance.
    """

    MAIN = "main", _("Shop")
    LOAN = "loan", _("Loan")
    DEPOSIT = "deposit", _("Deposit")


#: The buckets `party.balance` is the sum of (BR-1): what the party owes, net. A deposit is a
#: liability kept entirely outside it.
BALANCE_BUCKET_VALUES: tuple[str, ...] = (LedgerBucket.MAIN.value, LedgerBucket.LOAN.value)
