"""Read-only Django admin for support (super-admin only)."""

from __future__ import annotations

from typing import Any

from django.contrib import admin

from apps.files.models import Attachment


@admin.register(Attachment)
class AttachmentAdmin(admin.ModelAdmin):
    """Metadata only. Bytes are never editable here, and rows are never deleted
    from the admin: a branding file is replaced through the product so that the
    replacement is audited."""

    list_display = (
        "id",
        "tenant",
        "kind",
        "content_type",
        "size_bytes",
        "deleted_at",
        "created_at",
    )
    list_filter = ("kind", "content_type")
    search_fields = ("id", "owner_id", "storage_key")
    readonly_fields = tuple(f.name for f in Attachment._meta.fields)

    def get_queryset(self, request: Any) -> Any:
        return Attachment.all_objects.select_related("tenant")

    def has_add_permission(self, request: Any) -> bool:
        return False

    def has_delete_permission(self, request: Any, obj: Any = None) -> bool:
        return False
