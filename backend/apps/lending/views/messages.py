"""`/api/v1/lending/reminders` and a loan's messages (FRD lending LEN-12; L03).

GET prepares (the text, the links and whether it may go now) and records
nothing; POST is the tap that opened WhatsApp, the SMS app or the dialler, and
is refused by the same policy the GET warned about.
"""

from __future__ import annotations

from typing import Any

from apps.common.context import Ctx
from apps.common.idempotency import idempotent
from apps.common.responses import StandardResponse
from apps.common.tenancy import get_effective_tenant
from apps.lending.services import messages
from apps.lending.views.loans import _LendingView


class ReminderListView(_LendingView):
    read = "lending.reminder.send"

    def get(self, request: Any) -> Any:
        return StandardResponse.ok(messages.due_list(get_effective_tenant(request)))


class LoanMessageView(_LendingView):
    read = "lending.reminder.send"
    write = "lending.reminder.send"

    def get(self, request: Any, loan_id: Any, kind: str) -> Any:
        return StandardResponse.ok(
            messages.preview(
                ctx=Ctx.from_request(request),
                loan_id=loan_id,
                kind=kind,
                collection_id=request.query_params.get("collection") or None,
            )
        )

    @idempotent("lending.reminder.send")
    def post(self, request: Any, loan_id: Any, kind: str) -> Any:
        data = request.data if isinstance(request.data, dict) else {}
        return StandardResponse.created(
            messages.send(ctx=Ctx.from_request(request), loan_id=loan_id, kind=kind, data=data)
        )


class LoanMessagePreviewView(_LendingView):
    """Preview an edited message through a POST body, without recording a send."""

    read = "lending.reminder.send"
    write = "lending.reminder.send"

    def post(self, request: Any, loan_id: Any, kind: str) -> Any:
        data = request.data if isinstance(request.data, dict) else {}
        return StandardResponse.ok(
            messages.preview(
                ctx=Ctx.from_request(request),
                loan_id=loan_id,
                kind=kind,
                collection_id=data.get("collection"),
                text=data.get("text"),
            )
        )
