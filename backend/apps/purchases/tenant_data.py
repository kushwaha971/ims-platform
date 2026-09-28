"""What a business owns in `purchases` — read by PLT-10's export and deletion.

Lines before documents follows from the foreign key; the registry computes the
order (`apps.common.tenant_data.deletion_order`), so this file only says which
tables are ours. Neither table carries a delete trigger — a recorded bill is
immutable by service rule and voided rather than deleted, but it is not an
append-only log the way `ledger_entry` and the stock log are.
"""

from __future__ import annotations

from apps.common.tenant_data import TenantTable, register

register(
    TenantTable("purchases.PurchaseDocument", export_name="purchase_bills.csv"),
    TenantTable(
        "purchases.PurchaseDocumentLine",
        export_name="purchase_bill_lines.csv",
        tenant_path="document__tenant",
    ),
)
