"""LED-06 FR-3 — a manual reminder the merchant asked the PROVIDER to send.

Queued by `send_reminder` for `channel='sms'`; the row stays `scheduled`
until this decides. It renders `REMINDER_MANUAL_SMS` with the live balance and
goes through the same adapter and consent gate as every automated message.
"""

from __future__ import annotations

from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.common.context import Ctx
from apps.common.money import ZERO
from apps.ledger.constants import (
    NOTE_BALANCE_SETTLED,
    NOTE_INVALID_MOBILE,
    NOTE_PROVIDER_NOT_CONFIGURED,
    ReminderStatus,
)
from apps.ledger.models import Reminder
from apps.ledger.services import messaging
from apps.ledger.services.auto_reminders import RetryLater, _finish
from apps.parties.services.balance import lock_party


@transaction.atomic
def send_manual_sms(*, reminder_id: Any, tenant: Any, final_attempt: bool) -> dict:
    ctx = Ctx.system(tenant)
    reminder = (
        Reminder.objects.for_tenant(tenant)
        .select_for_update()
        .select_related("tenant")
        .filter(pk=reminder_id)
        .first()
    )
    if reminder is None or reminder.status != ReminderStatus.SCHEDULED:
        return {"skipped": "not_scheduled"}
    party = lock_party(tenant=tenant, party_id=reminder.party_id)
    if party is None or (party.balance or ZERO) <= ZERO:
        _finish(ctx, reminder, status=ReminderStatus.CANCELLED, note=NOTE_BALANCE_SETTLED)
        return {"cancelled": "balance_settled"}

    composed = messaging.compose_reminder(
        tenant=tenant, party=party, balance=party.balance, note=reminder.note
    )
    params = {
        **composed.params,
        "pay_line": messaging.pay_line(tenant=tenant, amount=party.balance),
        "note_line": f"{reminder.note} " if reminder.note else "",
    }
    outcome = messaging.deliver_sms(
        tenant=tenant,
        party=party,
        template_code="REMINDER_MANUAL_SMS",
        params=params,
        locale=messaging.message_locale(tenant),
        related_type="ledger_reminder",
        related_id=reminder.id,
    )
    log = outcome.log
    common = {"snapshot_balance": party.balance, "message_log_id": log.id}
    if log.status in ("sent", "delivered"):
        _finish(ctx, reminder, status=ReminderStatus.SENT, sent_at=timezone.now(), **common)
        return {"sent": True}
    if outcome.retryable and not final_attempt:
        raise RetryLater(log.error or "provider error")
    note = {
        "channel_not_configured": NOTE_PROVIDER_NOT_CONFIGURED,
        "invalid_number": NOTE_INVALID_MOBILE,
    }.get(log.error or "", log.error or "")
    _finish(ctx, reminder, status=ReminderStatus.FAILED, note=note, **common)
    return {"failed": log.error or "unknown"}
