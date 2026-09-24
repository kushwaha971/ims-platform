"""What a business owns in `files` — rows AND the bytes under `MEDIA_ROOT`.

The export copies every live attachment into `attachments/` beside the CSVs
(PLT-10 FR-1: logo, signature, bill photos, receipts). Deletion removes the
bytes before the rows, so a failure half-way leaves a row pointing at nothing
(harmless, and the next run deletes it) rather than bytes nobody can find.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from apps.common.tenant_data import TenantTable, register


def _attachments(tenant: Any) -> Iterable[tuple[str, str]]:
    from apps.files.models import Attachment

    rows = (
        Attachment.all_objects.filter(tenant=tenant, deleted_at__isnull=True)
        .order_by("created_at")
        .values_list("id", "kind", "original_name", "storage_key")
    )
    for pk, kind, name, key in rows.iterator(chunk_size=500):
        safe = (name or key.rsplit("/", 1)[-1]).replace("/", "_")[-80:]
        yield f"attachments/{kind}/{pk}-{safe}", key


def _purge(tenant: Any, queryset: Any) -> int:
    from django.core.files.storage import default_storage

    for key in queryset.values_list("storage_key", flat=True).iterator(chunk_size=500):
        try:
            default_storage.delete(key)
        except OSError:
            continue  # already gone; the row goes regardless
    deleted = queryset._raw_delete(queryset.db)
    return int(deleted or 0)


register(
    TenantTable(
        "files.Attachment",
        export_name="attachments.csv",
        attachments=_attachments,
        purge=_purge,
    )
)
