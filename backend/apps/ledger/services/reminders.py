"""LED-06 — asking for money, recorded (Part 26 §26.7 R7.1: fat service).

── What "sent" means here ────────────────────────────────────────────────────
For `whatsapp_manual`, `sms_manual` and `call` the PRODUCT sends nothing: the
merchant taps a real link that opens WhatsApp, their SMS app or the dialler
with the text already typed, and presses send themselves (DEC-012, NTF-03
BR-1). `status='sent'` on those rows means "the merchant was handed the
message", and the client calls `/send` from the tap that opens the app — so a
sheet that was opened and closed leaves no row claiming a nudge happened.

`sms` is the provider path (LED-06 FR-3): a job sends it through the adapter
and the row stays `scheduled` until that job decides.

── Why there is a preview that writes nothing ────────────────────────────────
`POST /reminders/preview` (CR-LOG) returns the server-composed text for the
sheet before anything is recorded. LED-06 FR-5 has the client render the
template itself for the preview, which is a second renderer of a message that
contains money; NTF-03 BR-2 says the server composes every such message. The
preview is the same function `/send` calls, minus the row.

── The snapshot ──────────────────────────────────────────────────────────────
BR-1: `snapshot_balance` is the balance at SEND time, read under the party's
row lock, and the text is rendered from the same number — so the row and the
message a customer received can never disagree (EC-4).
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.common.exceptions import BusinessRuleViolation, NotFound, ValidationFailed
from apps.common.jobs import enqueue
from apps.common.money import ZERO
from apps.ledger.constants import (
    BULK_REMINDER_MAX,
    MANUAL_REMINDER_CHANNELS,
    NOTE_BALANCE_SETTLED,
    REMINDED_RECENTLY_HOURS,
    REMINDER_NOTE_MAX_LENGTH,
    ReminderChannel,
    ReminderKind,
    ReminderStatus,
)
from apps.ledger.models import Reminder
from apps.ledger.services import messaging
from apps.parties.constants import PartyStatus
from apps.parties.models import Party
from apps.parties.services.balance import lock_party

#: The channels whose message the merchant sends from their own phone.
LINK_CHANNELS = (ReminderChannel.WHATSAPP_MANUAL, ReminderChannel.SMS_MANUAL)
#: Every channel that needs a mobile (all of them, today).
NEEDS_MOBILE = (*LINK_CHANNELS, ReminderChannel.SMS, ReminderChannel.CALL)


def _clean_note(raw: Any) -> str:
    """§10 — one line, ≤ 120 characters. Newlines are refused, not folded."""
    note = raw if isinstance(raw, str) else ""
    if "\n" in note or "\r" in note or len(note.strip()) > REMINDER_NOTE_MAX_LENGTH:
        raise ValidationFailed(
            {"note": [f"Keep it to one line ({REMINDER_NOTE_MAX_LENGTH} characters)."]}
        )
    return " ".join(note.split())


def _channel(raw: Any) -> str:
    if raw not in MANUAL_REMINDER_CHANNELS:
        raise ValidationFailed({"channel": ["Choose WhatsApp, SMS or Call."]})
    return raw


def _check_remindable(party: Party | None, channel: str | None) -> Party:
    """The three refusals every path shares, in the order a merchant hits them."""
    if party is None:
        raise NotFound("No such party.")
    if party.status == PartyStatus.ARCHIVED:
        raise BusinessRuleViolation(
            "party_archived", "This party is archived. Restore them to remind them."
        )
    if (party.balance or ZERO) <= ZERO:
        # FR-8 / CCR-2 — nothing to collect, or money the MERCHANT owes.
        raise BusinessRuleViolation(
            "nothing_due",
            "Nothing is due from this party.",
            details={"party_id": str(party.id), "balance": str(party.balance)},
        )
    if channel in NEEDS_MOBILE and not party.mobile:
        raise ValidationFailed({"party_id": ["Party has no mobile"]})
    return party


def _find_party(ctx: Ctx, raw: Any) -> Party | None:
    """The tenant's party, or None — an id that is not a UUID is simply not found."""
    valid = _valid_uuids([str(raw)]) if raw else []
    if not valid:
        return None
    return Party.objects.for_tenant(ctx.tenant).filter(pk=valid[0]).first()


def _recent_warning(party: Party) -> list[dict]:
    """FR-10 / BR-4 — a reminder already went in the last 24 hours."""
    since = timezone.now() - dt.timedelta(hours=REMINDED_RECENTLY_HOURS)
    last = (
        Reminder.objects.filter(party=party, status=ReminderStatus.SENT, sent_at__gte=since)
        .order_by("-sent_at")
        .only("sent_at", "channel")
        .first()
    )
    if last is None:
        return []
    return [
        {
            "code": "reminded_recently",
            "last_sent_at": last.sent_at.isoformat(),
            "channel": last.channel,
        }
    ]


def _reference(reminder_id: Any) -> str:
    """LED-06 BR-8 — `RM-` + a short id, the UPI `tr` a merchant can search for."""
    return f"RM-{str(reminder_id).replace('-', '')[-8:].upper()}"


def preview_reminder(*, ctx: Ctx, party_id: Any, note: Any = "") -> dict:
    """The text the sheet shows; writes nothing (see the module docstring)."""
    party = _check_remindable(_find_party(ctx, party_id), channel=None)
    composed = messaging.compose_reminder(
        tenant=ctx.tenant, party=party, balance=party.balance, note=_clean_note(note)
    )
    return {
        "party_id": str(party.id),
        "balance": str(party.balance),
        "text": composed.text,
        "sms_text": composed.sms_text,
        "wa_url": composed.wa_url,
        "sms_url": composed.sms_url,
        "tel_url": composed.tel_url,
        "has_mobile": bool(party.mobile),
        "has_upi": composed.has_upi,
        "sms_opt_in": party.sms_opt_in,
        "warnings": _recent_warning(party),
    }


@transaction.atomic
def create_reminder(*, ctx: Ctx, payload: dict) -> Reminder:
    """`POST /reminders` — a `scheduled` manual reminder; nothing is sent yet."""
    channel = _channel(payload.get("channel"))
    note = _clean_note(payload.get("note") or "")
    party = _check_remindable(_find_party(ctx, payload.get("party_id")), channel)
    due_on = payload.get("due_on") or tenant_today(ctx.tenant)
    if isinstance(due_on, str):
        try:
            due_on = dt.date.fromisoformat(due_on)
        except ValueError:
            raise ValidationFailed({"due_on": ["Enter a valid date."]}) from None
    return Reminder.objects.create(
        tenant=ctx.tenant,
        created_by=ctx.actor if ctx.actor_type == "user" else None,
        party=party,
        due_on=due_on,
        channel=channel,
        kind=ReminderKind.MANUAL,
        status=ReminderStatus.SCHEDULED,
        note=note,
        scheduled_for=timezone.now(),
    )


def _sent(ctx: Ctx, reminder: Reminder, *, balance: Decimal, log_id: Any, bulk: bool) -> None:
    reminder.status = ReminderStatus.SENT
    reminder.sent_at = timezone.now()
    reminder.snapshot_balance = balance
    reminder.message_log_id = log_id
    reminder.save(
        update_fields=["status", "sent_at", "snapshot_balance", "message_log_id", "updated_at"]
    )
    write_audit(
        ctx=ctx,
        action=AuditAction.REMINDER_SENT,
        entity_type="ledger_reminder",
        entity_id=reminder.id,
        metadata={
            "channel": reminder.channel,
            "kind": reminder.kind,
            "snapshot_balance": str(balance),
            "bulk": bulk,
            "party_id": str(reminder.party_id),
        },
    )


@transaction.atomic
def send_reminder(*, ctx: Ctx, reminder_id: Any, bulk: bool = False) -> dict:
    """`POST /reminders/{id}/send` — record the tap, or queue the provider SMS.

    Returns `{"status_code": 200|202, "data": {...}, "warnings": [...]}` so the
    view stays a translation of the service's answer, not a second decision.
    """
    reminder = (
        Reminder.objects.for_tenant(ctx.tenant).select_for_update().filter(pk=reminder_id).first()
    )
    if reminder is None:
        raise NotFound("No such reminder.")
    if reminder.status != ReminderStatus.SCHEDULED:
        raise BusinessRuleViolation(
            "reminder_not_sendable",
            "This reminder has already been dealt with.",
            details={"status": reminder.status},
        )
    party = _check_remindable(
        lock_party(tenant=ctx.tenant, party_id=reminder.party_id), reminder.channel
    )
    warnings = [] if bulk else _recent_warning(party)
    balance = party.balance

    if reminder.channel == ReminderChannel.CALL:
        # FR-4 — the dialler opens; there is no message, so no message log.
        digits = messaging.compose_reminder(tenant=ctx.tenant, party=party, balance=balance).digits
        _sent(ctx, reminder, balance=balance, log_id=None, bulk=bulk)
        return {"status_code": 200, "data": {"tel_url": f"tel:+{digits}"}, "warnings": warnings}

    if reminder.channel == ReminderChannel.SMS:
        # FR-3 — the provider path. Console-only is refused in production and
        # allowed in dev, where the job records `skipped` (T-LED-06-5).
        if not messaging.sms_configured() and not settings.DEBUG:
            raise BusinessRuleViolation("channel_not_configured", "No SMS provider is set up.")
        if not party.sms_opt_in:
            raise BusinessRuleViolation("party_opted_out", "This customer has opted out of SMS.")
        enqueue(
            job_type="ledger.send_reminder_sms",
            payload={"reminder_id": str(reminder.id)},
            tenant=ctx.tenant,
            idempotency_token=f"reminder-sms:{reminder.id}",
            request_id=ctx.request_id,
        )
        return {
            "status_code": 202,
            "data": {"reminder_id": str(reminder.id), "status": reminder.status},
            "warnings": warnings,
        }

    composed = messaging.compose_reminder(
        tenant=ctx.tenant,
        party=party,
        balance=balance,
        note=reminder.note,
        reference=_reference(reminder.id),
    )
    is_whatsapp = reminder.channel == ReminderChannel.WHATSAPP_MANUAL
    log = messaging.log_manual_share(
        tenant=ctx.tenant,
        party=party,
        channel="whatsapp" if is_whatsapp else "sms",
        provider="wa_me" if is_whatsapp else "sms_link",
        to=composed.digits or "",
        template_code=composed.template_code if is_whatsapp else "REMINDER_MANUAL_SMS",
        body=composed.text if is_whatsapp else composed.sms_text,
        params=composed.params,
        related_type="ledger_reminder",
        related_id=reminder.id,
    )
    _sent(ctx, reminder, balance=balance, log_id=log.id, bulk=bulk)
    data = (
        {"wa_url": composed.wa_url, "text": composed.text}
        if is_whatsapp
        else {"sms_url": composed.sms_url, "text": composed.sms_text}
    )
    return {"status_code": 200, "data": data, "warnings": warnings}


def bulk_reminders(*, ctx: Ctx, payload: dict) -> dict:
    """FR-7 / BR-5 — one `scheduled` row and one ready link per eligible party.

    Nothing is marked sent here. The client walks the list one tap at a time
    (browsers block a loop of popups, Part 32 §32.8.6) and each tap calls
    `/send` for its own row, so "7 of 12 done" is seven rows that say `sent`
    and five that still say `scheduled` — the truth, not the intention.
    For provider `sms` each row is sent immediately and queued.
    """
    channel = _channel(payload.get("channel"))
    raw_ids = payload.get("party_ids")
    if not isinstance(raw_ids, list) or not 1 <= len(raw_ids) <= BULK_REMINDER_MAX:
        raise ValidationFailed(
            {"party_ids": [f"Select up to {BULK_REMINDER_MAX} parties at a time."]}
        )
    note = _clean_note(payload.get("note") or "")
    ids = list(dict.fromkeys(str(i) for i in raw_ids))
    parties = {
        str(p.id): p for p in Party.objects.for_tenant(ctx.tenant).filter(pk__in=_valid_uuids(ids))
    }

    items: list[dict] = []
    skipped: list[dict] = []
    for party_id in ids:
        party = parties.get(party_id)
        reason = _skip_reason(party, channel)
        if reason:
            skipped.append({"party_id": party_id, "reason": reason})
            continue
        reminder = create_reminder(
            ctx=ctx, payload={"party_id": party_id, "channel": channel, "note": note}
        )
        if channel == ReminderChannel.SMS:
            send_reminder(ctx=ctx, reminder_id=reminder.id, bulk=True)
            items.append({"party_id": party_id, "reminder_id": str(reminder.id)})
            continue
        composed = messaging.compose_reminder(
            tenant=ctx.tenant,
            party=party,
            balance=party.balance,
            note=note,
            reference=_reference(reminder.id),
        )
        items.append(
            {
                "party_id": party_id,
                "party_name": party.name,
                "reminder_id": str(reminder.id),
                "balance": str(party.balance),
                "text": (
                    composed.sms_text if channel == ReminderChannel.SMS_MANUAL else composed.text
                ),
                "wa_url": composed.wa_url,
                "sms_url": composed.sms_url,
                "tel_url": composed.tel_url,
            }
        )
    return {"items": items, "skipped": skipped, "queued": channel == ReminderChannel.SMS}


def _valid_uuids(values: list[str]) -> list[str]:
    import uuid

    valid = []
    for value in values:
        try:
            valid.append(str(uuid.UUID(value)))
        except ValueError:
            continue
    return valid


def _skip_reason(party: Party | None, channel: str) -> str | None:
    if party is None:
        return "not_found"
    if party.status == PartyStatus.ARCHIVED:
        return "archived"
    if (party.balance or ZERO) <= ZERO:
        return "nothing_due"
    if not party.mobile:
        return "no_mobile"
    if channel == ReminderChannel.SMS and not party.sms_opt_in:
        return "opted_out"
    return None


@transaction.atomic
def mark_reminder(*, ctx: Ctx, reminder_id: Any, status: Any) -> Reminder:
    """FR-9 — Done (they paid) or Dismissed; a manual outcome on any live row."""
    if status not in (ReminderStatus.DONE, ReminderStatus.DISMISSED):
        raise ValidationFailed({"status": ["Mark it done or dismissed."]})
    reminder = (
        Reminder.objects.for_tenant(ctx.tenant).select_for_update().filter(pk=reminder_id).first()
    )
    if reminder is None:
        raise NotFound("No such reminder.")
    if reminder.status == status:
        return reminder  # idempotent: the second tap changes nothing
    if reminder.status not in (
        ReminderStatus.SCHEDULED,
        ReminderStatus.SENT,
        ReminderStatus.FAILED,
    ):
        raise BusinessRuleViolation(
            "reminder_not_sendable",
            "This reminder has already been dealt with.",
            details={"status": reminder.status},
        )
    reminder.status = status
    reminder.save(update_fields=["status", "updated_at"])
    write_audit(
        ctx=ctx,
        action=(
            AuditAction.REMINDER_DONE
            if status == ReminderStatus.DONE
            else AuditAction.REMINDER_DISMISSED
        ),
        entity_type="ledger_reminder",
        entity_id=reminder.id,
    )
    return reminder


def cancel_scheduled_reminders(*, party: Party) -> int:
    """LED-05 BR-2 — the settle port: nothing is due, so nothing may still go out.

    Registered with `parties.services.balance.register_settle_handler` in the
    ledger's `ready()`, and run inside the posting's transaction.
    """
    scheduled = Reminder.objects.filter(
        tenant_id=party.tenant_id, party=party, status=ReminderStatus.SCHEDULED
    )
    now = timezone.now()
    # An automated row carries no note, so it gets the reason; a manual row's
    # note is the merchant's own line and is kept.
    cancelled = scheduled.filter(note="").update(
        status=ReminderStatus.CANCELLED, note=NOTE_BALANCE_SETTLED, updated_at=now
    )
    return cancelled + scheduled.update(status=ReminderStatus.CANCELLED, updated_at=now)
