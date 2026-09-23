"""Pagination (Part 22 §22.1, Part 20 §20.14.3)."""

from __future__ import annotations

import base64
import json
from typing import Any

from django.db.models import Q
from rest_framework.pagination import BasePagination, PageNumberPagination
from rest_framework.response import Response

from apps.common.constants import (
    CURSOR_LIMIT_DEFAULT,
    CURSOR_LIMIT_MAX,
    PAGE_SIZE_DEFAULT,
    PAGE_SIZE_MAX,
)


class PagePagination(PageNumberPagination):
    """`?page=1&page_size=25` → `meta: {page, page_size, total, total_pages}`."""

    page_size = PAGE_SIZE_DEFAULT
    page_size_query_param = "page_size"
    max_page_size = PAGE_SIZE_MAX

    def get_meta(self) -> dict:
        total = self.page.paginator.count
        page_size = self.get_page_size(self.request) or PAGE_SIZE_DEFAULT
        return {
            "page": self.page.number,
            "page_size": page_size,
            "total": total,
            "total_pages": self.page.paginator.num_pages if total else 0,
        }

    def get_paginated_response(self, data: Any) -> Response:
        return Response({"data": data, "meta": self.get_meta()})


class CursorPagination(BasePagination):
    """Keyset pagination for ledger entries, movements, notifications and audit logs.

    `?cursor=…&limit=50` → `meta: {next_cursor, has_more}`. There is no count
    query: `OFFSET` degrades linearly, which is why the ledger timeline uses a
    cursor at all (Part 20 §20.14.3).
    """

    limit_query_param = "limit"
    cursor_query_param = "cursor"
    default_limit = CURSOR_LIMIT_DEFAULT
    max_limit = CURSOR_LIMIT_MAX
    ordering: tuple[str, ...] = ("-created_at", "-id")

    def __init__(self) -> None:
        self.has_more = False
        self.next_cursor: str | None = None

    def get_limit(self, request: Any) -> int:
        raw = request.query_params.get(self.limit_query_param)
        try:
            limit = int(raw) if raw is not None else self.default_limit
        except (TypeError, ValueError):
            limit = self.default_limit
        return max(1, min(limit, self.max_limit))

    def paginate_queryset(self, queryset: Any, request: Any, view: Any = None) -> list:
        limit = self.get_limit(request)
        ordering = tuple(getattr(view, "cursor_ordering", None) or self.ordering)
        queryset = queryset.order_by(*ordering)

        position = decode_cursor(request.query_params.get(self.cursor_query_param))
        if position:
            queryset = queryset.filter(keyset_after(position, ordering))

        rows = list(queryset[: limit + 1])
        self.has_more = len(rows) > limit
        rows = rows[:limit]
        self.next_cursor = encode_cursor(rows[-1], ordering) if (rows and self.has_more) else None
        return rows

    def get_meta(self) -> dict:
        return {"next_cursor": self.next_cursor, "has_more": self.has_more}

    def get_paginated_response(self, data: Any) -> Response:
        return Response({"data": data, "meta": self.get_meta()})


def encode_cursor(instance: Any, ordering: tuple[str, ...]) -> str:
    """Opaque base64 of the keyset tuple.

    The cursor is validated against the tenant-scoped queryset regardless, so
    tampering yields nothing — it is opaque so the question does not arise.

    The payload keys stay in the `field__lt` / `field__gt` spelling they have
    always had, so a cursor a client is already holding still decodes. What
    changed is how `keyset_after` ASSEMBLES them into a predicate: see there.
    """
    payload = {}
    for term in ordering:
        field = term.lstrip("-")
        lookup = "lt" if term.startswith("-") else "gt"
        payload[f"{field}__{lookup}"] = str(getattr(instance, field))
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def keyset_after(position: dict, ordering: tuple[str, ...]) -> Q:
    """"Strictly after this row in this ordering" — as a TUPLE comparison.

    A keyset over several columns is `(a, b, c) < (x, y, z)`, which expands to

        a < x  OR  (a = x AND b < y)  OR  (a = x AND b = y AND c < z)

    and NOT to `a < x AND b < y AND c < z`. The AND was what this paginator
    built, and the two predicates differ on exactly the rows that matter: every
    row tying on `a` fails `a < x` and is skipped, whatever its `b`.

    It survived because the only ordering in the codebase was
    `(-created_at, -id)`, whose two columns are almost perfectly correlated —
    uuid7 sorts by creation time — so the wrong predicate agreed with the right
    one on essentially every row. LED-01's timeline orders by
    `(-entry_date, -created_at)`, two genuinely independent columns, and a shop
    that wrote twelve entries on one Saturday lost the tail of that Saturday at
    the first page boundary with nothing failing anywhere.

    Postgres supports row comparison natively and would be one clause; this is
    expressed in the ORM because the queryset it filters is built by selectors
    that know nothing about SQL, and because an index on `(a, b, c)` serves the
    expanded form perfectly well.
    """
    clause = Q()
    equalities: dict[str, Any] = {}
    for term in ordering:
        field = term.lstrip("-")
        lookup = "lt" if term.startswith("-") else "gt"
        key = f"{field}__{lookup}"
        if key not in position:
            # A cursor minted under a different ordering. Everything after this
            # column is unconstrained, which yields a superset rather than a
            # silently truncated page — the honest failure for a stale cursor.
            break
        clause |= Q(**equalities, **{key: position[key]})
        equalities[field] = position[key]
    return clause


def decode_cursor(cursor: str | None) -> dict:
    if not cursor:
        return {}
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded.encode()).decode())
    except (ValueError, TypeError):
        return {}
    return payload if isinstance(payload, dict) else {}
