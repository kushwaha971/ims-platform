"""What a bill made: its cost of goods and its profit, line by line.

docs/platform/15 §1.4 item 1, and Vyapar's "bill-wise profit". The cost of
each line was written onto it when the bill was issued (`unit_cost_snapshot`:
the weighted average cost the stock movement took the goods out at, or for an
item that keeps no stock, its purchase price at that moment), so a past bill's
profit never moves when today's costs do. Computing it from today's average
would be wrong for every bill but today's.

Sale value is the line's TAXABLE value — after line and bill discounts, before
GST — because GST collected is the government's, not the shop's. A line whose
cost was never known (a service or an untracked item with no purchase price)
is shown without a profit rather than as pure profit, and the total says how
many lines it could not cost, so a figure is never better than its data.

Returns are netted: a line half returned on a credit note counts the half that
stayed sold. Cost and profit are visible only with `reports.financial.read`
(INV-08 EC-4) — the route enforces it.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from apps.common.money import ZERO, q2

HUNDRED = Decimal("100")


def _pct(profit: Decimal, sale: Decimal) -> str | None:
    if sale <= 0:
        return None
    return f"{(profit * HUNDRED / sale).quantize(Decimal('0.1'))}"


def invoice_profit(document: Any) -> dict:
    """`GET /sales/invoices/{id}/profit`."""
    rows: list[dict] = []
    sale_total = cost_total = ZERO
    uncosted = 0
    for line in sorted(document.lines.all(), key=lambda row: row.line_no):
        qty = Decimal(line.qty)
        kept = qty - Decimal(line.returned_qty or 0)
        share = kept / qty if qty else ZERO
        sale = q2(Decimal(line.taxable_value) * share)
        unit_cost = line.unit_cost_snapshot
        if unit_cost is None:
            cost = profit = None
            uncosted += 1
        else:
            cost = q2(Decimal(unit_cost) * kept)
            profit = sale - cost
            sale_total += sale
            cost_total += cost
        rows.append(
            {
                "line_no": line.line_no,
                "description": line.description,
                "qty": str(line.qty),
                "returned_qty": str(line.returned_qty or 0),
                "sale_value": f"{sale:.2f}",
                "unit_cost": None if unit_cost is None else str(unit_cost),
                "cost": None if cost is None else f"{cost:.2f}",
                "profit": None if profit is None else f"{profit:.2f}",
                "margin_pct": None if profit is None else _pct(profit, sale),
            }
        )
    profit_total = sale_total - cost_total
    return {
        "document_id": str(document.id),
        "lines": rows,
        "totals": {
            # Over the lines whose cost is known — so profit and margin stay true.
            "sale_value": f"{sale_total:.2f}",
            "cost": f"{cost_total:.2f}",
            "profit": f"{profit_total:.2f}",
            "margin_pct": _pct(profit_total, sale_total),
        },
        "lines_without_cost": uncosted,
    }
