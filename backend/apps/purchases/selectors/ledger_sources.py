"""LED-10 FR-5 — the supplier khata names a purchase bill by its number.

Registered with the ledger in `PurchasesConfig.ready()`, as sales and payments
register theirs. Without it a bill's credit and its void's reversal were the
only document lines in a khata the timeline could not name or link — the row
fell back to "Purchase bill" with no number, next to a PAYOUT voucher that
said exactly which payment it was.
"""

from __future__ import annotations

from apps.purchases.models import PurchaseDocument


def resolve_purchase_documents(ids: set[str]) -> dict[str, dict]:
    rows = PurchaseDocument.objects.filter(pk__in=ids).values_list("id", "number", "status", "kind")
    return {
        str(pk): {"number": number, "status": status, "kind": kind}
        for pk, number, status, kind in rows
    }
