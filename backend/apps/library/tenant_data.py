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
)
