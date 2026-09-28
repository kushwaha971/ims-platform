"""Enumerations owned by the payments app (Part 26 §26.16 R16.1).

`PaymentMode` and `Direction` are NOT redeclared: a payment's modes are the
ledger's modes (`apps/common/constants.py`), because the cashbook totals both
by the same key and two copies of a six-value enum is how they drift.
"""

from __future__ import annotations

from django.db import models
from django.utils.translation import gettext_lazy as _


class PaymentDirection(models.TextChoices):
    """PAY-01 — money IN from a customer, money OUT to a supplier (PUR-02)."""

    IN = "in", _("Received")
    OUT = "out", _("Paid out")


class PaymentStatus(models.TextChoices):
    """Part 21 §21.3.9 — two values. A void keeps its row and its number (PAY-05 BR-1)."""

    RECORDED = "recorded", _("Recorded")
    VOID = "void", _("Void")


class AllocationMode(models.TextChoices):
    """How the allocations were chosen — analytics and the audit row (§18)."""

    AUTO = "auto", _("Auto — oldest first")
    MANUAL = "manual", _("Manual")
    NONE = "none", _("None")


#: The numbering kinds `platform_document_sequence` already seeds (RCT / PAYOUT).
SEQUENCE_KIND_FOR_DIRECTION: dict[str, str] = {
    PaymentDirection.IN: "payment_in",
    PaymentDirection.OUT: "payment_out",
}

#: PAY-02 BR-5 — the jsonb stays small and the receipt readable.
MAX_MODE_LINES = 4
#: PAY-01 §10 — column widths, so the validator and the database agree.
NOTE_MAX_LENGTH = 255
REFERENCE_MAX_LENGTH = 64
#: PAY-02 §19 — the only keys a `mode_breakup` line may carry. `upi_app` is the
#: flattened-chip addition the ledger and expenses already store (CR-LOG).
MODE_LINE_KEYS: tuple[str, ...] = ("mode", "amount", "reference", "upi_app")
#: PAY-05 FR-2 quick reasons are client copy; the server only checks the length.
LIST_PAGE_SIZE = 25
