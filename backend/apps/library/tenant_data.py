"""What a business owns in `library` — read by PLT-10's export and deletion.

Each task registers its tables here in the same change that adds them
(B03 settings, B05 catalogue, …).
"""

from __future__ import annotations

from apps.common.tenant_data import TenantTable, register

register(
    TenantTable("library.LibrarySettings", export_name="library_settings.csv"),
)
