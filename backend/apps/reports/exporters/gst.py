"""RPT-07 FR-14 / RPT-08 BR-9 — the GST summary as ONE ZIP of CSV sheets.

One file per section (`gst-summary_<section>_<range>.csv`) inside one
`gst-summary_<range>.zip`: a multi-section report never produces several
downloads. Each CSV is written by `apps.common.exports.csv_lines`, so every
sheet has the BOM, CRLF line ends and formula neutralising the list exports
have (a party named `=cmd|…` in the exceptions sheet reaches Excel as text).

XLSX (FR-14's workbook) is not built: the in-house writer RPT-08 FR-11
describes does not exist yet, and the lead scoped this wave to CSV.
"""

from __future__ import annotations

import io
import zipfile
from collections.abc import Iterable
from apps.common.exports import ExportColumn, csv_lines
from apps.reports.exporters.registers import BOOL, DATE, MONEY, QTY, RATE, TEXT, cell


def _columns(spec: Iterable[tuple[str, str]]) -> tuple[ExportColumn, ...]:
    return tuple(
        ExportColumn(
            header=key,
            value=(lambda row, key=key, kind=kind: cell(row.get(key), kind)),
            numeric=kind in (MONEY, QTY, RATE),
        )
        for key, kind in spec
    )


RATE_COLS = (
    ("tax_code", TEXT),
    ("tax_rate", RATE),
    ("is_inter_state", BOOL),
    ("taxable_value", MONEY),
    ("cgst", MONEY),
    ("sgst", MONEY),
    ("igst", MONEY),
    ("cess", MONEY),
    ("invoice_count", TEXT),
    ("gstr3b_box", TEXT),
)
NATURE_COLS = (
    ("nature", TEXT),
    ("gstr1_table", TEXT),
    ("applicable", BOOL),
    ("document_count", TEXT),
    ("taxable_value", MONEY),
    ("cgst", MONEY),
    ("sgst", MONEY),
    ("igst", MONEY),
    ("cess", MONEY),
    ("invoice_value", MONEY),
)
B2CS_COLS = (
    ("pos_state", TEXT),
    ("tax_rate", RATE),
    ("is_inter_state", BOOL),
    ("gstr1_table", TEXT),
    ("taxable_value", MONEY),
    ("cgst", MONEY),
    ("sgst", MONEY),
    ("igst", MONEY),
    ("cess", MONEY),
)
NIL_COLS = (
    ("registered", BOOL),
    ("is_inter_state", BOOL),
    ("nil", MONEY),
    ("exempt", MONEY),
    ("non_gst", MONEY),
    ("gstr1_table", TEXT),
)
HSN_COLS = (
    ("hsn_sac", TEXT),
    ("description", TEXT),
    ("uqc", TEXT),
    ("supply_type", TEXT),
    ("total_qty", QTY),
    ("tax_rate", RATE),
    ("taxable_value", MONEY),
    ("igst", MONEY),
    ("cgst", MONEY),
    ("sgst", MONEY),
    ("cess", MONEY),
    ("total_value", MONEY),
)
DOCS_COLS = (
    ("nature", TEXT),
    ("series_prefix", TEXT),
    ("from_number", TEXT),
    ("to_number", TEXT),
    ("total_count", TEXT),
    ("cancelled_count", TEXT),
    ("net_issued", TEXT),
)
INWARD_COLS = (
    ("tax_code", TEXT),
    ("tax_rate", RATE),
    ("is_inter_state", BOOL),
    ("itc_eligible", BOOL),
    ("reverse_charge", BOOL),
    ("taxable_value", MONEY),
    ("cgst", MONEY),
    ("sgst", MONEY),
    ("igst", MONEY),
    ("cess", MONEY),
    ("bill_count", TEXT),
    ("gstr3b_box", TEXT),
)
GSTR3B_COLS = (
    ("box", TEXT),
    ("taxable", MONEY),
    ("igst", MONEY),
    ("cgst", MONEY),
    ("sgst", MONEY),
    ("cess", MONEY),
    ("note", TEXT),
)
EXCEPTION_COLS = (
    ("document_date", DATE),
    ("number", TEXT),
    ("document_kind", TEXT),
    ("party_name", TEXT),
    ("issue_code", TEXT),
    ("message", TEXT),
)


def _gstr3b_rows(boxes: dict) -> list[dict]:
    rows = []
    for box, value in boxes.items():
        if box == "3.2":
            rows.extend(
                {"box": f"3.2 ({s['pos_state']})", "taxable": s["taxable"], "igst": s["igst"]}
                for s in value
            )
        elif box == "5":
            rows.append({"box": "5 (inter-state)", "taxable": value["inter"]})
            rows.append({"box": "5 (intra-state)", "taxable": value["intra"]})
        elif box == "net_payable":
            rows.append({"box": "net_payable", **value, "note": value.get("method")})
        else:
            rows.append({"box": box, **value})
    return rows


def _with_total(section: dict, key: str) -> list[dict]:
    return [*section["rows"], {key: "TOTAL", **section["total"]}]


def gst_sheets(payload: dict) -> list[tuple[str, tuple[ExportColumn, ...], list[dict]]]:
    """`(sheet, columns, rows)` for every section present in the payload."""
    data = payload["data"]
    sheets: list[tuple[str, tuple[ExportColumn, ...], list[dict]]] = []
    outward = data.get("outward") or {}
    if "by_rate" in outward:
        sheets.append(
            ("outward-rate", _columns(RATE_COLS), _with_total(outward["by_rate"], "tax_code"))
        )
    if "by_nature" in outward:
        sheets.append(("outward-nature", _columns(NATURE_COLS), outward["by_nature"]["rows"]))
        sheets.append(("b2cs", _columns(B2CS_COLS), outward["b2cs"]))
        sheets.append(("nil-exempt", _columns(NIL_COLS), outward["nil_exempt"]))
    if "hsn" in data:
        sheets.append(("hsn", _columns(HSN_COLS), _with_total(data["hsn"], "hsn_sac")))
    if "docs" in data:
        sheets.append(("docs", _columns(DOCS_COLS), data["docs"]))
    if "inward" in data:
        sheets.append(
            ("inward", _columns(INWARD_COLS), _with_total(data["inward"]["by_rate"], "tax_code"))
        )
    if "gstr3b" in data:
        sheets.append(("gstr3b", _columns(GSTR3B_COLS), _gstr3b_rows(data["gstr3b"])))
    if "composition" in data:
        block = data["composition"]
        sheets.append(
            (
                "cmp08",
                _columns((("box", TEXT), ("turnover", MONEY), ("rate", RATE), ("tax", MONEY))),
                [block],
            )
        )
    if "exceptions" in data:
        sheets.append(("exceptions", _columns(EXCEPTION_COLS), data["exceptions"]))
    return sheets


def gst_zip(payload: dict, *, range_label: str) -> bytes:
    """The whole summary as one ZIP_DEFLATED archive, held in memory (it is aggregates)."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for sheet, columns, rows in gst_sheets(payload):
            text = "".join(csv_lines(columns, rows))
            archive.writestr(f"gst-summary_{sheet}_{range_label}.csv", text.encode("utf-8"))
    return buffer.getvalue()
