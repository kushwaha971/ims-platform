"""Party-cache-versus-ledger comparison — the one implementation behind
`manage.py recalc_balances`, `recalc_balances --check`, `check_invariants` and
the nightly integrity job (`apps.ledger.services.integrity.check_balances`).

Per party, the cached `balance` against `Σ debit − Σ credit` over the live
entries (`ledger.selectors.entry.SIGNED_AMOUNT`, imported rather than restated).
One correlated subquery, streamed — never a query per party.

`split_mismatch` is REPORTED alongside a balance drift (the receivable / payable
totals disagree with the cached balance they are split from) but does not by
itself make a party drifted: `apply_entry` writes all three together, and a
split-only difference is what test factories produce, not a ledger defect.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Iterator

from django.db.models import OuterRef, Subquery
from django.db.models.functions import Coalesce

from apps.common.money import ZERO
from apps.ledger.models import LedgerEntry
from apps.ledger.selectors.entry import SIGNED_AMOUNT
from apps.parties.models import Party


@dataclass(frozen=True)
class BalanceDrift:
    party_id: Any
    tenant_id: Any
    name: str
    cached_balance: Decimal
    ledger_balance: Decimal
    #: `receivable_total` / `payable_total` disagree with the cached balance
    #: they are derived from (a writer that set one and not the others).
    split_mismatch: bool


def iter_balances(*, tenant_id: Any = None, chunk: int = 1000) -> Iterator[tuple[Party, Decimal]]:
    """Every party (archived and soft-deleted too) with its ledger-computed balance."""
    parties = Party.all_objects.all().order_by("id")
    if tenant_id:
        parties = parties.filter(tenant_id=tenant_id)
    ledger_total = (
        LedgerEntry.objects.filter(party=OuterRef("pk"))
        .values("party")
        .annotate(total=SIGNED_AMOUNT)
        .values("total")[:1]
    )
    parties = parties.annotate(computed=Coalesce(Subquery(ledger_total), ZERO))
    for party in parties.iterator(chunk_size=max(1, int(chunk))):
        yield party, (party.computed or ZERO)


def drift_of(party: Party, computed: Decimal) -> BalanceDrift | None:
    """None when the party's cache agrees with its ledger, else what disagrees."""
    cached = party.balance or ZERO
    split_bad = (party.receivable_total or ZERO) != max(cached, ZERO) or (
        party.payable_total or ZERO
    ) != max(-cached, ZERO)
    if computed == cached:
        return None
    return BalanceDrift(party.id, party.tenant_id, party.name, cached, computed, split_bad)


def balance_drift(*, tenant_id: Any = None) -> tuple[int, list[BalanceDrift]]:
    """`(parties_checked, drifted)`. Reads only; never corrects."""
    checked, found = 0, []
    for party, computed in iter_balances(tenant_id=tenant_id):
        checked += 1
        drift = drift_of(party, computed)
        if drift is not None:
            found.append(drift)
    return checked, found
