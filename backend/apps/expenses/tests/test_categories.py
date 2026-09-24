"""EXP-02 — the seeded categories and the inline create the drawer relies on."""

from __future__ import annotations

import unicodedata
from typing import Any

import pytest
from django.urls import reverse

from apps.common.audit import AuditAction
from apps.expenses.constants import CATEGORY_COLORS, SEEDED_COLOR_BY_CODE
from apps.expenses.models import ExpenseCategory
from apps.expenses.tests.helpers import CATEGORIES, record
from apps.platform_app.models import AuditLog

pytestmark = pytest.mark.django_db


def test_the_nine_seeded_categories_come_with_their_colours(owner: Any, categories: dict) -> None:
    """AC-1 — the picker has a colour for every seeded row on day one.

    The colour is assigned by `ExpenseCategory.save()`, which is the one place
    every writer passes through; a rule in the seeder alone would leave
    onboarding's extras and the inline create grey.
    """
    rows = owner.get(reverse(CATEGORIES)).json()["data"]
    assert len(rows) == 9
    by_code = {row["system_code"]: row for row in rows}
    for code, color in SEEDED_COLOR_BY_CODE.items():
        assert by_code[code]["color"] == color
    assert all(row["status"] == "active" for row in rows)


def test_the_picker_is_ordered_by_recent_use_then_curation(
    tenant: Any, owner: Any, categories: dict
) -> None:
    """EXP-02 FR-5 / BR-7 — the category a shop uses daily rises to the top.

    Only the last 30 days count: a burst of Marketing two months ago does not
    keep it above the tea the shop buys every morning.
    """
    import datetime as dt

    from apps.common.dates import tenant_today

    today = tenant_today(tenant)
    recent = (today - dt.timedelta(days=2)).isoformat()
    record(owner, categories["transport"], expense_date=recent)
    record(owner, categories["transport"], expense_date=today.isoformat())
    record(owner, categories["food"], expense_date=today.isoformat())
    long_ago = (today - dt.timedelta(days=60)).isoformat()
    for _ in range(3):
        record(owner, categories["marketing"], expense_date=long_ago)
    names = [row["name"] for row in owner.get(reverse(CATEGORIES)).json()["data"]]
    assert names[:3] == ["Transport", "Food", "Rent"]


def test_inline_create_makes_a_coloured_category_and_audits_it(
    owner: Any, categories: dict
) -> None:
    """Alternate C — "Hamali" is created and usable in one tap."""
    response = owner.post(reverse(CATEGORIES), {"name": "  Hamali "}, format="json")
    assert response.status_code == 201, response.json()
    data = response.json()["data"]
    assert data["name"] == "Hamali"
    assert data["is_system"] is False
    assert data["color"] in CATEGORY_COLORS
    assert AuditLog.objects.filter(action=AuditAction.EXPENSE_CATEGORY_CREATED).count() == 1


def test_a_duplicate_name_answers_with_the_existing_row(owner: Any, categories: dict) -> None:
    """EC-1 / EC-2 — "rent " is Rent. The client selects it instead of erroring."""
    response = owner.post(reverse(CATEGORIES), {"name": "rent "}, format="json")
    assert response.status_code == 200
    assert response.json()["data"]["id"] == str(categories["rent"].id)
    assert response.json()["meta"]["existing"] is True


def test_a_decomposed_name_matches_its_composed_twin(
    tenant: Any, owner: Any, categories: dict
) -> None:
    """EC-3 — NFC before comparison, so two phones typing "Chai-pānī" make one row.

    One keyboard sends "ā" as a single code point, another as "a" plus a
    combining macron; they are the same word to the merchant.
    """
    composed = unicodedata.normalize("NFC", "Chai-pānī")
    decomposed = unicodedata.normalize("NFD", composed)
    assert composed != decomposed
    first = owner.post(reverse(CATEGORIES), {"name": composed}, format="json")
    second = owner.post(reverse(CATEGORIES), {"name": decomposed}, format="json")
    assert first.status_code == 201
    assert second.status_code == 200
    assert second.json()["data"]["id"] == first.json()["data"]["id"]


@pytest.mark.parametrize("name", ["", "   ", "x" * 41])
def test_a_name_must_be_one_to_forty_characters(owner: Any, name: str) -> None:
    response = owner.post(reverse(CATEGORIES), {"name": name}, format="json")
    assert response.status_code == 400
    assert "name" in response.json()["error"]["details"]


def test_the_accountant_cannot_create_a_category(tenant: Any, api_as: Any) -> None:
    accountant, _ = api_as(tenant, role="accountant")
    response = accountant.post(reverse(CATEGORIES), {"name": "Hamali"}, format="json")
    assert response.status_code == 403


def test_archived_categories_are_listed_only_when_asked_for(owner: Any, categories: dict) -> None:
    """EC-5 — the list screen labels historical expenses; the picker hides the row."""
    marketing = categories["marketing"]
    marketing.status = "archived"
    marketing.save(update_fields=["status"])
    active = {row["name"] for row in owner.get(reverse(CATEGORIES)).json()["data"]}
    everything = owner.get(reverse(CATEGORIES), {"status": "all"}).json()["data"]
    assert "Marketing" not in active
    assert {"name": "Marketing", "status": "archived"}.items() <= next(
        row for row in everything if row["name"] == "Marketing"
    ).items()


def test_the_colour_backfill_gives_old_rows_a_token(tenant: Any) -> None:
    """Migration 0002 — rows written before the colour column keep a real colour.

    Simulated by blanking the colour through `QuerySet.update()` (which skips
    `save()`), then running the migration's own function against it.
    """
    import importlib

    from django.apps import apps as django_apps

    from apps.common.management.commands.seed_reference_data import seed_expense_categories

    seed_expense_categories(tenant)
    ExpenseCategory.objects.create(tenant=tenant, name="Godown rent", sort_order=100)
    ExpenseCategory.objects.for_tenant(tenant).update(color="")
    migration = importlib.import_module("apps.expenses.migrations.0002_expense_and_category_colour")
    migration.backfill_category_colours(django_apps, None)
    rows = {c.name: c.color for c in ExpenseCategory.objects.for_tenant(tenant)}
    assert rows["Rent"] == SEEDED_COLOR_BY_CODE["rent"]
    assert rows["Godown rent"] in CATEGORY_COLORS
