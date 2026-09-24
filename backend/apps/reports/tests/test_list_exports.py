"""IMP-02 — `?format=csv` on the party, item and expense lists.

The property the feature exists for is BR-1, "the file is the screen": the
export reads the list's own filtered queryset, so these tests compare the file
with the JSON list under the same query string rather than with a fixture.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest
from django.core.cache import cache
from django.urls import reverse
from django.utils import timezone

from apps.common import exports
from apps.reports.models import Export
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _fresh_budget() -> Any:
    """The export budget is ten an hour per user, in a cache that outlives a test."""
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def owner(tenant: Any, api_as: Any) -> Any:
    client, _ = api_as(tenant)
    return client


def _csv(response: Any) -> list[list[str]]:
    import csv
    import io

    body = b"".join(response.streaming_content).decode("utf-8")
    assert body.startswith("\ufeff"), "Excel needs the BOM to read Devanagari"
    return list(csv.reader(io.StringIO(body.lstrip("\ufeff"))))


def _parties(url_query: str = "") -> str:
    return reverse("v1:party-list") + url_query


def test_the_party_export_is_the_filtered_list(owner: Any, tenant: Any) -> None:
    """BR-1 — same filters, same rows, same order; pagination is all that is dropped."""
    for n in range(30):
        PartyFactory(tenant=tenant, name=f"Kumar {n:02d}", balance=Decimal(n * 10))
    PartyFactory(tenant=tenant, name="Somebody Else", balance=Decimal("5"))
    query = "?q=Kumar&ordering=name&page_size=10"
    listed = owner.get(_parties(query)).json()
    exported = owner.get(_parties(query + "&format=csv"), HTTP_SEC_FETCH_SITE="same-origin")
    assert exported.status_code == 200
    assert exported["Content-Disposition"].startswith('attachment; filename="digikhaato-parties-')
    rows = _csv(exported)
    assert rows[0][:4] == ["name", "display_code", "mobile", "type"]
    assert len(rows) - 1 == listed["meta"]["total"] == 30
    assert [r[0] for r in rows[1:11]] == [p["name"] for p in listed["data"]]


def test_amounts_are_plain_numbers_and_formulas_are_neutralised(owner: Any, tenant: Any) -> None:
    """FR-4 / EC-4 — `2300.00`, not `₹2,300.00`; a party named `=SUM(...)` is text."""
    PartyFactory(tenant=tenant, name="=SUM(A1:A9)", balance=Decimal("-2300.00"))
    rows = _csv(owner.get(_parties("?format=csv")))
    header = rows[0]
    row = rows[1]
    assert row[0] == "'=SUM(A1:A9)"
    assert row[header.index("balance")] == "2300.00"
    assert row[header.index("balance_type")] == "You will give"


def test_an_export_nobody_matches_is_refused_rather_than_empty(owner: Any) -> None:
    """EC-2 — an empty file looks like a bug to a shopkeeper."""
    response = owner.get(_parties("?q=nobody&format=csv"))
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "nothing_to_export"


def test_staff_may_not_export_parties(tenant: Any, api_as: Any) -> None:
    """Canon §0.9 — `parties.party.export` is not a staff codename."""
    PartyFactory(tenant=tenant)
    staff, _ = api_as(tenant, role="staff")
    assert staff.get(_parties()).status_code == 200
    assert staff.get(_parties("?format=csv")).status_code == 403


def test_an_export_started_from_another_site_is_refused(owner: Any, tenant: Any) -> None:
    """F-3 — a link on a hostile page cannot make a merchant download their book."""
    PartyFactory(tenant=tenant)
    response = owner.get(_parties("?format=csv"), HTTP_SEC_FETCH_SITE="cross-site")
    assert response.status_code == 403


def test_the_export_budget_applies(owner: Any, tenant: Any) -> None:
    """Ten an hour — the eleventh is a 429, the list itself is not."""
    PartyFactory(tenant=tenant)
    for _ in range(10):
        assert owner.get(_parties("?format=csv")).status_code == 200
    assert owner.get(_parties("?format=csv")).status_code == 429
    assert owner.get(_parties()).status_code == 200


def test_a_big_export_is_queued_built_and_downloadable(
    owner: Any, tenant: Any, monkeypatch: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """FR-6/FR-7 — over the threshold: 202, a job, a file, a 7-day expiry."""
    monkeypatch.setattr(exports, "SYNC_MAX_ROWS", 5)
    for n in range(8):
        PartyFactory(tenant=tenant, name=f"Big {n}", balance=Decimal(n))
    PartyFactory(tenant=tenant, name="Filtered out")
    with django_capture_on_commit_callbacks(execute=True):
        response = owner.get(_parties("?q=Big&format=csv"))
    assert response.status_code == 202
    body = response.json()["data"]
    assert body["row_count"] == 8

    status = owner.get(reverse("v1:report-export-detail", args=[body["export_id"]])).json()["data"]
    assert status["status"] == "ready"
    assert status["row_count"] == 8
    expires = dt.datetime.fromisoformat(status["expires_at"])
    assert timezone.now() + dt.timedelta(days=6) < expires <= timezone.now() + dt.timedelta(days=7)

    download = owner.get(reverse("v1:report-export-download", args=[body["export_id"]]))
    assert download.status_code == 200
    rows = _csv(download)
    # The replay honoured the stored filter: eight "Big" parties, not nine.
    assert sorted(r[0] for r in rows[1:]) == [f"Big {n}" for n in range(8)]


def test_an_expired_or_foreign_export_cannot_be_downloaded(
    owner: Any,
    tenant: Any,
    other_tenant: Any,
    api_as: Any,
    monkeypatch: Any,
    django_capture_on_commit_callbacks: Any,
) -> None:
    """BR-6/BR-7 — expired is refused; another tenant's id is 404."""
    monkeypatch.setattr(exports, "SYNC_MAX_ROWS", 1)
    PartyFactory(tenant=tenant)
    PartyFactory(tenant=tenant)
    with django_capture_on_commit_callbacks(execute=True):
        export_id = owner.get(_parties("?format=csv")).json()["data"]["export_id"]
    stranger, _ = api_as(other_tenant)
    assert stranger.get(reverse("v1:report-export-download", args=[export_id])).status_code == 404

    Export.objects.filter(pk=export_id).update(expires_at=timezone.now() - dt.timedelta(minutes=1))
    expired = owner.get(reverse("v1:report-export-download", args=[export_id]))
    assert expired.status_code == 404
    assert expired.json()["error"]["code"] == "export_expired"

    from apps.reports.tasks import expire_exports

    assert expire_exports(None, None) == {"expired": 1}
    assert Export.objects.get(pk=export_id).status == "expired"


def test_item_cost_columns_need_financial_read(tenant: Any, api_as: Any) -> None:
    """BR-4 — `purchase_price` and `stock_value` are dropped server-side for a member
    without `reports.financial.read`, whatever they asked for."""
    from apps.common.context import Ctx
    from apps.common.management.commands.seed_reference_data import seed_tax_rates, seed_units
    from apps.inventory.models import Unit
    from apps.inventory.services.items import create_item

    seed_tax_rates()
    seed_units()
    unit = Unit.objects.get(tenant__isnull=True, code="NOS")
    create_item(
        ctx=Ctx.system(tenant),
        payload={
            "name": "Pen",
            "unit_id": str(unit.id),
            "purchase_price": "4",
            "selling_price": "10",
        },
    )

    owner, _ = api_as(tenant)
    header = _csv(owner.get(reverse("v1:item-list") + "?format=csv"))[0]
    assert "purchase_price" in header and "stock_value" in header

    member, membership = api_as(tenant, role="staff")
    membership.permissions_override = {"allow": ["reports.export"], "deny": []}
    membership.save(update_fields=["permissions_override"])
    rows = _csv(member.get(reverse("v1:item-list") + "?format=csv"))
    assert "purchase_price" not in rows[0] and "stock_value" not in rows[0]
    assert rows[1][0] == "Pen"


def test_the_expense_export_is_the_recorded_filtered_list(tenant: Any, api_as: Any) -> None:
    """The expenses list defaults to recorded ones; so does its file."""
    from apps.common.context import Ctx
    from apps.common.management.commands.seed_reference_data import seed_expense_categories
    from apps.expenses.models import ExpenseCategory
    from apps.expenses.services.record import record_expense
    from apps.expenses.services.void import void_expense

    seed_expense_categories(tenant)
    category = ExpenseCategory.objects.for_tenant(tenant).first()
    owner, member = api_as(tenant)
    ctx = Ctx(tenant=tenant, actor=member.user, actor_type="user")
    kept = record_expense(
        ctx=ctx,
        payload={
            "amount": "500.00",
            "expense_date": dt.date(2026, 4, 1),
            "category_id": category.id,
            "mode": "cash",
        },
    )
    voided = record_expense(
        ctx=ctx,
        payload={
            "amount": "70.00",
            "expense_date": dt.date(2026, 4, 2),
            "category_id": category.id,
            "mode": "cash",
        },
    )
    void_expense(ctx=ctx, expense_id=voided["expense"].id, reason="typo")
    rows = _csv(owner.get(reverse("v1:expense-list") + "?format=csv"))
    header = rows[0]
    assert len(rows) == 2
    assert rows[1][header.index("number")] == kept["expense"].number
    assert rows[1][header.index("amount")] == "500.00"
    assert rows[1][header.index("date")] == "01/04/2026"
