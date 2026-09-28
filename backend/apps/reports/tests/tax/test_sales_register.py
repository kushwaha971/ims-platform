"""RPT-03 — the sales register: signed rows, totals over the filtered set, the file.

The property the report exists for is that its totals are TRUE, so the
central tests compute the same figures a second way — raw SQL over
`sales_document`, and the sum of every page of rows — and assert equality to
the paisa (Part 32 §32.13.2's exit criterion).
"""

from __future__ import annotations

import datetime as dt
import random
from decimal import Decimal
from typing import Any

import pytest
from django.db import connection
from django.urls import reverse

from apps.common import exports
from apps.reports.models import Export
from apps.reports.selectors.registers import has_field
from apps.reports.tests.tax.builders import (
    RAMESH_GSTIN,
    csv_rows,
    party,
    sale,
)
from apps.sales.models import SalesDocument

pytestmark = pytest.mark.django_db

URL = "v1:report-sales-register"
SEP = dt.date(2026, 9, 5)
AUG = dt.date(2026, 8, 20)
SEPTEMBER = "?date_from=2026-09-01&date_to=2026-09-27"


def _get(client: Any, query: str = SEPTEMBER, **headers: Any) -> Any:
    return client.get(reverse(URL) + query, **headers)


@pytest.fixture
def worked(shop: Any) -> dict:
    """RPT-03 AC-1 / RPT-07 BR-14 — the September documents."""
    ramesh = party(shop, gstin=RAMESH_GSTIN, gst_registration="regular")
    invoice = sale(
        shop,
        "INV/26-27/0041",
        on=SEP,
        customer=ramesh,
        lines=[{"taxable": "1688.57", "qty": "2"}],
        round_off="-1.00",
    )
    walk_in = sale(shop, "INV/26-27/0042", on=SEP, walk_in="Sita", lines=[{"taxable": "855.00"}])
    note = sale(
        shop,
        "CN/26-27/0001",
        kind="credit_note",
        on=dt.date(2026, 9, 12),
        customer=ramesh,
        lines=[{"taxable": "443.63"}],
        round_off="0.00",
    )
    return {"ramesh": ramesh, "invoice": invoice, "walk_in": walk_in, "note": note}


def test_a_credit_note_is_negative_and_the_totals_net(owner: Any, worked: dict) -> None:
    """AC-1 — +1,772.00 and −465.81 net to 1,306.19; taxes net the same way (BR-1)."""
    body = _get(owner).json()
    by_number = {row["number"]: row for row in body["data"]}
    assert by_number["INV/26-27/0041"]["grand_total"] == "1772.00"
    assert by_number["INV/26-27/0041"]["cgst"] == "42.21"
    assert by_number["INV/26-27/0041"]["sgst"] == "42.22"
    note = by_number["CN/26-27/0001"]
    assert note["grand_total"] == "-465.81"
    assert note["taxable_total"] == "-443.63"
    assert note["cgst"] == note["sgst"] == "-11.09"
    totals = body["meta"]["totals"]
    assert Decimal(totals["grand_total"]) == Decimal("1772.00") + Decimal("898.00") - Decimal(
        "465.81"
    )
    assert totals["taxable_total"] == "2099.94"
    assert totals["cgst"] == "52.50" and totals["sgst"] == "52.50"
    assert totals["count_by_kind"] == {"invoice": 2, "bill_of_supply": 0, "credit_note": 1}


def test_b2b_is_a_gstin_on_the_frozen_snapshot_and_walk_ins_are_b2c(
    owner: Any, worked: dict
) -> None:
    """AC-2 / BR-2 / BR-3 / EC-4 — and editing the party later changes nothing."""
    worked["ramesh"].gstin = None
    worked["ramesh"].save()
    body = _get(owner).json()
    by_number = {row["number"]: row for row in body["data"]}
    assert by_number["INV/26-27/0041"]["party_gstin"] == RAMESH_GSTIN
    assert by_number["INV/26-27/0041"]["is_b2b"] is True
    walk_in = by_number["INV/26-27/0042"]
    assert walk_in["is_b2b"] is False
    assert walk_in["party_name"] == "Walk-in (Sita)"
    assert walk_in["party_gstin"] == ""
    split = body["meta"]["totals"]
    assert split["b2b"] == {"count": 2, "taxable": "1244.94", "tax": "62.25"}
    assert split["b2c"] == {"count": 1, "taxable": "855.00", "tax": "42.75"}


def test_void_is_excluded_by_default_and_listed_with_zeroes_on_request(
    owner: Any, worked: dict, shop: Any
) -> None:
    """FR-5 / T-RPT03-1 — a void row changes the count and nothing else."""
    voided = sale(shop, "INV/26-27/0043", on=SEP, status="void", walk_in="V")
    default = _get(owner).json()
    assert "INV/26-27/0043" not in {r["number"] for r in default["data"]}
    flagged = _get(owner, SEPTEMBER + "&include_void=true").json()
    row = next(r for r in flagged["data"] if r["number"] == voided.number)
    assert row["status"] == "void"
    assert row["grand_total"] == row["taxable_total"] == row["cgst"] == "0.00"
    assert flagged["meta"]["totals"]["count"] == default["meta"]["totals"]["count"] + 1
    assert flagged["meta"]["totals"]["grand_total"] == default["meta"]["totals"]["grand_total"]


def test_drafts_estimates_and_other_months_are_never_rows(owner: Any, shop: Any) -> None:
    """BR-5 / EC-2 — by `document_date`; estimates are not a register document."""
    from apps.sales.models import SalesDocument as Doc

    sale(shop, "INV/26-27/0001", on=SEP)
    sale(shop, "INV/26-27/0002", on=AUG)
    sale(shop, "EST/26-27/0001", on=SEP, kind="estimate", status="sent")
    Doc.objects.create(
        tenant=shop,
        kind="invoice",
        fy_label="2026-27",
        document_date=SEP,
        place_of_supply_state="27",
    )
    numbers = [r["number"] for r in _get(owner).json()["data"]]
    assert numbers == ["INV/26-27/0001"]


def test_filters_narrow_the_rows_and_the_totals_together(owner: Any, shop: Any) -> None:
    """FR-6 + CR-RPT-2 — party, status, kind, b2b, inter-state, series, tax code."""
    ramesh = party(shop, gstin=RAMESH_GSTIN)
    other = party(shop, name="Mohan")
    sale(shop, "INV/26-27/0001", on=SEP, customer=ramesh, status="paid", paid="105.00")
    sale(shop, "INV/26-27/0002", on=SEP, customer=other, pos="29", lines=[{"rate": "18"}])
    sale(shop, "INV/26-27/0003", on=SEP, customer=other, lines=[{"code": "EXEMPT", "rate": "0"}])
    sale(shop, "CS/26-27/0001", on=SEP, walk_in="Cash")

    def numbers(query: str) -> tuple[list[str], dict]:
        body = _get(owner, SEPTEMBER + query).json()
        return [r["number"] for r in body["data"]], body["meta"]["totals"]

    assert numbers(f"&party_id={ramesh.id}")[0] == ["INV/26-27/0001"]
    assert numbers("&status=paid")[0] == ["INV/26-27/0001"]
    assert numbers("&b2b=true")[0] == ["INV/26-27/0001"]
    assert numbers("&inter_state=true")[0] == ["INV/26-27/0002"]
    assert numbers("&series=CS/")[0] == ["CS/26-27/0001"]
    assert numbers("&tax_code=EXEMPT")[0] == ["INV/26-27/0003"]
    rows, totals = numbers("&b2b=false")
    assert len(rows) == 3 and totals["count"] == 3
    assert numbers("&kind=credit_note")[0] == []


def _naive_totals(tenant: Any, date_from: str, date_to: str) -> dict:
    """The same figures by hand-written SQL — nothing shared with the selector."""
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT COUNT(*),
                   COALESCE(SUM(CASE WHEN kind = 'credit_note' THEN -taxable_total
                                     ELSE taxable_total END), 0),
                   COALESCE(SUM(CASE WHEN kind = 'credit_note' THEN -(cgst_total + sgst_total
                                     + igst_total + cess_total)
                                     ELSE cgst_total + sgst_total + igst_total + cess_total END), 0),
                   COALESCE(SUM(CASE WHEN kind = 'credit_note' THEN -grand_total
                                     ELSE grand_total END), 0),
                   COALESCE(SUM(CASE WHEN kind = 'credit_note' THEN -amount_due
                                     ELSE amount_due END), 0),
                   COALESCE(SUM(CASE WHEN kind = 'credit_note' THEN -round_off
                                     ELSE round_off END), 0)
              FROM sales_document
             WHERE tenant_id = %s
               AND kind IN ('invoice', 'bill_of_supply', 'credit_note')
               AND status NOT IN ('draft', 'void')
               AND document_date BETWEEN %s AND %s
            """,
            [tenant.id, date_from, date_to],
        )
        count, taxable, tax, grand, due, round_off = cursor.fetchone()
    return {
        "count": count,
        "taxable": taxable,
        "tax": tax,
        "grand": grand,
        "due": due,
        "round_off": round_off,
    }


def test_totals_reconcile_with_raw_sql_and_with_every_page_of_rows(owner: Any, shop: Any) -> None:
    """§32.13.2 — the selector's totals, a naive SQL aggregate and Σ every row agree.

    Forty documents of every kind and status, inter and intra, paged at 7 so
    the sum crosses six page boundaries.
    """
    rng = random.Random(20260928)
    customers = [party(shop, name=f"P{n}", gstin=RAMESH_GSTIN if n % 2 else None) for n in range(4)]
    for n in range(40):
        kind = rng.choice(["invoice", "invoice", "bill_of_supply", "credit_note"])
        status = rng.choice(["issued", "paid", "partially_paid", "overdue", "void"])
        prefix = {"invoice": "INV", "bill_of_supply": "BOS", "credit_note": "CN"}[kind]
        sale(
            shop,
            f"{prefix}/26-27/{n:04d}",
            kind=kind,
            status=status,
            on=dt.date(2026, 9, rng.randint(1, 27)),
            customer=rng.choice(customers),
            pos=rng.choice(["27", "29"]),
            paid=str(rng.randint(0, 50)),
            lines=[
                {"taxable": f"{rng.randint(1, 99999) / 100:.2f}", "rate": rng.choice(["5", "18"])}
                for _ in range(rng.randint(1, 3))
            ],
        )
    body = _get(owner, SEPTEMBER + "&page_size=7").json()
    totals = body["meta"]["totals"]
    naive = _naive_totals(shop, "2026-09-01", "2026-09-27")
    assert totals["count"] == naive["count"] == body["meta"]["total"]
    assert Decimal(totals["taxable_total"]) == naive["taxable"]
    assert Decimal(totals["tax"]) == naive["tax"]
    assert Decimal(totals["grand_total"]) == naive["grand"]
    assert Decimal(totals["amount_due"]) == naive["due"]
    assert Decimal(totals["round_off"]) == naive["round_off"]
    assert totals["b2b"]["count"] + totals["b2c"]["count"] == totals["count"]

    rows = []
    for page in range(1, body["meta"]["total_pages"] + 1):
        rows += _get(owner, SEPTEMBER + f"&page_size=7&page={page}").json()["data"]
    assert len(rows) == naive["count"]
    for column in ("taxable_total", "cgst", "sgst", "igst", "grand_total", "amount_paid"):
        assert sum(Decimal(r[column]) for r in rows) == Decimal(totals[column]), column


def test_line_level_sums_back_to_each_document(owner: Any, worked: dict, shop: Any) -> None:
    """T-RPT03-2 / BR-4 — Σ line taxable = the document's taxable_total, signs kept."""
    sale(
        shop,
        "INV/26-27/0050",
        on=SEP,
        lines=[{"taxable": "100.00"}, {"taxable": "250.50", "rate": "18", "hsn": "0402"}],
        walk_in="A",
    )
    documents = {r["number"]: r for r in _get(owner).json()["data"]}
    lines = _get(owner, SEPTEMBER + "&level=line").json()
    assert lines["meta"]["level"] == "line"
    per_doc: dict[str, Decimal] = {}
    for row in lines["data"]:
        per_doc[row["number"]] = per_doc.get(row["number"], Decimal("0")) + Decimal(
            row["taxable_value"]
        )
    assert per_doc == {n: Decimal(d["taxable_total"]) for n, d in documents.items()}
    note_line = next(r for r in lines["data"] if r["number"] == "CN/26-27/0001")
    assert note_line["qty"] == "-1.000"
    assert note_line["hsn_sac"] == "1006"


def test_the_csv_header_is_exact_and_the_cells_are_machine_readable(
    owner: Any, worked: dict
) -> None:
    """T-RPT03-3 / RPT-08 FR-9 — BOM, CRLF, exact header, ISO dates, signed plain amounts."""
    response = _get(owner, SEPTEMBER + "&format=csv", HTTP_SEC_FETCH_SITE="same-origin")
    assert response.status_code == 200
    assert response["Content-Disposition"] == (
        'attachment; filename="sales-register_2026-09-01_2026-09-27.csv"'
    )
    rows = csv_rows(response)
    assert rows[0] == (
        "date,number,kind,status,party_name,party_gstin,gst_registration,pos_state,"
        "is_inter_state,reverse_charge,subtotal,discount,taxable_total,cgst,sgst,igst,cess,"
        "round_off,grand_total,amount_paid,amount_due,due_on,against_number,created_by"
    ).split(",")
    by_number = {r[1]: dict(zip(rows[0], r, strict=True)) for r in rows[1:]}
    note = by_number["CN/26-27/0001"]
    assert note["date"] == "2026-09-12"
    assert note["grand_total"] == "-465.81"
    assert note["is_inter_state"] == "false"
    assert by_number["INV/26-27/0041"]["gst_registration"] == "regular"
    assert "+919812345678" not in ",".join(",".join(r) for r in rows), "walk-in mobile leaked"
    assert len(rows) - 1 == _get(owner).json()["meta"]["total"]


def test_a_formula_in_a_party_name_reaches_the_file_as_text(owner: Any, shop: Any) -> None:
    """RPT-08 BR-6 / T-RPT08-19."""
    evil = party(shop, name="=cmd|'/c calc'!A0")
    sale(shop, "INV/26-27/0001", on=SEP, customer=evil)
    rows = csv_rows(_get(owner, SEPTEMBER + "&format=csv"))
    assert rows[1][4] == "'=cmd|'/c calc'!A0"


def test_staff_may_read_the_register_but_not_export_it(
    shop: Any, api_as: Any, worked: dict
) -> None:
    """RPT-03 §12 / T-RPT03-5 — basic read, no cost columns, no file."""
    staff, _ = api_as(shop, role="staff")
    assert _get(staff).status_code == 200
    refused = _get(staff, SEPTEMBER + "&format=csv")
    assert refused.status_code == 403
    accountant, _ = api_as(shop, role="accountant")
    assert _get(accountant, SEPTEMBER + "&format=csv").status_code == 200


def test_another_tenants_documents_are_not_in_the_register(
    owner: Any, shop: Any, other_tenant: Any
) -> None:
    """Tenancy — the base WHERE is the tenant, whatever the filters say."""
    sale(shop, "INV/26-27/0001", on=SEP)
    sale(other_tenant, "INV/26-27/0001", on=SEP)
    assert [r["number"] for r in _get(owner).json()["data"]] == ["INV/26-27/0001"]
    assert _get(owner).json()["meta"]["totals"]["count"] == 1


def test_a_big_register_export_is_queued_and_the_file_is_the_same_rows(
    owner: Any, shop: Any, monkeypatch: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """RPT-08 FR-3 — over the threshold: 202, the job replays the SAME filtered set."""
    monkeypatch.setattr(exports, "SYNC_MAX_ROWS", 3)
    for n in range(5):
        sale(shop, f"INV/26-27/{n:04d}", on=SEP, walk_in=f"W{n}")
    sale(shop, "INV/26-27/0099", on=AUG, walk_in="August")
    with django_capture_on_commit_callbacks(execute=True):
        response = _get(owner, SEPTEMBER + "&level=line&format=csv")
    assert response.status_code == 202
    export = Export.objects.get(pk=response.json()["data"]["export_id"])
    assert export.resource == "sales-register-lines"
    assert export.status == "ready" and export.row_count == 5
    download = owner.get(reverse("v1:report-export-download", args=[export.id]))
    rows = csv_rows(download)
    assert rows[0][:3] == ["date", "number", "kind"] and "line_no" in rows[0]
    assert sorted(r[1] for r in rows[1:]) == [f"INV/26-27/{n:04d}" for n in range(5)]


@pytest.mark.parametrize(
    ("query", "field"),
    [
        ("?date_from=2025-01-01&date_to=2026-09-01", "date_to"),
        ("?level=hsn", "level"),
        ("?status=pending", "status"),
        ("?date_from=31-08-2026", "date_from"),
        ("?b2b=maybe", "b2b"),
    ],
)
def test_a_bad_parameter_is_a_400_naming_it(owner: Any, query: str, field: str) -> None:
    """§10 — range ≤ 366 days, `level ∈ {document, line}`, known statuses."""
    response = _get(owner, query)
    assert response.status_code == 400
    assert field in response.json()["error"]["details"]


@pytest.mark.skipif(
    not has_field(SalesDocument, "against"), reason="SAL-04's `against` is not on this branch"
)
def test_a_credit_note_names_its_invoice(owner: Any, worked: dict) -> None:
    """FR-2 `against_number` — once SAL-04 has merged."""
    note = worked["note"]
    note.against = worked["invoice"]
    note.save()
    row = next(r for r in _get(owner).json()["data"] if r["number"] == note.number)
    assert row["against_number"] == "INV/26-27/0041"
