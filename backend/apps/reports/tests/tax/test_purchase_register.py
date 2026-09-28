"""RPT-04 — the purchase register: supplier numbers, ITC eligibility, RCM apart, the file."""

from __future__ import annotations

import datetime as dt
import random
from decimal import Decimal
from typing import Any

import pytest
from django.db import connection
from django.urls import reverse

from apps.reports.tests.tax.builders import (
    RAMESH_GSTIN,
    bill,
    csv_rows,
    party,
)

pytestmark = pytest.mark.django_db

URL = "v1:report-purchase-register"
SEP = dt.date(2026, 9, 5)
SEPTEMBER = "?date_from=2026-09-01&date_to=2026-09-27"


def _get(client: Any, query: str = SEPTEMBER, **headers: Any) -> Any:
    return client.get(reverse(URL) + query, **headers)


@pytest.fixture
def supplier(shop: Any) -> Any:
    return party(shop, name="Agarwal Traders", gstin=RAMESH_GSTIN, is_supplier=True)


def test_rows_carry_the_suppliers_own_number_and_date(owner: Any, shop: Any, supplier: Any) -> None:
    """AC-1 / BR-1 — our recording date chooses the row; the supplier's date is shown."""
    bill(
        shop,
        "PB/26-27/0001",
        on=SEP,
        supplier=supplier,
        supplier_invoice="AT/778",
        supplier_date=dt.date(2026, 8, 30),
        lines=[{"taxable": "5000.00", "rate": "18"}],
    )
    row = _get(owner).json()["data"][0]
    assert row["supplier_invoice_number"] == "AT/778"
    assert row["supplier_invoice_date"] == "2026-08-30"
    assert row["supplier_gstin"] == RAMESH_GSTIN
    assert (row["cgst"], row["sgst"], row["igst"]) == ("450.00", "450.00", "0.00")


def test_itc_totals_exclude_ineligible_bills_and_hold_rcm_apart(
    owner: Any, shop: Any, supplier: Any
) -> None:
    """AC-2 / BR-2 / T-RPT04-1 — 4(A)(5) is eligible AND not reverse charge."""
    bill(shop, "PB/1", on=SEP, supplier=supplier, lines=[{"taxable": "5000.00", "rate": "18"}])
    bill(
        shop,
        "PB/2",
        on=SEP,
        supplier=supplier,
        itc=False,
        lines=[{"taxable": "2000.00", "rate": "18"}],
    )
    bill(
        shop,
        "PB/3",
        on=SEP,
        supplier=supplier,
        rcm=True,
        lines=[{"taxable": "1000.00", "rate": "5"}],
    )
    totals = _get(owner).json()["meta"]["totals"]
    assert totals["itc_eligible"] == {
        "cgst": "450.00",
        "sgst": "450.00",
        "igst": "0.00",
        "cess": "0.00",
    }
    assert totals["rcm_tax"] == "50.00"
    assert totals["not_claimable_tax"] == "360.00"
    assert totals["taxable_total"] == "8000.00"


def test_unpaid_totals_are_the_amount_due(owner: Any, shop: Any, supplier: Any) -> None:
    """AC-3 — one unpaid bill: Σ due equals its `amount_due`."""
    bill(shop, "PB/1", on=SEP, supplier=supplier, status="paid", paid="105.00")
    unpaid = bill(shop, "PB/2", on=SEP, supplier=supplier, lines=[{"taxable": "300.00"}])
    totals = _get(owner).json()["meta"]["totals"]
    assert Decimal(totals["amount_due"]) == unpaid.amount_due
    assert Decimal(totals["amount_paid"]) == Decimal("105.00")


def test_a_composition_buyer_claims_no_itc(owner: Any, shop: Any, supplier: Any) -> None:
    """EC-1 / T-RPT04-2 — the tax is cost; `itc_eligible` reads false everywhere."""
    shop.gst_type = "composition"
    shop.save()
    bill(shop, "PB/1", on=SEP, supplier=supplier, lines=[{"taxable": "1000.00", "rate": "18"}])
    body = _get(owner).json()
    assert body["data"][0]["itc_eligible"] == "false"
    assert set(body["meta"]["totals"]["itc_eligible"].values()) == {"0.00"}
    assert body["meta"]["totals"]["not_claimable_tax"] == "180.00"
    assert _get(owner, SEPTEMBER + "&itc=true").json()["data"] == []
    assert len(_get(owner, SEPTEMBER + "&itc=false").json()["data"]) == 1


def test_void_bills_are_excluded_from_every_sum(owner: Any, shop: Any, supplier: Any) -> None:
    """BR-4 — listed with zeroes only on request."""
    bill(shop, "PB/1", on=SEP, supplier=supplier)
    bill(shop, "PB/2", on=SEP, supplier=supplier, status="void", lines=[{"taxable": "999.00"}])
    default = _get(owner).json()
    assert [r["number"] for r in default["data"]] == ["PB/1"]
    flagged = _get(owner, SEPTEMBER + "&include_void=true").json()
    assert flagged["meta"]["totals"]["taxable_total"] == default["meta"]["totals"]["taxable_total"]
    assert {r["number"]: r["grand_total"] for r in flagged["data"]}["PB/2"] == "0.00"


def test_totals_reconcile_with_raw_sql_and_with_every_row(owner: Any, shop: Any) -> None:
    """§32.13.2 — selector, naive SQL and Σ rows agree to the paisa."""
    rng = random.Random(4)
    suppliers = [party(shop, name=f"S{n}", gstin=RAMESH_GSTIN, is_supplier=True) for n in range(3)]
    for n in range(30):
        bill(
            shop,
            f"PB/26-27/{n:04d}",
            on=dt.date(2026, 9, rng.randint(1, 27)),
            supplier=rng.choice(suppliers),
            status=rng.choice(["recorded", "paid", "partially_paid", "void"]),
            pos=rng.choice(["27", "24"]),
            itc=rng.random() > 0.3,
            rcm=rng.random() > 0.8,
            lines=[
                {
                    "taxable": f"{rng.randint(1, 500000) / 100:.2f}",
                    "rate": rng.choice(["5", "18", "40"]),
                }
                for _ in range(rng.randint(1, 4))
            ],
        )
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT COUNT(*), SUM(taxable_total), SUM(grand_total),
                   SUM(CASE WHEN itc_eligible AND NOT reverse_charge
                            THEN cgst_total + sgst_total + igst_total + cess_total ELSE 0 END),
                   SUM(CASE WHEN reverse_charge
                            THEN cgst_total + sgst_total + igst_total + cess_total ELSE 0 END)
              FROM purchases_document
             WHERE tenant_id = %s AND kind = 'purchase_bill'
               AND status NOT IN ('draft', 'void')
               AND document_date BETWEEN '2026-09-01' AND '2026-09-27'
            """,
            [shop.id],
        )
        count, taxable, grand, itc, rcm = cursor.fetchone()
    body = _get(owner, SEPTEMBER + "&page_size=200").json()
    totals = body["meta"]["totals"]
    assert totals["count"] == count == len(body["data"])
    assert Decimal(totals["taxable_total"]) == taxable
    assert Decimal(totals["grand_total"]) == grand
    assert sum(Decimal(v) for v in totals["itc_eligible"].values()) == itc
    assert Decimal(totals["rcm_tax"]) == rcm
    assert sum(Decimal(r["grand_total"]) for r in body["data"]) == grand


def test_the_csv_header_is_exact(owner: Any, shop: Any, supplier: Any) -> None:
    """T-RPT04-3 — FR-2's header, in order; booleans and dates machine-readable."""
    bill(shop, "PB/1", on=SEP, supplier=supplier)
    rows = csv_rows(_get(owner, SEPTEMBER + "&format=csv"))
    assert rows[0] == (
        "date,number,kind,status,supplier_name,supplier_gstin,supplier_invoice_number,"
        "supplier_invoice_date,pos_state,is_inter_state,reverse_charge,itc_eligible,subtotal,"
        "discount,taxable_total,cgst,sgst,igst,cess,round_off,grand_total,amount_paid,"
        "amount_due,due_on,against_number,created_by"
    ).split(",")
    record = dict(zip(rows[0], rows[1], strict=True))
    assert record["itc_eligible"] == "true" and record["date"] == "2026-09-05"


def test_line_cost_is_absent_without_financial_read(
    shop: Any, api_as: Any, owner: Any, supplier: Any
) -> None:
    """T-RPT04-4 / RPT-08 BR-2 — ABSENT, not blank: a blank column leaks that it exists."""
    bill(shop, "PB/1", on=SEP, supplier=supplier, lines=[{"taxable": "460.00", "qty": "10"}])
    staff, _ = api_as(shop, role="staff")
    staff_row = _get(staff, SEPTEMBER + "&level=line").json()["data"][0]
    assert "unit_cost" not in staff_row
    owner_row = _get(owner, SEPTEMBER + "&level=line").json()["data"][0]
    assert owner_row["unit_cost"] == "46.0000"
    assert owner_row["itc_eligible"] == "true"
    rows = csv_rows(_get(owner, SEPTEMBER + "&level=line&format=csv"))
    assert "unit_cost" in rows[0]
    assert _get(staff, SEPTEMBER + "&format=csv").status_code == 403
