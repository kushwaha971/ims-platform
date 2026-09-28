"""EXP-01 — recording an expense, and what it does (and does not do) to the ledger.

The rule the whole feature turns on is BR-2: a PAID expense posts nothing to
the ledger and appears only in the cashbook; an UNPAID one posts exactly one
credit against the party it is owed to. Every test here that touches the
ledger is protecting one half of that sentence.
"""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.common.audit import AuditAction
from apps.common.dates import tenant_today
from apps.expenses.models import Expense
from apps.expenses.tests.helpers import EXPENSES, record
from apps.ledger.constants import EntryStatus, EntryType, SourceType
from apps.ledger.models import LedgerEntry
from apps.ledger.selectors.entry import computed_balance
from apps.parties.constants import PartyStatus
from apps.platform_app.models import AuditLog
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db


# ── The paid path ──────────────────────────────────────────────────────────


def test_a_paid_expense_is_numbered_and_posts_nothing_to_the_ledger(
    tenant: Any, owner: Any, categories: dict
) -> None:
    """AC-1 / T-EXP-01-1 first half.

    A cash tea expense is money out of the drawer, not a debt to anybody, so a
    ledger row for it would be a line in somebody's khata that nobody owes.
    """
    response = record(owner, categories["food"], amount="500")
    assert response.status_code == 201, response.json()
    data = response.json()["data"]
    assert data["number"] == "EXP/26-27/0001"
    assert data["amount"] == "500.00"
    assert data["mode"] == "cash"
    assert data["paid"] is True
    assert data["status"] == "recorded"
    assert data["category"]["name"] == "Food"
    assert data["category"]["color"].startswith("viz-")
    assert "party_balance" not in (response.json().get("meta") or {})
    assert not LedgerEntry.objects.filter(tenant=tenant).exists()
    assert AuditLog.objects.filter(action=AuditAction.EXPENSE_RECORDED).count() == 1


def test_numbers_follow_the_financial_year_of_the_expense_date(
    owner: Any, categories: dict
) -> None:
    """T-EXP-01-2 / BR-4 / EC-4 — a March expense takes LAST year's series.

    The number is a statement about which year's books the expense belongs to,
    so it is derived from the expense's date, not from the day it was typed in.
    """
    first = record(owner, categories["rent"], expense_date="2026-04-02").json()["data"]
    backdated = record(owner, categories["rent"], expense_date="2026-03-15").json()["data"]
    second = record(owner, categories["rent"], expense_date="2026-04-03").json()["data"]
    assert first["number"] == "EXP/26-27/0001"
    assert backdated["number"] == "EXP/25-26/0001"
    assert second["number"] == "EXP/26-27/0002"


def test_the_upi_app_is_kept_for_upi_and_dropped_for_every_other_mode(
    owner: Any, categories: dict
) -> None:
    """The flattened "PhonePe" chip writes `mode=upi, upi_app=phonepe`.

    A leftover app on a cash expense is dropped silently rather than refused:
    the client keeps the pick in form state when the merchant switches chips,
    and a form that refuses a field it no longer shows cannot say why.
    """
    upi = record(owner, categories["transport"], mode="upi", upi_app="phonepe").json()["data"]
    assert (upi["mode"], upi["upi_app"]) == ("upi", "phonepe")
    cash = record(owner, categories["transport"], mode="cash", upi_app="phonepe").json()["data"]
    assert (cash["mode"], cash["upi_app"]) == ("cash", None)


def test_validation_names_every_bad_field_at_once(owner: Any) -> None:
    """§10 — a merchant who typed three things wrong is told all three.

    A future date is refused in the TENANT's calendar, the same rule the
    ledger applies, because the two share one parser.
    """
    tomorrow = (dt.date.today() + dt.timedelta(days=2)).isoformat()
    response = owner.post(
        reverse(EXPENSES),
        {"amount": "0", "expense_date": tomorrow, "mode": "barter"},
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )
    assert response.status_code == 400
    details = response.json()["error"]["details"]
    assert {"amount", "expense_date", "category_id", "mode"} <= set(details)


def test_another_tenants_category_is_not_accepted(
    owner: Any, other_tenant: Any, categories: dict
) -> None:
    """Canon §0.11 rule 2 — a foreign id is never usable, and never confirmed."""
    from apps.common.management.commands.seed_reference_data import seed_expense_categories
    from apps.expenses.models import ExpenseCategory

    seed_expense_categories(other_tenant)
    foreign = ExpenseCategory.objects.for_tenant(other_tenant).first()
    response = record(owner, foreign)
    assert response.status_code == 400
    assert "category_id" in response.json()["error"]["details"]


def test_a_paid_expense_may_name_a_party_without_touching_their_khata(
    tenant: Any, owner: Any, categories: dict
) -> None:
    """FR-6 — "Paid to" on a paid expense is information, not a balance move."""
    party = PartyFactory(tenant=tenant, balance="0.00")
    response = record(owner, categories["rent"], party_id=str(party.id))
    assert response.status_code == 201
    assert response.json()["data"]["party"]["name"] == party.name
    party.refresh_from_db()
    assert party.balance == Decimal("0.00")
    assert not LedgerEntry.objects.filter(party=party).exists()


# ── The unpaid path ────────────────────────────────────────────────────────


def test_an_unpaid_expense_posts_exactly_one_credit_against_the_party(
    tenant: Any, owner: Any, categories: dict
) -> None:
    """AC-3 / T-EXP-01-1 second half.

    ₹12,000 rent owed to the landlord is one ledger `credit` with
    `entry_type='expense'`, `source_type='expense'` and the expense's id — the
    triple that lets LED-03 refuse to correct it directly and lets the void
    find it again. The party's balance moves to "you will give ₹12,000", and
    the cache matches a full replay of the ledger.
    """
    landlord = PartyFactory(tenant=tenant, balance="0.00", is_customer=False, is_supplier=True)
    response = record(
        owner,
        categories["rent"],
        amount="12000",
        paid=False,
        party_id=str(landlord.id),
        due_on="2026-04-05",
        mode="upi",
        upi_app="gpay",
        reference="UTR1",
    )
    assert response.status_code == 201, response.json()
    body = response.json()
    expense = Expense.objects.get(pk=body["data"]["id"])
    # No "how" on money that has not moved.
    assert (expense.mode, expense.upi_app, expense.reference) == (None, None, "")
    assert body["meta"]["party_balance"] == "-12000.00"

    entries = LedgerEntry.objects.filter(party=landlord)
    assert entries.count() == 1
    entry = entries.get()
    assert entry.direction == "credit"
    assert entry.entry_type == EntryType.EXPENSE
    assert entry.source_type == SourceType.EXPENSE
    assert entry.source_id == expense.id
    assert entry.entry_date == dt.date(2026, 4, 1)
    assert entry.amount == Decimal("12000.00")
    assert entry.payment_mode is None
    # The khata row's title says what the credit is for.
    assert entry.note.startswith("Rent · EXP/26-27/0001")

    landlord.refresh_from_db()
    assert landlord.balance == Decimal("-12000.00")
    assert landlord.balance == computed_balance(tenant=tenant, party_id=landlord.id)


def test_an_unpaid_expense_needs_a_party_and_a_due_date(owner: Any, categories: dict) -> None:
    """T-EXP-01-4 / FR-6 — a debt with no creditor has no khata to live in."""
    response = record(owner, categories["rent"], paid=False)
    assert response.status_code == 400
    details = response.json()["error"]["details"]
    assert details["party_id"] == ["Choose who you owe this to."]
    assert "due_on" in details


def test_a_due_date_before_the_expense_is_refused(
    tenant: Any, owner: Any, categories: dict
) -> None:
    party = PartyFactory(tenant=tenant)
    response = record(
        owner, categories["rent"], paid=False, party_id=str(party.id), due_on="2026-03-01"
    )
    assert response.status_code == 400
    assert "due_on" in response.json()["error"]["details"]


def test_an_archived_party_cannot_be_owed_a_new_expense(
    tenant: Any, owner: Any, categories: dict
) -> None:
    """The ledger's BR-9: an archived khata is closed. Restore first."""
    party = PartyFactory(tenant=tenant, status=PartyStatus.ARCHIVED)
    response = record(
        owner, categories["rent"], paid=False, party_id=str(party.id), due_on="2026-04-05"
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "party_archived"
    assert not Expense.objects.exists()


def test_another_tenants_party_is_not_found(
    owner: Any, other_tenant: Any, categories: dict
) -> None:
    foreign = PartyFactory(tenant=other_tenant)
    response = record(
        owner, categories["rent"], paid=False, party_id=str(foreign.id), due_on="2026-04-05"
    )
    assert response.status_code == 404


def test_the_ledger_refuses_to_correct_an_expense_line_directly(
    tenant: Any, owner: Any, categories: dict
) -> None:
    """LED-03 BR-6 — the expense is the document; its void is the way to undo it.

    Reversing the ledger line alone would leave an expense saying one thing and
    the khata another.
    """
    party = PartyFactory(tenant=tenant)
    record(owner, categories["rent"], paid=False, party_id=str(party.id), due_on="2026-04-05")
    entry = LedgerEntry.objects.get(party=party)
    response = owner.post(
        f"{reverse('v1:ledger-entry-detail', args=[entry.id])}/reverse",
        {"reason": "Wrong party"},
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "use_document_void"
    entry.refresh_from_db()
    assert entry.status == EntryStatus.POSTED


# ── Idempotency and permissions ─────────────────────────────────────────────


def test_a_retried_save_replays_instead_of_recording_twice(owner: Any, categories: dict) -> None:
    """T-EXP-01-8 / EC-7 — a lost response on a slow connection, tapped again."""
    key = str(uuid.uuid4())
    first = record(owner, categories["food"], key=key)
    again = record(owner, categories["food"], key=key)
    assert first.status_code == again.status_code == 201
    assert again.json()["data"]["id"] == first.json()["data"]["id"]
    assert Expense.objects.count() == 1
    different = record(owner, categories["food"], key=key, amount="600")
    assert different.status_code == 409
    assert different.json()["error"]["code"] == "idempotency_conflict"


def test_the_accountant_reads_but_cannot_record(
    tenant: Any, api_as: Any, owner: Any, categories: dict
) -> None:
    """T-EXP-01-10 — reads and exports for the CA, never writes."""
    record(owner, categories["food"])
    accountant, _ = api_as(tenant, role="accountant")
    assert record(accountant, categories["food"]).status_code == 403
    listing = accountant.get(reverse(EXPENSES))
    assert listing.status_code == 200
    assert len(listing.json()["data"]) == 1


def test_staff_record_at_the_counter(tenant: Any, api_as: Any, categories: dict) -> None:
    """The registry grants staff `expenses.expense.write` — the auto fare case."""
    staff, _ = api_as(tenant, role="staff")
    assert record(staff, categories["transport"], amount="60").status_code == 201


def test_a_disabled_module_answers_module_disabled(
    tenant: Any, owner: Any, categories: dict
) -> None:
    """EC-8 — a tenant without Expenses is told so, not "ask for rights"."""
    tenant.enabled_modules = [m for m in tenant.enabled_modules if m != "expenses"]
    tenant.save(update_fields=["enabled_modules"])
    response = owner.get(reverse(EXPENSES))
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "module_disabled"


def test_patch_and_delete_are_not_routes(tenant: Any, owner: Any, categories: dict) -> None:
    """BR-8 — void is how an expense is withdrawn; the 24 h edit is not built."""
    expense_id = record(owner, categories["food"]).json()["data"]["id"]
    detail = reverse("v1:expense-detail", args=[expense_id])
    assert owner.patch(detail, {"note": "x"}, format="json").status_code == 405
    assert owner.delete(detail).status_code == 405


# ── The list ────────────────────────────────────────────────────────────────


def _seed_month(owner: Any, categories: dict, tenant: Any) -> None:
    party = PartyFactory(tenant=tenant, name="Landlord Sharma")
    record(owner, categories["food"], amount="100", expense_date="2026-04-01")
    record(owner, categories["food"], amount="50", expense_date="2026-04-02", mode="upi")
    record(
        owner,
        categories["rent"],
        amount="12000",
        expense_date="2026-04-03",
        note="April rent",
        paid=False,
        party_id=str(party.id),
        due_on="2026-04-05",
    )
    record(owner, categories["transport"], amount="300", expense_date="2026-05-01")


def test_totals_are_over_the_filtered_set_not_the_page(
    tenant: Any, owner: Any, categories: dict
) -> None:
    """T-EXP-01-9 — the header total is the whole filter, and the top five follow it."""
    _seed_month(owner, categories, tenant)
    response = owner.get(
        reverse(EXPENSES), {"date_from": "2026-04-01", "date_to": "2026-04-30", "page_size": 1}
    )
    body = response.json()
    assert len(body["data"]) == 1
    totals = body["meta"]["totals"]
    assert totals["amount"] == "12150.00"
    assert totals["count"] == 3
    assert [row["name"] for row in totals["by_category"]] == ["Rent", "Food"]
    assert body["meta"]["total"] == 3


def test_filters_by_category_mode_tab_and_search(tenant: Any, owner: Any, categories: dict) -> None:
    """Each declared filter actually narrows — a filter that is ignored widens
    the list the merchant believes they narrowed."""
    _seed_month(owner, categories, tenant)
    url = reverse(EXPENSES)

    food = owner.get(url, {"category": str(categories["food"].id)}).json()
    assert food["meta"]["totals"]["count"] == 2
    both = owner.get(
        url, {"category": f"{categories['food'].id},{categories['transport'].id}"}
    ).json()
    assert both["meta"]["totals"]["count"] == 3
    assert owner.get(url, {"mode": "upi"}).json()["meta"]["totals"]["amount"] == "50.00"
    assert owner.get(url, {"paid": "false"}).json()["meta"]["totals"]["count"] == 1
    assert owner.get(url, {"q": "sharma"}).json()["meta"]["totals"]["count"] == 1
    assert owner.get(url, {"q": "april"}).json()["meta"]["totals"]["count"] == 1
    assert owner.get(url, {"category": "not-a-uuid"}).json()["meta"]["totals"]["count"] == 0


def test_the_list_is_newest_first(tenant: Any, owner: Any, categories: dict) -> None:
    _seed_month(owner, categories, tenant)
    dates = [row["expense_date"] for row in owner.get(reverse(EXPENSES)).json()["data"]]
    assert dates == sorted(dates, reverse=True)


def test_today_is_the_tenants_today(tenant: Any, owner: Any, categories: dict) -> None:
    """An expense dated the tenant's today is accepted, whatever the server's UTC date."""
    response = record(owner, categories["food"], expense_date=tenant_today(tenant).isoformat())
    assert response.status_code == 201
