"""RPT-07 FR-9 — the pre-filing checklist: documents the portal would refuse.

Each check is one query over the period's outward documents (drafts and voids
excluded, BR-1) and yields `(document, issue_code)` pairs; the list is capped
for the screen (`EXCEPTIONS_MAX`) but `count` is the whole of it, so "3 issues
to fix" is never a count of the first page.

The codes, and what each one reads:

- `missing_party_gstin` — the party is registered (`gst_registration` regular
  or composition) but the document carries no GSTIN snapshot. EC-2 limits this
  to unfiled periods; filing is not recorded in this product, so every period
  is treated as unfiled and the accountant decides.
- `invalid_gstin_checksum` — the snapshot GSTIN fails the check digit.
- `missing_hsn` — a line of a TAX INVOICE with no HSN/SAC.
- `missing_pos` — no place of supply.
- `pos_state_mismatch` — `is_inter_state` disagrees with "place of supply ≠
  our state" (EC-7). The figure is still reported as stored.
- `legacy_rate_used` — a line's code had ended (`tax_rate.effective_to`)
  before the document's date and no later row of that code covers it (BR-13).
- `cn_without_original` — a credit note with no invoice behind it (needs
  SAL-04's `against`; skipped where the field does not exist).
- `zero_taxable_with_tax` — a line taxed on nothing.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.db.models import F, Q

from apps.reports.constants_tax import CREDIT_NOTE, EXCEPTIONS_MAX
from apps.reports.selectors.gst import outward_lines
from apps.reports.selectors.registers import has_field
from apps.sales.models import SalesDocument
from apps.tax.models import TaxRate
from apps.tax.validators import is_valid_gstin

MESSAGES: dict[str, str] = {
    "missing_party_gstin": "The party is GST-registered but this document has no GSTIN.",
    "invalid_gstin_checksum": "The party GSTIN on this document is not a valid GSTIN.",
    "missing_hsn": "A line on this tax invoice has no HSN/SAC code.",
    "missing_pos": "This document has no place of supply.",
    "pos_state_mismatch": "The place of supply and the inter-state flag disagree.",
    "legacy_rate_used": "A line uses a GST rate that had ended before this date.",
    "cn_without_original": "This credit note is not linked to an invoice.",
    "zero_taxable_with_tax": "A line has tax on a zero taxable value.",
}
ISSUE_CODES: tuple[str, ...] = tuple(MESSAGES)


def _documents(*, tenant: Any, date_from: dt.date, date_to: dt.date) -> Any:
    from apps.reports.constants_tax import DRAFT, SALES_REGISTER_KINDS, VOID

    return SalesDocument.objects.filter(
        tenant=tenant,
        kind__in=SALES_REGISTER_KINDS,
        document_date__gte=date_from,
        document_date__lte=date_to,
    ).exclude(status__in=(DRAFT, VOID))


def _legacy(lines: Any, tenant: Any) -> set:
    """Documents with a line whose code was not in force on the document's date."""
    ended = TaxRate.objects.filter(Q(tenant__isnull=True) | Q(tenant=tenant)).values_list(
        "code", "effective_from", "effective_to"
    )
    windows: dict[str, list[tuple[dt.date, dt.date | None]]] = {}
    for code, start, end in ended:
        windows.setdefault(code, []).append((start, end))
    legacy_codes = [code for code, spans in windows.items() if any(e for _, e in spans)]
    if not legacy_codes:
        return set()
    hits = set()
    candidates = (
        lines.filter(tax_code__in=legacy_codes)
        .values_list("document_id", "tax_code", "document__document_date")
        .order_by()
        .distinct()
    )
    for doc_id, code, on in candidates:
        covered = any(start <= on and (end is None or on <= end) for start, end in windows[code])
        if not covered:
            hits.add(doc_id)
    return hits


def gst_exceptions(*, tenant: Any, date_from: dt.date, date_to: dt.date) -> dict:
    """FR-9 — `{count, rows[:EXCEPTIONS_MAX]}`, one row per (document, code)."""
    from apps.parties.models import Party

    documents = _documents(tenant=tenant, date_from=date_from, date_to=date_to)
    lines = outward_lines(tenant=tenant, date_from=date_from, date_to=date_to)
    no_gstin = Q(party_gstin_snapshot__isnull=True) | Q(party_gstin_snapshot="")
    found: dict[str, set] = {code: set() for code in ISSUE_CODES}

    registered = Party.objects.filter(
        tenant=tenant, gst_registration__in=("regular", "composition")
    ).values("id")
    found["missing_party_gstin"] = set(
        documents.filter(no_gstin, party_id__in=registered).values_list("id", flat=True)
    )
    for doc_id, gstin in documents.exclude(no_gstin).values_list("id", "party_gstin_snapshot"):
        if not is_valid_gstin(gstin):
            found["invalid_gstin_checksum"].add(doc_id)
    found["missing_hsn"] = set(
        lines.filter(document__kind="invoice")
        .filter(Q(hsn_sac__isnull=True) | Q(hsn_sac=""))
        .values_list("document_id", flat=True)
    )
    no_pos = Q(place_of_supply_state__isnull=True) | Q(place_of_supply_state="")
    found["missing_pos"] = set(documents.filter(no_pos).values_list("id", flat=True))
    state = tenant.state_code or ""
    found["pos_state_mismatch"] = set(
        documents.exclude(no_pos)
        .filter(
            Q(is_inter_state=True, place_of_supply_state=state)
            | (Q(is_inter_state=False) & ~Q(place_of_supply_state=state))
        )
        .values_list("id", flat=True)
    )
    found["legacy_rate_used"] = _legacy(lines, tenant)
    if has_field(SalesDocument, "against"):
        found["cn_without_original"] = set(
            documents.filter(kind=CREDIT_NOTE, against__isnull=True).values_list("id", flat=True)
        )
    found["zero_taxable_with_tax"] = set(
        lines.filter(taxable_value=0)
        .filter(Q(cgst__gt=0) | Q(sgst__gt=0) | Q(igst__gt=0) | Q(cess__gt=0))
        .values_list("document_id", flat=True)
    )

    pairs = [(doc_id, code) for code in ISSUE_CODES for doc_id in found[code]]
    ids = {doc_id for doc_id, _ in pairs}
    heads = {
        row["id"]: row
        for row in SalesDocument.objects.filter(id__in=ids)
        .annotate(name=F("party_snapshot__name"))
        .values("id", "kind", "number", "document_date", "name", "walk_in_name")
    }
    rows = sorted(
        (
            {
                "document_id": doc_id,
                "document_kind": heads[doc_id]["kind"],
                "number": heads[doc_id]["number"],
                "document_date": heads[doc_id]["document_date"],
                "party_name": heads[doc_id]["name"] or heads[doc_id]["walk_in_name"] or "",
                "issue_code": code,
                "message": MESSAGES[code],
            }
            for doc_id, code in pairs
        ),
        key=lambda r: (r["document_date"], r["number"] or "", ISSUE_CODES.index(r["issue_code"])),
    )
    return {"count": len(rows), "rows": rows[:EXCEPTIONS_MAX]}
