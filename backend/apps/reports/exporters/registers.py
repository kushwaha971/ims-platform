"""The registers' columns — one declaration read by the JSON rows AND the CSV.

RPT-08 BR-1, "the file equals the screen": every column is a `Field` with a
getter over the SAME annotated row the selector returns, and both renderings
are built from this list. A column added here is in the page and in the file
by construction, and the CSV header is exactly RPT-03 FR-2 / RPT-04 FR-2 in
that order (T-RPT03-3).

CSV cells follow RPT-08 FR-9 rather than the list exports' en-IN habits:
dates `YYYY-MM-DD`, booleans `true`/`false`, amounts plain signed decimals
(`-465.81`, never `(465.81)`), empty for null. Text still goes through
`apps.common.exports.neutralise` inside `csv_lines`, so a party named
`=cmd|'/c calc'!A0` reaches Excel as text (BR-6).

Walk-in mobile numbers are not a column (RPT-03 §19).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from apps.common.exports import ExportColumn

TEXT, MONEY, QTY, RATE, DATE, BOOL = "text", "money", "qty", "rate", "date", "bool"


@dataclass(frozen=True)
class Field:
    key: str
    get: Callable[[Any], Any]
    kind: str = TEXT
    #: The codename a member needs for this column to exist at all (BR-2).
    permission: str | None = None


def cell(value: Any, kind: str) -> Any:
    """RPT-08 FR-9 formatting, shared by the JSON (as strings) and the CSV."""
    if value is None:
        return None if kind != TEXT else ""
    if kind == DATE:
        return value.isoformat()
    if kind == BOOL:
        return "true" if value else "false"
    if kind in (MONEY, QTY, RATE):
        return str(value)
    return value


def _party_name(document: Any) -> str:
    """EC-4 — a walk-in reads "Walk-in" with the name typed, if any."""
    snapshot = document.party_snapshot or {}
    name = snapshot.get("name") or document.walk_in_name or ""
    if document.party_id is None:
        return f"Walk-in ({name})" if name else "Walk-in"
    return name


def _gst_registration(document: Any) -> str:
    """BR-2 — from the snapshot; a snapshot without the key reads its GSTIN."""
    snapshot = document.party_snapshot or {}
    if snapshot.get("gst_registration"):
        return snapshot["gst_registration"]
    return "regular" if document.party_gstin_snapshot else "unregistered"


def _doc(get: Callable[[Any], Any]) -> Callable[[Any], Any]:
    """A document getter lifted onto a LINE row."""
    return lambda line: get(line.document)


_SALES_DOC: tuple[Field, ...] = (
    Field("date", lambda d: d.document_date, DATE),
    Field("number", lambda d: d.number),
    Field("kind", lambda d: d.kind),
    Field("status", lambda d: d.status),
    Field("party_name", _party_name),
    Field("party_gstin", lambda d: d.party_gstin_snapshot or ""),
    Field("gst_registration", _gst_registration),
    Field("pos_state", lambda d: d.place_of_supply_state),
    Field("is_inter_state", lambda d: d.is_inter_state, BOOL),
    Field("reverse_charge", lambda d: d.reverse_charge, BOOL),
    Field("subtotal", lambda d: d.s_subtotal, MONEY),
    Field("discount", lambda d: d.s_discount_amount, MONEY),
    Field("taxable_total", lambda d: d.s_taxable_total, MONEY),
    Field("cgst", lambda d: d.s_cgst_total, MONEY),
    Field("sgst", lambda d: d.s_sgst_total, MONEY),
    Field("igst", lambda d: d.s_igst_total, MONEY),
    Field("cess", lambda d: d.s_cess_total, MONEY),
    Field("round_off", lambda d: d.s_round_off, MONEY),
    Field("grand_total", lambda d: d.s_grand_total, MONEY),
    Field("amount_paid", lambda d: d.s_amount_paid, MONEY),
    Field("amount_due", lambda d: d.s_amount_due, MONEY),
    Field("due_on", lambda d: d.due_on, DATE),
    Field("against_number", lambda d: getattr(d, "against_number", None) or ""),
    Field("created_by", lambda d: d.created_by_name),
)

_SALES_LINE: tuple[Field, ...] = (
    Field("date", _doc(lambda d: d.document_date), DATE),
    Field("number", _doc(lambda d: d.number)),
    Field("kind", _doc(lambda d: d.kind)),
    Field("party_name", _doc(_party_name)),
    Field("party_gstin", _doc(lambda d: d.party_gstin_snapshot or "")),
    Field("line_no", lambda line: line.line_no),
    Field("item_name", lambda line: line.description),
    Field("hsn_sac", lambda line: line.hsn_sac or ""),
    Field("qty", lambda line: line.s_qty, QTY),
    Field("unit", lambda line: line.unit_code),
    Field("unit_price", lambda line: line.unit_price, MONEY),
    Field("tax_inclusive", lambda line: line.tax_inclusive, BOOL),
    Field("line_discount", lambda line: line.s_discount_amount, MONEY),
    Field("taxable_value", lambda line: line.s_taxable_value, MONEY),
    Field("tax_rate", lambda line: line.tax_rate, RATE),
    Field("cgst", lambda line: line.s_cgst, MONEY),
    Field("sgst", lambda line: line.s_sgst, MONEY),
    Field("igst", lambda line: line.s_igst, MONEY),
    Field("cess", lambda line: line.s_cess, MONEY),
    Field("line_total", lambda line: line.s_line_total, MONEY),
)

_PURCHASE_DOC: tuple[Field, ...] = (
    Field("date", lambda d: d.document_date, DATE),
    Field("number", lambda d: d.number),
    Field("kind", lambda d: d.kind),
    Field("status", lambda d: d.status),
    Field("supplier_name", lambda d: (d.party_snapshot or {}).get("name") or ""),
    Field("supplier_gstin", lambda d: d.supplier_gstin_snapshot or ""),
    Field("supplier_invoice_number", lambda d: d.supplier_invoice_number or ""),
    Field("supplier_invoice_date", lambda d: d.supplier_invoice_date, DATE),
    Field("pos_state", lambda d: d.place_of_supply_state),
    Field("is_inter_state", lambda d: d.is_inter_state, BOOL),
    Field("reverse_charge", lambda d: d.reverse_charge, BOOL),
    Field("itc_eligible", lambda d: d.itc_effective, BOOL),
    Field("subtotal", lambda d: d.s_subtotal, MONEY),
    Field("discount", lambda d: d.s_discount_amount, MONEY),
    Field("taxable_total", lambda d: d.s_taxable_total, MONEY),
    Field("cgst", lambda d: d.s_cgst_total, MONEY),
    Field("sgst", lambda d: d.s_sgst_total, MONEY),
    Field("igst", lambda d: d.s_igst_total, MONEY),
    Field("cess", lambda d: d.s_cess_total, MONEY),
    Field("round_off", lambda d: d.s_round_off, MONEY),
    Field("grand_total", lambda d: d.s_grand_total, MONEY),
    Field("amount_paid", lambda d: d.s_amount_paid, MONEY),
    Field("amount_due", lambda d: d.s_amount_due, MONEY),
    Field("due_on", lambda d: d.due_on, DATE),
    # Debit notes are PUR-07 (Phase 2); the column is FR-2's and stays empty.
    Field("against_number", lambda d: ""),
    Field("created_by", lambda d: d.created_by_name),
)

_PURCHASE_LINE: tuple[Field, ...] = (
    Field("date", _doc(lambda d: d.document_date), DATE),
    Field("number", _doc(lambda d: d.number)),
    Field("kind", _doc(lambda d: d.kind)),
    Field("supplier_name", _doc(lambda d: (d.party_snapshot or {}).get("name") or "")),
    Field("supplier_gstin", _doc(lambda d: d.supplier_gstin_snapshot or "")),
    Field("line_no", lambda line: line.line_no),
    Field("item_name", lambda line: line.description),
    Field("hsn_sac", lambda line: line.hsn_sac or ""),
    Field("qty", lambda line: line.s_qty, QTY),
    Field("unit", lambda line: line.unit_code),
    # §19 — what the shop paid is cost data (RPT-04 §12, T-RPT04-4).
    Field("unit_cost", lambda line: line.unit_cost, MONEY, permission="reports.financial.read"),
    Field("line_discount", lambda line: line.s_discount_amount, MONEY),
    Field("taxable_value", lambda line: line.s_taxable_value, MONEY),
    Field("tax_rate", lambda line: line.tax_rate, RATE),
    Field("cgst", lambda line: line.s_cgst, MONEY),
    Field("sgst", lambda line: line.s_sgst, MONEY),
    Field("igst", lambda line: line.s_igst, MONEY),
    Field("cess", lambda line: line.s_cess, MONEY),
    Field("line_total", lambda line: line.s_line_total, MONEY),
    Field("itc_eligible", lambda line: line.itc_effective, BOOL),
)

FIELDS: dict[tuple[str, str], tuple[Field, ...]] = {
    ("sales", "document"): _SALES_DOC,
    ("sales", "line"): _SALES_LINE,
    ("purchase", "document"): _PURCHASE_DOC,
    ("purchase", "line"): _PURCHASE_LINE,
}


def export_columns(fields: tuple[Field, ...]) -> tuple[ExportColumn, ...]:
    """The CSV form of a field list, for `CsvExportMixin` (numbers are never escaped)."""
    return tuple(
        ExportColumn(
            header=f.key,
            value=(lambda row, f=f: cell(f.get(row), f.kind)),
            permission=f.permission,
            numeric=f.kind in (MONEY, QTY, RATE),
        )
        for f in fields
    )


def json_row(row: Any, fields: tuple[Field, ...], allowed: Callable[[str], bool]) -> dict:
    """One register row for the screen; a column the member may not see is ABSENT (BR-2)."""
    return {
        f.key: cell(f.get(row), f.kind)
        for f in fields
        if f.permission is None or allowed(f.permission)
    }
