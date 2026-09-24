"""`check_rule46()` — GST Rule 46's mandatory fields as a checklist (SAL-02 FR-16, BR-15).

Computed on every read and save, never stored (`meta.rule46`). Hard issues
block issue with 400 `rule46_failed`; soft ones are warnings the editor shows
with an action. Nine checks are counted so the editor can say "Rule 46 ✓ 9/9".
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from apps.sales.constants import RULE46_ADDRESS_THRESHOLD, DocumentKind

TOTAL_CHECKS = 9


def _issue(code: str, field: str, severity: str) -> dict:
    return {"code": code, "field": field, "severity": severity}


def check_rule46(*, tenant: Any, document: Any, lines: list[Any], require_hsn_b2b: bool) -> dict:
    """`{passed, total, satisfied, issues[]}` — `passed` means no HARD issue."""
    issues: list[dict] = []
    tax_invoice = document.kind == DocumentKind.INVOICE and tenant.gst_type == "regular"
    party = document.party
    party_gstin = (party.gstin if party is not None else None) or None

    # 1. Supplier name, address and GSTIN (hard on a Tax Invoice).
    if tax_invoice and not tenant.gstin:
        issues.append(_issue("supplier_gstin_missing", "non_field_errors", "hard"))
    if not (tenant.address or {}).get("line1") and not (tenant.address or {}).get("city"):
        issues.append(_issue("supplier_address_missing", "non_field_errors", "soft"))
    # 2. Date of issue — always present (the column is NOT NULL).
    # 3. Recipient name (hard); walk-ins print "Walk-in customer".
    if (
        party is None
        and not document.walk_in_name
        and document.grand_total >= Decimal(RULE46_ADDRESS_THRESHOLD)
    ):
        issues.append(_issue("recipient_details_required", "walk_in_name", "soft"))
    if party is not None and not party.name:
        issues.append(_issue("recipient_name_missing", "party_id", "hard"))
    # 4. Unregistered recipient ≥ ₹50,000 needs an address.
    if (
        party is not None
        and not party_gstin
        and document.grand_total >= Decimal(RULE46_ADDRESS_THRESHOLD)
        and not (party.billing_address or {}).get("line1")
    ):
        issues.append(_issue("recipient_address_missing", "party_id", "soft"))
    # 5. HSN/SAC per line — soft, hard for B2B when the setting asks.
    for index, line in enumerate(lines):
        if not line.hsn_sac and tax_invoice:
            hard = require_hsn_b2b and bool(party_gstin)
            issues.append(
                _issue("hsn_missing", f"lines.{index}.hsn_sac", "hard" if hard else "soft")
            )
        # 6. Description (hard).
        if not line.description:
            issues.append(_issue("description_missing", f"lines.{index}.description", "hard"))
    # 7. At least one line with quantity (hard, at issue).
    if not lines:
        issues.append(_issue("no_lines", "lines", "hard"))
    # 8. Place of supply (hard on a tax document).
    if not document.place_of_supply_state:
        issues.append(_issue("place_of_supply_missing", "place_of_supply_state", "hard"))
    # 9. Recipient GSTIN when registered — soft (the party may be B2C).
    if party is not None and party.gst_registration == "regular" and not party_gstin:
        issues.append(_issue("recipient_gstin_missing", "party_id", "soft"))

    failed_codes = {issue["code"] for issue in issues}
    return {
        "passed": not any(issue["severity"] == "hard" for issue in issues),
        "total": TOTAL_CHECKS,
        "satisfied": max(TOTAL_CHECKS - len(failed_codes), 0),
        "issues": issues,
    }
