"""Library P0 — the reading room's month: fees in, expenses out, what is left.

The defects these prevent: a fee CHARGED but not paid counted as income; a void expense
counted as spent; the library reading the expenses app directly (the spend seam is the
only road); and a period the owner did not ask for.
"""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal as D
from typing import Any

import pytest
from django.urls import reverse

from apps.common.dates import tenant_today
from apps.common.management.commands.seed_reference_data import seed_expense_categories
from apps.expenses.models import ExpenseCategory
from apps.library.models import LibraryMembershipType
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def room(api_as: Any, library_on: Any) -> dict:
    owner, _ = api_as(library_on, role="owner")
    seed_expense_categories(library_on)
    kind = LibraryMembershipType.objects.create(
        tenant=library_on, name="Monthly", validity_months=1, fee_amount=D("900.00")
    )

    def admit(name: str, mobile: str, collect: bool) -> None:
        body: dict = {
            "membership_type_id": str(kind.id),
            "party_id": str(PartyFactory(tenant=library_on, name=name, mobile=mobile).id),
        }
        if collect:
            body["collect_fees"] = {"mode_breakup": [{"mode": "upi", "amount": "900.00"}]}
        made = owner.post(
            reverse("v1:library-members"), body, format="json", HTTP_IDEMPOTENCY_KEY=name
        )
        assert made.status_code == 201, made.json()

    return {"client": owner, "tenant": library_on, "admit": admit}


def spend(room: dict, amount: str, code: str, app: str = "library") -> dict:
    """An expense recorded from the Library's Expenses page, which sends its app."""
    category = ExpenseCategory.objects.for_tenant(room["tenant"]).get(system_code=code)
    made = room["client"].post(
        reverse("v1:expense-list"),
        {
            "amount": amount,
            "expense_date": tenant_today(room["tenant"]).isoformat(),
            "category_id": str(category.id),
            "mode": "cash",
            "app": app,
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )
    assert made.status_code == 201, made.json()
    return made.json()["data"]


def test_fees_paid_less_expenses_is_the_months_profit(room: dict) -> None:
    room["admit"]("Rahul", "9876500011", collect=True)
    room["admit"]("Imran", "9876500012", collect=False)  # charged, not paid: not income
    spend(room, "500.00", ExpenseCategory.objects.for_tenant(room["tenant"]).first().system_code)
    page = room["client"].get(reverse("v1:library-profit")).json()["data"]
    assert page["income_total"] == "900.00"
    assert page["expenses_total"] == "500.00" and len(page["expenses"]) == 1
    assert page["profit"] == "400.00"
    assert all(row["amount"] != "0.00" for row in page["income"])


def test_the_shops_expenses_are_not_the_librarys(room: dict) -> None:
    """QA B10 / DEC-019 — the Shop's rent was being subtracted from the reading room's
    fees. An expense belongs to the app it was recorded in, and only the Library's own
    is the Library's spend."""
    code = ExpenseCategory.objects.for_tenant(room["tenant"]).first().system_code
    spend(room, "900.00", code, app="shop")
    spend(room, "300.00", code)
    page = room["client"].get(reverse("v1:library-profit")).json()["data"]
    assert page["expenses_total"] == "300.00"


def test_a_void_expense_was_never_spent_and_a_bad_period_is_refused(room: dict) -> None:
    from apps.expenses.tests.helpers import expense_url

    code = ExpenseCategory.objects.for_tenant(room["tenant"]).first().system_code
    made = spend(room, "300.00", code)
    room["client"].post(
        expense_url(made["id"], "void"),
        {"reason": "Entered twice"},
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )
    page = room["client"].get(reverse("v1:library-profit")).json()["data"]
    assert page["expenses_total"] == "0.00"
    today = tenant_today(room["tenant"])
    refused = room["client"].get(
        reverse("v1:library-profit"),
        {"from": today.isoformat(), "to": (today - dt.timedelta(days=1)).isoformat()},
    )
    assert refused.status_code == 400


def test_the_library_reads_spend_only_through_the_seam() -> None:
    import ast
    import pathlib

    for path in pathlib.Path("apps/library").rglob("*.py"):
        if "tests" in path.parts:
            continue
        for node in ast.walk(ast.parse(path.read_text())):
            if isinstance(node, ast.ImportFrom):
                assert not (node.module or "").startswith("apps.expenses"), path
