"""What a business owns in `library` — read by PLT-10's export and deletion.

Each task registers its tables here in the same change that adds them
(B03 settings, B05 catalogue, …). The deletion order follows the FKs.
"""

from __future__ import annotations

from apps.common.tenant_data import TenantTable, register

register(
    TenantTable("library.LibrarySettings", export_name="library_settings.csv"),
    # ── B05 ── the catalogue
    TenantTable("library.LibraryCategory", export_name="library_categories.csv"),
    TenantTable("library.LibraryLocation", export_name="library_locations.csv"),
    TenantTable("library.LibraryTitle", export_name="library_titles.csv"),
    TenantTable("library.LibraryCopy", export_name="library_copies.csv"),
    TenantTable("library.LibraryCopyEvent", export_name="library_copy_events.csv"),
    # ── B06 ── types, rules, and the membership schema (G17)
    TenantTable("library.LibraryMembershipType", export_name="library_membership_types.csv"),
    TenantTable("library.LibraryLoanRule", export_name="library_loan_rules.csv"),
    TenantTable("library.LibraryMembership", export_name="library_memberships.csv"),
    TenantTable("library.LibraryMembershipPeriod", export_name="library_membership_periods.csv"),
    # ── B10 ── charges and waivers
    TenantTable("library.LibraryCharge", export_name="library_charges.csv"),
    TenantTable("library.LibraryWaiver", export_name="library_waivers.csv"),
    # ── B09 ── loans
    TenantTable("library.LibraryLoan", export_name="library_loans.csv"),
    TenantTable("library.LibraryLoanEvent", export_name="library_loan_events.csv"),
    # ── B11 ── holds
    TenantTable("library.LibraryHold", export_name="library_holds.csv"),
    # ── B13 ── stock verification
    TenantTable("library.LibraryVerification", export_name="library_verifications.csv"),
    TenantTable("library.LibraryVerificationScan", export_name="library_verification_scans.csv"),
)
