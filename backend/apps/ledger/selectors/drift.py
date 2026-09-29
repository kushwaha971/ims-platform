"""Party-cache-versus-ledger comparison — the one implementation behind
`manage.py recalc_balances`, `recalc_balances --check`, `check_invariants` and
the nightly integrity job (`apps.ledger.services.integrity.check_balances`).

Per party, the three cached figures against their replays over the live entries
(A2, ADR-043): `balance` against `SIGNED_AMOUNT` (the `main` and `loan` buckets),
`loan_balance` against `LOAN_SIGNED_AMOUNT`, and `deposit_held` against
`DEPOSIT_HELD_AMOUNT` — all three imported from `ledger.selectors.entry` rather
than restated. One correlated subquery per figure, streamed — never a query per
party.

`split_mismatch` is REPORTED alongside a balance drift (the receivable / payable
totals disagree with the cached balance they are split from) but does not by
itself make a party drifted: `apply_entry` writes all three together, and a
split-only difference is what test factories produce, not a ledger defect.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Iterator, NamedTuple

from django.db.models import OuterRef, Subquery
from django.db.models.functions import Coalesce

from apps.common.money import ZERO
from apps.ledger.models import LedgerEntry
from apps.ledger.selectors.entry import DEPOSIT_HELD_AMOUNT, LOAN_SIGNED_AMOUNT, SIGNED_AMOUNT
from apps.parties.models import Party


class LedgerFigures(NamedTuple):
    """What the ledger says a party's three caches should be."""

    balance: Decimal
    loan_balance: Decimal
    deposit_held: Decimal


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
    cached_loan_balance: Decimal = ZERO
    ledger_loan_balance: Decimal = ZERO
    cached_deposit_held: Decimal = ZERO
    ledger_deposit_held: Decimal = ZERO

    @property
    def figures(self) -> tuple[str, ...]:
        """Which caches disagree: any of `balance`, `loan_balance`, `deposit_held`."""
        out = []
        if self.cached_balance != self.ledger_balance:
            out.append("balance")
        if self.cached_loan_balance != self.ledger_loan_balance:
            out.append("loan_balance")
        if self.cached_deposit_held != self.ledger_deposit_held:
            out.append("deposit_held")
        return tuple(out)


def _replay(expression: Any) -> Coalesce:
    total = (
        LedgerEntry.objects.filter(party=OuterRef("pk"))
        .values("party")
        .annotate(total=expression)
        .values("total")[:1]
    )
    return Coalesce(Subquery(total), ZERO)


def iter_balances(
    *, tenant_id: Any = None, chunk: int = 1000
) -> Iterator[tuple[Party, LedgerFigures]]:
    """Every party (archived and soft-deleted too) with its three ledger-computed figures."""
    parties = Party.all_objects.all().order_by("id")
    if tenant_id:
        parties = parties.filter(tenant_id=tenant_id)
    parties = parties.annotate(
        computed=_replay(SIGNED_AMOUNT),
        computed_loan=_replay(LOAN_SIGNED_AMOUNT),
        computed_deposit=_replay(DEPOSIT_HELD_AMOUNT),
    )
    for party in parties.iterator(chunk_size=max(1, int(chunk))):
        yield party, LedgerFigures(
            party.computed or ZERO, party.computed_loan or ZERO, party.computed_deposit or ZERO
        )


def drift_of(party: Party, computed: LedgerFigures) -> BalanceDrift | None:
    """None when all three of the party's caches agree with its ledger, else what disagrees."""
    cached = party.balance or ZERO
    cached_loan = party.loan_balance or ZERO
    cached_deposit = party.deposit_held or ZERO
    split_bad = (party.receivable_total or ZERO) != max(cached, ZERO) or (
        party.payable_total or ZERO
    ) != max(-cached, ZERO)
    if (computed.balance, computed.loan_balance, computed.deposit_held) == (
        cached,
        cached_loan,
        cached_deposit,
    ):
        return None
    return BalanceDrift(
        party.id,
        party.tenant_id,
        party.name,
        cached,
        computed.balance,
        split_bad,
        cached_loan_balance=cached_loan,
        ledger_loan_balance=computed.loan_balance,
        cached_deposit_held=cached_deposit,
        ledger_deposit_held=computed.deposit_held,
    )


def balance_drift(*, tenant_id: Any = None) -> tuple[int, list[BalanceDrift]]:
    """`(parties_checked, drifted)`. Reads only; never corrects."""
    checked, found = 0, []
    for party, computed in iter_balances(tenant_id=tenant_id):
        checked += 1
        drift = drift_of(party, computed)
        if drift is not None:
            found.append(drift)
    return checked, found
