"""Enumerations owned by the files app (Part 26 §26.16 R16.1, Part 21 §21.3.2)."""

from __future__ import annotations

from django.db import models


class AttachmentKind(models.TextChoices):
    """`files_attachment.kind` — Part 21 §21.3.2's closed set.

    Only `logo` and `signature` have a writer today (WLB-01, PLT-07). The rest
    are listed because the column's vocabulary is the schema's, not the first
    feature's, and a second feature adding a kind should not need a migration.
    """

    LOGO = "logo", "Logo"
    SIGNATURE = "signature", "Signature"
    ITEM_IMAGE = "item_image", "Item image"
    BILL_PHOTO = "bill_photo", "Bill photo"
    RECEIPT = "receipt", "Receipt"
    IMPORT_FILE = "import_file", "Import file"
    EXPORT_FILE = "export_file", "Export file"
    DOCUMENT_PDF = "document_pdf", "Document PDF"


#: PLT-07 §5 / WLB-01 §10: "≤ 2 MB". Tighter than `UB_MEDIA_MAX_UPLOAD_MB`, which
#: is the ceiling for every upload in the product; a branding image is small.
BRANDING_IMAGE_MAX_BYTES = 2 * 1024 * 1024

#: WLB-01 §10: "min 64 px". A logo smaller than this is a favicon, and it prints
#: as a smudge.
BRANDING_IMAGE_MIN_PX = 64

#: PLT-07 §5 / WLB-01 FR-6: resized server-side to at most these widths.
MAX_WIDTH_BY_KIND: dict[str, int] = {
    AttachmentKind.LOGO.value: 600,
    AttachmentKind.SIGNATURE.value: 400,
}

#: The owner type a tenant-level branding file carries.
OWNER_TENANT = "platform_tenant"
