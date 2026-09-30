"""What a business owns in `payments` — read by PLT-10's export and deletion.

`payments_allocation` references `payments_payment` (RESTRICT), so the computed
deletion order drains allocations first; no trigger refuses DELETE on either
table (the allocation trigger fires on INSERT/UPDATE only).
"""

from __future__ import annotations

from apps.common.tenant_data import TenantTable, register

register(
    TenantTable("payments.Payment", export_name="payments.csv"),
    TenantTable("payments.Allocation", export_name="payment_allocations.csv"),
    # ── A4b ── held deposits: the application references both payments and the
    # deposit (RESTRICT), so the computed order drains applications first.
    TenantTable("payments.HeldDeposit", export_name="held_deposits.csv"),
    TenantTable("payments.DepositApplication", export_name="deposit_applications.csv"),
)
