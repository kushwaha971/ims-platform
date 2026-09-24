"""LED-06 / LED-07 §14 — the reminder endpoints. Thin (Part 26 §26.7 R7.1).

GET   /reminders                 list, filters party_id/status/kind, meta.totals
POST  /reminders                 create a scheduled manual reminder
POST  /reminders/preview         the server-composed text; writes nothing (CR-LOG)
POST  /reminders/bulk            one scheduled row + one link per party
PATCH /reminders/{id}            done | dismissed
POST  /reminders/{id}/send       record the tap / queue the provider SMS
GET   /reminders/settings        the two messaging switches + provider status
PATCH /reminders/settings        change them (owner/admin)
"""

from __future__ import annotations

import uuid
from typing import Any

from django.db.models import Count, Max, Q
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.constants import ModuleCode
from apps.common.context import Ctx
from apps.common.exceptions import ValidationFailed
from apps.common.pagination import PagePagination
from apps.common.permissions import HasPermission, ModuleEnabled
from apps.common.responses import StandardResponse
from apps.common.throttling import ScopedUserRateThrottle
from apps.common.viewsets import TenantScopeMixin
from apps.ledger.constants import ReminderKind, ReminderStatus
from apps.ledger.models import Reminder
from apps.ledger.serializers.reminder import serialize_reminder
from apps.ledger.services import messaging
from apps.ledger.services.reminder_settings import reminder_settings, update_reminder_settings
from apps.ledger.services.reminders import (
    bulk_reminders,
    create_reminder,
    mark_reminder,
    preview_reminder,
    send_reminder,
)

#: `kind=manual|auto` are the tab filters; the raw kinds are accepted too (CCR-6).
KIND_GROUPS = {"auto": ("auto_d1", "auto_d0"), "manual": ("manual",)}


def _read_write(read: str = "ledger.entry.read", write: str = "ledger.reminder.write") -> list:
    """GET needs `read`; every other verb needs `write` (§12)."""

    class _ByMethod(IsAuthenticated):
        def has_permission(self, request: Any, view: Any) -> bool:
            codename = read if request.method in ("GET", "HEAD", "OPTIONS") else write
            return HasPermission(codename)().has_permission(request, view)

    return [IsAuthenticated, ModuleEnabled(ModuleCode.LEDGER), _ByMethod]


class _ReminderBase(TenantScopeMixin, APIView):
    permission_classes = _read_write()
    throttle_classes = [ScopedUserRateThrottle]

    def ctx(self) -> Ctx:
        return Ctx.from_request(self.request)


class ReminderListCreateView(_ReminderBase):
    def get(self, request: Any) -> Any:
        params = request.query_params
        rows = self.scope_to_tenant(Reminder.objects.select_related("party"))
        if params.get("party_id"):
            try:
                rows = rows.filter(party_id=uuid.UUID(params["party_id"]))
            except ValueError:
                raise ValidationFailed({"party_id": ["That is not a party id."]}) from None
        if params.get("status"):
            statuses = [s for s in params["status"].split(",") if s]
            if set(statuses) - set(ReminderStatus.values):
                raise ValidationFailed({"status": ["Unknown status."]})
            rows = rows.filter(status__in=statuses)
        if params.get("kind"):
            kinds: list[str] = []
            for token in params["kind"].split(","):
                kinds.extend(KIND_GROUPS.get(token, (token,)))
            if set(kinds) - set(ReminderKind.values):
                raise ValidationFailed({"kind": ["Unknown kind."]})
            rows = rows.filter(kind__in=kinds)

        # FR-6 — the history strip's one line: how many sent, and the last one.
        totals = rows.aggregate(
            sent=Count("id", filter=Q(status=ReminderStatus.SENT)),
            failed=Count("id", filter=Q(status=ReminderStatus.FAILED)),
            last_sent_at=Max("sent_at", filter=Q(status=ReminderStatus.SENT)),
        )
        last = (
            rows.filter(status=ReminderStatus.SENT)
            .order_by("-sent_at")
            .values_list("channel", flat=True)
            .first()
        )
        paginator = PagePagination()
        page = paginator.paginate_queryset(rows.order_by("-created_at", "-id"), request, view=self)
        meta = {
            **paginator.get_meta(),
            "totals": {
                "sent": totals["sent"],
                "failed": totals["failed"],
                "last_sent_at": (
                    totals["last_sent_at"].isoformat() if totals["last_sent_at"] else None
                ),
                "last_channel": last,
            },
        }
        return Response({"data": [serialize_reminder(r) for r in page], "meta": meta})

    def post(self, request: Any) -> Any:
        reminder = create_reminder(ctx=self.ctx(), payload=dict(request.data or {}))
        return StandardResponse.created(serialize_reminder(reminder))


class ReminderPreviewView(_ReminderBase):
    def post(self, request: Any) -> Any:
        data = request.data or {}
        return StandardResponse.ok(
            preview_reminder(
                ctx=self.ctx(), party_id=data.get("party_id"), note=data.get("note") or ""
            )
        )


class ReminderBulkView(_ReminderBase):
    def post(self, request: Any) -> Any:
        result = bulk_reminders(ctx=self.ctx(), payload=dict(request.data or {}))
        if result.pop("queued"):
            return StandardResponse.accepted(
                {
                    "queued": len(result["items"]),
                    "items": result["items"],
                    "skipped": result["skipped"],
                }
            )
        return StandardResponse.ok(result)


class ReminderDetailView(_ReminderBase):
    def patch(self, request: Any, pk: Any) -> Any:
        reminder = mark_reminder(
            ctx=self.ctx(), reminder_id=pk, status=(request.data or {}).get("status")
        )
        return StandardResponse.ok(serialize_reminder(reminder))


class ReminderSendView(_ReminderBase):
    def post(self, request: Any, pk: Any) -> Any:
        result = send_reminder(ctx=self.ctx(), reminder_id=pk)
        meta = {"warnings": result["warnings"]}
        if result["status_code"] == 202:
            return StandardResponse.accepted(result["data"], meta=meta)
        return StandardResponse.ok(result["data"], meta=meta)


class ReminderSettingsView(_ReminderBase):
    """LED-07 FR-1 / LED-08 FR-1 — read by anyone who reads the ledger, changed by owner/admin."""

    permission_classes = _read_write(write="notifications.settings.manage")

    def get(self, request: Any) -> Any:
        return StandardResponse.ok(
            {**reminder_settings(self.get_tenant()), "sms_configured": messaging.sms_configured()}
        )

    def patch(self, request: Any) -> Any:
        settings = update_reminder_settings(ctx=self.ctx(), payload=dict(request.data or {}))
        return StandardResponse.ok({**settings, "sms_configured": messaging.sms_configured()})
