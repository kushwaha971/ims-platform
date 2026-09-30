"""What every sales document route shares: the envelope and the tabbed list (Part 26 §26.7)."""

from __future__ import annotations

from typing import Any

from apps.common.dates import tenant_today
from apps.common.exceptions import ValidationFailed
from apps.common.responses import StandardResponse
from apps.sales.models import SalesDocument
from apps.sales.selectors.documents import (
    ORDERING_FIELDS,
    apply_tab,
    detail_queryset,
    list_totals,
    tab_counts,
)
from apps.sales.serializers.document import DocumentReadSerializer
from apps.sales.serializers.lists import InvoiceListSerializer
from apps.sales.services.issue_parts import rule46_for


def _rule46(document: SalesDocument) -> dict:
    rows = [
        {"hsn_sac": line.hsn_sac, "description": line.description} for line in document.lines.all()
    ]
    return rule46_for(document.tenant, document, rows)


def envelope(
    document: SalesDocument, *, warnings: list | None = None, extra: dict | None = None
) -> dict:
    """`{data, meta}` for one document, re-read so the response is what was stored."""
    document = detail_queryset(tenant=document.tenant, kinds=None).get(pk=document.pk)
    meta: dict[str, Any] = {"warnings": warnings or [], **(extra or {})}
    if document.kind in ("invoice", "bill_of_supply"):
        meta["rule46"] = _rule46(document)
    return {"data": DocumentReadSerializer(document).data, "meta": meta}


def ok(document: SalesDocument, **kwargs: Any) -> Any:
    body = envelope(document, **kwargs)
    return StandardResponse.ok(body["data"], meta=body["meta"])


def created(document: SalesDocument, **kwargs: Any) -> Any:
    body = envelope(document, **kwargs)
    return StandardResponse.created(body["data"], meta=body["meta"])


def tabbed_list(view: Any, request: Any, tabs: dict[str, tuple[str, ...]]) -> Any:
    """The SAL-08 list shape for any kind: tab counts, totals over the filtered set, a page."""
    tab = request.query_params.get("tab") or "all"
    if tab not in tabs:
        raise ValidationFailed({"tab": [f"Choose one of {', '.join(tabs)}."]})
    ordering = (request.query_params.get("ordering") or "").strip()
    if ordering and ordering.lstrip("-") not in ORDERING_FIELDS:
        raise ValidationFailed({"ordering": [f"Sort by one of {', '.join(ORDERING_FIELDS)}."]})
    filtered = view.filter_queryset(view.get_queryset())
    counts = tab_counts(filtered, tabs)
    queryset = apply_tab(filtered, tab, tabs)
    totals = list_totals(queryset)
    page = view.paginate_queryset(queryset)
    from apps.sales.services.origins import page_labels

    rows = list(page)
    data = InvoiceListSerializer(
        rows,
        many=True,
        context={
            "today": tenant_today(view.get_tenant()),
            # ── A5 ── one label call per origin type for the page, never one per row.
            "origin_labels": page_labels(view.get_tenant(), rows),
        },
    ).data
    meta = {
        **view.paginator.get_meta(),
        "totals": {
            "count": totals["count"],
            "grand_total": str(totals["grand_total"]),
            "amount_due": str(totals["amount_due"]),
        },
        "tabs": counts,
    }
    return StandardResponse.ok(data, meta=meta)
