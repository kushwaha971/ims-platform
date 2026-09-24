"""Attachment reads (rule D8 — never writes)."""

from __future__ import annotations

from typing import Any


def attachment_of_tenant(*, tenant: Any, attachment_id: Any) -> Any:
    """The live attachment with this id inside `tenant`, or `None`.

    The id is matched INSIDE the tenant filter, so "another business's file"
    and "no such file" are the same answer (canon §0.11 rule 2) — a 403 would
    confirm the id exists.
    """
    from apps.files.models import Attachment

    if tenant is None:
        return None
    return Attachment.objects.for_tenant(tenant).filter(pk=attachment_id).first()
