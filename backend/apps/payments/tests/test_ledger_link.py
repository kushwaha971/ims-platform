"""LED-10 — one posting service for every document, and the khata naming its source.

T-LED-10-2/-3/-4 against `ledger.services.postings`, T-LED-10-5 end to end
(§22.14's worked example up to the void, which is SAL-05's), T-LED-10-6, and
FR-5: the timeline and the statement carry `source.number`/`kind`.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest
from django.db import transaction

from apps.common.context import Ctx
from apps.ledger.constants import EntryType, SourceType
from apps.ledger.models import LedgerEntry
from apps.ledger.services.postings import (
    LedgerPostingError,
    post_source_entry,
    reverse_source_entries,
)
from apps.parties.services.balance import lock_party
from apps.payments.tests.conftest import cash_lines, pay, upi, void

pytestmark = pytest.mark.django_db


def test_a_second_posting_for_the_same_source_returns_the_standing_entry(
    shop: Any, make_party: Any
) -> None:
    """T-LED-10-2 / BR-1 — idempotent by (source_type, source_id, entry_type)."""
    import uuid

    party = make_party()
    source = uuid.uuid4()
    with transaction.atomic():
        locked = lock_party(tenant=shop, party_id=party.id)
        kwargs = dict(
            ctx=Ctx.system(shop),
            party=locked,
            amount=Decimal("100.00"),
            entry_date=dt.date(2026, 9, 1),
            entry_type=EntryType.INVOICE,
            source_type=SourceType.SALES_DOCUMENT,
            source_id=source,
            note="Invoice X",
        )
        first, _ = post_source_entry(**kwargs)
        second, balance = post_source_entry(**kwargs)
    assert first.pk == second.pk and balance == Decimal("100.00")
    assert LedgerEntry.objects.count() == 1


def test_a_posting_off_the_matrix_is_a_programming_error(shop: Any, make_party: Any) -> None:
    """§10 — `payment_in` from a sales document is refused, not written."""
    import uuid

    party = make_party()
    with pytest.raises(LedgerPostingError), transaction.atomic():
        post_source_entry(
            ctx=Ctx.system(shop),
            party=party,
            amount=Decimal("1"),
            entry_date=dt.date(2026, 9, 1),
            entry_type=EntryType.PAYMENT_IN,
            source_type=SourceType.SALES_DOCUMENT,
            source_id=uuid.uuid4(),
        )
    assert not LedgerEntry.objects.exists()


@pytest.mark.django_db(transaction=True)
def test_posting_outside_the_callers_transaction_is_refused(shop: Any, make_party: Any) -> None:
    """T-LED-10-4 / FR-1 — no open transaction means a half-written document; refused."""
    import uuid

    party = make_party()
    with pytest.raises(LedgerPostingError):
        post_source_entry(
            ctx=Ctx.system(shop),
            party=party,
            amount=Decimal("1"),
            entry_date=dt.date(2026, 9, 1),
            entry_type=EntryType.INVOICE,
            source_type=SourceType.SALES_DOCUMENT,
            source_id=uuid.uuid4(),
        )
    assert not LedgerEntry.objects.exists()


def test_reversing_a_source_undoes_every_posted_line_once(
    owner: Any, make_party: Any, invoice_for: Any, shop: Any
) -> None:
    """T-LED-10-3 — `reverse_source_entries` on an invoice: one reversal, dated today,
    sourced to the DOCUMENT; a second call finds nothing standing and writes nothing."""
    party = make_party()
    inv = invoice_for(party, "898.00", days_ago=10)
    with transaction.atomic():
        reversals, balance = reverse_source_entries(
            ctx=Ctx.system(shop),
            source_type=SourceType.SALES_DOCUMENT,
            source_id=inv["id"],
            reason="Wrong party",
        )
        again, _ = reverse_source_entries(
            ctx=Ctx.system(shop),
            source_type=SourceType.SALES_DOCUMENT,
            source_id=inv["id"],
            reason="Wrong party",
        )
    assert len(reversals) == 1 and again == []
    assert str(reversals[0].source_id) == inv["id"] and balance == Decimal("0.00")


def test_the_worked_example_moves_the_balance_898_then_398(
    owner: Any, make_party: Any, invoice_for: Any
) -> None:
    """T-LED-10-5 (to the void, which SAL-05 owns) — invoice ₹898, then ₹500 auto."""
    ramesh = make_party()
    invoice_for(ramesh, "898.00")
    assert (
        pay(owner, party_id=str(ramesh.id), mode_breakup=upi("500.00")).json()["meta"][
            "party_balance"
        ]
        == "398.00"
    )


def test_a_payment_line_cannot_be_reversed_from_the_khata(owner: Any, make_party: Any) -> None:
    """T-LED-10-6 / FR-7 — 409 `use_document_void`: void the payment instead."""
    party = make_party()
    pay(owner, party_id=str(party.id), mode_breakup=cash_lines("100.00"))
    entry = LedgerEntry.objects.get(entry_type=EntryType.PAYMENT_IN)
    response = owner.post(
        f"/api/v1/ledger-entries/{entry.id}/reverse",
        {"reason": "Typed twice"},
        format="json",
        HTTP_IDEMPOTENCY_KEY="rev-1",
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "use_document_void"


def test_the_timeline_names_each_document_by_number_and_kind(
    owner: Any, make_party: Any, invoice_for: Any
) -> None:
    """FR-5 / US-LED-10-3 — the khata's invoice row and receipt row carry their numbers,
    and a voided receipt's reversal links to the same receipt."""
    party = make_party()
    inv = invoice_for(party, "898.00")
    paid = pay(owner, party_id=str(party.id), mode_breakup=cash_lines("500.00")).json()["data"]
    void(owner, paid["id"])
    rows = owner.get(f"/api/v1/parties/{party.id}/ledger-entries?include_reversed=true").json()[
        "data"
    ]
    by_type = {row["entry_type"]: row["source"] for row in rows}
    assert by_type["invoice"]["number"] == inv["number"]
    assert by_type["invoice"]["kind"] == "invoice"
    assert by_type["payment_in"] == {
        "type": "payment",
        "id": paid["id"],
        "number": paid["number"],
        "status": "void",
        "kind": "payment_in",
        "url": None,
    }
    assert by_type["reversal"]["number"] == paid["number"]

    statement = owner.get(f"/api/v1/parties/{party.id}/statement?include_corrections=true")
    numbers = {row["source"]["number"] for row in statement.json()["data"]["rows"] if row["source"]}
    assert {inv["number"], paid["number"]} <= numbers
