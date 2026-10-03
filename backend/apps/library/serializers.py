"""JSON shapes of the catalogue (LIB-02 §6; task B05).

Keys whose tables do not exist yet are OMITTED, never sent empty (CLAUDE.md
PTY-03): `holds_waiting`, `holds` and `issues_12m` (LIB-08, LIB-06) on a
title; `due_on`, `borrower` and `loans` (LIB-06) on a copy. A client cannot
tell `0` from "not counted", and `[]` is a claim about holds this code has
never looked at.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from apps.library.services import isbn


def _money(value: Decimal | None) -> str | None:
    return None if value is None else f"{value:.2f}"


def _id(value: Any) -> str | None:
    return None if value is None else str(value)


def title_row(title: Any) -> dict:
    category = title.category if title.category_id else None
    return {
        "id": str(title.id),
        "title": title.title,
        "subtitle": title.subtitle,
        "authors": title.authors,
        "isbn13": title.isbn13,
        "isbn10": isbn.to_isbn10(title.isbn13) if title.isbn13 else None,
        "category": {"id": str(category.id), "name": category.name} if category else None,
        "material_type": title.material_type,
        "copies_total": title.copies_total,
        "copies_available": title.copies_available,
        "status": title.status,
    }


def copy_row(copy: Any) -> dict:
    location = copy.location if copy.location_id else None
    return {
        "id": str(copy.id),
        "accession_number": copy.accession_number,
        "barcode": copy.barcode,
        "title": {
            "id": str(copy.title_id),
            "title": copy.title.title,
            "authors": copy.title.authors,
        },
        "location": {"id": str(location.id), "code": location.code} if location else None,
        "location_text": copy.location_text,
        "status": copy.status,
        "is_reference": copy.is_reference,
        "price": _money(copy.price),
        "condition": copy.condition,
        "volume_label": copy.volume_label,
    }


def title_detail(title: Any, copies: list[Any]) -> dict:
    return {
        **title_row(title),
        "publisher": title.publisher,
        "edition": title.edition,
        "year": title.year,
        "language": title.language,
        "call_number": title.call_number,
        "keywords": title.keywords,
        "notes": title.notes,
        "copies": [copy_row(c) for c in copies],
        "version": title.version,
    }


def copy_event(event: Any) -> dict:
    return {
        "id": str(event.id),
        "from_status": event.from_status,
        "to_status": event.to_status,
        "reason_code": event.reason_code,
        "note": event.note,
        "source_type": event.source_type,
        "source_id": _id(event.source_id),
        "on_date": event.on_date.isoformat(),
        "created_at": event.created_at.isoformat(),
    }


def copy_detail(copy: Any) -> dict:
    events = sorted(copy.events.all(), key=lambda e: (e.created_at, e.id), reverse=True)
    return {
        **copy_row(copy),
        "acquired_on": copy.acquired_on.isoformat() if copy.acquired_on else None,
        "source": copy.source,
        "source_note": copy.source_note,
        "withdrawn_on": copy.withdrawn_on.isoformat() if copy.withdrawn_on else None,
        "withdrawn_reason": copy.withdrawn_reason,
        "withdrawn_note": copy.withdrawn_note,
        "last_seen_on": copy.last_seen_on.isoformat() if copy.last_seen_on else None,
        "issued_ever": copy.issued_ever,
        "events": [copy_event(e) for e in events],
        "version": copy.version,
    }


def category_row(category: Any, title_count: int) -> dict:
    return {
        "id": str(category.id),
        "name": category.name,
        "parent_id": _id(category.parent_id),
        "sort_order": category.sort_order,
        "is_active": category.is_active,
        "title_count": title_count,
    }


def location_row(location: Any, copy_count: int) -> dict:
    return {
        "id": str(location.id),
        "code": location.code,
        "name": location.name,
        "sort_order": location.sort_order,
        "is_active": location.is_active,
        "copy_count": copy_count,
    }
