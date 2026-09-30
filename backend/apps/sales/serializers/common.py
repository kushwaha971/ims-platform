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


# ── A5 ── BR-4 (FRD 00 PLT-X05 §9): the origin columns are written once, by the document port.
ORIGIN_KEYS = ("origin_module", "origin_type", "origin_id")


def refuse_origin_keys(data: Any) -> None:
    """400 on any origin key in a sales request body — DRF would otherwise drop it silently,
    and a client would believe it had set something it had not."""
    from rest_framework import serializers

    if not hasattr(data, "keys"):
        return
    sent = [key for key in ORIGIN_KEYS if key in data]
    if sent:
        raise serializers.ValidationError(
            {
                key: ["Set by the module that issued the document, never by a request."]
                for key in sent
            }
        )
