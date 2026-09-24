"""EXP-01 FR-3 — the expense's human number, `EXP/26-27/0031`.

── The lock is the sequence row, and it is taken LAST ───────────────────────
`platform_document_sequence` is "the hottest lock in the product" (its model
docstring), so Part 20 §20.11.2 rule L4 takes it after every other contended
lock in the transaction. `record_expense` locks the party first (an unpaid
expense moves a balance), then calls this — never the other way round, or an
expense and a ledger entry racing on one party could deadlock.

── The row is created on first use ──────────────────────────────────────────
Onboarding seeds a sequence per document kind in `presets.NUMBERING_PREFIXES`,
and `expense` is not one of them (CCR-30 adds the kind; `platform_app` is not
this app's to change in this wave). So the allocator `get_or_create`s the row
for the FY it needs, with `EXP` and four digits. A concurrent first use is
safe: the unique constraint on `(tenant, kind, fy_label)` makes the loser's
insert fail inside `get_or_create`, which then reads the winner's row, and the
`FOR UPDATE` below serialises the increment.

── The FY comes from the EXPENSE's date, not today's ────────────────────────
BR-4 / EC-4: a March expense recorded in April takes last year's series,
because the number is a statement about which year's books it belongs to.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from apps.common.dates import fy_label_for
from apps.expenses.constants import (
    EXPENSE_NUMBER_PADDING,
    EXPENSE_NUMBER_PREFIX,
    EXPENSE_SEQUENCE_KIND,
)


def short_fy(fy_label: str) -> str:
    """`2026-27` → `26-27`, the form FR-3's example number prints."""
    start, _, end = fy_label.partition("-")
    return f"{start[-2:]}-{end}"


def allocate_expense_number(*, tenant: Any, expense_date: dt.date) -> str:
    """Take the next number for `expense_date`'s FY. Caller holds the transaction."""
    from apps.platform_app.models import DocumentSequence

    fy_label = fy_label_for(tenant, expense_date)
    DocumentSequence.objects.get_or_create(
        tenant=tenant,
        kind=EXPENSE_SEQUENCE_KIND,
        fy_label=fy_label,
        defaults={
            "prefix": EXPENSE_NUMBER_PREFIX,
            "next_number": 1,
            "padding": EXPENSE_NUMBER_PADDING,
        },
    )
    sequence = DocumentSequence.objects.select_for_update().get(
        tenant=tenant, kind=EXPENSE_SEQUENCE_KIND, fy_label=fy_label
    )
    current = sequence.next_number
    sequence.next_number = current + 1
    sequence.save(update_fields=["next_number", "updated_at"])
    prefix = sequence.prefix or EXPENSE_NUMBER_PREFIX
    digits = str(current).zfill(sequence.padding or EXPENSE_NUMBER_PADDING)
    return f"{prefix}/{short_fy(fy_label)}/{digits}"
