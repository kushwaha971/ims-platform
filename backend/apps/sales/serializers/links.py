"""`links` on a document read — what it is tied to (SAL-01 §9, SAL-04 §9/§14, SAL-05 §7).

One nested object rather than a dozen top-level keys, so an invoice read and a
credit note read keep the §22.7 common shape and differ only inside `links`:

* estimate → `converted_to` (the invoice it became);
* invoice  → `converted_from`, `credit_notes[]` (notes written against it) and
  `credit_applications[]` (credit used on it, from any note);
* credit note → `against`, `applications[]`, `refund`, `reason`, `restock`,
  `settlement`, `open_credit`.

Each list is one query; a list read never includes `links`.
"""

from __future__ import annotations

from typing import Any

from apps.sales.serializers.common import doc_ref


def _applications(rows: Any, other: str) -> list[dict]:
    out = []
    for row in rows.select_related(other).order_by("created_at"):
        target = getattr(row, other)
        out.append({**(doc_ref(target) or {}), "amount": str(row.amount)})
    return out


def document_links(obj: Any) -> dict:
    from apps.sales.models import SalesCreditApplication, SalesDocument

    if obj.kind == "estimate":
        target = (
            SalesDocument.objects.filter(pk=obj.converted_to_id).first()
            if obj.converted_to_id
            else None
        )
        return {"converted_to": doc_ref(target)}
    if obj.kind == "credit_note":
        meta = obj.meta or {}
        against = (
            SalesDocument.objects.filter(pk=obj.against_id).first() if obj.against_id else None
        )
        return {
            "against": doc_ref(against),
            "applications": _applications(
                SalesCreditApplication.objects.filter(credit_note=obj), "invoice"
            ),
            "refund": meta.get("refund"),
            "refund_request": meta.get("refund_request"),
            "reason": meta.get("reason") or {},
            "restock": bool(meta.get("restock", True)),
            "settlement": meta.get("settlement") or "hold_advance",
            "open_credit": str(obj.amount_due) if obj.status in ("issued", "applied") else None,
        }
    source = (
        SalesDocument.objects.filter(pk=obj.converted_from_id).first()
        if obj.converted_from_id
        else None
    )
    notes = SalesDocument.objects.filter(tenant_id=obj.tenant_id, against_id=obj.id).order_by(
        "document_date", "created_at"
    )
    return {
        "converted_from": doc_ref(source),
        "credit_notes": [doc_ref(note) for note in notes],
        "credit_applications": _applications(
            SalesCreditApplication.objects.filter(invoice=obj), "credit_note"
        ),
    }
