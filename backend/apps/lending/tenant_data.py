"""What a business owns in `lending` — read by PLT-10's export and deletion."""

from __future__ import annotations

from apps.common.tenant_data import TenantTable, register

register(
    TenantTable("lending.LendingRoute", export_name="lending_routes.csv"),
    TenantTable("lending.LendingBorrower", export_name="lending_borrowers.csv"),
    TenantTable("lending.LendingLoan", export_name="lending_loans.csv"),
    TenantTable("lending.LendingLoanDeduction", export_name="lending_loan_deductions.csv"),
    TenantTable("lending.LendingCollection", export_name="lending_collections.csv"),
    TenantTable("lending.LendingVisit", export_name="lending_visits.csv"),
)
