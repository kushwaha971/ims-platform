"""`set_last_purchase_cost()` — PUR-01 FR-6f / BR-6, inventory's own writer of the last cost.

A recorded purchase bill overwrites `inventory_item.purchase_price` with the
line's inbound unit cost, so the next bill's cost defaults to what was paid
last time and the item form shows it. The purchases app may import inventory
(Part 20 §20.1.4) but writing another app's table directly is how a rule gets
two owners, so the write lives here.

`purchase_price` is `numeric(14,2)` (Part 21 §21.3.6) while the inbound cost
is 4 dp, so the value is rounded half-up to the paisa. The VALUATION cost —
the 4-dp figure the weighted average blends — is on the movement row and is
untouched by this rounding.

Not audited as `item.updated`: nobody edited the item. The bill's own
`purchase_bill.recorded` row is the evidence, and a void deliberately does
not restore the previous value (BR-6).
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.utils import timezone

from apps.common.money import q2


def set_last_purchase_cost(*, tenant: Any, costs: dict[Any, Decimal]) -> int:
    """`{item_id: inbound_unit_cost}` → rows updated. The caller's transaction."""
    from apps.inventory.models import Item

    now = timezone.now()
    updated = 0
    for item_id, cost in costs.items():
        updated += Item.objects.filter(tenant=tenant, pk=item_id).update(
            purchase_price=q2(cost), updated_at=now
        )
    return updated
