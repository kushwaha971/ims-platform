"""Fixtures for the RPT-03/04/07 tests: documents built as ROWS, not through services.

Why rows. The registers and the GST summary read what SAL-02/SAL-04/SAL-05
and PUR-01/PUR-04 WRITE. The track was built before SAL-04/SAL-05 merged;
they have since, and `apps/sales/tests/test_credit_notes.py` reads real notes
through these reports to prove the assumptions below. Constructing the rows directly — with the tax columns the engine would have
stored (CGST = q2(t·r/200), SGST = q2(t·r/100) − CGST; IGST = q2(t·r/100)) —
tests the reports against the storage contract rather than against a second
copy of the issue flow. Assumptions about SAL-04's rows, stated once:

- a credit note is `kind='credit_note'` with POSITIVE stored amounts, status
  `issued` / `applied` / `void`, `amount_due` = its open credit;
- a voided document keeps its number and amounts, `status='void'`.

The `shop`/`owner` fixtures are in this folder's `conftest.py`; a subfolder, so the
day-book track can add its own `apps/reports/tests/conftest.py` without a clash.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from apps.common.money import q2, to_rupee

TENANT_GSTIN = "27AAPFU0939F1ZV"
RAMESH_GSTIN = "27AAACR5055K1Z7"
KARNATAKA_GSTIN = "29AAACR5055K1Z3"


def party(tenant: Any, name: str = "Ramesh Traders", **fields: Any) -> Any:
    from tests.factories.parties import PartyFactory

    fields.setdefault("state_code", "27")
    return PartyFactory(tenant=tenant, name=name, **fields)


def line_taxes(taxable: Decimal, rate: Decimal, *, inter: bool, cess_rate: Decimal) -> dict:
    tax = q2(taxable * rate / 100)
    cess = q2(taxable * cess_rate / 100)
    if inter:
        return {"cgst": Decimal("0.00"), "sgst": Decimal("0.00"), "igst": tax, "cess": cess}
    cgst = q2(taxable * rate / 200)
    return {"cgst": cgst, "sgst": tax - cgst, "igst": Decimal("0.00"), "cess": cess}


def _lines(spec: list[dict], *, inter: bool) -> list[dict]:
    built = []
    for index, raw in enumerate(spec, start=1):
        taxable = Decimal(str(raw.get("taxable", "100.00")))
        rate = Decimal(str(raw.get("rate", "5.000")))
        cess_rate = Decimal(str(raw.get("cess_rate", "0.000")))
        taxes = line_taxes(taxable, rate, inter=inter, cess_rate=cess_rate)
        taxes.update(raw.get("override", {}))
        qty = Decimal(str(raw.get("qty", "1.000")))
        built.append(
            {
                "line_no": index,
                "description": raw.get("description", "Basmati Rice 5kg"),
                "hsn_sac": raw.get("hsn", "1006"),
                "qty": qty,
                "unit_code": raw.get("unit", "NOS"),
                "price": q2(taxable / qty),
                "taxable_value": taxable,
                "tax_code": raw.get("code", f"GST{int(rate)}" if rate else "GST0"),
                "tax_rate": rate,
                "cess_rate": cess_rate,
                **taxes,
                "line_total": taxable + sum(taxes.values(), Decimal("0.00")),
            }
        )
    return built


def _totals(lines: list[dict], round_off: Any) -> dict:
    total = {
        "taxable_total": sum((ln["taxable_value"] for ln in lines), Decimal("0.00")),
        "cgst_total": sum((ln["cgst"] for ln in lines), Decimal("0.00")),
        "sgst_total": sum((ln["sgst"] for ln in lines), Decimal("0.00")),
        "igst_total": sum((ln["igst"] for ln in lines), Decimal("0.00")),
        "cess_total": sum((ln["cess"] for ln in lines), Decimal("0.00")),
    }
    raw_total = sum(total.values(), Decimal("0.00"))
    rounded = to_rupee(raw_total) if round_off is None else raw_total + Decimal(str(round_off))
    return {
        **total,
        "subtotal": total["taxable_total"],
        "round_off": rounded - raw_total,
        "grand_total": rounded,
    }


def sale(
    tenant: Any,
    number: str,
    *,
    on: dt.date,
    kind: str = "invoice",
    status: str = "issued",
    customer: Any = None,
    walk_in: str | None = None,
    gstin: str | None = None,
    pos: str = "27",
    inter: bool | None = None,
    rcm: bool = False,
    lines: list[dict] | None = None,
    round_off: Any = None,
    paid: Any = None,
    fy: str = "2026-27",
    snapshot: dict | None = None,
    **extra: Any,
) -> Any:
    """One issued sales document with its lines, stored as SAL-02 would store it."""
    from apps.sales.models import SalesDocument, SalesDocumentLine

    inter = (pos != (tenant.state_code or "27")) if inter is None else inter
    built = _lines(lines or [{}], inter=inter)
    totals = _totals(built, round_off)
    if gstin is None and customer is not None:
        gstin = customer.gstin or None
    amount_paid = totals["grand_total"] if customer is None else Decimal(str(paid or "0.00"))
    document = SalesDocument.objects.create(
        tenant=tenant,
        kind=kind,
        number=number,
        fy_label=fy,
        status=status,
        party=customer,
        walk_in_name=walk_in,
        walk_in_mobile="+919812345678" if customer is None else None,
        document_date=on,
        place_of_supply_state=pos,
        is_inter_state=inter,
        reverse_charge=rcm,
        supplier_gstin_snapshot=tenant.gstin,
        party_gstin_snapshot=gstin,
        party_snapshot=snapshot
        or {"name": customer.name if customer else (walk_in or ""), "gstin": gstin},
        amount_paid=amount_paid,
        amount_due=totals["grand_total"] - amount_paid,
        **totals,
        **extra,
    )
    for ln in built:
        SalesDocumentLine.objects.create(
            document=document,
            line_no=ln["line_no"],
            description=ln["description"],
            hsn_sac=ln["hsn_sac"],
            qty=ln["qty"],
            unit_code=ln["unit_code"],
            unit_price=ln["price"],
            taxable_value=ln["taxable_value"],
            tax_code=ln["tax_code"],
            tax_rate=ln["tax_rate"],
            cess_rate=ln["cess_rate"],
            cgst=ln["cgst"],
            sgst=ln["sgst"],
            igst=ln["igst"],
            cess=ln["cess"],
            line_total=ln["line_total"],
        )
    return document


def bill(
    tenant: Any,
    number: str,
    *,
    on: dt.date,
    supplier: Any,
    status: str = "recorded",
    supplier_invoice: str | None = None,
    supplier_date: dt.date | None = None,
    pos: str = "27",
    inter: bool | None = None,
    rcm: bool = False,
    itc: bool = True,
    lines: list[dict] | None = None,
    paid: Any = "0.00",
    fy: str = "2026-27",
) -> Any:
    """One recorded purchase bill, stored as PUR-01 would store it."""
    from apps.purchases.models import PurchaseDocument, PurchaseDocumentLine

    inter = (pos != (tenant.state_code or "27")) if inter is None else inter
    built = _lines(lines or [{}], inter=inter)
    totals = _totals(built, None)
    amount_paid = Decimal(str(paid))
    document = PurchaseDocument.objects.create(
        tenant=tenant,
        kind="purchase_bill",
        number=number,
        fy_label=fy,
        status=status,
        party=supplier,
        supplier_invoice_number=supplier_invoice or f"S-{number}",
        supplier_invoice_date=supplier_date or on,
        document_date=on,
        place_of_supply_state=pos,
        is_inter_state=inter,
        reverse_charge=rcm,
        itc_eligible=itc,
        supplier_gstin_snapshot=supplier.gstin or None,
        party_snapshot={"name": supplier.name, "gstin": supplier.gstin or None},
        amount_paid=amount_paid,
        amount_due=totals["grand_total"] - amount_paid,
        **totals,
    )
    for ln in built:
        PurchaseDocumentLine.objects.create(
            document=document,
            line_no=ln["line_no"],
            description=ln["description"],
            hsn_sac=ln["hsn_sac"],
            qty=ln["qty"],
            unit_code=ln["unit_code"],
            unit_cost=ln["price"],
            taxable_value=ln["taxable_value"],
            tax_code=ln["tax_code"],
            tax_rate=ln["tax_rate"],
            cess_rate=ln["cess_rate"],
            cgst=ln["cgst"],
            sgst=ln["sgst"],
            igst=ln["igst"],
            cess=ln["cess"],
            line_total=ln["line_total"],
        )
    return document


def csv_rows(response: Any) -> list[list[str]]:
    import csv
    import io

    body = b"".join(response.streaming_content).decode("utf-8")
    assert body.startswith("﻿"), "Excel needs the BOM to read Devanagari"
    assert "\r\n" in body, "RPT-08 FR-9 — CRLF line ends"
    return list(csv.reader(io.StringIO(body.lstrip("﻿"))))
