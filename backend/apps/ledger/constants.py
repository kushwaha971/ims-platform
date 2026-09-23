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


class EntryType(models.TextChoices):
    """Part 21 §21.3.4 — what KIND of ledger line this is.

    Twelve of the fourteen values name a source the product cannot post yet;
    they are declared in full anyway, because `entry_type` is stored on every
    row from the first one and a value added later would leave the rows written
    before it with no way to say what they were. The column is the vocabulary;
    the endpoints arrive one feature at a time.

    LED-01 writes exactly two of them (`MANUAL_GAVE`, `MANUAL_GOT`) and LED-02
    writes `OPENING`. `INTEREST` is Phase 3 and is here for the same reason.
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


class SourceType(models.TextChoices):
    """What produced the entry — the other half of the `(source_type, source_id)` pair.

    Part 21 §21.9 names this polymorphism as the extension point that lets a new
    document kind post to the ledger without a schema change. `MANUAL` is the
    only value LED-01 writes, and `source_id` is null for it: a manual entry is
    its own source.
    """

    MANUAL = "manual", _("Manual")
    SALES_DOCUMENT = "sales_document", _("Sales document")
    PURCHASE_DOCUMENT = "purchase_document", _("Purchase document")
    PAYMENT = "payment", _("Payment")
    EXPENSE = "expense", _("Expense")
    LEDGER_ENTRY = "ledger_entry", _("Ledger entry")


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
