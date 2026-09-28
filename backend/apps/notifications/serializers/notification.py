"""NTF-01 §14 — one inbox row on the wire. Rendered as plain data, never HTML."""

from __future__ import annotations

from typing import Any

from apps.notifications.services.notify import is_unread_for


def _safe_route(route: Any) -> str:
    """§19 — an in-app path or nothing; never `javascript:` or another origin."""
    if isinstance(route, str) and route.startswith("/") and not route.startswith("//"):
        return route
    return "/notifications"


def serialize_notification(row: Any, user: Any) -> dict:
    data = row.data or {}
    return {
        "id": str(row.id),
        "type": row.type,
        "category": row.category,
        "severity": row.severity,
        "title": row.title,
        "body": row.body,
        "count": row.count,
        "route": _safe_route(data.get("route")),
        "params": {k: str(v) for k, v in (data.get("params") or {}).items()},
        "is_read": not is_unread_for(row, user),
        "created_at": row.created_at.isoformat(),
    }
