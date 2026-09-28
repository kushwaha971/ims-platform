"""What a business owns in `reports` — read by PLT-10's export and deletion.

An `Export` row is bookkeeping for a file the member already downloaded, not a
record of the business, so it is deleted but not written to the full export.
Its file is a `files.Attachment` (PROTECT), which orders this table first.
"""

from __future__ import annotations

from apps.common.tenant_data import TenantTable, register

register(
    TenantTable("reports.Export"),
)
