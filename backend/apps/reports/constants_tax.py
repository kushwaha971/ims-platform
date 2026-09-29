"""Constants for the tax-document reports: RPT-03, RPT-04 and RPT-07.

Its own module beside `constants.py` so the day-book and dashboard track can
grow that file without this one conflicting with it. The document kinds each
register reads, the tax codes that are not "taxable supply" for GSTR-3B, the
GSTR-1 table each nature maps to, and the limits §10 of each FRD states.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal

# ── Registers (RPT-03 / RPT-04) ─────────────────────────────────────────────

#: RPT-03 BR-5 — estimates and challans are never in the sales register.
#: `credit_note` is SAL-04's kind; it is a string here rather than a
#: `DocumentKind` member so the register reads the rows SAL-04 writes whether
#: or not that enum member exists on this branch.
SALES_REGISTER_KINDS: tuple[str, ...] = ("invoice", "bill_of_supply", "credit_note")
CREDIT_NOTE = "credit_note"
# ── A15 ── `sales_document_line.credit_mode` of a value credit (R51, ADR-057).
VALUE_CREDIT = "value"
#: RPT-04 BR-3 — only bills (debit notes are PUR-07, Phase 2).
PURCHASE_REGISTER_KINDS: tuple[str, ...] = ("purchase_bill",)

VOID = "void"
DRAFT = "draft"

#: The statuses a register row may carry. Drafts are never a register row.
SALES_REGISTER_STATUSES: tuple[str, ...] = (
    "issued",
    "partially_paid",
    "paid",
    "overdue",
    "applied",  # SAL-04 — a credit note whose credit is fully used
    "void",
)
PURCHASE_REGISTER_STATUSES: tuple[str, ...] = (
    "recorded",
    "partially_paid",
    "paid",
    "overdue",
    "void",
)

#: RPT-03 NFR — "server pagination 100 rows".
REGISTER_PAGE_SIZE = 100
REGISTER_PAGE_SIZE_MAX = 200
#: RPT-03 §10 / RPT-07 §10 — at most one year per request.
MAX_RANGE_DAYS = 366

REGISTER_ORDERINGS: dict[str, tuple[str, ...]] = {
    "document_date": ("document_date", "fy_label", "number", "id"),
    "-document_date": ("-document_date", "-fy_label", "-number", "-id"),
    "number": ("fy_label", "number", "id"),
    "-number": ("-fy_label", "-number", "-id"),
    "grand_total": ("grand_total", "document_date", "id"),
    "-grand_total": ("-grand_total", "document_date", "id"),
}
DEFAULT_REGISTER_ORDERING = "document_date"

# ── GST summary (RPT-07) ────────────────────────────────────────────────────

#: BR-9 — `3.1(c)` nil-rated and exempt; `3.1(e)` non-GST.
NIL_EXEMPT_CODES: frozenset[str] = frozenset({"GST0", "NIL", "EXEMPT"})
NON_GST_CODES: frozenset[str] = frozenset({"NONGST"})

GSTR1_TABLE: dict[str, str] = {
    "b2b": "4A",
    "b2b_rcm": "4B",
    "b2cl": "5A",
    "b2cs": "7",
    "cdnr": "9B",
    "cdnur": "9B (UR)",
    "nil_exempt": "8",
    "advances": "11A/11B",
}
#: The order the nature table reads in, which is the GSTR-1 table order.
NATURE_ORDER: tuple[str, ...] = (
    "b2b",
    "b2b_rcm",
    "b2cl",
    "b2cs",
    "cdnr",
    "cdnur",
    "nil_exempt",
    "advances",
)

#: BR-4 — the notified B2CL thresholds, by document date. Overridable per
#: tenant by the `gst.b2cl_threshold` setting (CR-RPT-3), same shape.
B2CL_THRESHOLD_SETTING = "gst.b2cl_threshold"
B2CL_THRESHOLD_DEFAULT: tuple[tuple[dt.date, Decimal], ...] = (
    (dt.date(2017, 7, 1), Decimal("250000.00")),
    (dt.date(2024, 11, 1), Decimal("100000.00")),
)
#: BR-12 — the composition levy rate, per cent.
COMPOSITION_RATE_SETTING = "gst.composition_rate"
COMPOSITION_RATE_DEFAULT = Decimal("1.000")

#: FR-1 — the `section` whitelist.
GST_SECTIONS: tuple[str, ...] = ("rate", "nature", "hsn", "docs", "itc", "exceptions", "gstr3b")
GST_TYPES: tuple[str, ...] = ("outward", "inward", "both")
GST_ROUNDINGS: tuple[str, ...] = ("paise", "rupee")
#: EC-5 — the HSN key a line without one is grouped under, so totals reconcile.
MISSING_HSN = "(missing)"
#: FR-5 — the portal's description limit.
HSN_DESCRIPTION_MAX = 30
#: FR-9 — the exceptions list is a worklist, not an archive.
EXCEPTIONS_MAX = 200
#: GSTR-1 table 13 natures this product issues.
DOC_NATURE_FOR_KIND: dict[str, str] = {
    "invoice": "invoices_outward",
    "bill_of_supply": "invoices_outward",
    "credit_note": "credit_notes",
}
#: Filing due dates (the day of the month after the period's last month).
GSTR1_DUE_DAY = 11
GSTR3B_DUE_DAY = 20

#: RPT-08 FR-8 — the fixed slugs, used for file names and export rows.
SLUG_SALES_REGISTER = "sales-register"
SLUG_PURCHASE_REGISTER = "purchase-register"
SLUG_GST_SUMMARY = "gst-summary"
