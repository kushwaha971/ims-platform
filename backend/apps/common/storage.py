"""Media paths and upload validation (Part 20 §20.9)."""

from __future__ import annotations

import hashlib
import secrets
from typing import Any

from django.conf import settings
from django.utils.translation import gettext_lazy as _

from apps.common.exceptions import BusinessRuleViolation

ALLOWED_IMAGE_TYPES = ("image/jpeg", "image/png", "image/webp")
ALLOWED_DOCUMENT_TYPES = ("application/pdf", "text/csv")


def tenant_media_path(tenant_id: Any, kind: str, filename: str) -> str:
    """`<tenant>/<kind>/<shard>/<token>-<name>` (Part 20 §20.9.1).

    A tenant's bytes are contiguous (so `PLT-10` can export or delete them
    wholesale), no directory holds more than a few thousand entries, and the key
    is unguessable.
    """
    token = secrets.token_hex(8)
    shard = token[:2]
    safe = filename.replace("/", "_")[-80:]
    return f"{tenant_id}/{kind}/{shard}/{token}-{safe}"


def validate_upload(*, size_bytes: int, content_type: str, allowed: tuple[str, ...]) -> None:
    """Size and sniffed-type checks, raising the registered codes (Part 22 §22.1.1)."""
    maximum = settings.UB_MEDIA_MAX_UPLOAD_MB * 1024 * 1024
    if size_bytes > maximum:
        raise BusinessRuleViolation(
            "file_too_large",
            _("This file is too large."),
            details={"bytes": size_bytes, "maximum_bytes": maximum},
        )
    if content_type not in allowed:
        raise BusinessRuleViolation(
            "unsupported_file_type",
            _("This file type is not supported."),
            details={"content_type": content_type, "allowed": list(allowed)},
        )


def sha256_of(fileobj: Any) -> str:
    """Content hash for deduplication and integrity (Part 21 §21.3.2)."""
    digest = hashlib.sha256()
    for chunk in iter(lambda: fileobj.read(1024 * 1024), b""):
        digest.update(chunk)
    fileobj.seek(0)
    return digest.hexdigest()
