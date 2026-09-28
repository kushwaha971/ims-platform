"""What a business owns in `imports` — read by PLT-10's export and deletion.

The uploaded file is a `files.Attachment` (PROTECT); `deletion_order()` puts
this table before `files` from that foreign key alone.
"""

from __future__ import annotations

from apps.common.tenant_data import TenantTable, register

register(
    TenantTable("imports.ImportJob", export_name="import_jobs.csv"),
)
