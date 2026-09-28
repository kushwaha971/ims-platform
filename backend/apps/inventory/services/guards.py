"""The platform's module-off hook, answered by inventory (PLT-06 FR-4).

`platform_app.services.guards` may not import inventory (Part 20 §20.1.4), so
the counter is registered from `InventoryConfig.ready()`. The FRD's rule, word
for word: "disabling `inventory` is refused while any item has `on_hand ≠ 0`".
Items with no stock — or a catalogue of services — do not block: switching the
module off deletes nothing (BR-4), and nothing is stranded that a merchant
would need to count or write off first. The count is ITEMS, not stock rows, so
the refusal reads "12 items still have stock" however many locations exist.
"""

from __future__ import annotations

from typing import Any

_REGISTERED = False


def items_with_stock(tenant: Any) -> int:
    from apps.inventory.models import ItemStock

    return (
        ItemStock.objects.filter(tenant=tenant)
        .exclude(on_hand=0)
        .values("item_id")
        .distinct()
        .count()
    )


def register_guards() -> None:
    global _REGISTERED
    if _REGISTERED:
        return
    from apps.platform_app.services.guards import register_module_off_guard

    register_module_off_guard("inventory", items_with_stock)
    _REGISTERED = True
