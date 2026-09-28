"""The customer's copy of a shared document — `GET /public/d/{token}` (SAL-03 FR-5).

An ALLOW-list, not the merchant's serializer minus a few keys. The public view
used to be `DocumentReadSerializer` with `created_by` and `party` popped, which
still handed the customer every internal id the document touches — the
document's own id, each line's `id`/`item_id`/`against_line_id`, every
receipt's payment id — plus `version`, `created_at`/`updated_at`, the
`doc_discount_allocation` working and the take-payment `meta`. Part 27 §27.12:
"Excluded: internal ids … any field not printed on paper." A field the
merchant's screen gains tomorrow must not appear on the customer's page by
default, so this module names what IS printed and nothing else.
"""

from __future__ import annotations

from typing import Any

from apps.sales.models import SalesDocument
from apps.sales.serializers.common import mask_mobile
from apps.sales.serializers.document import DocumentReadSerializer

#: The document fields a printed invoice, estimate or credit note carries.
DOCUMENT_FIELDS: tuple[str, ...] = (
    "kind",
    "number",
    "fy_label",
    "status",
    "walk_in_name",
    "document_date",
    "due_on",
    "valid_until",
    "place_of_supply_state",
    "is_inter_state",
    "reverse_charge",
    "discount_type",
    "discount_value",
    "round_off_enabled",
    "subtotal",
    "discount_amount",
    "taxable_total",
    "cgst_total",
    "sgst_total",
    "igst_total",
    "cess_total",
    "round_off",
    "grand_total",
    "amount_paid",
    "amount_due",
    "notes",
    "terms",
    "issued_at",
    "voided_at",
)

#: A printed line: what was sold, how much, at what tax. No ids.
LINE_FIELDS: tuple[str, ...] = (
    "line_no",
    "description",
    "hsn_sac",
    "qty",
    "unit_code",
    "unit_price",
    "tax_inclusive",
    "discount_type",
    "discount_value",
    "discount_amount",
    "taxable_value",
    "tax_rate",
    "cess_rate",
    "cgst",
    "sgst",
    "igst",
    "cess",
    "line_total",
)

#: A receipt as the bill prints it ("Paid ₹500 by UPI on 1 Apr 2026").
PAYMENT_FIELDS: tuple[str, ...] = ("number", "payment_date", "primary_mode", "amount", "status")

#: The seller block — the letterhead, which is on paper by definition.
SUPPLIER_FIELDS: tuple[str, ...] = (
    "name",
    "legal_name",
    "gstin",
    "gst_type",
    "state_code",
    "phone",
    "email",
    "address",
    "upi_vpa",
    "bank_details",
)

#: The buyer block. The mobile is masked below; nothing else of the party is sent.
PARTY_SNAPSHOT_FIELDS: tuple[str, ...] = (
    "name",
    "gstin",
    "state_code",
    "mobile",
    "billing_address",
    "shipping_address",
    "address",
)


def _pick(source: dict, fields: tuple[str, ...]) -> dict:
    return {key: source[key] for key in fields if key in source}


def public_document_payload(document: SalesDocument) -> dict[str, Any]:
    full = dict(DocumentReadSerializer(document).data)
    data = _pick(full, DOCUMENT_FIELDS)
    data["kind_label"] = document.kind
    data["walk_in_mobile"] = mask_mobile(full.get("walk_in_mobile"))
    snapshot = _pick(dict(full.get("party_snapshot") or {}), PARTY_SNAPSHOT_FIELDS)
    snapshot["mobile"] = mask_mobile(snapshot.get("mobile"))
    data["party_snapshot"] = snapshot
    data["supplier"] = _pick(dict(full.get("supplier") or {}), SUPPLIER_FIELDS)
    data["lines"] = [_pick(dict(row), LINE_FIELDS) for row in full.get("lines") or []]
    data["payments"] = [_pick(dict(row), PAYMENT_FIELDS) for row in full.get("payments") or []]
    # `links` names other documents by id; the customer's copy keeps only what
    # prints — a credit note's "Against INV/… dated …" (SAL-04 FR-11).
    against = (full.get("links") or {}).get("against")
    if against:
        data["against"] = {
            "number": against.get("number"),
            "document_date": against.get("document_date"),
        }
    branding = dict(document.tenant.branding or {})
    data["tenant_branding"] = {
        "app_name": branding.get("app_name"),
        "primary_hex": branding.get("primary_hex"),
        "doc_header": branding.get("doc_header"),
        "doc_footer": branding.get("doc_footer"),
    }
    return data
