"""GSTR-1 and GSTR-3B as the offline tool's JSON (Shop item 2, RPT-12).

The defects these prevent: a file that disagrees with the screen the
accountant checked it against (every section is held to the GST summary's own
figure); a credit note signed the screen's way inside `cdnr`, where the portal
applies the sign itself; one `itms` entry per LINE instead of per rate; an
empty section emitted as `[]`; and a file the portal would refuse after the
upload — a registered customer with no GSTIN, a line with no HSN, a month
still running — handed over instead of refused with the documents named.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.reports.tests.tax.builders import RAMESH_GSTIN, TENANT_GSTIN, bill, party, sale

pytestmark = pytest.mark.django_db

SEP = dt.date(2026, 9, 5)


def _url(kind: str) -> str:
    return reverse("v1:report-gst-return-json", kwargs={"return_type": kind})


def _file(client: Any, kind: str, query: str = "?period=2026-09") -> tuple[Any, dict]:
    response = client.get(_url(kind) + query)
    assert response.status_code == 200, response.content
    return response, json.loads(response.content)


@pytest.fixture
def br14(shop: Any) -> dict:
    """BR-14's September — a B2B invoice, a walk-in, a credit note against the first."""
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
    sale(
        shop,
        "CN/26-27/0001",
        kind="credit_note",
        on=dt.date(2026, 9, 12),
        customer=ramesh,
        lines=[{"taxable": "443.63"}],
        round_off="0.00",
        against=invoice,
    )
    return {"ramesh": ramesh, "invoice": invoice}


def test_gstr1_is_the_worked_example_in_the_offline_tools_shape(owner: Any, br14: dict) -> None:
    """T-RPT12-1/4/11 — numbers as numbers, DD-MM-YYYY, MMYYYY, the note positive."""
    response, body = _file(owner, "gstr1")
    assert response["Content-Type"].startswith("application/json")
    assert f'GSTR1_{TENANT_GSTIN}_092026.json"' in response["Content-Disposition"]
    assert response["X-File-Sha256"] == hashlib.sha256(response.content).hexdigest()
    assert b"\n" not in response.content  # compact, as the tool imports it
    assert (body["gstin"], body["fp"], body["version"], body["hash"]) == (
        TENANT_GSTIN,
        "092026",
        "GST3.2.2",
        "hash",
    )
    assert body["b2b"] == [
        {
            "ctin": RAMESH_GSTIN,
            "inv": [
                {
                    "inum": "INV/26-27/0041",
                    "idt": "05-09-2026",
                    "val": 1772.0,
                    "pos": "27",
                    "rchrg": "N",
                    "inv_typ": "R",
                    "itms": [
                        {
                            "num": 1,
                            "itm_det": {
                                "rt": 5,
                                "txval": 1688.57,
                                "iamt": 0.0,
                                "camt": 42.21,
                                "samt": 42.22,
                                "csamt": 0.0,
                            },
                        }
                    ],
                }
            ],
        }
    ]
    assert body["b2cs"] == [
        {
            "sply_ty": "INTRA",
            "pos": "27",
            "typ": "OE",
            "rt": 5,
            "txval": 855.0,
            "iamt": 0.0,
            "camt": 21.38,
            "samt": 21.37,
            "csamt": 0.0,
        }
    ]
    (note,) = body["cdnr"][0]["nt"]
    assert body["cdnr"][0]["ctin"] == RAMESH_GSTIN
    assert (note["ntty"], note["nt_num"], note["nt_dt"]) == ("C", "CN/26-27/0001", "12-09-2026")
    # Positive: the portal applies the sign from `ntty` (BR-3); the screen shows it negative.
    assert note["itms"][0]["itm_det"]["txval"] == 443.63
    (b2b_hsn,) = body["hsn"]["hsn_b2b"]
    assert (b2b_hsn["hsn_sc"], b2b_hsn["uqc"], b2b_hsn["qty"], b2b_hsn["txval"]) == (
        "1006",
        "NOS",
        1.0,
        1244.94,
    )
    docs = {d["doc_num"]: d["docs"] for d in body["doc_issue"]["doc_det"]}
    assert docs[1] == [
        {
            "num": 1,
            "from": "INV/26-27/0041",
            "to": "INV/26-27/0042",
            "totnum": 2,
            "cancel": 0,
            "net_issue": 2,
        }
    ]
    assert docs[5][0]["from"] == "CN/26-27/0001"
    # Nothing nil-rated, no large B2C invoice: those keys are absent, not [] (BR-9).
    assert "nil" not in body and "b2cl" not in body and "cdnur" not in body


def test_every_section_equals_the_screen_the_accountant_checked(owner: Any, br14: dict) -> None:
    """T-RPT12-2 — the central one: the file is the GST summary, section by section."""
    screen = owner.get(reverse("v1:report-gst-summary") + "?period=2026-09").json()["data"]
    _, body = _file(owner, "gstr1")
    nature = {r["nature"]: r for r in screen["outward"]["by_nature"]["rows"]}

    def txval(records: list[dict]) -> Decimal:
        return sum(
            (Decimal(str(i["itm_det"]["txval"])) for r in records for i in r["itms"]),
            Decimal("0"),
        )

    assert txval([inv for g in body["b2b"] for inv in g["inv"]]) == Decimal(
        nature["b2b"]["taxable_value"]
    )
    assert txval([nt for g in body["cdnr"] for nt in g["nt"]]) == Decimal(
        nature["cdnr"]["taxable_value"]
    )
    assert sum(Decimal(str(r["txval"])) for r in body["b2cs"]) == sum(
        Decimal(r["taxable_value"]) for r in screen["outward"]["b2cs"]
    )
    hsn = [row for rows in body["hsn"].values() for row in rows]
    assert sum(Decimal(str(r["txval"])) for r in hsn) == Decimal(
        screen["hsn"]["total"]["taxable_value"]
    )

    _, three_b = _file(owner, "gstr3b")
    box = screen["gstr3b"]["3.1(a)"]
    assert three_b["ret_period"] == "092026"
    assert three_b["sup_details"]["osup_det"] == {
        "txval": float(box["taxable"]),
        "iamt": float(box["igst"]),
        "camt": float(box["cgst"]),
        "samt": float(box["sgst"]),
        "csamt": float(box["cess"]),
    }


def test_one_ctin_per_customer_and_one_itms_entry_per_rate(owner: Any, shop: Any) -> None:
    """T-RPT12-5 (EC-4, EC-5) — two invoices to one GSTIN; lines summed by rate, `num` 1, 2."""
    ramesh = party(shop, gstin=RAMESH_GSTIN, gst_registration="regular")
    sale(
        shop,
        "INV/26-27/0001",
        on=SEP,
        customer=ramesh,
        lines=[
            {"taxable": "100.00", "rate": "5.000"},
            {"taxable": "50.00", "rate": "5.000"},
            {"taxable": "200.00", "rate": "18.000"},
        ],
    )
    sale(shop, "INV/26-27/0002", on=SEP, customer=ramesh, lines=[{"taxable": "10.00"}])
    _, body = _file(owner, "gstr1")
    (group,) = body["b2b"]
    assert [inv["inum"] for inv in group["inv"]] == ["INV/26-27/0001", "INV/26-27/0002"]
    itms = group["inv"][0]["itms"]
    assert [(i["num"], i["itm_det"]["rt"], i["itm_det"]["txval"]) for i in itms] == [
        (1, 5, 150.0),
        (2, 18, 200.0),
    ]


def test_a_file_the_portal_would_refuse_is_refused_here_with_the_documents_named(
    owner: Any, shop: Any
) -> None:
    """FR-6 — blocked before the upload, not after; GSTR-3B is aggregates and is not."""
    ramesh = party(shop, gstin=RAMESH_GSTIN, gst_registration="regular")
    sale(shop, "INV/26-27/0007", on=SEP, customer=ramesh, lines=[{"hsn": ""}])
    refused = owner.get(_url("gstr1") + "?period=2026-09")
    assert refused.status_code == 409, refused.content
    error = refused.json()["error"]
    assert error["code"] == "gstr1_blocked"
    assert [(i["issue_code"], i["number"]) for i in error["details"]["issues"]] == [
        ("missing_hsn", "INV/26-27/0007")
    ]
    assert owner.get(_url("gstr3b") + "?period=2026-09").status_code == 200


def test_only_a_whole_ended_month_and_only_the_owner_and_accountant(
    owner: Any, shop: Any, api_as: Any
) -> None:
    from apps.common.dates import tenant_today

    today = tenant_today(shop)
    this_month = owner.get(_url("gstr1") + f"?period={today:%Y-%m}")
    assert this_month.status_code == 409
    assert this_month.json()["error"]["code"] == "period_not_closed"
    part = owner.get(_url("gstr1") + "?date_from=2026-09-01&date_to=2026-09-15")
    assert part.status_code == 400
    assert owner.get(_url("gstr2") + "?period=2026-09").status_code == 404

    staff, _ = api_as(shop, role="staff")
    assert staff.get(_url("gstr1") + "?period=2026-09").status_code == 403

    shop.gst_type = "composition"
    shop.save(update_fields=["gst_type"])
    composition = owner.get(_url("gstr3b") + "?period=2026-09")
    assert composition.status_code == 409
    assert composition.json()["error"]["details"]["issues"][0]["issue_code"] == (
        "composition_scheme"
    )


def test_gstr3b_carries_the_credit_and_the_file_is_audited(owner: Any, shop: Any) -> None:
    """4(A)(5) is `itc_avl` OTH; every file leaves an audit row with its SHA-256."""
    from apps.platform_app.models import AuditLog

    supplier = party(shop, "Shree Wholesale", gstin=RAMESH_GSTIN, gst_registration="regular")
    bill(shop, "PUR/1", on=SEP, supplier=supplier)
    sale(shop, "INV/26-27/0001", on=SEP, walk_in="Sita", lines=[{"taxable": "1000.00"}])
    response, body = _file(owner, "gstr3b")
    other = next(row for row in body["itc_elg"]["itc_avl"] if row["ty"] == "OTH")
    assert other["camt"] > 0 and other == {"ty": "OTH", **body["itc_elg"]["itc_net"]}
    assert body["sup_details"]["osup_det"]["txval"] == 1000.0
    row = AuditLog.objects.filter(tenant=shop, action="gst.return_json.exported").get()
    assert row.metadata["file_hash"] == response["X-File-Sha256"]
    assert row.metadata["return"] == "gstr3b"
