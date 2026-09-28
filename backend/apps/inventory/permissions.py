"""Permission maps for the inventory app (canon §0.9, 17-03 §12 of each INV feature).

`HasPermission` is fail-closed: an action missing from a map is DENIED.
"""

from __future__ import annotations

from apps.common.permissions import HasPermission

ItemPermissions = HasPermission(
    {
        "list": "inventory.item.read",
        "retrieve": "inventory.item.read",
        "lookup": "inventory.item.read",
        "create": "inventory.item.write",
        "partial_update": "inventory.item.write",
        # INV-02 §12 — archive IS the delete capability: items are never hard
        # deleted, because an item that moved stock is evidence.
        "archive": "inventory.item.delete",
        "restore": "inventory.item.delete",
        # INV-03 §12 — the movement ledger and valuation are the STOCK read.
        "movements": "inventory.stock.read",
    }
)

MasterPermissions = HasPermission(
    {
        "list": "inventory.item.read",
        # INV-04 §12 — inline create from the item form is the item WRITE right.
        "create": "inventory.item.write",
    }
)

AdjustmentPermissions = HasPermission(
    {
        # INV-06 BR-7 — absent from the staff role; granted per member through
        # `permissions_override`, and the codename check honours that override.
        "create": "inventory.stock.adjust",
        "retrieve": "inventory.stock.read",
    }
)

StockReadPermissions = HasPermission("inventory.stock.read")
