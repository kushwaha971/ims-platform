"""Balance drift — the one implementation behind `manage.py recalc_balances` and the
nightly `parties.recalc_balances` job (Part 20 §20.8.4, Part 42 BE-03).

`parties_party.balance` is a cache moved one entry at a time; this replays the
ledger for every party in ONE correlated subquery (a query per party would make
a 100,000-party night an outage) using `SIGNED_AMOUNT`, the same formula the
writer's rule is stated in, and reports every party whose cache disagrees.
It reads; it never writes. A drift is a bug report, and correcting the number
quietly would destroy the evidence of how it happened.
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
    cached: Decimal
    replayed: Decimal


def parties_with_replay(*, tenant_id: Any = None) -> Any:
    """Every party (archived and deleted included), annotated with `computed`."""
    parties = Party.all_objects.all().order_by("id")
    if tenant_id:
        parties = parties.filter(tenant_id=tenant_id)
    ledger_total = (
        LedgerEntry.objects.filter(party=OuterRef("pk"))
        .values("party")
        .annotate(total=SIGNED_AMOUNT)
        .values("total")[:1]
    )
    return parties.annotate(computed=Coalesce(Subquery(ledger_total), ZERO))


def iter_balance_drift(*, tenant_id: Any = None, chunk: int = 1000) -> Iterator[tuple[Any, bool]]:
    """Yield `(party, drifted)` for every party — the command prints as it goes."""
    for party in parties_with_replay(tenant_id=tenant_id).iterator(chunk_size=max(1, chunk)):
        yield party, (party.computed or ZERO) != (party.balance or ZERO)


def balance_drift(*, tenant_id: Any = None) -> list[BalanceDrift]:
    return [
        BalanceDrift(
            party_id=party.id,
            tenant_id=party.tenant_id,
            cached=party.balance or ZERO,
            replayed=party.computed or ZERO,
        )
        for party, drifted in iter_balance_drift(tenant_id=tenant_id)
        if drifted
    ]
