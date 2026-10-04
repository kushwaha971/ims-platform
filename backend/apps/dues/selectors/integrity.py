"""BR-5's replay — a due's caches re-derived from their evidence (FRD 00 DUE-03 §9, T-DUE-03-4).

* Ledger and expectation dues: `settled_amount = Σ dues_settlement.amount`, and each
  component's `settled = Σ` its settlement rows.
* Document dues: `settled_amount = grand_total − amount_due` of the invoice, read through the
  document port (the engine never reads `sales_*`, rule D4).

`manage.py recalc_dues` prints what this finds; the replay fuzz asserts it finds nothing.
Read-only (rule D8).
"""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from typing import Any, Iterator, TypedDict

from django.db.models import Sum

from apps.common.money import ZERO, q2
from apps.dues.constants import Posting
from apps.dues.models import DuesDue, DuesDueComponent, DuesSettlement


class Drift(TypedDict):
    due_id: str
    field: str
    cached: str
    computed: str


def _settled_by_due(due_ids: list[Any]) -> dict[Any, Decimal]:
    rows = (
        DuesSettlement.objects.filter(due_id__in=due_ids)
        .values("due_id")
        .annotate(total=Sum("amount"))
    )
    return {row["due_id"]: q2(row["total"]) for row in rows}


def _settled_by_component(due_ids: list[Any]) -> dict[tuple[Any, str], Decimal]:
    rows = (
        DuesSettlement.objects.filter(due_id__in=due_ids)
        .values("due_id", "component")
        .annotate(total=Sum("amount"))
    )
    return {(row["due_id"], row["component"]): q2(row["total"]) for row in rows}


def due_drift(*, tenant_id: Any = None, chunk: int = 1000) -> Iterator[Drift]:
    """Every cache that disagrees with its evidence, due by due."""
    from apps.common.seams.documents import document_summaries

    dues = DuesDue.objects.select_related("schedule").order_by("tenant_id", "id")
    if tenant_id:
        dues = dues.filter(tenant_id=tenant_id)
    batch: list[DuesDue] = []
    for due in dues.iterator(chunk_size=chunk):
        batch.append(due)
        if len(batch) >= chunk:
            yield from _check(batch, document_summaries)
            batch = []
    if batch:
        yield from _check(batch, document_summaries)


def _check(batch: list[DuesDue], document_summaries: Any) -> Iterator[Drift]:
    ids = [d.id for d in batch]
    by_due = _settled_by_due(ids)
    by_component = _settled_by_component(ids)
    documents: dict[Any, Any] = {}
    by_tenant: dict[Any, set] = defaultdict(set)
    for due in batch:
        if due.schedule.posting == Posting.DOCUMENT and due.document_id:
            by_tenant[due.tenant].add(due.document_id)
    for tenant, doc_ids in by_tenant.items():
        documents = {**documents, **document_summaries(tenant=tenant, ids=doc_ids)}
    for due in batch:
        if due.schedule.posting == Posting.DOCUMENT:
            doc = documents.get(due.document_id) if due.document_id else None
            if doc is None:
                continue
            computed = q2(Decimal(doc["grand_total"]) - Decimal(doc["amount_due"]))
        else:
            computed = by_due.get(due.id, ZERO)
        if q2(due.settled_amount) != computed:
            yield {
                "due_id": str(due.id),
                "field": "settled_amount",
                "cached": str(q2(due.settled_amount)),
                "computed": str(computed),
            }
    for row in DuesDueComponent.objects.filter(due_id__in=ids):
        computed = by_component.get((row.due_id, row.component), ZERO)
        if q2(row.settled) != computed:
            yield {
                "due_id": str(row.due_id),
                "field": f"component.{row.component}.settled",
                "cached": str(q2(row.settled)),
                "computed": str(computed),
            }
