"""The party balance cache — the only code that writes it (Part 21 §21.1 rule 3).

`parties_party.balance` is not a fact. It is a cache of a sum over
`ledger_entry`, kept current because a list of two hundred parties cannot
aggregate the ledger per row, and recomputable in full by
`manage.py recalc_balances`. `Party`'s own docstring names this module as its
sole writer, and that is the invariant this file exists to hold: one function
moves the number, inside the caller's transaction, after locking the row.

── What is here and what is next door ───────────────────────────────────────
This module moves the number. The RULE for what the number should be — which
ledger rows count, and the arithmetic over them — lives in
`ledger/selectors/entry.py`, because it is a statement about `ledger_entry` and
Part 20 §20.1.4 has `parties` importing nothing from `ledger`. The dependency
runs one way: the ledger calls `lock_party` and `apply_entry`; nothing here
calls the ledger.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.utils import timezone

from apps.common.constants import Direction
from apps.common.money import ZERO
from apps.parties.models import Party


def lock_party(*, tenant: Any, party_id: Any) -> Party | None:
    """The party row, locked for the rest of this transaction (BR-2, EC-7).

    `SELECT … FOR UPDATE`, which is what makes two staff posting to the same
    party at the same moment safe: the second transaction blocks here until the
    first commits, then reads a balance that includes the first entry. Without
    it both read the same balance, both add their amount to it, and one entry's
    worth of money disappears from the cache while both rows sit in the ledger.

    It is also what makes the credit-limit check meaningful. A limit compared
    against a balance read outside the lock is a limit compared against a number
    that can change before the insert — which is the whole reason FR-6's check
    runs in the write path and not only in the pre-flight.

    Returns `None` for an id this tenant cannot see; the caller decides whether
    that is a 404 (it is — canon §0.11 rule 2).
    """
    if tenant is None:
        return None
    return Party.objects.for_tenant(tenant).select_for_update().filter(pk=party_id).first()


def apply_entry(*, party: Party, direction: str, amount: Decimal) -> Decimal:
    """Move the cache by one entry and write the row. Returns the new balance.

    Called with the party ALREADY LOCKED by `lock_party`. It does not lock, and
    it does not open a transaction: both belong to the caller, because the
    balance write and the ledger insert have to be the same atom or the cache
    can commit without the row that justifies it.

    Incremental rather than a re-aggregate of the party's history, and the
    difference is the feature: a party with three years of daily entries would
    make every new entry cost a scan of all of them. `recalc_balances` is the
    aggregate, run nightly, and the drift between the two is the thing it
    reports.
    """
    delta = amount if direction == Direction.DEBIT else -amount
    party.balance = (party.balance or ZERO) + delta
    # BR-3. Two caches of one number, kept here rather than computed on read,
    # because the reports that want them want them summed across parties.
    party.receivable_total = max(party.balance, ZERO)
    party.payable_total = max(-party.balance, ZERO)
    # BR-4 — `now()`, not `entry_date`. The column answers "when did anything
    # last happen on this khata", and backdating an entry the merchant forgot
    # is something happening. Sorting the list by the business date of the
    # oldest thing somebody remembered would put the party they just touched at
    # the bottom.
    party.last_activity_at = timezone.now()
    party.save(
        update_fields=[
            "balance",
            "receivable_total",
            "payable_total",
            "last_activity_at",
            "updated_at",
        ]
    )
    return party.balance
