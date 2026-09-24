"""EXP-01 FR-12 — voiding an expense, and the ledger line it takes with it.

Void is terminal, keeps the number, needs a reason, and — when the expense was
unpaid — reverses its credit with a new ledger row dated the VOID date and
sourced to the expense (C6, LED-10 BR-5/BR-6). The balance must come back to
where it was and still equal a full replay of the ledger.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

import pytest

from apps.common.audit import AuditAction
from apps.common.dates import tenant_today
from apps.expenses.models import Expense
from apps.expenses.tests.helpers import expense_url, record
from apps.ledger.constants import EntryStatus, EntryType, SourceType
from apps.ledger.models import LedgerEntry
from apps.ledger.selectors.entry import computed_balance
from apps.parties.constants import PartyStatus
from apps.platform_app.models import AuditLog
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db


def void(
    client: Any, expense_id: Any, reason: str | None = "Wrong amount", key: str | None = None
) -> Any:
    body = {} if reason is None else {"reason": reason}
    return client.post(
        expense_url(expense_id, "void"),
        body,
        format="json",
        HTTP_IDEMPOTENCY_KEY=key or str(uuid.uuid4()),
    )


def test_voiding_a_paid_expense_keeps_the_row_and_its_number(owner: Any, categories: dict) -> None:
    """AC-6 — status void, reason stored, number retained, no ledger row appears."""
    created = record(owner, categories["food"]).json()["data"]
    response = void(owner, created["id"])
    assert response.status_code == 200, response.json()
    data = response.json()["data"]
    assert data["status"] == "void"
    assert data["void_reason"] == "Wrong amount"
    assert data["number"] == created["number"]
    assert data["voided_by"] is not None
    assert not LedgerEntry.objects.exists()
    assert AuditLog.objects.filter(action=AuditAction.EXPENSE_VOIDED).count() == 1
    # And the next expense does not reuse the number (T-EXP-01-2).
    assert record(owner, categories["food"]).json()["data"]["number"] == "EXP/26-27/0002"


def test_voiding_an_unpaid_expense_reverses_its_credit_dated_today(
    tenant: Any, owner: Any, categories: dict
) -> None:
    """T-EXP-01-6 / C6 — the reversal is the DOCUMENT void's shape, not LED-03's.

    Dated today (a void is an event on its own date) and sourced to the expense
    (so the pair groups by document), with the original marked reversed. The
    landlord's balance returns to zero and equals a full replay.
    """
    landlord = PartyFactory(tenant=tenant, balance="0.00")
    created = record(
        owner,
        categories["rent"],
        amount="12000",
        paid=False,
        party_id=str(landlord.id),
        due_on="2026-04-05",
    ).json()["data"]

    response = void(owner, created["id"], reason="Landlord waived it")
    assert response.status_code == 200, response.json()
    assert response.json()["meta"]["party_balance"] == "0.00"

    original = LedgerEntry.objects.get(entry_type=EntryType.EXPENSE)
    reversal = LedgerEntry.objects.get(entry_type=EntryType.REVERSAL)
    assert original.status == EntryStatus.REVERSED
    assert original.reversed_by_id == reversal.id
    assert reversal.reverses_id == original.id
    assert reversal.direction == "debit"
    assert reversal.amount == Decimal("12000.00")
    assert reversal.source_type == SourceType.EXPENSE
    assert str(reversal.source_id) == created["id"]
    assert reversal.entry_date == tenant_today(tenant)
    assert reversal.reason == "Landlord waived it"
    assert response.json()["meta"]["reversal_entry_id"] == str(reversal.id)

    landlord.refresh_from_db()
    assert landlord.balance == Decimal("0.00")
    assert landlord.balance == computed_balance(tenant=tenant, party_id=landlord.id)


def test_a_second_void_is_refused_and_a_retry_replays(owner: Any, categories: dict) -> None:
    """BR-8 terminal — and a lost response retried with its key is the first 200,
    not a confusing 409 about something the merchant never saw succeed."""
    expense_id = record(owner, categories["food"]).json()["data"]["id"]
    key = str(uuid.uuid4())
    assert void(owner, expense_id, key=key).status_code == 200
    assert void(owner, expense_id, key=key).status_code == 200
    again = void(owner, expense_id)
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "expense_already_void"


@pytest.mark.parametrize("reason", [None, "", "no"])
def test_a_void_needs_a_real_reason(owner: Any, categories: dict, reason: str | None) -> None:
    """BR-8 — 3 to 160 characters, the same bar a ledger correction clears."""
    expense_id = record(owner, categories["food"]).json()["data"]["id"]
    response = void(owner, expense_id, reason=reason)
    assert response.status_code == 400
    assert "reason" in response.json()["error"]["details"]
    assert Expense.objects.get(pk=expense_id).status == "recorded"


def test_staff_cannot_void(tenant: Any, api_as: Any, owner: Any, categories: dict) -> None:
    """§12 — voiding is `expenses.expense.void`, which staff do not hold."""
    expense_id = record(owner, categories["food"]).json()["data"]["id"]
    staff, _ = api_as(tenant, role="staff")
    assert void(staff, expense_id).status_code == 403


def test_another_tenants_expense_is_not_found(
    other_tenant: Any, api_as: Any, owner: Any, categories: dict
) -> None:
    expense_id = record(owner, categories["food"]).json()["data"]["id"]
    stranger, _ = api_as(other_tenant)
    assert void(stranger, expense_id).status_code == 404
    assert stranger.get(expense_url(expense_id)).status_code == 404


def test_an_archived_partys_expense_cannot_be_voided_until_restored(
    tenant: Any, owner: Any, categories: dict
) -> None:
    """EC-6 — reversing would silently move the balance of a filed-away party."""
    party = PartyFactory(tenant=tenant, balance="0.00")
    expense_id = record(
        owner, categories["rent"], paid=False, party_id=str(party.id), due_on="2026-04-05"
    ).json()["data"]["id"]
    party.status = PartyStatus.ARCHIVED
    party.save(update_fields=["status"])
    response = void(owner, expense_id)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "party_archived"
    assert Expense.objects.get(pk=expense_id).status == "recorded"


def test_the_void_tab_lists_voids_and_the_default_list_hides_them(
    owner: Any, categories: dict
) -> None:
    """FR-9 — "Total" never counts money the merchant said did not go out."""
    from django.urls import reverse

    from apps.expenses.tests.helpers import EXPENSES

    kept = record(owner, categories["food"], amount="100").json()["data"]
    gone = record(owner, categories["food"], amount="900").json()["data"]
    void(owner, gone["id"])
    default = owner.get(reverse(EXPENSES)).json()
    assert [row["id"] for row in default["data"]] == [kept["id"]]
    assert default["meta"]["totals"]["amount"] == "100.00"
    voids = owner.get(reverse(EXPENSES), {"status": "void"}).json()
    assert [row["id"] for row in voids["data"]] == [gone["id"]]
