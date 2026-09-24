"""Storing a branding image: sniff, verify, re-encode, record (WLB-01 §19, PLT-07 §19).

Every upload goes through the same four steps, in this order, and each one
exists because the one before it can be lied to:

1. **Magic bytes.** The browser's `Content-Type` and the file name are the
   uploader's claims. The first bytes of the file are not — PNG, JPEG and WebP
   each open with a fixed signature, and anything else (an SVG, a PDF, a
   renamed `.exe`) is refused before Pillow ever parses it. SVG is refused on
   purpose (WLB-01 FR-6): sanitising it is a project, and it can carry script.
2. **Pillow verify.** A file with the right first bytes and a corrupt or
   truncated body is refused by `Image.verify()`.
3. **Re-encode.** The stored bytes are a NEW image Pillow wrote from the
   decoded pixels, never the upload. That is what strips EXIF (GPS location,
   camera serial, the phone owner's name) and any payload appended after the
   image data: none of it survives a decode/encode round trip. EXIF
   orientation is applied first, so a photo of a signature taken sideways is
   stored the right way up rather than rotated once its orientation tag is
   gone.
4. **Record.** A `files_attachment` row under the caller's tenant, with a
   tenant-prefixed, unguessable storage key.
"""

from __future__ import annotations

import hashlib
import io
from dataclasses import dataclass
from typing import Any

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.common.exceptions import BusinessRuleViolation
from apps.common.storage import tenant_media_path
from apps.files.constants import BRANDING_IMAGE_MAX_BYTES, BRANDING_IMAGE_MIN_PX, MAX_WIDTH_BY_KIND

#: A decoded-size ceiling. A 2 MB PNG can decompress to gigabytes of pixels (a
#: "decompression bomb"); the byte limit alone does not stop that.
MAX_PIXELS = 40_000_000


@dataclass(frozen=True, slots=True)
class SniffedType:
    content_type: str
    pillow_format: str
    extension: str


PNG = SniffedType("image/png", "PNG", "png")
JPEG = SniffedType("image/jpeg", "JPEG", "jpg")
WEBP = SniffedType("image/webp", "WEBP", "webp")


def sniff_image_type(head: bytes) -> SniffedType | None:
    """The image type the first bytes prove, or `None`. Never the claimed type."""
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return PNG
    if head.startswith(b"\xff\xd8\xff"):
        return JPEG
    if len(head) >= 12 and head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return WEBP
    return None


def _unsupported() -> BusinessRuleViolation:
    return BusinessRuleViolation(
        "unsupported_file_type",
        _("Use a PNG, JPG or WebP image."),
        details={"allowed": [PNG.content_type, JPEG.content_type, WEBP.content_type]},
    )


def _read_all(upload: Any, limit: int) -> bytes:
    """Read at most `limit + 1` bytes, so an oversized upload is not slurped whole."""
    if hasattr(upload, "seek"):
        upload.seek(0)
    data = upload.read(limit + 1)
    if len(data) > limit:
        raise BusinessRuleViolation(
            "file_too_large",
            _("Use an image under 2 MB."),
            details={"maximum_bytes": limit},
        )
    return data


def reencode_image(
    data: bytes, *, max_width: int, min_px: int
) -> tuple[bytes, SniffedType, int, int]:
    """Steps 1–3. Returns `(bytes, type, width, height)` of the image to store."""
    from PIL import Image, ImageOps, UnidentifiedImageError

    sniffed = sniff_image_type(data[:16])
    if sniffed is None:
        raise _unsupported()

    try:
        with Image.open(io.BytesIO(data)) as probe:
            if probe.format != sniffed.pillow_format:
                raise _unsupported()
            width, height = probe.size
            if width * height > MAX_PIXELS:
                raise BusinessRuleViolation(
                    "image_too_large",
                    _("This image is too large."),
                    details={"max_pixels": MAX_PIXELS},
                )
            probe.verify()
        with Image.open(io.BytesIO(data)) as source:
            source.load()
            image = ImageOps.exif_transpose(source) or source
            image = image.copy()
    except BusinessRuleViolation:
        raise
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError) as exc:
        raise _unsupported() from exc

    if min(image.size) < min_px:
        raise BusinessRuleViolation(
            "validation_error",
            _("Use an image at least %(px)s pixels on each side.") % {"px": min_px},
            details={"file": [f"Use an image at least {min_px} px on each side."]},
        )

    if image.width > max_width:
        ratio = max_width / image.width
        image = image.resize((max_width, max(1, round(image.height * ratio))), Image.LANCZOS)

    out = io.BytesIO()
    if sniffed is JPEG:
        # PLT-07 EC-4: a JPEG has no transparency, so whatever alpha a
        # conversion produced is flattened onto white, never black.
        if image.mode not in ("RGB", "L"):
            background = Image.new("RGB", image.size, (255, 255, 255))
            rgba = image.convert("RGBA")
            background.paste(rgba, mask=rgba.split()[-1])
            image = background
        image.save(out, format="JPEG", quality=88, optimize=True)
    elif sniffed is PNG:
        # EC-4: a transparent signature stays transparent.
        if image.mode not in ("RGB", "RGBA", "L", "LA", "P"):
            image = image.convert("RGBA")
        image.save(out, format="PNG", optimize=True)
    else:
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGBA")
        image.save(out, format="WEBP", quality=88)
    return out.getvalue(), sniffed, image.width, image.height


def store_branding_image(
    *,
    tenant: Any,
    kind: str,
    upload: Any,
    owner_type: str,
    owner_id: Any,
    actor: Any = None,
) -> Any:
    """Validate, re-encode and store one image; return the new `Attachment`.

    The caller soft-deletes whatever this replaces, in its own transaction, so
    that "the new logo is live" and "the old logo is retired" commit together.
    """
    from apps.files.models import Attachment

    data = _read_all(upload, BRANDING_IMAGE_MAX_BYTES)
    encoded, sniffed, width, height = reencode_image(
        data, max_width=MAX_WIDTH_BY_KIND.get(kind, 600), min_px=BRANDING_IMAGE_MIN_PX
    )
    original = (getattr(upload, "name", "") or f"{kind}.{sniffed.extension}")[-255:]
    key = tenant_media_path(tenant.id, kind, f"{kind}.{sniffed.extension}")
    stored_key = default_storage.save(key, ContentFile(encoded))
    # If the row fails to insert, the bytes must not outlive it as an orphan
    # nobody can reach. (A later rollback of the caller's transaction leaves
    # an unreferenced file behind; the Part 21 §21.5 GC is what sweeps those.)
    try:
        return Attachment.objects.create(
            tenant=tenant,
            created_by=actor,
            owner_type=owner_type,
            owner_id=owner_id,
            kind=kind,
            storage_key=stored_key,
            original_name=original,
            content_type=sniffed.content_type,
            size_bytes=len(encoded),
            width=width,
            height=height,
            sha256=hashlib.sha256(encoded).hexdigest(),
        )
    except Exception:
        default_storage.delete(stored_key)
        raise


def retire(*, attachment_id: Any, tenant: Any) -> int:
    """Soft-delete one attachment of this tenant (PLT-07 BR-4). Idempotent."""
    from apps.files.models import Attachment

    if not attachment_id:
        return 0
    return Attachment.objects.filter(pk=attachment_id, tenant=tenant).update(
        deleted_at=timezone.now()
    )
