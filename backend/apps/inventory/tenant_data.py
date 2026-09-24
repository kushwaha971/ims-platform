"""What a business owns in `inventory` — read by PLT-10's export and deletion.

System units carry `tenant = NULL` and are therefore never selected here. The
stock log refuses DELETE by trigger (migration 0004); see `apps.ledger.tenant_data`
for why the deletion job, and only it, disables that trigger by name.
"""

from __future__ import annotations

from apps.common.tenant_data import TenantTable, register

register(
    TenantTable("inventory.Unit", export_name="units.csv"),
    TenantTable("inventory.Location", export_name="locations.csv"),
    TenantTable("inventory.Category", export_name="item_categories.csv"),
    TenantTable("inventory.Item", export_name="items.csv"),
    TenantTable("inventory.ItemStock", export_name="item_stock.csv"),
    TenantTable(
        "inventory.StockMovement",
        export_name="stock_movements.csv",
        triggers=("inventory_stock_movement_forbid_update_delete",),
    ),
    TenantTable("inventory.StockAdjustment", export_name="stock_adjustments.csv"),
    TenantTable("inventory.LowStockAlert"),
)
