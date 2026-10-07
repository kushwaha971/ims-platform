"""GSTR-1 and GSTR-3B as the JSON files the GST portal's offline tool loads.

docs/platform/15 Shop item 2, and RPT-12 in docs/17-04 — Vyapar and myBillBook
both hand the accountant a JSON for the offline tool; we gave them a screen to
type from. These files are built from the SAME selectors RPT-07's screen is
(`gst.outward_lines` with its nature rules, `outward_b2cs`, `outward_nil_exempt`,
`hsn_summary`, `document_series`, `gstr3b`), so the file and the screen cannot
disagree (RPT-12 BR-1); a test holds every section total to the screen's.

── What the file is, and what it is not ──────────────────────────────────────
A month only (a return is filed for a month; QRMP quarters are not modelled),
and a CLOSED month: a file for a month that is still running would be refiled.
Nothing is sent anywhere — the file is downloaded and the accountant loads it.

Shape, per the offline tool's import format:

* GSTR-1: `b2b` (by GSTIN → invoices → one `itms` entry per RATE, BR-4), `b2cl`
  (by place of supply), `b2cs` (rate-wise and state-wise, unregistered notes
  netted in, RPT-07 BR-5), `cdnr` / `cdnur` (notes POSITIVE with `ntty: "C"` —
  the portal applies the sign, BR-3), `nil`, `hsn` (split `hsn_b2b` /
  `hsn_b2c`, as table 12 has been since 2025) and `doc_issue`. A section with
  nothing in it is omitted, never `[]` (BR-9).
* GSTR-3B: tables 3.1, 3.2, 4 and 5 from `gst.gstr3b`, the figures the screen's
  GSTR-3B tab shows.

Money is a JSON NUMBER with two decimals here — the one place in the product,
because the schema demands it (RPT-12 FR-5). Dates are `DD-MM-YYYY`, the
period `MMYYYY`.

── Refused rather than wrong ─────────────────────────────────────────────────
The portal rejects a whole file for one bad invoice, after the accountant has
committed to the upload. So the problems RPT-07 already lists that the portal
would reject — a registered party with no GSTIN, a bad GSTIN, a line with no
HSN, no place of supply, a credit note with no invoice, tax on nothing — block
the GSTR-1 file, with the documents named. `legacy_rate_used` and
`pos_state_mismatch` are the screen's warnings and do not block.
"""

from __future__ import annotations

import datetime as dt
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from django.db.models import Q, Sum

from apps.common.exceptions import BusinessRuleViolation, ValidationFailed
from apps.reports.constants_tax import MISSING_HSN
from apps.reports.selectors import gst
from apps.reports.selectors.gst_checks import gst_exceptions
from apps.tax.validators import is_valid_gstin

RETURNS: tuple[str, ...] = ("gstr1", "gstr3b")
VERSION_SETTING = "gst.gstr1_json_version"
DEFAULT_VERSION = "GST3.2.2"
#: RPT-07's exceptions that the portal would refuse the file for.
BLOCKING: tuple[str, ...] = (
    "missing_party_gstin",
    "invalid_gstin_checksum",
    "missing_hsn",
    "missing_pos",
    "cn_without_original",
    "zero_taxable_with_tax",
)
#: Table 13's nature codes, as the offline tool numbers them.
DOC_NUM: dict[str, int] = {"invoices_outward": 1, "credit_notes": 5}
_HEADS = (("iamt", "igst"), ("camt", "cgst"), ("samt", "sgst"), ("csamt", "cess"))


# ── Numbers as the schema wants them ────────────────────────────────────────


def money(value: Any) -> float:
    """Two decimals, half-up on the stored (already rounded) sums — never re-derived."""
    return float(Decimal(value or 0).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def rate(value: Any) -> int | float:
    number = Decimal(value or 0)
    return int(number) if number == number.to_integral_value() else float(number)


def quantity(value: Any) -> float:
    return float(Decimal(value or 0).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP))


def portal_date(value: dt.date) -> str:
    return value.strftime("%d-%m-%Y")


# ── The period and the business ─────────────────────────────────────────────


def return_month(date_from: dt.date, date_to: dt.date, *, today: dt.date) -> str:
    """`MMYYYY` for a whole, ended calendar month; a refusal for anything else."""
    first = date_from.replace(day=1)
    following = (first.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
    last = following - dt.timedelta(days=1)
    one_month = "Choose one month — a return is filed for a month."
    if date_from != first or date_to > last:
        raise ValidationFailed({"period": [one_month]})
    if last >= today:
        raise BusinessRuleViolation(
            "period_not_closed",
            "You can make this file once the month has ended.",
            details={"month_ends": last.isoformat()},
        )
    if date_to != last:
        raise ValidationFailed({"period": [one_month]})
    return first.strftime("%m%Y")


def _issue(code: str, message: str, **extra: Any) -> dict:
    return {"issue_code": code, "message": message, **extra}


def business_issues(tenant: Any) -> list[dict]:
    if tenant.gst_type == "composition":
        return [
            _issue(
                "composition_scheme",
                "A composition business files CMP-08, not GSTR-1 or GSTR-3B.",
            )
        ]
    if not tenant.gstin:
        return [_issue("missing_tenant_gstin", "Add your GSTIN in Business settings.")]
    if not is_valid_gstin(tenant.gstin):
        return [_issue("invalid_tenant_gstin", "Your GSTIN in Business settings is not valid.")]
    return []


def gstr1_issues(*, tenant: Any, date_from: dt.date, date_to: dt.date) -> list[dict]:
    """Everything that would make the portal refuse the GSTR-1 file, with its document."""
    issues = business_issues(tenant)
    checks = gst_exceptions(tenant=tenant, date_from=date_from, date_to=date_to)
    issues += [row for row in checks["rows"] if row["issue_code"] in BLOCKING]
    # A bill of supply's line with no HSN is a warning on the screen, and still
    # an HSN row the portal refuses: table 12 has no "(missing)".
    lines = gst.outward_lines(tenant=tenant, date_from=date_from, date_to=date_to)
    no_hsn = (
        lines.exclude(document__kind="invoice")
        .filter(Q(hsn_sac__isnull=True) | Q(hsn_sac=""))
        .values_list("document__number", flat=True)
        .distinct()
    )
    issues += [
        _issue("missing_hsn", "A line on this bill has no HSN/SAC code.", number=number)
        for number in sorted(no_hsn)
    ]
    return issues


def refuse_if_blocked(issues: list[dict]) -> None:
    if issues:
        count = len(issues)
        raise BusinessRuleViolation(
            "gstr1_blocked",
            f"Fix {count} {'issue' if count == 1 else 'issues'} before making the file.",
            details={"count": count, "issues": issues[:50]},
        )


def version(tenant: Any) -> str:
    value = gst._setting(tenant, VERSION_SETTING)
    raw = value.get("version") if isinstance(value, dict) else value
    return str(raw) if raw else DEFAULT_VERSION


# ── GSTR-1 ──────────────────────────────────────────────────────────────────


def _itm(num: int, row: dict) -> dict:
    return {
        "num": num,
        "itm_det": {
            "rt": rate(row["tax_rate"]),
            "txval": money(row["txval"]),
            **{key: money(row[head]) for key, head in _HEADS},
        },
    }


def _documents(lines: Any, tenant: Any) -> dict[str, list[dict]]:
    """Per nature, each document with its lines summed per rate (BR-4), in date order."""
    rows = (
        lines.annotate(nature=gst._nature_expression(tenant))
        .exclude(nature__in=("b2cs", "nil_exempt"))
        .values(
            "nature",
            "document_id",
            "document__number",
            "document__document_date",
            "document__grand_total",
            "document__place_of_supply_state",
            "document__party_gstin_snapshot",
            "document__reverse_charge",
            "tax_rate",
        )
        .annotate(
            txval=Sum("taxable_value"),
            igst=Sum("igst"),
            cgst=Sum("cgst"),
            sgst=Sum("sgst"),
            cess=Sum("cess"),
        )
        .order_by("document__document_date", "document__number", "tax_rate")
    )
    by_nature: dict[str, dict[Any, dict]] = {}
    for row in rows:
        documents = by_nature.setdefault(row["nature"], {})
        document = documents.get(row["document_id"])
        if document is None:
            document = documents[row["document_id"]] = {"head": row, "rates": []}
        document["rates"].append(row)
    return {nature: list(documents.values()) for nature, documents in by_nature.items()}


def _invoice(document: dict, *, with_party: bool) -> dict:
    head = document["head"]
    body = {
        "inum": head["document__number"],
        "idt": portal_date(head["document__document_date"]),
        "val": money(head["document__grand_total"]),
        "pos": head["document__place_of_supply_state"],
    }
    if with_party:
        body["rchrg"] = "Y" if head["document__reverse_charge"] else "N"
        body["inv_typ"] = "R"
    body["itms"] = [_itm(num, row) for num, row in enumerate(document["rates"], start=1)]
    return body


def _note(document: dict) -> dict:
    head = document["head"]
    return {
        "ntty": "C",
        "nt_num": head["document__number"],
        "nt_dt": portal_date(head["document__document_date"]),
        "val": money(head["document__grand_total"]),
        "pos": head["document__place_of_supply_state"],
        "rchrg": "Y" if head["document__reverse_charge"] else "N",
        "inv_typ": "R",
        "itms": [_itm(num, row) for num, row in enumerate(document["rates"], start=1)],
    }


def _by(documents: list[dict], key: str) -> dict[str, list[dict]]:
    grouped: dict[str, list[dict]] = {}
    for document in documents:
        grouped.setdefault(document["head"][key], []).append(document)
    return grouped


def _nil_type(row: dict) -> str:
    inter = "INTER" if row["is_inter_state"] else "INTR"
    return f"{inter}{'B2B' if row['registered'] else 'B2C'}"


def _hsn_rows(rows: list[dict]) -> list[dict]:
    return [
        {
            "num": num,
            "hsn_sc": row["hsn_sac"],
            "desc": row["description"],
            "uqc": row["uqc"],
            "qty": quantity(row["total_qty"]),
            "rt": rate(row["tax_rate"]),
            "txval": money(row["taxable_value"]),
            **{key: money(row[head]) for key, head in _HEADS},
        }
        for num, row in enumerate(rows, start=1)
    ]


def gstr1(*, tenant: Any, date_from: dt.date, date_to: dt.date, fp: str) -> dict:
    lines = gst.outward_lines(tenant=tenant, date_from=date_from, date_to=date_to)
    documents = _documents(lines, tenant)
    body: dict[str, Any] = {
        "gstin": tenant.gstin,
        "fp": fp,
        "version": version(tenant),
        "hash": "hash",
    }

    b2b = documents.get("b2b", []) + documents.get("b2b_rcm", [])
    if b2b:
        body["b2b"] = [
            {"ctin": ctin, "inv": [_invoice(doc, with_party=True) for doc in docs]}
            for ctin, docs in sorted(_by(b2b, "document__party_gstin_snapshot").items())
        ]
    if documents.get("b2cl"):
        body["b2cl"] = [
            {"pos": pos, "inv": [_invoice(doc, with_party=False) for doc in docs]}
            for pos, docs in sorted(
                _by(documents["b2cl"], "document__place_of_supply_state").items()
            )
        ]
    b2cs = [
        {
            "sply_ty": "INTER" if row["is_inter_state"] else "INTRA",
            "pos": row["pos_state"],
            "typ": "OE",
            "rt": rate(row["tax_rate"]),
            "txval": money(row["taxable_value"]),
            **{key: money(row[head]) for key, head in _HEADS},
        }
        for row in gst.outward_b2cs(lines, tenant=tenant)
        if any(row[head] for head in gst.HEADS)
    ]
    if b2cs:
        body["b2cs"] = b2cs
    if documents.get("cdnr"):
        body["cdnr"] = [
            {"ctin": ctin, "nt": [_note(doc) for doc in docs]}
            for ctin, docs in sorted(
                _by(documents["cdnr"], "document__party_gstin_snapshot").items()
            )
        ]
    if documents.get("cdnur"):
        body["cdnur"] = [
            {key: value for key, value in _note(doc).items() if key not in ("rchrg", "inv_typ")}
            | {"typ": "B2CL"}
            for doc in documents["cdnur"]
        ]
    nil = [
        {
            "sply_ty": _nil_type(row),
            "nil_amt": money(row["nil"]),
            "expt_amt": money(row["exempt"]),
            "ngsup_amt": money(row["non_gst"]),
        }
        for row in gst.outward_nil_exempt(lines)
        if row["nil"] or row["exempt"] or row["non_gst"]
    ]
    if nil:
        body["nil"] = {"inv": nil}
    hsn_rows = [row for row in gst.hsn_summary(lines)["rows"] if row["hsn_sac"] != MISSING_HSN]
    hsn = {
        f"hsn_{supply}": _hsn_rows([row for row in hsn_rows if row["supply_type"] == supply])
        for supply in ("b2b", "b2c")
    }
    hsn = {key: rows for key, rows in hsn.items() if rows}
    if hsn:
        body["hsn"] = hsn
    series = gst.document_series(tenant=tenant, date_from=date_from, date_to=date_to)
    doc_det = []
    for nature, doc_num in DOC_NUM.items():
        docs = [row for row in series if row["nature"] == nature]
        if docs:
            doc_det.append(
                {
                    "doc_num": doc_num,
                    "docs": [
                        {
                            "num": num,
                            "from": row["from_number"],
                            "to": row["to_number"],
                            "totnum": row["total_count"],
                            "cancel": row["cancelled_count"],
                            "net_issue": row["net_issued"],
                        }
                        for num, row in enumerate(docs, start=1)
                    ],
                }
            )
    if doc_det:
        body["doc_issue"] = {"doc_det": doc_det}
    return body


# ── GSTR-3B ─────────────────────────────────────────────────────────────────


def _heads(box: dict, *, tax: bool = True) -> dict:
    body = {"txval": money(box.get("taxable"))}
    if tax:
        body |= {key: money(box.get(head)) for key, head in _HEADS}
    return body


def _itc(ty: str, box: dict | None = None) -> dict:
    box = box or {}
    return {"ty": ty, **{key: money(box.get(head)) for key, head in _HEADS}}


def gstr3b(*, tenant: Any, date_from: dt.date, date_to: dt.date, fp: str) -> dict:
    window = {"tenant": tenant, "date_from": date_from, "date_to": date_to}
    boxes = gst.gstr3b(gst.outward_lines(**window), gst.inward_lines(**window), tenant=tenant)
    available = {head: boxes["4(A)(3)"][head] + boxes["4(A)(5)"][head] for _, head in _HEADS}
    five = boxes["5"]
    return {
        "gstin": tenant.gstin,
        "ret_period": fp,
        "sup_details": {
            "osup_det": _heads(boxes["3.1(a)"]),
            "osup_zero": {"txval": 0.0, "iamt": 0.0, "csamt": 0.0},
            "osup_nil_exmp": _heads(boxes["3.1(c)"], tax=False),
            "isup_rev": _heads(boxes["3.1(d)"]),
            "osup_nongst": _heads(boxes["3.1(e)"], tax=False),
        },
        "inter_sup": {
            "unreg_details": [
                {
                    "pos": row["pos_state"],
                    "txval": money(row["taxable"]),
                    "iamt": money(row["igst"]),
                }
                for row in boxes["3.2"]
            ],
            "comp_details": [],
            "uin_details": [],
        },
        "itc_elg": {
            "itc_avl": [
                _itc("IMPG"),
                _itc("IMPS"),
                _itc("ISRC", boxes["4(A)(3)"]),
                _itc("ISD"),
                _itc("OTH", boxes["4(A)(5)"]),
            ],
            "itc_rev": [_itc("RUL"), _itc("OTH")],
            "itc_net": {key: money(available[head]) for key, head in _HEADS},
            "itc_inelg": [_itc("RUL"), _itc("OTH")],
        },
        "inward_sup": {
            "isup_details": [
                {"ty": "GST", "inter": money(five["inter"]), "intra": money(five["intra"])},
                {"ty": "NONGST", "inter": 0.0, "intra": 0.0},
            ]
        },
    }


def section_counts(body: dict) -> dict[str, int]:
    """For the audit row: how many records each GSTR-1 section carried."""
    counts: dict[str, int] = {}
    for key in ("b2b", "b2cl", "cdnr"):
        if key in body:
            inner = "nt" if key == "cdnr" else "inv"
            counts[key] = sum(len(group[inner]) for group in body[key])
    for key in ("b2cs", "cdnur"):
        if key in body:
            counts[key] = len(body[key])
    if "hsn" in body:
        counts["hsn"] = sum(len(rows) for rows in body["hsn"].values())
    return counts


__all__ = [
    "BLOCKING",
    "RETURNS",
    "business_issues",
    "gstr1",
    "gstr1_issues",
    "gstr3b",
    "refuse_if_blocked",
    "return_month",
    "section_counts",
]
