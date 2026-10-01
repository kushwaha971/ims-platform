"""What a business owns in `dues` — read by PLT-10's export and deletion.

The deletion order is derived from the FKs (`tenant_data.deletion_order`): dues
rows reference schedules, schedules reference plans and parties, so every
`dues_*` table drains before `parties_party`. `dues_settlement.payment_id` is a
uuid with no FK; a settlement is deleted with its due.
"""

from __future__ import annotations

from apps.common.tenant_data import TenantTable, register

register(
    TenantTable("dues.DuesPlan", export_name="dues_plans.csv"),
    TenantTable("dues.DuesPlanHead", export_name="dues_plan_heads.csv"),
    TenantTable("dues.DuesSchedule", export_name="dues_schedules.csv"),
    TenantTable("dues.DuesScheduleHead", export_name="dues_schedule_heads.csv"),
    TenantTable("dues.DuesDue", export_name="dues.csv"),
    TenantTable("dues.DuesDueComponent", export_name="dues_components.csv"),
    TenantTable("dues.DuesAdjustment", export_name="dues_adjustments.csv"),
    TenantTable("dues.DuesPause", export_name="dues_pauses.csv"),
    TenantTable("dues.DuesSettlement", export_name="dues_settlements.csv"),
)
