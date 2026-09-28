"""LED-07 — the day-before and on-the-day SMS, sent by the system, not the owner.

── Shape (Part 20 §20.8.6.1 rule S3: fan out, never loop) ───────────────────
`ledger.schedule_auto_reminders` (daily, 09:00 IST, in `SCHEDULES`) enqueues
one `ledger.auto_reminders_for_tenant` job per active tenant. That job writes
the day's `ledger_reminder` rows with `INSERT … ON CONFLICT DO NOTHING` against
`uq_reminder_auto_per_day`, raises the `reminder_due` inbox row, and enqueues
one `ledger.send_auto_reminder` per scheduled row. Each send re-checks
eligibility at send time and writes exactly one message-log row.

── Why a double run is harmless (FR-7, Part 12 §12.8) ────────────────────────
The unique index means the second insert writes nothing; the send jobs are
enqueued with `idempotency_token=auto-reminder:<id>` so a live job is never
duplicated; and a send job for a row that is no longer `scheduled` returns
without touching anything. Running the whole chain twice on one day produces
the same rows and the same messages as running it once.

── Console is `failed`, on purpose (BR-6) ────────────────────────────────────
With no provider the message-log row is `skipped` and the REMINDER is
`failed` with the note "provider not configured": for an owner, "failed" has
to mean "the customer did not get it", and with no provider they did not.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.common.jobs import enqueue
from apps.common.money import ZERO
from apps.ledger.constants import (
    AUTO_REMINDER_KINDS,
    NOTE_BALANCE_SETTLED,
    NOTE_DATE_CHANGED,
    NOTE_INVALID_MOBILE,
    NOTE_NO_MOBILE,
    NOTE_OPTED_OUT,
    NOTE_PROVIDER_NOT_CONFIGURED,
    NOTE_SETTING_OFF,
    SETTING_AUTO_SMS,
    ReminderChannel,
    ReminderKind,
    ReminderStatus,
)
from apps.ledger.models import Reminder
from apps.ledger.services import messaging
from apps.ledger.services.reminder_settings import setting_on
from apps.parties.constants import PartyStatus
from apps.parties.models import Party
from apps.parties.services.balance import lock_party


def eligible_parties(*, tenant: Any, due_on: dt.date) -> Any:
    """BR-1 — who gets an automated SMS for a collection date of `due_on`."""
    return (
        Party.objects.for_tenant(tenant)
        .filter(
            status=PartyStatus.ACTIVE,
            balance__gt=ZERO,
            sms_opt_in=True,
            mobile__isnull=False,
            collection_date=due_on,
        )
        .exclude(mobile="")
    )


def due_today_parties(*, tenant: Any, today: dt.date) -> Any:
    """LED-05 §17 — the `reminder_due` row counts these, SMS or no SMS."""
    return Party.objects.for_tenant(tenant).filter(
        status=PartyStatus.ACTIVE, balance__gt=ZERO, collection_date=today
    )


@transaction.atomic
def schedule_for_tenant(*, tenant: Any, today: dt.date | None = None) -> dict:
    """FR-2 — the day's rows, the inbox nudge, and one send job per row."""
    today = today or tenant_today(tenant)
    due_today = list(due_today_parties(tenant=tenant, today=today).values_list("id", flat=True))
    if due_today:
        messaging.notify(
            tenant,
            "reminder_due",
            params={"count": len(due_today)},
            group_key=f"reminder_due:{today.isoformat()}",
            ids=[str(i) for i in due_today],
        )

    if not setting_on(tenant, SETTING_AUTO_SMS):
        return {"due_today": len(due_today), "scheduled": 0}

    now = timezone.now()
    # BR-2 / BR-5. D0 for today; D-1 for tomorrow only. A day the scheduler
    # missed never produces a late "due tomorrow" for a date that is today.
    rows = [
        Reminder(
            tenant=tenant,
            party_id=party_id,
            due_on=due_on,
            channel=ReminderChannel.SMS,
            kind=kind,
            status=ReminderStatus.SCHEDULED,
            scheduled_for=now,
        )
        for kind, due_on in (
            (ReminderKind.AUTO_D0, today),
            (ReminderKind.AUTO_D1, today + dt.timedelta(days=1)),
        )
        for party_id in eligible_parties(tenant=tenant, due_on=due_on).values_list("id", flat=True)
    ]
    Reminder.objects.bulk_create(rows, ignore_conflicts=True, batch_size=500)

    pending = Reminder.objects.for_tenant(tenant).filter(
        kind__in=AUTO_REMINDER_KINDS,
        status=ReminderStatus.SCHEDULED,
        due_on__in=(today, today + dt.timedelta(days=1)),
    )
    queued = 0
    for reminder_id in pending.values_list("id", flat=True):
        if enqueue(
            job_type="ledger.send_auto_reminder",
            payload={"reminder_id": str(reminder_id)},
            tenant=tenant,
            idempotency_token=f"auto-reminder:{reminder_id}",
        ):
            queued += 1
    return {"due_today": len(due_today), "scheduled": pending.count(), "queued": queued}


def _finish(ctx: Ctx, reminder: Reminder, *, status: str, note: str = "", **fields: Any) -> None:
    reminder.status = status
    if note:
        reminder.note = note
    for key, value in fields.items():
        setattr(reminder, key, value)
    reminder.save()
    if status in (ReminderStatus.SENT, ReminderStatus.FAILED):
        write_audit(
            ctx=ctx,
            action=(
                AuditAction.REMINDER_SENT
                if status == ReminderStatus.SENT
                else AuditAction.REMINDER_FAILED
            ),
            entity_type="ledger_reminder",
            entity_id=reminder.id,
            metadata={"kind": reminder.kind, "message_log_id": str(reminder.message_log_id or "")},
        )
    if status == ReminderStatus.FAILED:
        # FR-4 — the owner is told, once a day, in one coalesced row.
        messaging.notify(
            reminder.tenant,
            "reminder_failed",
            params={"count": 1},
            group_key=f"reminder_failed:{tenant_today(reminder.tenant).isoformat()}",
            ids=[str(reminder.party_id)],
        )


class RetryLater(RuntimeError):
    """A retryable provider failure — the job runner's backoff takes it from here."""


@transaction.atomic
def send_auto_reminder(*, reminder_id: Any, tenant: Any, final_attempt: bool) -> dict:
    """FR-3 — re-check, render with the LIVE balance, send, record."""
    ctx = Ctx.system(tenant)
    reminder = (
        Reminder.objects.for_tenant(tenant)
        .select_for_update()
        .select_related("tenant")
        .filter(pk=reminder_id)
        .first()
    )
    if reminder is None or reminder.status != ReminderStatus.SCHEDULED:
        return {"skipped": "not_scheduled"}  # FR-7 — idempotent on the reminder

    party = lock_party(tenant=tenant, party_id=reminder.party_id)
    # The second line of defence (BR-4): every reason it may have stopped
    # being right since 09:00.
    if party is None or party.status != PartyStatus.ACTIVE or (party.balance or ZERO) <= ZERO:
        _finish(ctx, reminder, status=ReminderStatus.CANCELLED, note=NOTE_BALANCE_SETTLED)
        return {"cancelled": "balance_settled"}
    if not party.sms_opt_in:
        _finish(ctx, reminder, status=ReminderStatus.CANCELLED, note=NOTE_OPTED_OUT)
        return {"cancelled": "opted_out"}
    if not party.mobile:
        _finish(ctx, reminder, status=ReminderStatus.CANCELLED, note=NOTE_NO_MOBILE)
        return {"cancelled": "no_mobile"}
    if party.collection_date != reminder.due_on:
        # LED-05 BR-4 — the promise moved; the next 09:00 run targets the new one.
        _finish(ctx, reminder, status=ReminderStatus.CANCELLED, note=NOTE_DATE_CHANGED)
        return {"cancelled": "date_changed"}
    if not setting_on(tenant, SETTING_AUTO_SMS):
        _finish(ctx, reminder, status=ReminderStatus.CANCELLED, note=NOTE_SETTING_OFF)
        return {"cancelled": "setting_off"}

    template = "REMINDER_D1" if reminder.kind == ReminderKind.AUTO_D1 else "REMINDER_D0"
    params = {
        "shop": messaging.shop_name(tenant),
        "balance": messaging.format_rs(party.balance),
        "due_date": reminder.due_on.strftime("%d/%m"),
        "pay_line": messaging.pay_line(tenant=tenant, amount=party.balance),
    }
    outcome = messaging.deliver_sms(
        tenant=tenant,
        party=party,
        template_code=template,
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
    if log.error == "channel_not_configured":
        _finish(
            ctx, reminder, status=ReminderStatus.FAILED, note=NOTE_PROVIDER_NOT_CONFIGURED, **common
        )
        return {"failed": "provider_not_configured"}
    if log.error == "invalid_number":
        _finish(ctx, reminder, status=ReminderStatus.FAILED, note=NOTE_INVALID_MOBILE, **common)
        return {"failed": "invalid_mobile"}
    if outcome.retryable and not final_attempt:
        raise RetryLater(log.error or "provider error")
    _finish(ctx, reminder, status=ReminderStatus.FAILED, note=log.error or "", **common)
    return {"failed": log.error or "unknown"}
