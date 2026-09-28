"""NTF-01 §14 — the inbox endpoints. Thin: parse, ask the service, wrap.

There is deliberately no endpoint that CREATES a notification (§14): creation
is service-internal, so a compromised client cannot forge one.
"""

from __future__ import annotations

import base64
import binascii
import datetime as dt
from typing import Any

from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView

from apps.common.exceptions import ValidationFailed
from apps.common.responses import StandardResponse
from apps.common.tenancy import get_effective_tenant
from apps.common.throttling import ScopedUserRateThrottle
from apps.notifications.constants import INBOX_DEFAULT_LIMIT, INBOX_MAX_LIMIT, NotificationCategory
from apps.notifications.permissions import IsTenantMember, member_permissions
from apps.notifications.serializers.notification import serialize_notification
from apps.notifications.services.notify import inbox, mark_all_read, mark_read, unread_q


def _decode_cursor(raw: str) -> tuple[dt.datetime, str]:
    try:
        created, _, pk = base64.urlsafe_b64decode(raw.encode()).decode().partition("|")
        return dt.datetime.fromisoformat(created), pk
    except (ValueError, binascii.Error, UnicodeDecodeError):
        raise ValidationFailed({"cursor": ["That cursor is not valid."]}) from None


def _encode_cursor(row: Any) -> str:
    return base64.urlsafe_b64encode(f"{row.created_at.isoformat()}|{row.pk}".encode()).decode()


class _InboxMixin:
    permission_classes = [IsTenantMember]
    throttle_classes = [ScopedUserRateThrottle]

    def _scope(self, request: Any) -> Any:
        return inbox(
            tenant=get_effective_tenant(request),
            user=request.user,
            permissions=member_permissions(request),
        )

    def _category(self, raw: str | None) -> str | None:
        if raw in (None, ""):
            return None
        if raw not in NotificationCategory.values:
            raise ValidationFailed({"category": ["Choose a category from the list."]})
        return raw


class NotificationListView(_InboxMixin, APIView):
    """`GET /notifications?unread=&category=&cursor=&limit=` — cursor on `created_at, id`."""

    def get(self, request: Any) -> Any:
        params = request.query_params
        try:
            limit = int(params.get("limit") or INBOX_DEFAULT_LIMIT)
        except ValueError:
            limit = 0
        if not 1 <= limit <= INBOX_MAX_LIMIT:
            raise ValidationFailed({"limit": [f"Ask for 1 to {INBOX_MAX_LIMIT} rows."]})
        unread = params.get("unread")
        if unread not in (None, "", "true", "false"):
            raise ValidationFailed({"unread": ["Use true or false."]})
        category = self._category(params.get("category"))

        scoped = self._scope(request)
        rows = scoped
        if unread == "true":
            rows = rows.filter(unread_q(request.user))
        if category:
            rows = rows.filter(category=category)
        if params.get("cursor"):
            created, pk = _decode_cursor(params["cursor"])
            rows = rows.filter(Q(created_at__lt=created) | Q(created_at=created, pk__lt=pk))
        page = list(rows.order_by("-created_at", "-pk")[: limit + 1])
        has_more = len(page) > limit
        page = page[:limit]
        return StandardResponse.ok(
            [serialize_notification(row, request.user) for row in page],
            meta={
                "next_cursor": _encode_cursor(page[-1]) if has_more and page else None,
                "has_more": has_more,
                # §5 — the badge and the list use the SAME predicate.
                "unread_count": scoped.filter(unread_q(request.user)).count(),
            },
        )


class UnreadCountView(_InboxMixin, APIView):
    """`GET /notifications/unread-count` — the bell's one number, and per category."""

    def get(self, request: Any) -> Any:
        unread = self._scope(request).filter(unread_q(request.user))
        by_category = {code: 0 for code in NotificationCategory.values}
        for category in unread.values_list("category", flat=True):
            by_category[category] = by_category.get(category, 0) + 1
        return StandardResponse.ok({"count": sum(by_category.values()), "by_category": by_category})


class NotificationReadView(_InboxMixin, APIView):
    """`POST /notifications/{id}/read` — idempotent; another tenant's or user's row is 404."""

    def post(self, request: Any, pk: Any) -> Any:
        row = get_object_or_404(self._scope(request), pk=pk)
        mark_read(row=row, user=request.user)
        return StandardResponse.no_content()


class NotificationReadAllView(_InboxMixin, APIView):
    """`POST /notifications/read-all { category? }` → `{ marked }`."""

    def post(self, request: Any) -> Any:
        category = self._category((request.data or {}).get("category"))
        marked = mark_all_read(
            tenant=get_effective_tenant(request),
            user=request.user,
            permissions=member_permissions(request),
            category=category,
        )
        return StandardResponse.ok({"marked": marked})
