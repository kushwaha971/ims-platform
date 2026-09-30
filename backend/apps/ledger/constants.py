"""Enumerations owned by the ledger app (Part 26 §26.16 R16.1).

`Direction` and `PaymentMode` are NOT redeclared here. They live in
`apps/common/constants.py` because the ledger is not their only reader: a
payment, an expense and a purchase bill all carry a direction, and a second
copy of a two-value enum is how the two copies eventually disagree about which
value means what. This module owns the three vocabularies that are the ledger's
alone.
"""

from __future__ import annotations

from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.common.constants import Direction


class EntryType(models.TextChoices):
    """Part 21 §21.3.4 — what KIND of ledger line this is.

    Twelve of the fourteen values name a source the product cannot post yet;
    they are declared in full anyway, because `entry_type` is stored on every
    row from the first one and a value added later would leave the rows written
    before it with no way to say what they were. The column is the vocabulary;
    the endpoints arrive one feature at a time.

    LED-01 writes exactly two of them (`MANUAL_GAVE`, `MANUAL_GOT`) and LED-02
    writes `OPENING`. `INTEREST` is Phase 3 and is here for the same reason.

    A2 (ADR-048) adds the two the engines and verticals post: `CHARGE`, a
    non-document amount owed (a due in ledger mode, a library fine, a lending
    fee), always a debit; and `ADJUSTMENT_CREDIT`, a reduction of what is owed
    with no money moving (a waiver, a discount, a pro-rata credit), always a
    credit, labelled "Credit". There is no refund type and no deposit type:
    money going back is `PAYMENT_OUT`, and deposits move through payments.
    """

    OPENING = "opening", _("Opening balance")
    MANUAL_GAVE = "manual_gave", _("You gave")
    MANUAL_GOT = "manual_got", _("You got")
    INVOICE = "invoice", _("Invoice")
    CREDIT_NOTE = "credit_note", _("Credit note")
    PURCHASE_BILL = "purchase_bill", _("Purchase bill")
    DEBIT_NOTE = "debit_note", _("Debit note")
    PAYMENT_IN = "payment_in", _("Payment received")
    PAYMENT_OUT = "payment_out", _("Payment made")
    EXPENSE = "expense", _("Expense")
    WRITE_OFF = "write_off", _("Write-off")
    INTEREST = "interest", _("Interest")
    REVERSAL = "reversal", _("Reversal")
    CORRECTION = "correction", _("Correction")
    CHARGE = "charge", _("Charge")
    ADJUSTMENT_CREDIT = "adjustment_credit", _("Credit")


class SourceType(models.TextChoices):
    """What produced the entry — the other half of the `(source_type, source_id)` pair.

    Part 21 §21.9 names this polymorphism as the extension point that lets a new
    document kind post to the ledger without a schema change. `MANUAL` is the
    only value LED-01 writes, and `source_id` is null for it: a manual entry is
    its own source.

    Since A2 (R8) this is the vocabulary of the CORE's own source types, not the
    set of valid values: `ledger_entry.source_type` has no `choices`, and a
    source an engine or vertical registers with `register_posting_source`
    (`dues_due`, `library_charge`) is valid because the registry says so.
    """

    MANUAL = "manual", _("Manual")
    SALES_DOCUMENT = "sales_document", _("Sales document")
    PURCHASE_DOCUMENT = "purchase_document", _("Purchase document")
    PAYMENT = "payment", _("Payment")
    EXPENSE = "expense", _("Expense")
    LEDGER_ENTRY = "ledger_entry", _("Ledger entry")


#: BR-2 of LED-10, BR-8 of PLT-X01 — the direction each POSTABLE entry type always
#: carries. A posting source registers entry types from this table only, and the
#: direction it declares must be the one here: `charge` is a debit wherever it is
#: posted from, so a statement can read a row without asking who wrote it. The
#: manual, opening, write-off, reversal and correction types are not postable by a
#: source (LED-01/02/03 and LED-11 write them), so they are not listed.
POSTABLE_ENTRY_DIRECTIONS: dict[str, str] = {
    EntryType.INVOICE: Direction.DEBIT,
    EntryType.CREDIT_NOTE: Direction.CREDIT,
    EntryType.PURCHASE_BILL: Direction.CREDIT,
    EntryType.DEBIT_NOTE: Direction.DEBIT,
    EntryType.PAYMENT_IN: Direction.CREDIT,
    EntryType.PAYMENT_OUT: Direction.DEBIT,
    EntryType.EXPENSE: Direction.CREDIT,
    EntryType.INTEREST: Direction.DEBIT,
    EntryType.CHARGE: Direction.DEBIT,
    EntryType.ADJUSTMENT_CREDIT: Direction.CREDIT,
}

#: `ledger_entry.source_type varchar(32)` — a registered source's name must fit.
SOURCE_TYPE_MAX_LENGTH = 32


class EntryStatus(models.TextChoices):
    """Canon §0.7 — two values, and never a third.

    There is no `draft` and no `deleted`. A line is either standing or it has
    been reversed by another line that says so; both rows stay for ever
    (canon §0.11 rule 1).
    """

    POSTED = "posted", _("Posted")
    REVERSED = "reversed", _("Reversed")


#: The two entry types a merchant creates by hand, and the direction each one
#: means. LED-01 FR-5: the client sends a DIRECTION, because "You gave" and
#: "You got" is the merchant's vocabulary; the server derives the type, because
#: `manual_gave` is the ledger's.
MANUAL_ENTRY_TYPE_FOR_DIRECTION: dict[str, str] = {
    "debit": EntryType.MANUAL_GAVE,
    "credit": EntryType.MANUAL_GOT,
}

#: §10 — `note` and `reference` ceilings, matching the column widths so the
#: validator and the database can never disagree about what fits.
NOTE_MAX_LENGTH = 255
REFERENCE_MAX_LENGTH = 64
REASON_MAX_LENGTH = 160

#: §10 — the largest amount one entry may carry, matching `numeric(14,2)` minus
#: the four digits the running total needs. A figure above this is a typo; a
#: merchant with a genuine ₹10 crore transaction is not using a phone khata.
MAX_ENTRY_AMOUNT = "99999999.99"

#: BR-5's floor. A date before this is a mistyped year, not a business date —
#: and an entry dated 0026 sorts above every real row in the statement for ever.
MIN_ENTRY_DATE = "2000-01-01"


# ── LED-05 … LED-08 — collection dates and reminders ────────────────────────


class ReminderChannel(models.TextChoices):
    """Part 21 §21.3.4 `ledger_reminder.channel`, plus `sms_manual`.

    `sms_manual` is not in §21.3.4's list and is recorded in CR-LOG: it is the
    native `sms:` link — the merchant's OWN phone sends the text, exactly as
    `whatsapp_manual` is their own WhatsApp. Logging it as `sms` would make a
    provider-sent SMS and a text the merchant typed indistinguishable in the
    history, and the second is free and consent-exempt (NTF-03 BR-6).
    """

    WHATSAPP_MANUAL = "whatsapp_manual", _("WhatsApp")
    SMS_MANUAL = "sms_manual", _("SMS from your phone")
    SMS = "sms", _("SMS")
    WHATSAPP_API = "whatsapp_api", _("WhatsApp (automatic)")
    CALL = "call", _("Call")
    IN_APP = "in_app", _("In app")


class ReminderKind(models.TextChoices):
    MANUAL = "manual", _("Manual")
    AUTO_D1 = "auto_d1", _("Day before")
    AUTO_D0 = "auto_d0", _("Due day")
    RECURRING = "recurring", _("Recurring")
    # ── A7 ── PLT-X06: a module's amount due, and a notice with no amount.
    DUE = "due", _("Due")
    NOTICE = "notice", _("Notice")


class ReminderStatus(models.TextChoices):
    SCHEDULED = "scheduled", _("Scheduled")
    SENT = "sent", _("Sent")
    FAILED = "failed", _("Failed")
    DONE = "done", _("Done")
    DISMISSED = "dismissed", _("Dismissed")
    CANCELLED = "cancelled", _("Cancelled")


#: LED-06 — the channels a person may choose on the sheet or in bulk.
MANUAL_REMINDER_CHANNELS: tuple[str, ...] = (
    ReminderChannel.WHATSAPP_MANUAL,
    ReminderChannel.SMS_MANUAL,
    ReminderChannel.SMS,
    ReminderChannel.CALL,
)
#: LED-07 — the two kinds the daily job writes, and the partial unique index's set.
AUTO_REMINDER_KINDS: tuple[str, ...] = (ReminderKind.AUTO_D1, ReminderKind.AUTO_D0)

#: LED-06 §10 — one line, 120 characters.
REMINDER_NOTE_MAX_LENGTH = 120
#: LED-06 §10 — "Select up to 100 parties at a time".
BULK_REMINDER_MAX = 100
#: LED-06 BR-4 — "reminded recently" is within this many hours.
REMINDED_RECENTLY_HOURS = 24
#: LED-05 §10 — a collection date is at most a year out.
COLLECTION_DATE_MAX_DAYS = 365
#: LED-05 BR-1 — the "upcoming" bucket's width.
UPCOMING_BUCKET_DAYS = 7
#: LED-08 FR-2 — the coalescing window before a transaction SMS goes.
ENTRY_SMS_DELAY_SECONDS = 60

#: Tenant setting keys (Part 21 §21.3.1, already well-known).
SETTING_AUTO_SMS = "ledger.auto_sms"
SETTING_PARTY_SMS_ON_ENTRY = "ledger.party_sms_on_entry"

#: Notes written onto reminder rows by the system (LED-07 FR-3 / BR-6).
NOTE_PROVIDER_NOT_CONFIGURED = "provider not configured"
NOTE_BALANCE_SETTLED = "balance settled"
NOTE_OPTED_OUT = "opted out"
NOTE_NO_MOBILE = "no mobile"
NOTE_INVALID_MOBILE = "invalid mobile"
NOTE_SETTING_OFF = "automated SMS turned off"
NOTE_DATE_CHANGED = "collection date changed"


# ── A7 ── PLT-X06: module reminders ─────────────────────────────────────────

#: The kinds the automated job writes, one per (party, due_on, kind, source) —
#: `uq_reminder_auto_per_day` covers exactly these.
UNIQUE_PER_DAY_KINDS: tuple[str, ...] = (
    ReminderKind.AUTO_D1,
    ReminderKind.AUTO_D0,
    ReminderKind.DUE,
    ReminderKind.NOTICE,
)
#: The statuses a daily cap counts (BR-3): what went, and what is about to go.
CAP_COUNTED_STATUSES: tuple[str, ...] = (ReminderStatus.SENT, ReminderStatus.SCHEDULED)
#: The shortest window a tenant may narrow a module's to (BR-5).
MIN_WINDOW_MINUTES = 60
NOTE_SOURCE_CLOSED = "no longer due"
NOTE_OUTSIDE_WINDOW = "outside the sending hours"
NOTE_CAP_REACHED = "daily limit reached"
