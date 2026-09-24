"""LED-08 — the SMS a customer gets when the shop writes in their khata.

── When it is queued (FR-2) ──────────────────────────────────────────────────
Inside the posting's transaction, for `manual_gave`, `manual_got` and
`write_off` only (BR-1, BR-3 — never an opening, never a document line), and
only when the tenant switched it on, the party is opted in and has a mobile. A
job row committed with the entry is the transactional outbox: no SMS for an
entry that rolled back, no entry that silently lost its SMS.

── Coalescing (FR-3, BR-4) ──────────────────────────────────────────────────
The job runs 60 seconds later. If a NEWER job for the same party is still
waiting, this one steps aside and lets the newest speak for all of them: three
entries in a minute become one SMS with the final balance ("3 entries added…"),
which is what a customer can actually use.

── The balance is read at send time ─────────────────────────────────────────
Not the balance at posting: by the time the SMS goes, a correction or a second
entry may have moved it, and the one number that must be right is the one the
customer reads.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.db import transaction

from apps.common.jobs import enqueue
from apps.common.money import ZERO
from apps.ledger.constants import (
    ENTRY_SMS_DELAY_SECONDS,
    SETTING_PARTY_SMS_ON_ENTRY,
    EntryStatus,
    EntryType,
)
from apps.ledger.models import LedgerEntry
from apps.ledger.services import messaging
from apps.ledger.services.reminder_settings import setting_on

#: BR-1 — the entry types that text the customer.
SMS_ENTRY_TYPES = (EntryType.MANUAL_GAVE, EntryType.MANUAL_GOT, EntryType.WRITE_OFF)
TEMPLATE_FOR_TYPE = {
    EntryType.MANUAL_GAVE: "LEDGER_ENTRY_GAVE",
    EntryType.MANUAL_GOT: "LEDGER_ENTRY_GOT",
    EntryType.WRITE_OFF: "WRITE_OFF",
}
LEDGER_TEMPLATES = (*TEMPLATE_FOR_TYPE.values(), "LEDGER_ENTRY_MULTI")
JOB_TYPE = "ledger.send_entry_sms"

#: BR-2 — the balance label from the CUSTOMER's side; never "you owe".
LABELS = {
    "en": {"receivable": "you will give", "payable": "we will give", "settled": "settled"},
    "hi": {"receivable": "आप देंगे", "payable": "हम देंगे", "settled": "बराबर"},
}
#: FR-7 — the DPDP notice on the first SMS a party ever receives.
NOTICE = {
    "en": " Reply STOP to {shop} to opt out.",
    "hi": " बंद करने के लिए {shop} को बताएं।",
}


def maybe_enqueue_entry_sms(*, tenant: Any, party: Any, entry: LedgerEntry) -> bool:
    """FR-2 — queue the coalescing job when every condition holds. Returns whether it did."""
    if entry.entry_type not in SMS_ENTRY_TYPES:
        return False
    if not party.sms_opt_in or not party.mobile:
        return False
    if not setting_on(tenant, SETTING_PARTY_SMS_ON_ENTRY):
        return False
    from django.utils import timezone

    enqueue(
        job_type=JOB_TYPE,
        payload={"party_id": str(party.id), "entry_id": str(entry.id)},
        tenant=tenant,
        run_after=timezone.now() + dt.timedelta(seconds=ENTRY_SMS_DELAY_SECONDS),
        max_attempts=4,
    )
    return True


def _superseded(job: Any) -> bool:
    """FR-3 — is a newer job for the same party still waiting?"""
    from django.apps import apps

    job_model = apps.get_model("platform", "Job")
    return job_model.objects.filter(
        tenant_id=job.tenant_id,
        job_type=JOB_TYPE,
        status="queued",
        payload__party_id=job.payload.get("party_id"),
        created_at__gt=job.created_at,
    ).exists()


def _label(balance: Any, locale: str) -> str:
    labels = LABELS.get(locale, LABELS["en"])
    if balance > ZERO:
        return labels["receivable"]
    if balance < ZERO:
        return labels["payable"]
    return labels["settled"]


@transaction.atomic
def send_entry_sms(*, job: Any, tenant: Any, final_attempt: bool) -> dict:
    """The job body: coalesce, re-check, render, send (FR-3, BR-2, BR-4, FR-7)."""
    from apps.parties.models import Party

    if _superseded(job):
        return {"skipped": "coalesced"}
    party = Party.objects.for_tenant(tenant).filter(pk=job.payload.get("party_id")).first()
    entry = LedgerEntry.objects.for_tenant(tenant).filter(pk=job.payload.get("entry_id")).first()
    if party is None or entry is None:
        return {"skipped": "gone"}
    if not setting_on(tenant, SETTING_PARTY_SMS_ON_ENTRY):
        return {"skipped": "setting_off"}

    log_model = messaging.message_log_model()
    last = (
        log_model.objects.filter(party=party, template_code__in=LEDGER_TEMPLATES)
        .order_by("-created_at")
        .values_list("created_at", flat=True)
        .first()
    )
    since = LedgerEntry.objects.for_tenant(tenant).filter(
        party=party, entry_type__in=SMS_ENTRY_TYPES, status=EntryStatus.POSTED
    )
    if last is not None:
        since = since.filter(created_at__gt=last)
    count = max(since.count(), 1)

    locale = messaging.message_locale(tenant)
    shop = messaging.shop_name(tenant)
    notice = (
        ""
        if messaging.has_sent_sms(party=party)
        else NOTICE.get(locale, NOTICE["en"]).format(shop=shop)
    )
    template = "LEDGER_ENTRY_MULTI" if count > 1 else TEMPLATE_FOR_TYPE[entry.entry_type]
    params = {
        "shop": shop,
        "amount": messaging.format_rs(entry.amount),
        "date": entry.entry_date.strftime("%d/%m"),
        "balance": messaging.format_rs(party.balance),
        "label": _label(party.balance, locale),
        "n": count,
        "notice": notice,
    }
    outcome = messaging.deliver_sms(
        tenant=tenant,
        party=party,
        template_code=template,
        params=params,
        locale=locale,
        related_type="ledger_entry",
        related_id=entry.id,
    )
    if outcome.retryable and not final_attempt:
        from apps.ledger.services.auto_reminders import RetryLater

        raise RetryLater(outcome.log.error or "provider error")
    return {"status": outcome.log.status, "template": template, "coalesced": count}
