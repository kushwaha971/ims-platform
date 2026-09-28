"""EXP-03 — the cashbook projection.

Three things are worth a test each, because each is a way the number the
merchant counts the drawer against could be wrong without anything failing:

* the SOURCES — exactly the money events, and nothing that only changes what
  is owed (T-EXP-03-1);
* the CHAIN — every day's opening is the previous day's closing, and the
  opening of a range is everything before it (T-EXP-03-3, T-EXP-03-4);
* the SCOPE — staff see today's till and nothing else, enforced by the server
  (T-EXP-03-11), because the cashbook is the business's whole cash position.
"""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.common.dates import tenant_today
from apps.expenses.tests.helpers import CASHBOOK, expense_url, record
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db


def got(client: Any, party: Any, amount: str, entry_date: str, mode: str | None = "cash") -> Any:
    """A "You got" through the real ledger route."""
    body = {
        "party_id": str(party.id),
        "direction": "credit",
        "amount": amount,
        "entry_date": entry_date,
        "payment_mode": mode,
    }
    response = client.post(
        reverse("v1:ledger-entry-list"),
        body,
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )
    assert response.status_code == 201, response.json()
    return response.json()["data"]


def gave(client: Any, party: Any, amount: str, entry_date: str) -> None:
    response = client.post(
        reverse("v1:ledger-entry-list"),
        {
            "party_id": str(party.id),
            "direction": "debit",
            "amount": amount,
            "entry_date": entry_date,
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )
    assert response.status_code == 201, response.json()


def cashbook(client: Any, **params: Any) -> Any:
    return client.get(reverse(CASHBOOK), params)


def test_only_money_events_appear(tenant: Any, owner: Any, categories: dict) -> None:
    """T-EXP-03-1 / BR-4 / BR-5 / BR-6 / FR-12.

    In: a paid expense (out), a "You got" with a mode (in). Out of the book: an
    unpaid expense (nothing has moved yet), a voided expense (it never did), a
    "You gave" (goods on credit), an opening balance and a reversed receipt.
    """
    party = PartyFactory(tenant=tenant, balance="0.00")
    day = "2026-04-10"
    record(owner, categories["food"], amount="120", expense_date=day)
    got(owner, party, "500.00", day)
    record(
        owner,
        categories["rent"],
        amount="9000",
        expense_date=day,
        paid=False,
        party_id=str(party.id),
        due_on=day,
    )
    voided = record(owner, categories["food"], amount="70", expense_date=day).json()["data"]
    owner.post(
        expense_url(voided["id"], "void"),
        {"reason": "Typed twice"},
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )
    gave(owner, party, "800.00", day)
    reversed_receipt = got(owner, party, "44.00", day)
    owner.post(
        f"{reverse('v1:ledger-entry-detail', args=[reversed_receipt['id']])}/reverse",
        {"reason": "Duplicate"},
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )
    other = PartyFactory(tenant=tenant, balance="0.00")
    owner.post(
        reverse("v1:ledger-entry-list"),
        {
            "party_id": str(other.id),
            "direction": "debit",
            "amount": "300.00",
            "entry_date": "2026-04-01",
            "entry_type": "opening",
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )

    body = cashbook(owner, date_from=day, date_to=day).json()["data"]
    (only_day,) = body["days"]
    kinds = sorted(
        (row["source_type"], row["direction"], row["amount"]) for row in only_day["rows"]
    )
    assert kinds == [("expense", "out", "120.00"), ("ledger_entry", "in", "500.00")]
    assert only_day["voided_count"] == 1
    assert body["range"]["in"] == {"cash": "500.00", "bank": "0.00", "total": "500.00"}
    assert body["range"]["out"] == {"cash": "120.00", "bank": "0.00", "total": "120.00"}


def test_cash_and_bank_are_kept_apart(tenant: Any, owner: Any, categories: dict) -> None:
    """FR-2 / US-EXP-03-2 — UPI money is not notes in the till."""
    party = PartyFactory(tenant=tenant)
    day = "2026-04-11"
    got(owner, party, "700.00", day, mode="upi")
    got(owner, party, "300.00", day, mode="cash")
    record(owner, categories["electricity"], amount="200", expense_date=day, mode="bank")
    rng = cashbook(owner, date_from=day, date_to=day).json()["data"]["range"]
    assert rng["in"] == {"cash": "300.00", "bank": "700.00", "total": "1000.00"}
    assert rng["out"] == {"cash": "0.00", "bank": "200.00", "total": "200.00"}
    assert rng["closing"] == {"cash": "300.00", "bank": "500.00", "total": "800.00"}


def test_openings_chain_from_everything_before_the_range(
    tenant: Any, owner: Any, categories: dict
) -> None:
    """T-EXP-03-3/4 / BR-2 — each day opens where the last one closed.

    A range starting mid-month still opens with what came before it, and a
    zero-activity day in the middle is skipped without breaking the chain.
    """
    party = PartyFactory(tenant=tenant)
    got(owner, party, "1000.00", "2026-04-01")
    record(owner, categories["food"], amount="150", expense_date="2026-04-02")
    got(owner, party, "250.00", "2026-04-05")
    record(owner, categories["transport"], amount="60", expense_date="2026-04-05")

    body = cashbook(owner, date_from="2026-04-02", date_to="2026-04-06").json()["data"]
    assert body["anchor"] is None
    assert body["range"]["opening"]["cash"] == "1000.00"
    days = body["days"]
    assert [d["date"] for d in days] == ["2026-04-05", "2026-04-02"]  # newest first
    fifth, second = days
    assert second["opening"]["cash"] == "1000.00"
    assert second["closing"]["cash"] == "850.00"
    assert fifth["opening"]["cash"] == second["closing"]["cash"]
    assert fifth["closing"]["cash"] == "1040.00"
    assert body["range"]["closing"]["cash"] == "1040.00"
    # Within a day, a passbook: the running balance after each row, in entry order.
    assert [r["running_after"]["cash"] for r in fifth["rows"]] == ["1100.00", "1040.00"]


def test_a_void_erases_the_row_from_its_own_day(owner: Any, categories: dict) -> None:
    """T-EXP-01-15 / T-EXP-03-7 — the cash never actually moved."""
    day = "2026-04-12"
    expense = record(owner, categories["food"], amount="120", expense_date=day).json()["data"]
    before = cashbook(owner, date_from=day, date_to=day).json()["data"]
    assert before["range"]["out"]["total"] == "120.00"
    owner.post(
        expense_url(expense["id"], "void"),
        {"reason": "Wrong amount"},
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )
    after = cashbook(owner, date_from=day, date_to=day).json()["data"]
    assert after["range"]["out"]["total"] == "0.00"
    assert after["days"] == []


def test_the_category_breakdown_sums_to_the_expense_outflow(owner: Any, categories: dict) -> None:
    """FR-9 / AC-6 — the colours and names come from EXP-02, biggest first."""
    record(owner, categories["rent"], amount="5000", expense_date="2026-04-01")
    record(owner, categories["food"], amount="100", expense_date="2026-04-01")
    record(owner, categories["food"], amount="50", expense_date="2026-04-02")
    body = cashbook(owner, date_from="2026-04-01", date_to="2026-04-30").json()["data"]
    rows = body["breakdown"]["by_category"]
    assert [(r["name"], r["amount"]) for r in rows] == [("Rent", "5000.00"), ("Food", "150.00")]
    assert all(r["color"].startswith("viz-") for r in rows)
    total = sum(Decimal(r["amount"]) for r in rows)
    assert str(total) == body["range"]["out"]["total"]


def test_one_bucket_omits_the_other(owner: Any, categories: dict) -> None:
    """A bucket not asked for is ABSENT, not "0.00" — a zero would be a claim."""
    record(owner, categories["food"], amount="10", expense_date="2026-04-01", mode="upi")
    body = cashbook(owner, date_from="2026-04-01", date_to="2026-04-01", bucket="cash").json()
    rng = body["data"]["range"]
    assert set(rng["closing"]) == {"cash", "total"}
    assert body["data"]["days"] == []


def test_staff_see_todays_till_and_nothing_else(
    tenant: Any, api_as: Any, owner: Any, categories: dict
) -> None:
    """FR-13 / BR-12 / T-EXP-03-11 — enforced by the server, not by a hidden control."""
    today = tenant_today(tenant)
    record(owner, categories["food"], amount="40", expense_date=today.isoformat())
    record(owner, categories["food"], amount="90", expense_date=today.isoformat(), mode="upi")
    staff, _ = api_as(tenant, role="staff")

    plain = cashbook(staff)
    assert plain.status_code == 200, plain.json()
    data = plain.json()["data"]
    assert data["scope"] == "today_cash"
    assert set(data["range"]["out"]) == {"cash", "total"}
    assert data["range"]["out"]["cash"] == "40.00"

    yesterday = (today - dt.timedelta(days=1)).isoformat()
    assert cashbook(staff, date_from=yesterday, date_to=yesterday).status_code == 403
    assert cashbook(staff, bucket="bank").status_code == 403
    assert cashbook(staff, bucket="all").status_code == 403


def test_the_accountant_reads_any_range(tenant: Any, api_as: Any) -> None:
    accountant, _ = api_as(tenant, role="accountant")
    response = cashbook(accountant, date_from="2026-04-01", date_to="2026-04-30")
    assert response.status_code == 200
    assert response.json()["data"]["scope"] == "full"


@pytest.mark.parametrize(
    ("params", "field"),
    [
        ({"date_from": "2025-01-01", "date_to": "2026-04-01"}, "date_to"),
        ({"date_from": "2026-04-10", "date_to": "2026-04-01"}, "date_to"),
        ({"date_from": "yesterday"}, "date_from"),
        ({"bucket": "wallet"}, "bucket"),
    ],
)
def test_bad_ranges_are_refused(owner: Any, params: dict, field: str) -> None:
    """§10 — a year at most, in order, real dates, a known bucket."""
    response = cashbook(owner, **params)
    assert response.status_code == 400
    assert field in response.json()["error"]["details"]


def test_another_tenants_money_never_appears(
    tenant: Any, other_tenant: Any, api_as: Any, owner: Any, categories: dict
) -> None:
    record(owner, categories["food"], amount="500", expense_date="2026-04-01")
    stranger, _ = api_as(other_tenant)
    body = cashbook(stranger, date_from="2026-04-01", date_to="2026-04-01").json()["data"]
    assert body["days"] == []
    assert body["range"]["opening"]["total"] == "0.00"
