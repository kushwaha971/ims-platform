"""LED-10 FR-5 — how a khata line names the invoice it came from.

Registered with `ledger.selectors.sources` in `SalesConfig.ready()`: the ledger
may not import sales (Part 20 §20.1.4), so sales tells it. One query for every
invoice on a timeline page.
"""

from __future__ import annotations

from apps.sales.models import SalesDocument


def resolve_sales_documents(ids: set[str]) -> dict[str, dict]:
    rows = SalesDocument.objects.filter(pk__in=ids).values_list("id", "number", "status", "kind")
    return {
        str(pk): {"number": number, "status": status, "kind": kind}
        for pk, number, status, kind in rows
    }
