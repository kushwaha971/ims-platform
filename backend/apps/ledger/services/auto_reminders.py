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
from django.db.models import F, Q
from django.utils import timezone

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.common.jobs import enqueue
from apps.common.money import ZERO
from apps.ledger.constants import (
    AUTO_REMINDER_KINDS,
    NOTE_BALANCE_SETTLED,
    NOTE_CAP_REACHED,
    NOTE_DATE_CHANGED,
    NOTE_INVALID_MOBILE,
    NOTE_NO_MOBILE,
    NOTE_OPTED_OUT,
    NOTE_OUTSIDE_WINDOW,
    NOTE_PROVIDER_NOT_CONFIGURED,
    NOTE_SETTING_OFF,
    NOTE_SOURCE_CLOSED,
    SETTING_AUTO_SMS,
    ReminderChannel,
    ReminderKind,
    ReminderStatus,
)
from apps.ledger.models import Reminder
from apps.ledger.services import messaging
from apps.ledger.services import reminder_seam as _seam
from apps.ledger.services.reminder_seam import next_allowed_at
from apps.ledger.services.reminder_settings import setting_on
from apps.ledger.services.reminders import trade_balance
from apps.parties.constants import PartyStatus
from apps.parties.models import Party
from apps.parties.services.balance import lock_party


def eligible_parties(*, tenant: Any, due_on: dt.date) -> Any:
    """BR-1 — who gets an automated SMS for a collection date of `due_on`."""
    # A7 BR-7 — the shop's figure: a loan is reminded by lending's own source.
    return (
        Party.objects.for_tenant(tenant)
        .alias(trade=F("balance") - F("loan_balance"))
        .filter(
            status=PartyStatus.ACTIVE,
            trade__gt=ZERO,
            sms_opt_in=True,
            mobile__isnull=False,
            collection_date=due_on,
        )
        .exclude(mobile="")
    )


def due_today_parties(*, tenant: Any, today: dt.date) -> Any:
    """LED-05 §17 — the `reminder_due` row counts these, SMS or no SMS."""
    return (
        Party.objects.for_tenant(tenant)
        .alias(trade=F("balance") - F("loan_balance"))
        .filter(status=PartyStatus.ACTIVE, trade__gt=ZERO, collection_date=today)
    )


@transaction.atomic
def schedule_for_tenant(*, tenant: Any, today: dt.date | None = None) -> dict:
    """FR-2 — the day's rows, the inbox nudge, and one send job per row."""
    today = today or _seam.today(tenant)
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

    now = _seam.now()
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
    rows.extend(_module_rows(tenant=tenant, today=today, now=now))
    Reminder.objects.bulk_create(rows, ignore_conflicts=True, batch_size=500)

    pending = Reminder.objects.for_tenant(tenant).filter(
        Q(
            kind__in=AUTO_REMINDER_KINDS,
            due_on__in=(today, today + dt.timedelta(days=1)),
        )
        | Q(kind__in=(ReminderKind.DUE, ReminderKind.NOTICE)),
        status=ReminderStatus.SCHEDULED,
    )
    queued = 0
    for reminder_id, scheduled_for in pending.values_list("id", "scheduled_for"):
        if enqueue(
            job_type="ledger.send_auto_reminder",
            payload={"reminder_id": str(reminder_id)},
            tenant=tenant,
            # A7 EC-6 — a module row waits for its window; the send re-checks.
            run_after=scheduled_for if scheduled_for and scheduled_for > now else None,
            idempotency_token=f"auto-reminder:{reminder_id}",
        ):
            queued += 1
    return {"due_today": len(due_today), "scheduled": pending.count(), "queued": queued}


def _module_rows(*, tenant: Any, today: dt.date, now: dt.datetime) -> list[Reminder]:
    """A7 §2 flow 4 — the module candidates of the day, one row each.

    `due` when the candidate has an amount, `notice` when not; unique per
    `(party, due_on, kind, source_id)`, so a rerun writes nothing (BR-10) and
    two loans due the same day are two rows. `scheduled_for` is deferred into
    the module's window (EC-6: a 09:00 run for a 10:00 window waits until 10:00).
    """
    from apps.ledger.services.reminder_seam import candidates_for, module_of_source

    rows: list[Reminder] = []
    for candidate in candidates_for(tenant, today):
        module = module_of_source(candidate["source_type"]) or ""
        when = next_allowed_at(
            tenant=tenant,
            module=module,
            party_id=candidate["party_id"],
            source_id=candidate["source_id"],
            after=now,
        )
        amount = candidate.get("amount")
        rows.append(
            Reminder(
                tenant=tenant,
                party_id=candidate["party_id"],
                recipient_party_id=candidate.get("recipient_party_id"),
                due_on=candidate["due_on"],
                channel=ReminderChannel.SMS,
                kind=ReminderKind.DUE if amount is not None else ReminderKind.NOTICE,
                status=ReminderStatus.SCHEDULED,
                module=module,
                source_type=candidate["source_type"],
                source_id=candidate["source_id"],
                subject_label=(candidate.get("subject_label") or "")[:120],
                snapshot_balance=amount,
                scheduled_for=when,
            )
        )
    return rows


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
    if reminder.source_id is not None:
        return _send_module_auto(ctx, reminder, final_attempt=final_attempt)

    party = lock_party(tenant=tenant, party_id=reminder.party_id)
    # The second line of defence (BR-4): every reason it may have stopped
    # being right since 09:00.
    if party is None or party.status != PartyStatus.ACTIVE or trade_balance(party) <= ZERO:
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
        "balance": messaging.format_rs(trade_balance(party)),
        "due_date": reminder.due_on.strftime("%d/%m"),
        "pay_line": messaging.pay_line(tenant=tenant, amount=trade_balance(party)),
    }
    return _deliver(
        ctx,
        reminder,
        to=party,
        template=template,
        params=params,
        snapshot=trade_balance(party),
        final_attempt=final_attempt,
    )


def _deliver(
    ctx: Ctx,
    reminder: Reminder,
    *,
    to: Party,
    template: str,
    params: dict,
    snapshot: Any,
    final_attempt: bool,
) -> dict:
    """Send through the adapter and record the outcome (BR-6: console is failed)."""
    tenant = ctx.tenant
    outcome = messaging.deliver_sms(
        tenant=tenant,
        party=to,
        template_code=template,
        params=params,
        locale=messaging.message_locale(tenant),
        related_type="ledger_reminder",
        related_id=reminder.id,
    )
    log = outcome.log
    common = {"snapshot_balance": snapshot, "message_log_id": log.id}
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


def _send_module_auto(ctx: Ctx, reminder: Reminder, *, final_attempt: bool) -> dict:
    """A7 — the send job for a `due`/`notice` row: re-check EVERYTHING at send
    time (EC-6), including the policy, which may have narrowed since 09:00."""
    from apps.common.exceptions import BusinessRuleViolation
    from apps.ledger.services.reminder_seam import check_reminder_allowed, find_candidate
    from apps.ledger.services.reminders import _source_params

    tenant = ctx.tenant
    candidate = find_candidate(
        tenant, reminder.source_type, reminder.source_id, _seam.today(tenant)
    )
    person = lock_party(tenant=tenant, party_id=reminder.party_id)
    if candidate is None or person is None or person.status != PartyStatus.ACTIVE:
        _finish(ctx, reminder, status=ReminderStatus.CANCELLED, note=NOTE_SOURCE_CLOSED)
        return {"cancelled": "source_closed"}
    recipient = person
    if reminder.recipient_party_id:
        other = Party.objects.for_tenant(tenant).filter(pk=reminder.recipient_party_id).first()
        if other is not None and other.status == PartyStatus.ACTIVE:
            recipient = other
    if not recipient.sms_opt_in:
        _finish(ctx, reminder, status=ReminderStatus.CANCELLED, note=NOTE_OPTED_OUT)
        return {"cancelled": "opted_out"}
    if not recipient.mobile:
        _finish(ctx, reminder, status=ReminderStatus.CANCELLED, note=NOTE_NO_MOBILE)
        return {"cancelled": "no_mobile"}
    if not setting_on(tenant, SETTING_AUTO_SMS):
        _finish(ctx, reminder, status=ReminderStatus.CANCELLED, note=NOTE_SETTING_OFF)
        return {"cancelled": "setting_off"}
    try:
        check_reminder_allowed(
            tenant=tenant,
            module=reminder.module,
            party_id=person.pk,
            source_id=reminder.source_id,
            exclude_id=reminder.id,
        )
    except BusinessRuleViolation as refusal:
        note = (
            NOTE_OUTSIDE_WINDOW if refusal.code == "reminder_outside_window" else NOTE_CAP_REACHED
        )
        _finish(ctx, reminder, status=ReminderStatus.CANCELLED, note=note)
        return {"cancelled": refusal.code}
    amount = candidate.get("amount")
    return _deliver(
        ctx,
        reminder,
        to=recipient,
        template=candidate["template_key"],
        params=_source_params(ctx, dict(candidate), person, recipient),
        snapshot=amount,
        final_attempt=final_attempt,
    )
