"""`inbound_unit_cost()` — the valuation cost a bill line puts into stock (§17.7.0, normative).

Pure: a line's stored figures and one boolean in, a 4-dp cost out. The
weighted-average blend itself is NOT here — it belongs to
`inventory.services.costing.apply_weighted_average`, the one function both the
posting path and `recalc_stock` fold over the stock log. This module only
decides which cost the `purchase_in` row carries.

    itc_claimable = tenant.gst_type == 'regular' AND bill.itc_eligible
    cost_base     = taxable_value (after the document discount) if itc_claimable
                    else line_total          — tax is a cost when it cannot be claimed
    inbound_unit_cost = round4(cost_base / qty)

The document discount is already inside `taxable_value` (the engine apportions
it before tax, BR-2), so a bill-level discount lowers the cost of every line
it touched. Round-off is not a line figure and never enters a unit cost.
"""

from __future__ import annotations

from decimal import Decimal

from apps.common.money import q4

ZERO4 = Decimal("0.0000")


def inbound_unit_cost(
    *, taxable_value: Decimal, line_total: Decimal, qty: Decimal, itc_claimable: bool
) -> Decimal:
    """§17.7.0 worked example: Rice 920.00 / 20 → 46.0000; without ITC 966.00 / 20 → 48.3000."""
    if qty <= 0:
        return ZERO4
    base = taxable_value if itc_claimable else line_total
    return q4(base / qty)
