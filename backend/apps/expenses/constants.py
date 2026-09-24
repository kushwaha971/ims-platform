"""Enumerations owned by the expenses app (Part 26 §26.16 R16.1).

`PaymentMode` and `UpiApp` are NOT redeclared here. They live in
`apps/common/constants.py` beside `Direction`, because an expense, a ledger
"You got" and a payment all say how money moved, and the cashbook (EXP-03)
buckets all three by the same vocabulary. A second copy of the enum is how the
cashbook would come to disagree with the ledger about which value is cash.
"""

from __future__ import annotations

from django.db import models
from django.utils.translation import gettext_lazy as _


class ExpenseStatus(models.TextChoices):
    """EXP-01 BR-8 — two values. Void is terminal and never deletes the row."""

    RECORDED = "recorded", _("Recorded")
    VOID = "void", _("Void")


class CategoryStatus(models.TextChoices):
    """EXP-02 FR-6 — archive, never delete a category that has been used."""

    ACTIVE = "active", _("Active")
    ARCHIVED = "archived", _("Archived")


#: EXP-02 BR-6 — the category palette is the tag palette (PTY-05): theme-aware
#: TOKENS, never hex. A hex value cannot answer the question a chip asks on
#: every render — which theme am I on — and `--viz-1` resolves through
#: `--primary-500`, which dark mode redefines. `varchar(16)` holds any of them.
CATEGORY_COLORS: tuple[str, ...] = (
    "viz-1",
    "viz-2",
    "viz-3",
    "viz-4",
    "viz-5",
    "viz-6",
    "viz-7",
    "viz-8",
)

#: FR-1 — the nine seeded categories get a deterministic colour by position in
#: the seed, so two tenants' "Rent" chips look the same and a support screenshot
#: can be read without asking which shop it came from. The ninth wraps round to
#: the first token, which is what "deterministic by index" means for nine codes
#: and eight colours.
SEEDED_CATEGORY_CODES: tuple[str, ...] = (
    "rent",
    "salaries",
    "electricity",
    "transport",
    "purchases_misc",
    "food",
    "marketing",
    "fees",
    "other",
)
SEEDED_COLOR_BY_CODE: dict[str, str] = {
    code: CATEGORY_COLORS[index % len(CATEGORY_COLORS)]
    for index, code in enumerate(SEEDED_CATEGORY_CODES)
}

#: EXP-02 FR-12 — a picker the merchant has to scroll is a picker that has
#: stopped being fast. 40 active categories is the FRD's ceiling.
MAX_ACTIVE_CATEGORIES = 40
CATEGORY_NAME_MAX_LENGTH = 40

#: EXP-01 §10 — the same ceilings as the ledger's columns, because an unpaid
#: expense's note travels into a ledger row of that width.
NOTE_MAX_LENGTH = 255
REFERENCE_MAX_LENGTH = 64

#: EXP-01 FR-3 — `platform_document_sequence.kind`, and the default prefix.
#: CCR-30 names the kind; onboarding does not seed a row for it, so the
#: allocator creates the row for the FY it first needs (`services/numbering.py`).
EXPENSE_SEQUENCE_KIND = "expense"
EXPENSE_NUMBER_PREFIX = "EXP"
EXPENSE_NUMBER_PADDING = 4

#: EXP-03 FR-2 — the two cashbook buckets. `cash` is exactly `mode='cash'`;
#: every other mode is money in a bank account or behind a UPI app, which the
#: merchant cannot count in the drawer at closing time.
CASH_BUCKET = "cash"
BANK_BUCKET = "bank"
BUCKETS: tuple[str, ...] = (CASH_BUCKET, BANK_BUCKET)

#: EXP-03 §10 — a year is the longest range one request may ask for.
CASHBOOK_MAX_DAYS = 366
