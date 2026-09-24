"""What a business owns in `expenses` — read by PLT-10's export and deletion."""

from __future__ import annotations

from apps.common.tenant_data import TenantTable, register

register(
    TenantTable("expenses.ExpenseCategory", export_name="expense_categories.csv"),
    TenantTable("expenses.Expense", export_name="expenses.csv"),
)
