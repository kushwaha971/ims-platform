"""RPT-07 — the GST summary: every section to the paisa, and reconciled to the registers.

The most valuable assertions here are the reconciliations: Σ rate-wise taxable
= Σ HSN taxable = the sales register's `taxable_total`, the inward table = the
purchase register, and the rate-wise table = the FRD's own normative SQL
(BR-8) run verbatim. A GST figure that disagrees with the invoices is the
defect that destroys trust silently (§32.13.2's risk row).
"""

from __future__ import annotations

import csv
import datetime as dt
import io
import zipfile
from decimal import Decimal
from typing import Any

import pytest
from django.db import connection
from django.urls import reverse

from apps.reports.tests.tax.builders import (
    KARNATAKA_GSTIN,
    RAMESH_GSTIN,
    bill,
    party,
    sale,
)
from apps.reports.views.tax_params import parse_period

pytestmark = pytest.mark.django_db

URL = "v1:report-gst-summary"
SEP = dt.date(2026, 9, 5)


def _get(client: Any, query: str = "?period=2026-09", **headers: Any) -> Any:
    return client.get(reverse(URL) + query, **headers)


def _d(value: Any) -> Decimal:
    return Decimal(str(value))


@pytest.fixture
def br14(shop: Any) -> dict:
    """BR-14's September 2026 — a B2B invoice, a walk-in, a credit note against the first."""
    ramesh = party(shop, gstin=RAMESH_GSTIN, gst_registration="regular")
    invoice = sale(
        shop,
        "INV/26-27/0041",
        on=SEP,
        customer=ramesh,
        lines=[{"taxable": "1688.57", "qty": "2"}],
        round_off="-1.00",
    )
    sale(shop, "INV/26-27/0042", on=SEP, walk_in="Sita", lines=[{"taxable": "855.00"}])
    note = sale(
        shop,
        "CN/26-27/0001",
        kind="credit_note",
        on=dt.date(2026, 9, 12),
        customer=ramesh,
        lines=[{"taxable": "443.63"}],
        round_off="0.00",
        against=invoice,
    )
    return {"ramesh": ramesh, "invoice": invoice, "note": note}


def test_the_br14_worked_example_to_the_paisa(owner: Any, br14: dict) -> None:
    """T-RPT07-1 / AC-1..AC-4 — every section; CN negative in by_rate, positive in CDNR."""
    body = _get(owner).json()
    data = body["data"]
    (row,) = data["outward"]["by_rate"]["rows"]
    assert (row["tax_code"], row["tax_rate"], row["is_inter_state"]) == ("GST5", "5.000", False)
    assert (row["taxable_value"], row["cgst"], row["sgst"]) == ("2099.94", "52.50", "52.50")
    assert row["gstr3b_box"] == "3.1(a)" and row["invoice_count"] == 3

    nature = {r["nature"]: r for r in data["outward"]["by_nature"]["rows"]}
    assert nature["b2b"]["gstr1_table"] == "4A"
    assert (nature["b2b"]["document_count"], nature["b2b"]["taxable_value"]) == (1, "1688.57")
    assert nature["b2b"]["invoice_value"] == "1772.00"
    assert (nature["b2cs"]["gstr1_table"], nature["b2cs"]["taxable_value"]) == ("7", "855.00")
    assert nature["cdnr"]["gstr1_table"] == "9B"
    assert (nature["cdnr"]["document_count"], nature["cdnr"]["taxable_value"]) == (1, "443.63")
    assert nature["cdnr"]["cgst"] == "11.09"
    assert (
        nature["advances"]["applicable"] is False and nature["advances"]["note"] == "not_modelled"
    )

    box = data["gstr3b"]["3.1(a)"]
    assert (box["taxable"], box["cgst"], box["sgst"], box["igst"]) == (
        "2099.94",
        "52.50",
        "52.50",
        "0.00",
    )
    assert data["gstr3b"]["3.1(b)"]["note"] == "not_modelled"

    hsn = {
        (r["hsn_sac"], r["uqc"], r["tax_rate"], r["supply_type"]): r for r in data["hsn"]["rows"]
    }
    b2b = hsn[("1006", "NOS", "5.000", "b2b")]
    # The B2B invoice's 2.000 less the credit note's 1.000 — returns net here too.
    assert (b2b["total_qty"], b2b["taxable_value"]) == ("1.000", "1244.94")
    assert b2b["gstr1_table"] == "12" and b2b["description"] == "Basmati Rice 5kg"

    docs = {r["nature"]: r for r in data["docs"]}
    invoices, notes = docs["invoices_outward"], docs["credit_notes"]
    assert invoices == {
        "nature": "invoices_outward",
        "series_prefix": "INV/26-27/",
        "from_number": "INV/26-27/0041",
        "to_number": "INV/26-27/0042",
        "total_count": 2,
        "cancelled_count": 0,
        "net_issued": 2,
        "gstr1_table": "13",
    }
    assert notes["nature"] == "credit_notes" and notes["total_count"] == 1
    meta = body["meta"]
    assert meta["date_from"] == "2026-09-01"
    assert meta["filing_due_dates"] == {"gstr1": "2026-10-11", "gstr3b": "2026-10-20"}
    assert meta["exception_count"] == 0 and meta["is_ready"] is True


def test_a_credit_note_with_no_invoice_behind_it_is_the_one_exception(
    owner: Any, shop: Any, br14: dict
) -> None:
    """FR-9 `cn_without_original` — SAL-04 allows a standalone note, and the checklist
    flags it; BR-14's note is written against INV/26-27/0041 and is not flagged. The
    BR-14 test failed after SAL-04 merged because its fixture had left `against` unset."""
    sale(
        shop,
        "CN/26-27/0002",
        kind="credit_note",
        on=dt.date(2026, 9, 14),
        customer=br14["ramesh"],
        lines=[{"taxable": "100.00"}],
        round_off="0.00",
    )
    body = _get(owner).json()
    assert body["meta"]["exception_count"] == 1 and body["meta"]["is_ready"] is False
    (row,) = body["data"]["exceptions"]
    assert (row["number"], row["issue_code"]) == ("CN/26-27/0002", "cn_without_original")


def _register_taxable(client: Any, url: str, date_from: str, date_to: str) -> Decimal:
    body = client.get(reverse(url) + f"?date_from={date_from}&date_to={date_to}").json()
    return _d(body["meta"]["totals"]["taxable_total"])


def test_three_way_reconciliation_with_the_registers(owner: Any, shop: Any) -> None:
    """T-RPT07-6 + §32.13.2 — HSN = rate-wise = the sales register; inward = purchases."""
    mohan = party(shop, name="Mohan", gstin=KARNATAKA_GSTIN, state_code="29")
    sale(
        shop,
        "INV/1",
        on=SEP,
        customer=mohan,
        pos="29",
        lines=[{"taxable": "1234.56", "rate": "18"}],
    )
    sale(
        shop,
        "INV/2",
        on=SEP,
        walk_in="X",
        lines=[
            {"taxable": "99.99", "code": "EXEMPT", "rate": "0", "hsn": None},
            {"taxable": "10.01", "rate": "40", "cess_rate": "12", "hsn": "2402"},
        ],
    )
    sale(shop, "INV/3", on=SEP, customer=mohan, status="void", lines=[{"taxable": "5000"}])
    sale(
        shop,
        "CN/1",
        kind="credit_note",
        on=SEP,
        customer=mohan,
        pos="29",
        lines=[{"taxable": "34.56", "rate": "18"}],
    )
    sale(
        shop,
        "INV/4",
        on=SEP,
        walk_in="Y",
        lines=[{"taxable": "1.00", "code": "NONGST", "rate": "0"}],
    )
    supplier = party(shop, name="Sup", gstin=RAMESH_GSTIN)
    bill(shop, "PB/1", on=SEP, supplier=supplier, lines=[{"taxable": "700.00", "rate": "18"}])
    bill(
        shop,
        "PB/2",
        on=SEP,
        supplier=supplier,
        itc=False,
        lines=[{"taxable": "300.00", "rate": "5"}],
    )
    bill(shop, "PB/3", on=SEP, supplier=supplier, status="void", lines=[{"taxable": "999.00"}])

    data = _get(owner, "?date_from=2026-09-01&date_to=2026-09-27").json()["data"]
    register = _register_taxable(owner, "v1:report-sales-register", "2026-09-01", "2026-09-27")
    rate_total = _d(data["outward"]["by_rate"]["total"]["taxable_value"])
    hsn_total = _d(data["hsn"]["total"]["taxable_value"])
    assert rate_total == hsn_total == register == Decimal("1311.00")
    assert sum(_d(r["taxable_value"]) for r in data["hsn"]["rows"]) == hsn_total
    by_rate = data["outward"]["by_rate"]
    for head in ("cgst", "sgst", "igst", "cess"):
        assert _d(by_rate["total"][head]) == _d(data["hsn"]["total"][head]), head
    # No RCM sale here, so 3.1(a) + 3.1(c) + 3.1(e) is the whole rate table.
    boxes = data["gstr3b"]
    assert sum(_d(boxes[b]["taxable"]) for b in ("3.1(a)", "3.1(c)", "3.1(e)")) == rate_total
    purchases = _register_taxable(owner, "v1:report-purchase-register", "2026-09-01", "2026-09-27")
    assert (
        _d(data["inward"]["by_rate"]["total"]["taxable_value"]) == purchases == Decimal("1000.00")
    )
    missing = [r for r in data["hsn"]["rows"] if r["hsn_sac"] == "(missing)"]
    assert missing and missing[0]["taxable_value"] == "99.99"


def test_the_rate_table_equals_the_frds_normative_sql(owner: Any, br14: dict, shop: Any) -> None:
    """BR-8 run verbatim beside the selector: the same rows, the same figures."""
    sale(
        shop,
        "INV/26-27/0050",
        on=SEP,
        walk_in="Z",
        pos="24",
        lines=[{"taxable": "321.09", "rate": "18"}],
    )
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT l.tax_code, l.tax_rate, d.is_inter_state,
                   SUM(CASE WHEN d.kind = 'credit_note' THEN -l.taxable_value ELSE l.taxable_value END),
                   SUM(CASE WHEN d.kind = 'credit_note' THEN -l.cgst ELSE l.cgst END),
                   SUM(CASE WHEN d.kind = 'credit_note' THEN -l.sgst ELSE l.sgst END),
                   SUM(CASE WHEN d.kind = 'credit_note' THEN -l.igst ELSE l.igst END),
                   SUM(CASE WHEN d.kind = 'credit_note' THEN -l.cess ELSE l.cess END),
                   COUNT(DISTINCT d.id)
              FROM sales_document d
              JOIN sales_document_line l ON l.document_id = d.id
             WHERE d.tenant_id = %s
               AND d.kind IN ('invoice','bill_of_supply','credit_note')
               AND d.status NOT IN ('draft','void')
               AND d.document_date BETWEEN %s AND %s
             GROUP BY l.tax_code, l.tax_rate, d.is_inter_state
             ORDER BY l.tax_rate, d.is_inter_state
            """,
            [shop.id, "2026-09-01", "2026-09-28"],
        )
        expected = [
            (code, str(rate), inter, *(str(v) for v in money), count)
            for code, rate, inter, *money, count in cursor.fetchall()
        ]
    rows = _get(owner, "?date_from=2026-09-01&date_to=2026-09-28").json()["data"]["outward"][
        "by_rate"
    ]["rows"]
    got = [
        (
            r["tax_code"],
            r["tax_rate"],
            r["is_inter_state"],
            r["taxable_value"],
            r["cgst"],
            r["sgst"],
            r["igst"],
            r["cess"],
            r["invoice_count"],
        )
        for r in rows
    ]
    assert got == expected


def test_b2cl_is_strictly_above_the_threshold_of_the_documents_date(owner: Any, shop: Any) -> None:
    """T-RPT07-2 / EC-4 / BR-4 — ₹1 L from 1 Nov 2024 (strict), ₹2.5 L before it."""
    for number, on, taxable in (
        ("A", dt.date(2024, 11, 5), "100000.00"),  # grand total 1,00,000.00 → B2CS
        ("B", dt.date(2024, 11, 5), "100000.01"),  # → B2CL
        ("C", dt.date(2024, 10, 30), "200000.00"),  # below the old ₹2.5 L → B2CS
        ("D", dt.date(2024, 10, 30), "250000.01"),  # → B2CL
    ):
        sale(
            shop,
            number,
            on=on,
            walk_in=number,
            pos="29",
            fy="2024-25",
            lines=[{"taxable": taxable, "rate": "0", "code": "GST5"}],
            round_off="0.00",
        )
    data = _get(owner, "?date_from=2024-10-01&date_to=2024-11-30").json()["data"]
    nature = {r["nature"]: r for r in data["outward"]["by_nature"]["rows"]}
    assert nature["b2cl"]["document_count"] == 2
    assert nature["b2cl"]["taxable_value"] == "350000.02"
    assert nature["b2cs"]["taxable_value"] == "300000.00"


def test_b2cs_is_keyed_by_state_and_rate_and_unregistered_credit_notes_net_into_it(
    owner: Any, shop: Any
) -> None:
    """T-RPT07-3 / BR-5 — no document numbers; a walk-in return reduces the bucket."""
    sale(shop, "INV/1", on=SEP, walk_in="A", lines=[{"taxable": "500.00"}])
    sale(shop, "INV/2", on=SEP, walk_in="B", lines=[{"taxable": "300.00"}])
    sale(shop, "INV/3", on=SEP, walk_in="C", pos="29", lines=[{"taxable": "200.00", "rate": "18"}])
    customer = party(shop, name="Unregistered Uma")
    sale(shop, "CN/1", kind="credit_note", on=SEP, customer=customer, lines=[{"taxable": "100.00"}])
    detail = _get(owner).json()["data"]["outward"]["b2cs"]
    keys = {(r["pos_state"], r["tax_rate"], r["is_inter_state"]): r for r in detail}
    assert keys[("27", "5.000", False)]["taxable_value"] == "700.00"
    assert keys[("27", "5.000", False)]["gstr1_table"] == "7A"
    assert keys[("29", "18.000", True)]["igst"] == "36.00"
    assert keys[("29", "18.000", True)]["gstr1_table"] == "7B"
    assert all("number" not in r for r in detail)


def test_tax_heads_are_read_from_the_line_never_recomputed(owner: Any, shop: Any) -> None:
    """T-RPT07-4 / BR-3 — mutate a stored line and the report follows it."""
    document = sale(shop, "INV/1", on=SEP, walk_in="A", lines=[{"taxable": "1000.00"}])
    line = document.lines.get()
    assert (line.cgst, line.sgst, line.igst) == (_d("25.00"), _d("25.00"), _d("0.00"))
    line.cgst = _d("25.01")
    line.save()
    row = _get(owner).json()["data"]["outward"]["by_rate"]["rows"][0]
    assert row["cgst"] == "25.01" and row["igst"] == "0.00"
    sale(shop, "INV/2", on=SEP, walk_in="B", pos="29", lines=[{"taxable": "1000.00"}])
    rows = _get(owner).json()["data"]["outward"]["by_rate"]["rows"]
    inter = next(r for r in rows if r["is_inter_state"])
    assert (inter["cgst"], inter["sgst"], inter["igst"]) == ("0.00", "0.00", "50.00")


def test_rupee_rounding_applies_to_section_totals_not_rows(owner: Any, shop: Any) -> None:
    """T-RPT07-5 / BR-6 — rows keep paise; the total is ROUND(Σ, 0) half-up."""
    for n, taxable in enumerate(("10.50", "10.50", "10.49")):
        sale(
            shop,
            f"INV/{n}",
            on=SEP,
            walk_in="A",
            lines=[{"taxable": taxable, "code": "GST0", "rate": "0", "hsn": f"10{n}"}],
        )
    data = _get(owner, "?period=2026-09&rounding=rupee").json()["data"]
    assert data["hsn"]["total"]["taxable_value"] == "31"
    assert [r["taxable_value"] for r in data["hsn"]["rows"]] == ["10.50", "10.50", "10.49"]
    assert data["gstr3b"]["3.1(c)"]["taxable"] == "31"
    paise = _get(owner).json()["data"]
    assert paise["hsn"]["total"]["taxable_value"] == "31.49"


def test_the_series_counts_cancelled_numbers_in_the_middle(owner: Any, shop: Any) -> None:
    """T-RPT07-7 / EC-9 / AC-4 — 0041…0048 with 0043 and 0047 void: total 8, cancelled 2."""
    for n in range(41, 49):
        sale(
            shop,
            f"INV/26-27/{n:04d}",
            on=SEP,
            walk_in="A",
            status="void" if n in (43, 47) else "issued",
        )
    (row,) = _get(owner, "?period=2026-09&section=docs").json()["data"]["docs"]
    assert (row["from_number"], row["to_number"]) == ("INV/26-27/0041", "INV/26-27/0048")
    assert (row["total_count"], row["cancelled_count"], row["net_issued"]) == (8, 2, 6)


def test_the_series_orders_by_the_number_not_the_string(owner: Any, shop: Any) -> None:
    """A series that outgrows its padding: 10000 follows 9999."""
    sale(shop, "INV/9999", on=SEP, walk_in="A")
    sale(shop, "INV/10000", on=SEP, walk_in="A")
    (row,) = _get(owner, "?period=2026-09&section=docs").json()["data"]["docs"]
    assert (row["from_number"], row["to_number"]) == ("INV/9999", "INV/10000")


def test_gstr3b_boxes_itc_and_the_rcm_sale_exclusion(owner: Any, shop: Any) -> None:
    """T-RPT07-8 / AC-5 / AC-6 / EC-10 / EC-14."""
    registered = party(shop, gstin=RAMESH_GSTIN)
    sale(shop, "INV/1", on=SEP, walk_in="A", lines=[{"taxable": "2100.00"}])  # output 105.00
    sale(shop, "INV/2", on=SEP, customer=registered, rcm=True, lines=[{"taxable": "1000.00"}])
    sale(shop, "INV/3", on=SEP, walk_in="B", pos="29", lines=[{"taxable": "400.00", "rate": "18"}])
    supplier = party(shop, name="Sup", gstin=RAMESH_GSTIN)
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
        lines=[{"taxable": "100.00", "rate": "5"}],
    )
    bill(
        shop,
        "PB/4",
        on=SEP,
        supplier=supplier,
        lines=[{"taxable": "80.00", "code": "EXEMPT", "rate": "0"}],
    )
    data = _get(owner).json()["data"]
    boxes = data["gstr3b"]
    assert boxes["3.1(a)"]["taxable"] == "2500.00", "the RCM sale is the recipient's to pay"
    assert boxes["3.1(a)"]["igst"] == "72.00"
    assert boxes["3.1(d)"] == {
        "taxable": "100.00",
        "igst": "0.00",
        "cgst": "2.50",
        "sgst": "2.50",
        "cess": "0.00",
    }
    assert boxes["4(A)(5)"]["cgst"] == "450.00" and boxes["4(A)(5)"]["sgst"] == "450.00"
    assert boxes["4(A)(3)"]["cgst"] == "2.50"
    assert boxes["3.2"] == [{"pos_state": "29", "taxable": "400.00", "igst": "72.00"}]
    assert boxes["5"] == {"inter": "0.00", "intra": "80.00"}
    assert boxes["4(B)"]["note"] == "not_modelled"
    itc = data["inward"]["itc"]
    assert itc["eligible"]["total"] == "900.00"
    assert itc["not_claimable"] == "360.00"
    net = boxes["net_payable"]
    # Output 105.00 + 72.00 IGST + RCM 5.00; ITC 900.00 + 5.00 → credit carried forward.
    assert net["cgst"] == _signed("52.50", "2.50", "450.00", "2.50")
    assert _d(net["total"]) < 0 and net["method"] == "simple_head_wise"
    nature = {r["nature"]: r for r in data["outward"]["by_nature"]["rows"]}
    assert nature["b2b_rcm"]["gstr1_table"] == "4B"


def _signed(output: str, rcm: str, itc: str, rcm_itc: str) -> str:
    return str(_d(output) + _d(rcm) - _d(itc) - _d(rcm_itc))


def test_each_exception_fires_on_its_fixture_and_not_on_a_clean_one(owner: Any, shop: Any) -> None:
    """T-RPT07-9 / AC-7 — one document per code, and a clean document with none."""
    registered_no_gstin = party(shop, name="Reg", gst_registration="regular")
    sale(shop, "CLEAN/1", on=SEP, walk_in="Clean")
    sale(shop, "E/1", on=SEP, customer=registered_no_gstin)
    sale(shop, "E/2", on=SEP, customer=party(shop, name="Bad"), gstin="27AAACR5055K1Z0")
    sale(shop, "E/3", on=SEP, walk_in="H", lines=[{"hsn": None}])
    sale(shop, "E/4", on=SEP, walk_in="P", pos="", inter=False)
    sale(shop, "E/5", on=SEP, walk_in="M", pos="27", inter=True)
    sale(
        shop,
        "E/6",
        on=SEP,
        walk_in="Z",
        lines=[{"taxable": "0.00", "override": {"cgst": _d("1.00")}}],
    )
    sale(shop, "E/7", on=SEP, walk_in="L", lines=[{"code": "GST12", "rate": "12"}])
    body = _get(owner).json()
    codes = {(r["number"], r["issue_code"]) for r in body["data"]["exceptions"]}
    assert codes == {
        ("E/1", "missing_party_gstin"),
        ("E/2", "invalid_gstin_checksum"),
        ("E/3", "missing_hsn"),
        ("E/4", "missing_pos"),
        ("E/5", "pos_state_mismatch"),
        ("E/6", "zero_taxable_with_tax"),
        ("E/7", "legacy_rate_used"),
    }
    assert body["meta"]["exception_count"] == 7 and body["meta"]["is_ready"] is False
    first = body["data"]["exceptions"][0]
    assert set(first) >= {"document_id", "document_kind", "number", "party_name", "message"}


def test_a_legacy_slab_is_an_exception_only_after_it_ended(owner: Any, shop: Any) -> None:
    """T-RPT07-10 / BR-13 — GST12 on 10 Sep 2025 is fine; on 10 Oct 2025 it is not."""
    sale(
        shop,
        "OLD/1",
        on=dt.date(2025, 9, 10),
        walk_in="A",
        fy="2025-26",
        lines=[{"code": "GST12", "rate": "12"}],
    )
    sale(
        shop,
        "OLD/2",
        on=dt.date(2025, 10, 10),
        walk_in="B",
        fy="2025-26",
        lines=[{"code": "GST12", "rate": "12"}],
    )
    body = _get(owner, "?date_from=2025-09-01&date_to=2025-10-31").json()
    assert [(r["number"], r["issue_code"]) for r in body["data"]["exceptions"]] == [
        ("OLD/2", "legacy_rate_used")
    ]
    (row,) = body["data"]["outward"]["by_rate"]["rows"]
    assert row["tax_rate"] == "12.000", "grouped by the STORED rate"


def test_an_unregistered_business_is_told_to_add_a_gstin(owner: Any, shop: Any) -> None:
    """T-RPT07-11 / FR-11 — 409 `gst_not_registered`, not an error page."""
    shop.gst_type = "unregistered"
    shop.save()
    response = _get(owner)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "gst_not_registered"


def test_a_composition_business_gets_the_reduced_report(owner: Any, shop: Any) -> None:
    """T-RPT07-11 / BR-12 — CMP-08 turnover × rate, no ITC, no nature table."""
    shop.gst_type = "composition"
    shop.save()
    sale(
        shop,
        "BOS/1",
        kind="bill_of_supply",
        on=SEP,
        walk_in="A",
        lines=[{"taxable": "1000.00", "rate": "0", "code": "GST5"}],
    )
    data = _get(owner).json()["data"]
    assert data["composition"] == {
        "turnover": "1000.00",
        "rate": "1.000",
        "tax": "10.00",
        "box": "CMP-08 3",
    }
    assert "inward" not in data and "gstr3b" not in data
    assert "by_nature" not in data["outward"]


def test_staff_are_refused_and_accountants_read_it(shop: Any, api_as: Any) -> None:
    """T-RPT07-12 / §12 — `reports.financial.read` for the whole report."""
    staff, _ = api_as(shop, role="staff")
    assert _get(staff).status_code == 403
    accountant, _ = api_as(shop, role="accountant")
    assert _get(accountant).status_code == 200


def test_a_section_subset_returns_exactly_those_keys(owner: Any, br14: dict) -> None:
    """T-RPT07-12 / EC-12 — the second call of a two-call first paint."""
    data = _get(owner, "?period=2026-09&section=hsn,docs").json()["data"]
    assert set(data) == {"hsn", "docs"}
    only_rate = _get(owner, "?period=2026-09&section=rate&type=outward").json()["data"]
    assert set(only_rate) == {"outward"} and set(only_rate["outward"]) == {"by_rate"}


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("2026-09", (dt.date(2026, 9, 1), dt.date(2026, 9, 30), "month")),
        ("2026-Q2", (dt.date(2026, 7, 1), dt.date(2026, 9, 30), "quarter")),
        ("2026-Q4", (dt.date(2027, 1, 1), dt.date(2027, 3, 31), "quarter")),
        ("fy:2026-27", (dt.date(2026, 4, 1), dt.date(2027, 3, 31), "fy")),
    ],
)
def test_periods_parse_as_the_portal_reads_them(raw: str, expected: tuple) -> None:
    """T-RPT07-13 — a quarter is a quarter of the FINANCIAL year (Q1 = Apr–Jun)."""
    assert parse_period(raw) == expected


@pytest.mark.parametrize(
    ("query", "field", "message"),
    [
        ("?period=2026-13", "period", "Period must be a month"),
        ("?period=fy:2026-28", "period", "Period must be a month"),
        ("?period=2026-09&date_from=2026-09-01", "period", "either a period or a date range"),
        ("?date_from=2025-01-01&date_to=2026-02-01", "date_to", "at most one year"),
        ("?date_from=2026-09-01&date_to=2099-01-01", "date_to", "cannot be in the future"),
        ("?period=2099-01", "period", "cannot be in the future"),
        ("?type=sideways", "type", "Unknown supply type"),
        ("?section=hsn,profit", "section", "Unknown section: profit"),
        ("?rounding=lakh", "rounding", "paise or rupee"),
    ],
)
def test_each_invalid_parameter_has_its_frd_message(
    owner: Any, query: str, field: str, message: str
) -> None:
    """T-RPT07-13 — every §10 row, with its message."""
    response = _get(owner, query)
    assert response.status_code == 400
    assert message in response.json()["error"]["details"][field][0]


def test_a_year_to_date_period_is_clamped_to_today(owner: Any, br14: dict) -> None:
    """EC-13 — `fy:2026-27` before the year ends is allowed and says so."""
    meta = _get(owner, "?period=fy:2026-27&section=rate").json()["meta"]
    assert meta["year_to_date"] is True
    assert meta["date_to"] <= dt.date.today().isoformat()


def test_the_csv_export_is_one_zip_of_sheets_with_formulas_neutralised(
    owner: Any, shop: Any, br14: dict
) -> None:
    """FR-14 / RPT-08 BR-9 / BR-6 — one file; every sheet has the BOM; text is text."""
    evil = party(shop, name="=HYPERLINK(1)", gst_registration="regular")
    sale(shop, "INV/26-27/0043", on=SEP, customer=evil)
    response = _get(owner, "?period=2026-09&format=csv", HTTP_SEC_FETCH_SITE="same-origin")
    assert response.status_code == 200
    assert response["Content-Type"] == "application/zip"
    assert response["Content-Disposition"] == 'attachment; filename="gst-summary_2026-09.zip"'
    archive = zipfile.ZipFile(io.BytesIO(response.content))
    names = set(archive.namelist())
    assert {
        "gst-summary_outward-rate_2026-09.csv",
        "gst-summary_outward-nature_2026-09.csv",
        "gst-summary_hsn_2026-09.csv",
        "gst-summary_docs_2026-09.csv",
        "gst-summary_gstr3b_2026-09.csv",
        "gst-summary_exceptions_2026-09.csv",
    } <= names
    for name in names:
        assert archive.read(name).decode("utf-8").startswith("﻿"), name
    rate = list(
        csv.reader(io.StringIO(archive.read("gst-summary_outward-rate_2026-09.csv").decode()[1:]))
    )
    assert rate[0][:4] == ["tax_code", "tax_rate", "is_inter_state", "taxable_value"]
    assert rate[-1][0] == "TOTAL"
    exceptions = archive.read("gst-summary_exceptions_2026-09.csv").decode()
    assert "'=HYPERLINK(1)" in exceptions


def test_staff_may_not_export_the_gst_summary(shop: Any, api_as: Any) -> None:
    """RPT-08 §12 — refused before anything is computed."""
    staff, _ = api_as(shop, role="staff")
    assert _get(staff, "?period=2026-09&format=csv").status_code == 403


def test_a_rate_row_drills_into_register_lines_that_sum_to_it(owner: Any, shop: Any) -> None:
    """FR-13 via CR-RPT-2 — the register at line level, filtered by the row's keys, IS the row."""
    sale(
        shop,
        "INV/1",
        on=SEP,
        walk_in="A",
        lines=[{"taxable": "100.00"}, {"taxable": "40.00", "rate": "18", "code": "GST18"}],
    )
    sale(shop, "INV/2", on=SEP, walk_in="B", lines=[{"taxable": "60.00"}])
    sale(
        shop, "CN/1", kind="credit_note", on=SEP, customer=party(shop), lines=[{"taxable": "10.00"}]
    )
    rows = _get(owner).json()["data"]["outward"]["by_rate"]["rows"]
    five = next(r for r in rows if r["tax_code"] == "GST5")
    lines = owner.get(
        reverse("v1:report-sales-register")
        + "?date_from=2026-09-01&date_to=2026-09-27&level=line&tax_code=GST5&inter_state=false"
    ).json()["data"]
    assert {line["tax_rate"] for line in lines} == {"5.000"}
    assert sum(_d(line["taxable_value"]) for line in lines) == _d(five["taxable_value"])
    assert sum(_d(line["cgst"]) for line in lines) == _d(five["cgst"])
