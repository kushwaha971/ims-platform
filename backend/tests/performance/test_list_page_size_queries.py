"""No list endpoint is O(page size) — measured on a realistic book (H3 item 4).

`test_query_budgets.py` proves the rule for the party list on factory rows.
Every other list shipped since — items, invoices, payments, bills, expenses,
the khata timeline, the statement, the day book, the registers, aging, stock —
serialises FK-rich rows (a party name on an invoice, a unit on an item, a
category on an expense), and a serializer that walks one of those relations
without `select_related` / `prefetch_related` is one extra query PER ROW: 25 on
page one, 100 the day someone picks "100 per page". Nothing in the per-feature
suites measures two page sizes, so an N+1 there passes every test it has.

So this module builds a small but complete book with `seed_scale` — the same
bulk writer the launch-scale run uses, with every document kind and every
relation populated — and, per endpoint, counts the queries at a small and a
large page, asserting that (a) the large page really does return more rows and
(b) the query count is identical. It also proves the seeded book itself is
clean (`check_invariants`), since the scale run depends on that.
"""

from __future__ import annotations

from typing import Any, Callable
from unittest import mock

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

pytestmark = [pytest.mark.django_db, pytest.mark.slow]


@pytest.fixture
def book(db: Any, plan: Any, partner: Any, system_roles: dict) -> dict:
    """A seeded tenant: 60 parties, 40 items, 600 invoices, 3,000 khata lines."""
    from django.db.models import Count

    from apps.common.management.commands.seed_reference_data import (
        seed_hsn,
        seed_tax_rates,
        seed_units,
    )
    from apps.ledger.models import LedgerEntry
    from apps.platform_app.models import Membership
    from apps.reports.management.commands.scale_probe import _token
    from apps.reports.services.scale_seed import seed_scale

    seed_tax_rates()
    seed_units()
    seed_hsn()
    result = seed_scale(
        entries=3_000,
        parties=60,
        items=40,
        invoices=600,
        days=120,
        heavy_party_entries=300,
        log=lambda _line: None,
    )
    member = Membership.objects.select_related("user", "role", "tenant").get(
        tenant_id=result["tenant_id"]
    )
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {_token(member)}")
    # The heavy customer: a khata long enough that a page of 50 is full.
    busiest = (
        LedgerEntry.objects.filter(tenant_id=result["tenant_id"])
        .values("party_id")
        .annotate(n=Count("id"))
        .order_by("-n")
        .values_list("party_id", flat=True)
        .first()
    )
    from apps.inventory.models import StockMovement

    item = (
        StockMovement.objects.filter(tenant_id=result["tenant_id"], movement_type="sale_out")
        .values_list("item_id", flat=True)
        .first()
    )
    return {"client": client, "tenant": member.tenant, "party": busiest, "item": item, **result}


def rows_of(body: Any) -> list:
    data = body.get("data")
    if isinstance(data, list):
        return data
    for key in ("rows", "entries", "items", "results"):
        if isinstance(data, dict) and isinstance(data.get(key), list):
            return data[key]
    raise AssertionError(f"cannot find the rows in {list(body)} / {type(data)}")


def source_types(rows: list) -> int:
    """LED-10's batched resolvers: ONE query per document source type on the page
    (`ledger.selectors.sources.resolve_sources`), by design — bounded by the
    number of document kinds, never by the rows. A khata page of five manual
    lines resolves nothing; one that also holds an invoice and a receipt runs two
    lookups. The per-row rule is asserted net of that."""
    kinds = set()
    for row in rows:
        # The timeline row carries `source_type`/`source_id`; both carry
        # `source: {type, id, …}` (null for a manual line) — read that.
        source = row.get("source") if isinstance(row, dict) else None
        if isinstance(source, dict) and source.get("type"):
            kinds.add(source["type"])
    return len(kinds)


#: The two ledger lists that resolve document sources per type (LED-10).
LEDGER_LISTS = {"khata-timeline", "statement"}

#: (id, path builder, page-size parameter, extra params)
LISTS: tuple[tuple[str, Callable[[dict], str], str, dict], ...] = (
    ("parties", lambda w: "/api/v1/parties", "page_size", {"ordering": "-last_activity_at"}),
    ("items", lambda w: "/api/v1/items", "page_size", {}),
    ("item-movements", lambda w: f"/api/v1/items/{w['item']}/movements", "limit", {}),
    ("stock-summary", lambda w: "/api/v1/stock/summary", "page_size", {}),
    ("invoices", lambda w: "/api/v1/sales/invoices", "page_size", {}),
    ("payments", lambda w: "/api/v1/payments", "page_size", {}),
    ("bills", lambda w: "/api/v1/purchases/bills", "page_size", {}),
    ("expenses", lambda w: "/api/v1/expenses", "page_size", {}),
    ("khata-timeline", lambda w: f"/api/v1/parties/{w['party']}/ledger-entries", "limit", {}),
    ("statement", lambda w: f"/api/v1/parties/{w['party']}/statement", "limit", {}),
    ("receivables-aging", lambda w: "/api/v1/reports/receivables-aging", "page_size", {}),
    ("stock-report", lambda w: "/api/v1/reports/stock-summary", "page_size", {}),
    (
        "day-book",
        lambda w: "/api/v1/reports/day-book",
        "page_size",
        {"date_from": "__start__", "date_to": "__today__"},
    ),
    (
        "sales-register",
        lambda w: "/api/v1/reports/sales-register",
        "page_size",
        {"date_from": "__start__", "date_to": "__today__"},
    ),
    (
        "purchase-register",
        lambda w: "/api/v1/reports/purchase-register",
        "page_size",
        {"date_from": "__start__", "date_to": "__today__"},
    ),
)


def _count(client: APIClient, path: str, params: dict, net: bool) -> tuple[int, int]:
    """`(queries net of LED-10's per-source-type lookups, rows)`."""
    first = client.get(path, params)
    assert first.status_code == 200, (path, params, first.content[:300])
    with CaptureQueriesContext(connection) as captured:
        response = client.get(path, params)
    rows = rows_of(response.json())
    return len(captured.captured_queries) - (source_types(rows) if net else 0), len(rows)


@pytest.mark.parametrize("list_id,path,size_param,extra", LISTS, ids=[x[0] for x in LISTS])
def test_list_query_count_is_constant_in_the_page_size(
    book: dict, list_id: str, path: Callable, size_param: str, extra: dict
) -> None:
    import datetime as dt

    from apps.common.dates import tenant_today

    today = tenant_today(book["tenant"])
    swap = {
        "__today__": today.isoformat(),
        "__start__": (today - dt.timedelta(days=90)).isoformat(),
    }
    params = {k: swap.get(v, v) for k, v in extra.items()}
    url = path(book)
    net = list_id in LEDGER_LISTS
    with mock.patch(
        "rest_framework.throttling.SimpleRateThrottle.allow_request", return_value=True
    ):
        small_q, small_rows = _count(book["client"], url, {**params, size_param: 5}, net)
        large_q, large_rows = _count(book["client"], url, {**params, size_param: 50}, net)
    assert large_rows > small_rows, (
        f"{list_id}: the large page returned {large_rows} rows and the small {small_rows} — "
        "the fixture is too thin to tell an N+1 from a constant."
    )
    assert small_q == large_q, (
        f"{list_id}: {small_q} queries for {small_rows} rows but {large_q} for {large_rows} "
        "— a per-row query (select_related / prefetch_related missing)."
    )


def test_the_seeded_book_is_clean(book: dict) -> None:
    """The launch gate the scale run leans on: the bulk writer keeps every cache
    equal to its replay, so `check_invariants` on a seeded tenant finds nothing."""
    from apps.inventory.services.integrity import check_stock
    from apps.ledger.services.integrity import check_balances

    stock = check_stock(tenant_id=book["tenant_id"])
    balances = check_balances(tenant_id=book["tenant_id"])
    assert stock["ok"] and stock["checked"] == 40, stock
    assert balances["ok"] and balances["checked"] == 60, balances
