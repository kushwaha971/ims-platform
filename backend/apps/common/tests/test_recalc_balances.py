"""`manage.py recalc_balances` — the cache's replay (Part 21 §21.1 rule 3).

The balance column is a cache of a sum over `ledger_entry`, and a cache nobody
can rebuild is a number nobody can trust. These tests are the "nobody can" part:
they break the cache deliberately and check that the command notices, and that
it does not touch anything until it is told to.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from io import StringIO
from typing import Any

import pytest
from django.core.management import call_command

from apps.common.constants import Direction
from apps.ledger.constants import EntryStatus, EntryType, SourceType
from apps.ledger.models import LedgerEntry
from apps.parties.models import Party
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db


def entry(party: Party, direction: str, amount: str, **extra: Any) -> LedgerEntry:
    return LedgerEntry.objects.create(
        tenant=party.tenant,
        party=party,
        direction=direction,
        amount=Decimal(amount),
        entry_date=dt.date(2026, 4, 1),
        entry_type=(
            EntryType.MANUAL_GAVE if direction == Direction.DEBIT else EntryType.MANUAL_GOT
        ),
        source_type=SourceType.MANUAL,
        status=EntryStatus.POSTED,
        **extra,
    )


def run(**opts: Any) -> str:
    out = StringIO()
    call_command("recalc_balances", stdout=out, **opts)
    return out.getvalue()


def test_a_cache_that_matches_its_ledger_is_reported_as_clean(tenant: Any) -> None:
    party = PartyFactory(tenant=tenant, balance="800.00")
    entry(party, Direction.DEBIT, "1000.00")
    entry(party, Direction.CREDIT, "200.00")

    output = run(tenant=str(tenant.id))

    assert "drift" not in output
    assert "0 found" in output


def test_drift_is_reported_and_nothing_is_written_without_apply(tenant: Any) -> None:
    """Report-only is the default because a drift report is a BUG REPORT.

    A balance that disagrees with its ledger means something wrote the number
    without the entry that justifies it. Quietly correcting it destroys the only
    evidence of how that happened, so an operator reads the report first.
    """
    party = PartyFactory(tenant=tenant, balance="9999.00")
    entry(party, Direction.DEBIT, "500.00")

    output = run(tenant=str(tenant.id))

    assert "drift" in output
    assert "1 found" in output
    party.refresh_from_db()
    assert party.balance == Decimal("9999.00")


def test_apply_writes_the_ledgers_answer_and_both_totals(tenant: Any) -> None:
    party = PartyFactory(tenant=tenant, balance="9999.00", receivable_total="9999.00")
    entry(party, Direction.CREDIT, "500.00")

    run(tenant=str(tenant.id), apply=True)

    party.refresh_from_db()
    assert party.balance == Decimal("-500.00")
    # BR-3 — the party is in credit, so nothing is receivable and ₹500 is owed
    # to them. A replay that fixed only `balance` would leave the two report
    # totals telling a different story from the number beside them.
    assert party.receivable_total == Decimal("0.00")
    assert party.payable_total == Decimal("500.00")


def test_a_party_with_no_entries_at_all_recomputes_to_zero(tenant: Any) -> None:
    """The subquery returns NULL for a party with no rows, not zero.

    `Coalesce` is what turns that into ₹0.00. Without it every party who has
    never traded would be "corrected" to `None`, which is a NOT NULL column and
    an exception halfway through a nightly job.
    """
    party = PartyFactory(tenant=tenant, balance="250.00")

    run(tenant=str(tenant.id), apply=True)

    party.refresh_from_db()
    assert party.balance == Decimal("0.00")


def test_a_reversal_pair_cancels_rather_than_counting_twice(tenant: Any) -> None:
    """Canon §0.2 against Part 21 §21.3.4, and the arithmetic that settles it.

    §21.3.4 writes the balance as a sum over `status='posted'` rows and argues
    that reversal pairs cancel. They do not under that predicate: the original
    is flipped to `reversed` and dropped, the reversal stays `posted` and is
    counted, so a reversed ₹500 debit nets to −₹500 instead of zero — the
    reversal applied twice.

    Canon's "non-reversed entries" excludes BOTH halves, which is also what a
    merchant sees: a reversed line and the line that reversed it are both struck
    through in the statement and neither is in the total. Canon's precedence
    rule makes §21.3.4 the defect, and this test is the arithmetic that says so.

    LED-03 is what creates these rows; this builds the pair by hand, because the
    formula has to be right before the feature that produces it exists.
    """
    party = PartyFactory(tenant=tenant, balance="0.00")
    original = entry(party, Direction.DEBIT, "500.00")
    reversal = LedgerEntry.objects.create(
        tenant=party.tenant,
        party=party,
        direction=Direction.CREDIT,
        amount=Decimal("500.00"),
        entry_date=dt.date(2026, 4, 2),
        entry_type=EntryType.REVERSAL,
        source_type=SourceType.LEDGER_ENTRY,
        status=EntryStatus.POSTED,
        reverses=original,
        reason="Duplicate",
    )
    LedgerEntry.objects.filter(pk=original.pk).update(
        status=EntryStatus.REVERSED, reversed_by=reversal
    )
    entry(party, Direction.DEBIT, "300.00")

    run(tenant=str(tenant.id), apply=True)

    party.refresh_from_db()
    assert party.balance == Decimal("300.00")


def test_a_corrected_party_still_matches_a_full_replay(tenant: Any, api_as: Any) -> None:
    """LED-03's arithmetic against the ground truth, by a different route.

    `correct_entry` moves the cache by the DIFFERENCE between two rows, which is
    the one place in the ledger a balance is not moved by a single entry's own
    amount — and therefore the one most likely to drift. `recalc_balances`
    re-derives the figure from every row in the table using `LIVE_ENTRIES`, so
    agreeing with it is the only honest proof the incremental path is right.

    The sequence deliberately mixes the two shapes: a reversal, whose pair must
    net to zero, and a correction, whose pair must net to the difference.
    """
    from django.urls import reverse

    from apps.ledger.selectors.entry import computed_balance

    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")

    def post(**extra: Any) -> Any:
        return client.post(
            reverse("v1:ledger-entry-list"),
            {
                "party_id": str(party.id),
                "direction": Direction.DEBIT,
                "amount": "500.00",
                "entry_date": "2026-04-01",
                **extra,
            },
            format="json",
        )

    post(amount="1200.00")
    undone = LedgerEntry.objects.get(pk=post(amount="500.00").json()["data"]["id"])
    fixed = LedgerEntry.objects.get(pk=post(amount="300.00").json()["data"]["id"])
    detail = reverse("v1:ledger-entry-detail", args=[undone.id])
    client.post(f"{detail}/reverse", {"reason": "Duplicate"}, format="json")
    client.post(
        f"{reverse('v1:ledger-entry-detail', args=[fixed.id])}/correct",
        {"amount": "350.00", "reason": "Recount"},
        format="json",
    )

    party.refresh_from_db()
    expected = Decimal("1200.00") + Decimal("350.00")
    assert party.balance == expected
    assert computed_balance(tenant=tenant, party_id=party.id) == expected

    output = run(tenant=str(tenant.id))
    assert "drift" not in output, output
    assert "0 found" in output
