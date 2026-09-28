"""CR-2026-09-24-A — a write-off is neither "You gave" nor "You got".

QA found the khata reading "You got in all ₹930.00" after a write-off, over a
row that said "Written off": the header summed every credit, and a write-off is
a credit. LED-11 BR-3 keeps write-offs out of every collections total and §8
paints them "neither gave nor got", so the totals now carry THREE mutually
exclusive buckets — gave, got and `written_off {debit, credit}` — over one set
of rows. These tests hold the three properties that make that safe:

1. The figures are right: gave/got exclude write-offs; written_off is exactly
   the write-off rows, by direction; opening entries still count in gave/got.
2. The arithmetic still reconciles: `opening + debit − credit + wo.debit −
   wo.credit == closing`, and on an unbounded statement `closing ==
   parties_party.balance` (LED-04 BR-3).
3. CR-125 holds: no net figure is on the wire — the client subtracts.

Built through the real routes (opening entry, entries, the archive write-off)
so the cache the invariant is checked against was maintained by the real path.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.common.constants import Direction
from apps.ledger.constants import EntryStatus, EntryType, SourceType
from apps.ledger.models import LedgerEntry
from apps.ledger.selectors.aging import aging_rows
from apps.ledger.selectors.entry import party_ledger_summary
from apps.ledger.selectors.statement import statement_totals
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db

ENTRIES = "v1:ledger-entry-list"
STATEMENT = "v1:party-statement"


def _post(client: Any, party: Any, **fields: Any) -> None:
    response = client.post(reverse(ENTRIES), {"party_id": str(party.id), **fields}, format="json")
    assert response.status_code == 201, response.json()


def _write_off_and_archive(client: Any, party: Any) -> None:
    response = client.post(
        reverse("v1:party-archive", args=[party.id]),
        {"reason": "Shop closed", "write_off": {"reason": "Cannot recover"}},
        format="json",
    )
    assert response.status_code == 200, response.json()


def _book(client: Any, party: Any, *, receivable: bool) -> None:
    """Opening ₹2,300, then ₹500 one way and ₹300 the other, then a write-off.

    Receivable: opening "they owe" 2,300, gave 500, got 300 → owes 2,500 →
    written off with a CREDIT. Payable is the mirror: opening "I owe" 2,300,
    got 500, gave 300 → owed 2,500 → written off with a DEBIT.
    """
    owed, paid = (
        (Direction.DEBIT, Direction.CREDIT) if receivable else (Direction.CREDIT, Direction.DEBIT)
    )
    _post(
        client,
        party,
        entry_type="opening",
        direction=owed,
        amount="2300.00",
        entry_date="2026-04-01",
    )
    for direction, amount in ((owed, "500.00"), (paid, "300.00")):
        _post(
            client,
            party,
            direction=direction,
            amount=amount,
            entry_date="2026-04-18",
            **({"payment_mode": "cash"} if direction == Direction.CREDIT else {}),
        )
    _write_off_and_archive(client, party)


@pytest.fixture
def receivable(tenant: Any, api_as: Any) -> dict:
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00", name="Naidu Agency")
    _book(client, party, receivable=True)
    party.refresh_from_db()
    return {"client": client, "party": party}


@pytest.fixture
def payable(tenant: Any, api_as: Any) -> dict:
    client, _ = api_as(tenant)
    party = PartyFactory(
        tenant=tenant, balance="0.00", name="Gupta Wholesale", is_customer=False, is_supplier=True
    )
    _book(client, party, receivable=False)
    party.refresh_from_db()
    return {"client": client, "party": party}


def _reconciles(opening: str, totals: dict, closing: str) -> bool:
    """The merchant's own sum: brought forward + gave − got ± written off."""
    written_off = totals["written_off"]
    return Decimal(opening) + Decimal(totals["debit"]) - Decimal(totals["credit"]) + Decimal(
        written_off["debit"]
    ) - Decimal(written_off["credit"]) == Decimal(closing)


# ── The khata header (timeline meta.summary) ────────────────────────────────


def test_a_receivable_write_off_is_not_counted_as_money_got(receivable: dict) -> None:
    """The QA defect, closed. "You got in all" is what came back — ₹300 — and the
    ₹2,500 forgiven is its own figure. The opening still counts in gave."""
    client, party = receivable["client"], receivable["party"]

    summary = client.get(f"{reverse(ENTRIES)}?party={party.id}").json()["meta"]["summary"]

    assert summary == {
        "total_debit": "2800.00",
        "total_credit": "300.00",
        "written_off": {"debit": "0.00", "credit": "2500.00"},
        "entry_count": 4,
    }
    assert party.balance == Decimal("0.00")


def test_a_payable_write_off_is_not_counted_as_money_given(payable: dict) -> None:
    """The mirror: forgiving what the merchant owed a supplier is not a payment."""
    client, party = payable["client"], payable["party"]

    summary = client.get(f"{reverse(ENTRIES)}?party={party.id}").json()["meta"]["summary"]

    assert summary["total_debit"] == "300.00"
    assert summary["total_credit"] == "2800.00"
    assert summary["written_off"] == {"debit": "2500.00", "credit": "0.00"}
    assert party.balance == Decimal("0.00")


def test_the_three_header_figures_still_sum_to_the_balance(receivable: dict, payable: dict) -> None:
    """Canon §0.2's balance, restated over the three buckets. Nothing is lost by
    moving the write-off out of "got": it is still in the sum, one line down."""
    for book in (receivable, payable):
        client, party = book["client"], book["party"]
        summary = client.get(f"{reverse(ENTRIES)}?party={party.id}").json()["meta"]["summary"]
        totals = {
            "debit": summary["total_debit"],
            "credit": summary["total_credit"],
            "written_off": summary["written_off"],
        }
        assert _reconciles("0.00", totals, str(party.balance))


def test_a_book_with_no_write_off_carries_zeroes_not_absence(tenant: Any, api_as: Any) -> None:
    """Additive and always present, so a client never has to guess whether a
    missing key means "none" or "an older server"."""
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")
    _post(client, party, direction=Direction.DEBIT, amount="100.00", entry_date="2026-04-01")

    summary = client.get(f"{reverse(ENTRIES)}?party={party.id}").json()["meta"]["summary"]

    assert summary["written_off"] == {"debit": "0.00", "credit": "0.00"}
    assert summary["total_debit"] == "100.00"


def test_a_reversed_write_off_leaves_every_bucket(tenant: Any) -> None:
    """LED-11 FR-5 — a write-off undone through LED-03 is out of the live set,
    both halves, exactly as any other reversal pair is."""
    party = PartyFactory(tenant=tenant, balance="0.00")
    base = {"tenant": tenant, "party": party, "status": EntryStatus.POSTED}
    LedgerEntry.objects.create(
        **base,
        direction=Direction.DEBIT,
        amount=Decimal("900.00"),
        entry_date=dt.date(2026, 4, 1),
        entry_type=EntryType.MANUAL_GAVE,
        source_type=SourceType.MANUAL,
    )
    wo = LedgerEntry.objects.create(
        **base,
        direction=Direction.CREDIT,
        amount=Decimal("900.00"),
        entry_date=dt.date(2026, 4, 2),
        entry_type=EntryType.WRITE_OFF,
        source_type=SourceType.MANUAL,
        reason="Moved away",
    )
    reversal = LedgerEntry.objects.create(
        **base,
        direction=Direction.DEBIT,
        amount=Decimal("900.00"),
        entry_date=dt.date(2026, 4, 3),
        entry_type=EntryType.REVERSAL,
        source_type=SourceType.LEDGER_ENTRY,
        source_id=wo.id,
        reverses=wo,
        reason="Paid after all",
    )
    wo.status = EntryStatus.REVERSED
    wo.reversed_by = reversal
    wo.save(update_fields=["status", "reversed_by"])

    summary = party_ledger_summary(tenant=tenant, party_id=party.id)

    assert summary["written_off"] == {"debit": Decimal("0.00"), "credit": Decimal("0.00")}
    assert summary["total_debit"] == Decimal("900.00")
    assert summary["total_credit"] == Decimal("0.00")


# ── The statement ───────────────────────────────────────────────────────────


def test_the_statement_carries_written_off_beside_gave_and_got(receivable: dict) -> None:
    """LED-04 §14 `totals`, additive: `{debit, credit}` keep their keys and now
    mean "You gave" / "You got"; `written_off` is the third line of the strip."""
    client, party = receivable["client"], receivable["party"]

    body = client.get(reverse(STATEMENT, args=[party.id])).json()["data"]

    assert body["totals"] == {
        "debit": "2800.00",
        "credit": "300.00",
        "written_off": {"debit": "0.00", "credit": "2500.00"},
    }
    assert body["opening_balance"] == "0.00"
    assert body["closing_balance"] == "0.00"
    assert _reconciles(body["opening_balance"], body["totals"], body["closing_balance"])


def test_the_payable_statement_mirrors_it(payable: dict) -> None:
    client, party = payable["client"], payable["party"]

    body = client.get(reverse(STATEMENT, args=[party.id])).json()["data"]

    assert body["totals"] == {
        "debit": "300.00",
        "credit": "2800.00",
        "written_off": {"debit": "2500.00", "credit": "0.00"},
    }
    assert body["closing_balance"] == "0.00"
    assert _reconciles(body["opening_balance"], body["totals"], body["closing_balance"])


def test_an_unbounded_statement_still_closes_on_the_party_balance(
    receivable: dict, payable: dict
) -> None:
    """BR-3 is untouched: the closing figure is a signed sum of every row and the
    split changes only which line of the strip a row is reported on."""
    for book in (receivable, payable):
        client, party = book["client"], book["party"]
        body = client.get(reverse(STATEMENT, args=[party.id])).json()["data"]
        assert body["closing_balance"] == str(party.balance)


def test_a_narrowed_period_reconciles_through_its_opening(receivable: dict) -> None:
    """Brought forward ₹2,300 (the opening entry, before the period), then gave
    500, got 300, written off 2,500 → closing 0. The write-off is dated today by
    the archive flow, so the period runs to it."""
    client, party = receivable["client"], receivable["party"]

    body = client.get(reverse(STATEMENT, args=[party.id]), {"date_from": "2026-04-18"}).json()[
        "data"
    ]

    assert body["opening_balance"] == "2300.00"
    assert body["totals"]["debit"] == "500.00"
    assert body["totals"]["credit"] == "300.00"
    assert body["totals"]["written_off"]["credit"] == "2500.00"
    assert body["closing_balance"] == "0.00"
    assert _reconciles(body["opening_balance"], body["totals"], body["closing_balance"])


def test_no_net_figure_is_on_the_wire(receivable: dict) -> None:
    """CR-125. `net_change` is `closing − opening` and also the sum of the
    components; the server carries the components and the client subtracts."""
    client, party = receivable["client"], receivable["party"]

    body = client.get(reverse(STATEMENT, args=[party.id])).json()["data"]
    summary = client.get(f"{reverse(ENTRIES)}?party={party.id}").json()["meta"]["summary"]

    for payload in (body, body["totals"], body["totals"]["written_off"], summary):
        assert not {"net", "net_change", "balance"} & set(payload)


def test_the_selector_and_the_route_agree(receivable: dict) -> None:
    party = receivable["party"]

    totals = statement_totals(tenant=party.tenant, party_id=party.id)

    assert totals == {
        "debit": Decimal("2800.00"),
        "credit": Decimal("300.00"),
        "written_off": {"debit": Decimal("0.00"), "credit": Decimal("2500.00")},
    }


# ── Aging (FIFO) ────────────────────────────────────────────────────────────


def test_a_partial_write_off_retires_the_oldest_debt_first(tenant: Any) -> None:
    """LED-04 is not the only reader: aging applies every credit to the oldest
    debit (BR-2), and a write-off is a credit, so forgiving ₹2,000 of a ₹2,300
    ninety-day-old opening leaves ₹300 in 90+ and the recent ₹500 untouched."""
    party = PartyFactory(tenant=tenant, balance="0.00")
    as_of = dt.date(2026, 9, 24)

    def row(days_ago: int, direction: str, amount: str, entry_type: str) -> None:
        LedgerEntry.objects.create(
            tenant=tenant,
            party=party,
            direction=direction,
            amount=Decimal(amount),
            entry_date=as_of - dt.timedelta(days=days_ago),
            entry_type=entry_type,
            source_type=SourceType.MANUAL,
            status=EntryStatus.POSTED,
        )

    row(120, Direction.DEBIT, "2300.00", EntryType.OPENING)
    row(10, Direction.DEBIT, "500.00", EntryType.MANUAL_GAVE)
    row(1, Direction.CREDIT, "2000.00", EntryType.WRITE_OFF)

    buckets = aging_rows(tenant=tenant, as_of=as_of)[str(party.id)]

    assert buckets["90_plus"] == Decimal("300.00")
    assert buckets["0_30"] == Decimal("500.00")
    assert buckets["total"] == Decimal("800.00")
