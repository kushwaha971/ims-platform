"""DEC-019 (QA B10) — an expense belongs to the app it was recorded in.

The QA report found the Shop's expenses in the Library's profit: every expense
was the business's, and each app's money view read all of them. Each expense now
carries its `app`; these tests name what goes wrong without it.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.urls import reverse

from apps.expenses.models import Expense
from apps.expenses.tests.helpers import EXPENSES, record
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def with_library(tenant: Any) -> Any:
    """The business runs the Library beside the Shop."""
    for row, field in ((tenant.plan, "modules"), (tenant.partner, "allowed_modules")):
        setattr(row, field, [*getattr(row, field), "library", "dues"])
        row.save(update_fields=[field])
    tenant.enabled_modules = [*tenant.enabled_modules, "library"]
    tenant.save(update_fields=["enabled_modules"])
    return tenant


def test_an_older_client_that_names_no_app_records_in_the_shop(
    owner: Any, categories: dict
) -> None:
    response = record(owner, categories["food"])
    assert response.status_code == 201, response.json()
    assert response.json()["data"]["app"] == "shop"


def test_an_app_the_business_does_not_run_is_refused(owner: Any, categories: dict) -> None:
    """A Library expense in a business with no library would vanish from every page."""
    response = record(owner, categories["food"], app="library")
    assert response.status_code == 400
    assert "app" in response.json()["error"]["details"]


def test_the_library_records_an_expense_when_it_is_paid(
    owner: Any, categories: dict, with_library: Any
) -> None:
    """An expense on credit is owed to a supplier in the Shop's book, so the Library
    cannot post one; it is told so in words rather than handed a Shop debt."""
    supplier = PartyFactory(tenant=with_library, is_supplier=True)
    refused = record(
        owner,
        categories["food"],
        app="library",
        paid=False,
        party_id=str(supplier.id),
        due_on="2026-04-30",
    )
    assert refused.status_code == 400
    assert "paid" in refused.json()["error"]["details"]

    paid = record(owner, categories["food"], app="library")
    assert paid.status_code == 201, paid.json()
    assert Expense.objects.get(pk=paid.json()["data"]["id"]).app == "library"


def test_each_apps_expenses_page_lists_its_own(
    owner: Any, categories: dict, with_library: Any
) -> None:
    record(owner, categories["food"], amount="700.00")
    record(owner, categories["food"], amount="300.00", app="library")
    library = owner.get(reverse(EXPENSES), {"app": "library"}).json()
    assert [row["amount"] for row in library["data"]] == ["300.00"]
    assert library["meta"]["totals"]["amount"] == "300.00"


def test_the_shops_cashbook_leaves_the_librarys_expense_out(
    owner: Any, categories: dict, with_library: Any
) -> None:
    """The cashbook is the Shop's till: a reading room's rent paid in cash is not cash
    out of the shop's drawer."""
    record(owner, categories["food"], amount="700.00")
    record(owner, categories["food"], amount="300.00", app="library")
    book = owner.get(
        reverse("v1:cashbook"), {"date_from": "2026-04-01", "date_to": "2026-04-01"}
    ).json()["data"]
    assert book["range"]["out"]["total"] == "700.00"
