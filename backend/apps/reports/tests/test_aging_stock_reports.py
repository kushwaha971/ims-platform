"""RPT-05 and RPT-06 under Reports: the same selectors as LED-09 and INV-08, in
the report's own rows and files — and reconciled against a naive recount.
"""

from __future__ import annotations

import csv
import datetime as dt
import io
import random
from decimal import Decimal
from typing import Any

import pytest
from django.core.cache import cache
from django.urls import reverse

from apps.common.dates import tenant_today
from apps.reports.selectors.aging_report import aging_report
from apps.reports.tests import builders as b

pytestmark = pytest.mark.django_db

AGING_HEADER = [
    "party_name",
    "mobile",
    "party_type",
    "tags",
    "collection_date",
    "credit_limit",
    "bucket_0_30",
    "bucket_31_60",
    "bucket_61_90",
    "bucket_90_plus",
    "total",
    "oldest_entry_date",
    "oldest_days",
    "last_payment_date",
]
STOCK_HEADER = [
    "item_name",
    "sku",
    "barcode",
    "category",
    "unit",
    "hsn_sac",
    "tax_code",
    "on_hand",
    "avg_cost",
    "stock_value",
    "reorder_point",
    "stock_status",
    "selling_price",
    "potential_sale_value",
    "last_movement_date",
]


@pytest.fixture(autouse=True)
def _fresh_budget() -> Any:
    cache.clear()
    yield
    cache.clear()


def _csv(response: Any) -> list[list[str]]:
    body = b"".join(response.streaming_content).decode("utf-8")
    assert body.startswith("﻿")
    return list(csv.reader(io.StringIO(body.lstrip("﻿"))))


# ── RPT-05 ───────────────────────────────────────────────────────────────────


def test_ac1_fifo_leaves_the_old_hundred_in_90_plus(tenant: Any) -> None:
    """AC-1 / EC-1 — debit ₹1,000 100 days ago, credit ₹900 today → 90+ ₹100,
    oldest 100 days, last payment today."""
    today = tenant_today(tenant)
    ramesh = b.party(tenant, "Ramesh")
    b.khata(tenant, today - dt.timedelta(days=100), 1000, party=ramesh, got=False)
    b.khata(tenant, today, 900, party=ramesh, mode="cash")
    rows, totals = aging_report(tenant=tenant, as_of=today, kind="receivable")
    (row,) = rows
    assert row["buckets"] == {"0_30": 0, "31_60": 0, "61_90": 0, "90_plus": Decimal("100.00")}
    assert row["total"] == Decimal("100.00")
    assert row["oldest_days"] == 100
    assert row["last_payment_date"] == today
    assert totals["party_count"] == 1


def test_ac2_payable_side_is_the_mirror(tenant: Any) -> None:
    """AC-2 — a bill ₹5,000 45 days ago, ₹2,000 paid yesterday → 31–60 ₹3,000;
    no credit limit on the payable side (BR-8)."""
    today = tenant_today(tenant)
    mahesh = b.party(
        tenant, "Mahesh", is_supplier=True, is_customer=False, credit_limit=Decimal("100")
    )
    b.khata(
        tenant,
        today - dt.timedelta(days=45),
        5000,
        party=mahesh,
        mode="cash",
        entry_type="purchase_bill",
        source_type="purchase_document",
    )
    b.khata(
        tenant,
        today - dt.timedelta(days=1),
        2000,
        party=mahesh,
        got=False,
        entry_type="payment_out",
        source_type="payment",
    )
    (row,), _ = aging_report(tenant=tenant, as_of=today, kind="payable")
    assert row["buckets"]["31_60"] == Decimal("3000.00") and row["total"] == Decimal("3000.00")
    assert row["credit_limit"] is None and row["party"]["type"] == "supplier"
    assert row["last_payment_date"] == today - dt.timedelta(days=1)


def test_buckets_sum_to_a_naive_ledger_balance_for_every_party(tenant: Any) -> None:
    """BR-3 / T-RPT05-2 — for random as-of dates, each row's four buckets sum to
    its total, and the total is the party's balance recomputed from the ledger
    rows (debits − credits, positive side), which shares nothing with FIFO."""
    from apps.ledger.models import LedgerEntry

    today = tenant_today(tenant)
    rng = random.Random(8)
    parties = [b.party(tenant, f"P{n}") for n in range(8)]
    for _ in range(80):
        who = rng.choice(parties)
        on = today - dt.timedelta(days=rng.randrange(200))
        b.khata(
            tenant,
            on,
            Decimal(rng.randrange(100, 90000)) / 100,
            party=who,
            got=rng.random() < 0.45,
            mode=rng.choice([None, "cash"]),
        )
    for offset in (0, 17, 64, 150):
        as_of = today - dt.timedelta(days=offset)
        for kind, sign in (("receivable", 1), ("payable", -1)):
            rows, totals = aging_report(tenant=tenant, as_of=as_of, kind=kind)
            naive = {}
            for party in parties:
                net = Decimal("0")
                for entry in LedgerEntry.objects.filter(party=party, entry_date__lte=as_of):
                    net += entry.amount if entry.direction == "debit" else -entry.amount
                if sign * net > 0:
                    naive[str(party.id)] = sign * net
            got = {row["party"]["id"]: row["total"] for row in rows}
            assert got == naive
            for row in rows:
                assert sum(row["buckets"].values()) == row["total"]
            assert totals["total"] == sum(naive.values(), Decimal("0"))


def test_receivables_csv_has_fr5_columns_and_a_total_row(tenant: Any, api_as: Any) -> None:
    """FR-5 / T-RPT05-6 — the exact header, tags joined by `;`, a TOTAL row equal
    to the sum of the rows, and `receivables-aging_<as_of>.csv`."""
    from apps.parties.models import Tag

    today = tenant_today(tenant)
    camp = Tag.objects.create(tenant=tenant, name="Camp Area")
    route = Tag.objects.create(tenant=tenant, name="Route 2")
    ramesh = b.party(
        tenant, "Ramesh", mobile="+919812345678", collection_date=today, credit_limit=Decimal("500")
    )
    ramesh.tags.add(camp, route)
    suresh = b.party(tenant, "Suresh", mobile=None)
    b.khata(tenant, today - dt.timedelta(days=10), 700, party=ramesh, got=False)
    b.khata(tenant, today - dt.timedelta(days=95), 250, party=suresh, got=False)
    owner, _ = api_as(tenant)
    response = owner.get(reverse("v1:report-receivables-aging") + "?format=csv")
    assert response.status_code == 200
    assert f"receivables-aging_{today.isoformat()}.csv" in response["Content-Disposition"]
    rows = _csv(response)
    assert rows[0] == AGING_HEADER
    table = [dict(zip(AGING_HEADER, row, strict=True)) for row in rows[1:]]
    assert [r["party_name"] for r in table] == ["Suresh", "Ramesh", "TOTAL"]  # 90+ first
    ramesh_row = table[1]
    assert ramesh_row["tags"] == "Camp Area;Route 2"
    # RPT-08 BR-6 — a leading `+` is a formula to Excel, so the cell is escaped.
    assert ramesh_row["mobile"] == "'+919812345678"
    assert ramesh_row["party_type"] == "customer"
    assert ramesh_row["collection_date"] == today.isoformat()
    assert ramesh_row["credit_limit"] == "500.00"
    assert ramesh_row["bucket_0_30"] == "700.00" and ramesh_row["oldest_days"] == "10"
    assert table[0]["mobile"] == ""  # EC-7
    total = table[2]
    assert total["total"] == "950.00" and total["bucket_90_plus"] == "250.00"
    assert total["mobile"] == "" and total["tags"] == ""


def test_aging_json_filters_and_validation(tenant: Any, api_as: Any) -> None:
    """§10 / EC-5 — future as-of is 400; a bucket filter keeps only rows with money
    in it, and the totals are over those rows; `fresh` needs the financial read."""
    today = tenant_today(tenant)
    old = b.party(tenant, "Old")
    new = b.party(tenant, "New")
    b.khata(tenant, today - dt.timedelta(days=120), 400, party=old, got=False)
    b.khata(tenant, today - dt.timedelta(days=2), 300, party=new, got=False)
    owner, _ = api_as(tenant)
    staff, _ = api_as(tenant, role="staff")
    url = reverse("v1:report-receivables-aging")
    future = (today + dt.timedelta(days=1)).isoformat()
    assert owner.get(f"{url}?as_of={future}").status_code == 400
    assert owner.get(f"{url}?bucket=forever").status_code == 400
    body = owner.get(f"{url}?bucket=90_plus").json()
    assert [r["party"]["name"] for r in body["data"]] == ["Old"]
    assert body["meta"]["totals"]["total"] == "400.00"
    assert body["meta"]["totals"]["party_count"] == 1
    assert staff.get(url).status_code == 200
    assert staff.get(f"{url}?fresh=true").status_code == 403
    assert staff.get(f"{url}?format=csv").status_code == 403
    assert owner.get(reverse("v1:report-payables-aging")).json()["data"] == []


# ── RPT-06 ───────────────────────────────────────────────────────────────────


def _stock(
    tenant: Any,
    name: str,
    on_hand: Any,
    avg: Any,
    price: Any,
    reorder: Any = None,
    unit: str = "NOS",
) -> Any:
    from apps.inventory.models import ItemStock

    item = b.stocked_item(tenant, name, on_hand=on_hand, reorder_point=reorder, unit_code=unit)
    item.selling_price = Decimal(str(price))
    item.save(update_fields=["selling_price"])
    ItemStock.objects.filter(item=item).update(avg_cost=Decimal(str(avg)))
    return item


def test_br10_the_worked_example_in_the_file(tenant: Any, api_as: Any) -> None:
    """BR-10 — 5 NOS at ₹332.0000 → value ₹1,660.00, low, potential ₹2,250.00;
    the TOTAL row sums the rows."""
    _stock(tenant, "Basmati Rice 5kg", 5, "332.0000", "450.00", reorder=10)
    _stock(tenant, "Toor Dal", 20, "100.1250", "130.00", reorder=5, unit="KGS")
    owner, _ = api_as(tenant)
    response = owner.get(reverse("v1:report-stock-summary") + "?format=csv&ordering=name")
    rows = _csv(response)
    assert rows[0] == STOCK_HEADER
    table = [dict(zip(STOCK_HEADER, row, strict=True)) for row in rows[1:]]
    rice = table[0]
    assert rice["item_name"] == "Basmati Rice 5kg"
    assert (rice["on_hand"], rice["avg_cost"], rice["stock_value"]) == (
        "5.000",
        "332.0000",
        "1660.00",
    )
    assert rice["stock_status"] == "low" and rice["potential_sale_value"] == "2250.00"
    total = table[-1]
    assert total["item_name"] == "TOTAL" and total["unit"] == "MIXED"
    assert total["stock_value"] == str(
        sum(Decimal(r["stock_value"]) for r in table[:-1]).quantize(Decimal("0.01"))
    )
    assert total["on_hand"] == "25.000"
    today = tenant_today(tenant)
    assert f"stock-summary_{today.isoformat()}.csv" in response["Content-Disposition"]


def test_the_stock_file_is_the_stock_screen(tenant: Any, api_as: Any) -> None:
    """RPT-08 BR-1 — same query string, same rows as INV-08's `/stock/summary`."""
    for n in range(7):
        _stock(tenant, f"Item {n}", n, "10", "12", reorder=3)
    owner, _ = api_as(tenant)
    query = "?status=low&hide_zero=true&ordering=name"
    screen = owner.get(reverse("v1:stock-summary") + query).json()
    rows = _csv(owner.get(reverse("v1:report-stock-summary") + query + "&format=csv"))
    names = [r[0] for r in rows[1:-1]]
    assert names == [row["item"]["name"] for row in screen["data"]]
    assert len(names) == screen["meta"]["total"]


def test_cost_columns_leave_with_the_permission(tenant: Any, api_as: Any) -> None:
    """FR-8 / BR-2 — no financial read → no avg cost, value or potential columns
    (absent, not blank), in the file and in the JSON; a past valuation is 403."""
    _stock(tenant, "Oil", 3, "90", "120")
    staff, member = api_as(tenant, role="staff")
    member.permissions_override = {"allow": ["reports.export"]}
    member.save(update_fields=["permissions_override"])
    url = reverse("v1:report-stock-summary")
    header = _csv(staff.get(url + "?format=csv"))[0]
    assert header == [
        c for c in STOCK_HEADER if c not in ("avg_cost", "stock_value", "potential_sale_value")
    ]
    body = staff.get(url).json()
    assert body["meta"]["cost_visible"] is False
    assert "stock_value" not in body["data"][0] and "stock_value" not in body["meta"]["totals"]
    past = (tenant_today(tenant) - dt.timedelta(days=30)).isoformat()
    assert staff.get(f"{url}?as_of={past}").status_code == 403


@pytest.mark.parametrize("ordering", ["name", "-value"])
def test_the_json_page_is_a_slice_of_the_file_and_its_totals_are_the_files(
    tenant: Any, api_as: Any, ordering: str
) -> None:
    """H3 scale run: the JSON page used to build EVERY row in Python to show 25 —
    1.8 s on a 5,000-item shop. It now slices in SQL and aggregates the totals in
    one outer query; this proves the page is the file's rows `[25:50]` and the
    totals (per-item rounded, BR-4; `MIXED` units, EC-6) are the file's TOTAL row."""
    rng = random.Random(28)
    for n in range(60):
        _stock(
            tenant,
            f"Item {n:02d}",
            rng.randint(0, 40),
            f"{rng.randint(100, 99_999) / 100:.4f}",
            f"{rng.randint(100, 99_999) / 100:.2f}",
            unit="NOS" if n % 7 else "KGS",
        )
    owner, _ = api_as(tenant)
    url = reverse("v1:report-stock-summary")
    rows = _csv(owner.get(f"{url}?format=csv&ordering={ordering}"))
    table = [dict(zip(STOCK_HEADER, row, strict=True)) for row in rows[1:]]
    body = owner.get(f"{url}?ordering={ordering}&page=2&page_size=25").json()
    assert [r["item_name"] for r in body["data"]] == [r["item_name"] for r in table[25:50]]
    assert [r["stock_value"] for r in body["data"]] == [r["stock_value"] for r in table[25:50]]
    totals, file_total = body["meta"]["totals"], table[-1]
    assert body["meta"]["total"] == totals["item_count"] == len(table) - 1
    for key in ("on_hand", "stock_value", "potential_sale_value", "unit"):
        assert totals[key] == file_total[key], key
