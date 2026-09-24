"""`files_attachment` — attachment metadata (Part 21 §21.3.2).

The bytes live under `MEDIA_ROOT` at `storage_key` (ADR-021: no object store);
this row is what makes them a tenant's. Nothing serves a file by path: the only
way out is `GET /files/{id}`, which matches the id inside the caller's tenant.
"""

from __future__ import annotations

from django.db import models

from apps.common.managers import AllObjectsManager, SoftDeleteManager
from apps.common.models import TenantModel
from apps.files.constants import AttachmentKind


class Attachment(TenantModel):
    """One stored file. Soft-deleted on replacement (PLT-07 BR-4, WLB-01 BR-5).

    `owner_type`/`owner_id` name what the file belongs to — `platform_tenant`
    and the tenant's id for a logo or signature. `deleted_at` is set when a
    newer file replaces this one; the GC that removes the bytes after 30 days
    (Part 21 §21.5) is not built, so replaced files stay on disk until it is.
    """

    owner_type = models.CharField(max_length=48)
    owner_id = models.UUIDField()
    kind = models.CharField(max_length=24, choices=AttachmentKind.choices)
    storage_key = models.CharField(max_length=255, unique=True)
    original_name = models.CharField(max_length=255, blank=True, default="")
    content_type = models.CharField(max_length=100)
    size_bytes = models.BigIntegerField()
    width = models.IntegerField(null=True, blank=True)
    height = models.IntegerField(null=True, blank=True)
    sha256 = models.CharField(max_length=64)
    deleted_at = models.DateTimeField(null=True, blank=True)

    # Both managers are declared here rather than inherited: `TenantModel` and a
    # soft-delete base both define `objects`, and which one wins must not depend
    # on the MRO (see `SoftDeleteModel`'s docstring).
    objects = SoftDeleteManager()
    all_objects = AllObjectsManager()

    class Meta:
        db_table = "files_attachment"
        verbose_name = "attachment"
        verbose_name_plural = "attachments"
        indexes = [
            models.Index(fields=["tenant", "owner_type", "owner_id"], name="ix_attachment_owner"),
        ]

    def __str__(self) -> str:
        return f"{self.kind}:{self.id}"
