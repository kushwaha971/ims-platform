"""Who bought this item, who sold it to us, at what price — and what it made.

docs/platform/15 §1.4, the first of the Shop gaps: Vyapar's and myBillBook's
item page opens on the item's own transactions, sales by customer and
purchases by supplier, because those are the questions a shopkeeper asks of
an item ("who buys this most", "what did Agro Wholesale charge me last time").
Our item page had only the stock ledger.

Two sides, same shape:

* **Sales** — invoice and bill-of-supply lines for the item, drafts and voids
  excluded. What stayed sold is counted: a line half returned on a credit note
  counts its other half (the `invoice_profit` rule). The value is the TAXABLE
  value, GST being the government's. Margin is that value less the cost written
  onto the line at issue; a line whose cost was never known is left out of the
  margin, not counted as pure profit, and `uncosted_lines` says how many.
* **Purchases** — recorded bill lines; the rate is the unit cost paid, which is
  the "last price from this supplier" a merchant wants before ordering again.

Grouped by party (walk-in sales together as one row), plus the latest lines.
Margin is `reports.financial.read`'s (INV-08 EC-4); the caller decides.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from django.db.models import Count, DecimalField, ExpressionWrapper, F, Max, Q, Sum, Value
from django.db.models.functions import Coalesce

from apps.common.money import ZERO
from apps.reports.constants import DRAFT, SALE_KINDS, VOID

_WIDE = DecimalField(max_digits=24, decimal_places=6)
LINES_LIMIT = 50
PARTIES_LIMIT = 50


def _money(value: Decimal | None) -> str:
    return str((value or ZERO).quantize(Decimal("0.01")))


def _qty(value: Decimal | None) -> str:
    return str((value or ZERO).quantize(Decimal("0.001")))


def _rate(amount: Decimal | None, qty: Decimal | None) -> str | None:
    if not qty:
        return None
    return _money((amount or ZERO) / qty)


def _sales(tenant: Any, item_id: Any, date_from: dt.date | None, date_to: dt.date | None) -> Any:
    from apps.sales.models import SalesDocumentLine

    lines = SalesDocumentLine.objects.filter(
        document__tenant=tenant,
        document__kind__in=SALE_KINDS,
        item_id=item_id,
        qty__gt=0,
    ).exclude(document__status__in=(DRAFT, VOID))
    if date_from:
        lines = lines.filter(document__document_date__gte=date_from)
    if date_to:
        lines = lines.filter(document__document_date__lte=date_to)
    return lines


def _sale_figures() -> dict[str, Any]:
    """Per-line expressions. The queryset is NOT annotated with them before it is
    grouped: an aggregate with a `filter=` over an annotation's name reaches
    Postgres as a bare column ("column margin does not exist"), and re-using the
    name as the aggregate's alias is refused as an aggregate over an aggregate.
    So every Sum carries its own expression and only the line list annotates."""
    kept = F("qty") - Coalesce(F("returned_qty"), Value(Decimal("0")))
    return {
        "kept": ExpressionWrapper(kept, output_field=_WIDE),
        "sold": ExpressionWrapper(F("taxable_value") * kept / F("qty"), output_field=_WIDE),
        "margin": ExpressionWrapper(
            F("taxable_value") * kept / F("qty") - F("unit_cost_snapshot") * kept,
            output_field=_WIDE,
        ),
    }


def _purchases(
    tenant: Any, item_id: Any, date_from: dt.date | None, date_to: dt.date | None
) -> Any:
    from apps.purchases.models import PurchaseDocumentLine

    lines = PurchaseDocumentLine.objects.filter(
        document__tenant=tenant, document__kind="purchase_bill", item_id=item_id, qty__gt=0
    ).exclude(document__status__in=(DRAFT, VOID))
    if date_from:
        lines = lines.filter(document__document_date__gte=date_from)
    if date_to:
        lines = lines.filter(document__document_date__lte=date_to)
    return lines


def _purchase_figures() -> dict[str, Any]:
    return {
        "kept": ExpressionWrapper(F("qty"), output_field=_WIDE),
        "sold": ExpressionWrapper(F("taxable_value"), output_field=_WIDE),
    }


def item_trade(
    *,
    tenant: Any,
    item_id: Any,
    side: str,
    with_margin: bool,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
) -> dict[str, Any]:
    """`GET /reports/items/{id}/trade?side=sales|purchases`."""
    sales = side == "sales"
    lines = (_sales if sales else _purchases)(tenant, item_id, date_from, date_to)
    margin_on = sales and with_margin
    costed = Q(unit_cost_snapshot__isnull=False) if sales else Q()
    fig = _sale_figures() if sales else _purchase_figures()

    # Aliases never share a name with a column: `qty=Sum(...)` would make every
    # later F("qty") in the same call resolve to the SUM ("... is an aggregate").
    group = lines.values("document__party_id", "document__party__name").annotate(
        sum_qty=Coalesce(Sum(fig["kept"]), Decimal("0"), output_field=_WIDE),
        sum_amount=Coalesce(Sum(fig["sold"]), Decimal("0"), output_field=_WIDE),
        documents=Count("document_id", distinct=True),
        last_date=Max("document__document_date"),
        **(
            {
                "sum_margin": Coalesce(
                    Sum(fig["margin"], filter=costed), Decimal("0"), output_field=_WIDE
                )
            }
            if margin_on
            else {}
        ),
    )
    by_party = []
    for row in group.order_by("-sum_amount")[:PARTIES_LIMIT]:
        entry = {
            "party": (
                {"id": str(row["document__party_id"]), "name": row["document__party__name"]}
                if row["document__party_id"]
                else None
            ),
            "qty": _qty(row["sum_qty"]),
            "amount": _money(row["sum_amount"]),
            "avg_rate": _rate(row["sum_amount"], row["sum_qty"]),
            "documents": row["documents"],
            "last_date": row["last_date"].isoformat() if row["last_date"] else None,
        }
        if margin_on:
            entry["margin"] = _money(row["sum_margin"])
        by_party.append(entry)

    recent = []
    for line in (
        lines.annotate(**fig)
        .select_related("document", "document__party")
        .order_by("-document__document_date", "-document__created_at", "line_no")[:LINES_LIMIT]
    ):
        doc = line.document
        entry = {
            "document": {
                "id": str(doc.id),
                "kind": doc.kind,
                "number": doc.number,
                "date": doc.document_date.isoformat(),
            },
            "party": {"id": str(doc.party_id), "name": doc.party.name} if doc.party_id else None,
            "walk_in_name": getattr(doc, "walk_in_name", None),
            "qty": _qty(line.kept),
            "rate": _money(line.unit_price if sales else line.unit_cost),
            "amount": _money(line.sold),
        }
        if margin_on:
            entry["margin"] = _money(line.margin) if line.unit_cost_snapshot is not None else None
        recent.append(entry)

    totals_row = lines.aggregate(
        sum_qty=Coalesce(Sum(fig["kept"]), Decimal("0"), output_field=_WIDE),
        sum_amount=Coalesce(Sum(fig["sold"]), Decimal("0"), output_field=_WIDE),
        **(
            {
                "sum_margin": Coalesce(
                    Sum(fig["margin"], filter=costed), Decimal("0"), output_field=_WIDE
                ),
                "costed_amount": Coalesce(
                    Sum(fig["sold"], filter=costed), Decimal("0"), output_field=_WIDE
                ),
                "uncosted": Count("id", filter=Q(unit_cost_snapshot__isnull=True)),
            }
            if margin_on
            else {}
        ),
    )
    totals: dict[str, Any] = {
        "qty": _qty(totals_row["sum_qty"]),
        "amount": _money(totals_row["sum_amount"]),
        "avg_rate": _rate(totals_row["sum_amount"], totals_row["sum_qty"]),
    }
    if margin_on:
        totals["margin"] = _money(totals_row["sum_margin"])
        costed_amount = totals_row["costed_amount"] or ZERO
        totals["margin_pct"] = (
            str((totals_row["sum_margin"] * 100 / costed_amount).quantize(Decimal("0.1")))
            if costed_amount > 0
            else None
        )
        totals["uncosted_lines"] = totals_row["uncosted"]
    return {"side": side, "by_party": by_party, "lines": recent, "totals": totals}


def last_rate(
    *, tenant: Any, item_id: Any, party_id: Any, side: str, exclude: Any = None
) -> dict[str, Any] | None:
    """`GET /reports/items/{id}/last-rate?side=&party=` — price memory (Shop gap §1.5).

    The rate on the latest issued bill of this item TO this customer, or FROM
    this supplier: what a merchant otherwise looks up in last month's carbon
    copy before writing the next one. Drafts and voids are not prices anybody
    agreed to. `exclude` leaves out the bill being edited, which would
    otherwise answer with its own rate.
    """
    sales = side == "sales"
    lines = (_sales if sales else _purchases)(tenant, item_id, None, None).filter(
        document__party_id=party_id
    )
    if exclude:
        lines = lines.exclude(document_id=exclude)
    line = (
        lines.select_related("document")
        .order_by("-document__document_date", "-document__created_at", "-line_no")
        .first()
    )
    if line is None:
        return None
    doc = line.document
    return {
        "rate": _money(line.unit_price if sales else line.unit_cost),
        "tax_inclusive": bool(line.tax_inclusive) if sales else False,
        "unit_code": line.unit_code,
        "qty": _qty(line.qty),
        "document": {
            "id": str(doc.id),
            "number": doc.number,
            "date": doc.document_date.isoformat(),
        },
    }
