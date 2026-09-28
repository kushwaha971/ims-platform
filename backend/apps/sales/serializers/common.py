"""Small read helpers shared by the document and list serializers."""

from __future__ import annotations

from typing import Any


def person(user: Any) -> dict | None:
    if user is None:
        return None
    return {
        "id": str(user.id),
        "name": getattr(user, "full_name", "") or getattr(user, "email", ""),
    }


def mask_mobile(value: str | None) -> str | None:
    """SAL-02 §19 — `+91 98••• ••210` in lists."""
    if not value:
        return None
    digits = value[-10:]
    return f"+91 {digits[:2]}••• ••{digits[-3:]}"


def doc_ref(document: Any) -> dict | None:
    """`{id, number, document_date, status, kind}` — how one document names another."""
    if document is None:
        return None
    return {
        "id": str(document.id),
        "kind": document.kind,
        "number": document.number,
        "document_date": document.document_date.isoformat() if document.document_date else None,
        "status": document.status,
        "grand_total": str(document.grand_total),
    }
