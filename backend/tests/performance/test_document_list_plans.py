"""Document lists' query plans, asserted rather than assumed (H3 scale run).

The same lesson as `test_party_list_plans.py`, three lists later. On the
launch-scale book (`manage.py seed_scale`: 20,000 invoices, 7,500 payments,
19,000 allocations) `manage.py scale_probe` found:

- the invoice list read and top-N sorted EVERY document of the tenant for a
  page of 25 — `ix_sales_doc_kind_status` leads with kind and status, and the
  list's IN-lists on both mean it cannot give one `-document_date` order, so
  the planner scanned and sorted. `ix_sales_doc_tenant_date` (tenant,
  -document_date, -created_at, -id) is the list's own order;
- a month's sales register filtered the tenant's whole history through the bare
  `tenant_id` index — the same index serves its date range;
- the payment list joined and GROUPED every allocation of every payment before
  the LIMIT, because `allocated` was `Sum("allocations__amount")`. It is a
  correlated subquery now, evaluated for the 25 rows on the page.

Each test builds the smallest book that makes an index genuinely the cheaper
plan, sends the request the client sends, and reads `EXPLAIN` of the SQL the
endpoint actually issued. Marked `slow`.
"""

from __future__ import annotations

import datetime as dt
import random
import uuid
from decimal import Decimal
from typing import Any

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from tests.factories.parties import PartyFactory

pytestmark = [pytest.mark.django_db, pytest.mark.slow, pytest.mark.postgres]

DOCUMENTS = 20_000
PAYMENTS = 8_000


def _analyze(*tables: str) -> None:
    with connection.cursor() as cursor:
        cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
        for table in tables:
            cursor.execute(f"ANALYZE {table}")  # noqa: S608 — fixed identifiers


def _plan(sql: str) -> str:
    with connection.cursor() as cursor:
        cursor.execute("EXPLAIN (FORMAT TEXT) " + sql)
        return "\n".join(row[0] for row in cursor.fetchall())


def _issued(client: Any, url: str, params: dict, table: str) -> list[str]:
    """The SELECTs on `table` the endpoint really issued for this request."""
    assert client.get(url, params).status_code == 200
    with CaptureQueriesContext(connection) as captured:
        response = client.get(url, params)
    assert response.status_code == 200, response.content[:300]
    return [
        q["sql"]
        for q in captured.captured_queries
        if q["sql"].lstrip().upper().startswith("SELECT") and f'FROM "{table}"' in q["sql"]
    ]


@pytest.fixture
def invoice_book(tenant: Any) -> dict:
    """A year of invoices: 20,000 rows, a few drafts and voids, 50 customers."""
    from apps.common.dates import fy_label_for
    from apps.sales.models import SalesDocument

    rng = random.Random(20260928)
    parties = PartyFactory.create_batch(50, tenant=tenant)
    today = timezone.localdate()
    rows = []
    for n in range(DOCUMENTS):
        on = today - dt.timedelta(days=rng.randint(0, 364))
        status = (
            "draft" if n % 97 == 0 else ("void" if n % 89 == 0 else rng.choice(("issued", "paid")))
        )
        total = Decimal(rng.randint(100, 100_000)) / 100
        rows.append(
            SalesDocument(
                tenant=tenant,
                kind="invoice",
                number=None if status == "draft" else f"INV/{n:06d}",
                fy_label=fy_label_for(tenant, on),
                status=status,
                party=rng.choice(parties),
                document_date=on,
                place_of_supply_state="27",
                subtotal=total,
                taxable_total=total,
                grand_total=total,
                amount_paid=total if status == "paid" else Decimal("0"),
                amount_due=total if status == "issued" else Decimal("0"),
                issued_at=None if status == "draft" else timezone.now(),
                void_reason="x" if status == "void" else None,
            )
        )
    SalesDocument.objects.bulk_create(rows, batch_size=5_000)
    _analyze("sales_document")
    return {"today": today}


def test_the_invoice_list_page_walks_the_date_index(
    tenant: Any, api_as: Any, invoice_book: dict
) -> None:
    """A page of 25 must stop after 25, not read and sort 20,000."""
    client, _ = api_as(tenant)
    pages = [
        sql
        for sql in _issued(client, "/api/v1/sales/invoices", {"page_size": 25}, "sales_document")
        if "LIMIT" in sql
    ]
    assert pages, "the list issued no LIMITed query"
    plan = _plan(pages[-1])
    assert "ix_sales_doc_tenant_date" in plan, plan
    assert "Seq Scan on sales_document" not in plan, plan


def test_a_months_register_reads_a_month_through_the_date_index(
    tenant: Any, api_as: Any, invoice_book: dict
) -> None:
    """RPT-03 for one month of a year's book: a range scan, not the history."""
    client, _ = api_as(tenant)
    today = invoice_book["today"]
    start = (today - dt.timedelta(days=40)).replace(day=1)
    end = (start + dt.timedelta(days=32)).replace(day=1) - dt.timedelta(days=1)
    queries = _issued(
        client,
        "/api/v1/reports/sales-register",
        {"date_from": start.isoformat(), "date_to": end.isoformat()},
        "sales_document",
    )
    ranged = [sql for sql in queries if "document_date" in sql and ">=" in sql]
    assert ranged, queries
    for sql in ranged:
        plan = _plan(sql)
        assert "Seq Scan on sales_document" not in plan, plan
        assert "ix_sales_doc_tenant_date" in plan, plan


def test_the_payment_list_page_does_not_aggregate_every_payment(tenant: Any, api_as: Any) -> None:
    """`allocated` per row, for the page only: no GROUP BY over the tenant's
    payments and no scan of every allocation before the LIMIT."""
    from apps.payments.models import Allocation, Payment

    rng = random.Random(28)
    parties = PartyFactory.create_batch(20, tenant=tenant)
    today = timezone.localdate()
    payments, allocations = [], []
    for n in range(PAYMENTS):
        amount = Decimal(rng.randint(500, 50_000)) / 100  # ≥ 4 allocations of 1.00
        payment = Payment(
            tenant=tenant,
            number=f"RCT/{n:06d}",
            direction="in",
            party=rng.choice(parties),
            payment_date=today - dt.timedelta(days=rng.randint(0, 364)),
            amount=amount,
            mode_breakup=[{"mode": "cash", "amount": str(amount)}],
            primary_mode="cash",
            status="recorded",
            unallocated_amount=Decimal("0"),
        )
        payments.append(payment)
        for _ in range(rng.randint(1, 4)):

            allocations.append(
                Allocation(
                    tenant=tenant,
                    payment=payment,
                    document_type="sales_document",
                    document_id=uuid.uuid4(),
                    amount=Decimal("1.00"),
                )
            )
    Payment.objects.bulk_create(payments, batch_size=5_000)
    Allocation.objects.bulk_create(allocations, batch_size=5_000)
    _analyze("payments_payment", "payments_allocation")

    client, _ = api_as(tenant)
    pages = [
        sql
        for sql in _issued(client, "/api/v1/payments", {"page_size": 25}, "payments_payment")
        if "LIMIT" in sql
    ]
    assert pages
    plan = _plan(pages[-1])
    assert "Seq Scan on payments_allocation" not in plan, plan
    # The per-payment sum may aggregate — inside the SubPlan, over one payment's
    # allocations. Above it (the page itself) there must be no aggregate at all.
    page_part = plan.split("SubPlan", 1)[0]
    assert "Aggregate" not in page_part, plan
    assert "SubPlan" in plan and "ix_payment_tenant_date" in page_part, plan
    body = client.get("/api/v1/payments", {"page_size": 5}).json()
    for row in body["data"]:
        expected = sum(
            a.amount for a in Allocation.objects.filter(payment_id=row["id"])
        ) or Decimal("0")
        assert Decimal(row["allocated_amount"]) == expected
