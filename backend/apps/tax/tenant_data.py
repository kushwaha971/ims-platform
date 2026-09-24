"""What a business owns in `tax` — its own rates. System rates (`tenant = NULL`) stay."""

from __future__ import annotations

from apps.common.tenant_data import TenantTable, register

register(TenantTable("tax.TaxRate", export_name="tax_rates.csv"))
