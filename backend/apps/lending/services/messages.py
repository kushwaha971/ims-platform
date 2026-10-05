"""A lender's WhatsApp messages, handled like reminders (LEN-12; L03).

The owner's words, for every module: a WhatsApp message works the way Reminders
do — prepared, listed when due, sent by hand from the lender's own phone
(DEC-012: the product sends nothing) and recorded, so the office can see who
was told and when. So these ride the reminder seam
(`apps.ledger.services.reminder_seam`), with lending's legal guardrail as its
policy:

* **08:00 to 19:00, tenant-local** — a borrower is never messaged or called at
  night (FR-3). The tenant may narrow it, never widen it.
* **One message per loan per day**, whoever sends it and on whichever channel
  (FR-4) — the cap is what stops a collection round turning into pressure.
* **Fixed, polite texts only** (FR-5): no free text, no tone option, and a test
  proves none of them contains a word of `FORBIDDEN_WORDS` (BR-4).

Three reminders, under the source `lending_loan` (one per loan): the next
instalment is **due tomorrow**, something is **due today**, or the loan is
**overdue** (what is late plus today's). And one notice, the **receipt** after a
collection, under `lending_message` with the collection's payment as its
source — so the one-a-day cap on the LOAN never stops a receipt because a
reminder went out that morning. The window still applies to a receipt: it is a
message to a borrower, and the rule is about the hour, not the purpose.

Texts are `Rs`, never `₹` (NTF-02), and carry the lender's own business name,
never the product's. Only the borrower is messaged; the guarantor arm of FR-6
waits for loans to record a guarantor.
"""

from __future__ import annotations

import datetime as dt
import math
from decimal import Decimal
from typing import Any

from django.db import transaction

from apps.common.audit import write_audit
from apps.common.exceptions import BusinessRuleViolation, NotFound, ValidationFailed
from apps.common.money import ZERO
from apps.lending.constants import MODULE, LoanStatus
from apps.lending.models import LendingCollection, LendingLoan

SOURCE_LOAN = "lending_loan"
SOURCE_MESSAGE = "lending_message"
TEMPLATE_DUE_TOMORROW = "lending_due_tomorrow"
TEMPLATE_DUE_TODAY = "lending_due_today"
TEMPLATE_OVERDUE = "lending_overdue"
TEMPLATE_RECEIPT = "lending_receipt"
KIND_REMINDER = "reminder"
KIND_RECEIPT = "receipt"
#: Which bucket a template is, as the client and the list name it.
BUCKET = {
    TEMPLATE_DUE_TOMORROW: "due_tomorrow",
    TEMPLATE_DUE_TODAY: "due_today",
    TEMPLATE_OVERDUE: "overdue",
}

#: FRD LEN-12 BR-4, verbatim. Reviewed with the templates (L9): a word added to a
#: template that is on this list fails `test_messages.py`, not a borrower's trust.
FORBIDDEN_WORDS: frozenset[str] = frozenset(
    {
        # en
        "police", "court", "legal", "lawyer", "advocate", "case", "fir", "jail", "arrest",
        "warrant", "notice", "final", "warning", "action", "consequences", "family",
        "relatives", "neighbour", "employer", "office", "boss", "shame", "default",
        "defaulter", "blacklist", "cibil", "credit score", "seize", "recovery agent",
        "immediately", "last chance",
        # hi
        "पुलिस", "थाना", "कोर्ट", "अदालत", "वकील", "केस", "जेल", "गिरफ्तार", "नोटिस",
        "चेतावनी", "कार्रवाई", "परिवार", "रिश्तेदार", "पड़ोसी", "मालिक", "दफ्तर", "बदनाम",
        "शर्म", "डिफॉल्टर", "ब्लैकलिस्ट", "सिबिल", "ज़ब्त", "तुरंत", "आखिरी मौका",
    }
)  # fmt: skip

POLICY = {
    "window": (dt.time(8, 0), dt.time(19, 0)),
    "daily_cap_per_source": 1,
    "fixed_templates": True,
    "forbidden_words": FORBIDDEN_WORDS,
}

#: FRD LEN-12 §8, with `Rs` for `₹` (NTF-02). `recipient_name` is added at
#: compose time; every other parameter is in the candidate, so the generic
#: reminder list can prepare the same text without this module.
TEMPLATES: dict[str, dict[str, dict[str, str]]] = {
    TEMPLATE_DUE_TOMORROW: {
        "whatsapp": {
            "en": (
                "Namaste {{recipient_name}}. A reminder from {{business}}: instalment {{seq}} "
                "of loan {{loan_number}}, Rs {{amount}}, is due tomorrow, {{date}}. Thank you."
            ),
            "hi": (
                "नमस्ते {{recipient_name}}। {{business}} की ओर से याद दिला रहे हैं: कर्ज़ "
                "{{loan_number}} की किस्त {{seq}}, Rs {{amount}}, कल {{date}} को देय है। धन्यवाद।"
            ),
        },
        "sms": {
            "en": "{{business}}: loan {{loan_number}} instalment Rs {{amount}} due tomorrow {{date}}.",
            "hi": "{{business}}: कर्ज़ {{loan_number}} की किस्त Rs {{amount}} कल {{date}} को देय।",
        },
    },
    TEMPLATE_DUE_TODAY: {
        "whatsapp": {
            "en": (
                "Namaste {{recipient_name}}. A reminder from {{business}}: Rs {{amount}} for "
                "loan {{loan_number}} is due today, {{date}}. Thank you."
            ),
            "hi": (
                "नमस्ते {{recipient_name}}। {{business}} की ओर से याद दिला रहे हैं: कर्ज़ "
                "{{loan_number}} के Rs {{amount}} आज, {{date}} को देय हैं। धन्यवाद।"
            ),
        },
        "sms": {
            "en": "{{business}}: Rs {{amount}} for loan {{loan_number}} due today {{date}}.",
            "hi": "{{business}}: कर्ज़ {{loan_number}} के Rs {{amount}} आज {{date}} को देय।",
        },
    },
    TEMPLATE_OVERDUE: {
        "whatsapp": {
            "en": (
                "Namaste {{recipient_name}}. {{business}} here. Our records show Rs {{amount}} "
                "due on loan {{loan_number}} since {{date}}. Please pay when you can, or tell "
                "us if your records are different. Thank you."
            ),
            "hi": (
                "नमस्ते {{recipient_name}}। {{business}} से। हमारे हिसाब में कर्ज़ {{loan_number}} "
                "के Rs {{amount}} {{date}} से बाकी हैं। जब हो सके दे दीजिए, या आपका हिसाब अलग हो "
                "तो बताइए। धन्यवाद।"
            ),
        },
        "sms": {
            "en": "{{business}}: Rs {{amount}} due on loan {{loan_number}} since {{date}}.",
            "hi": "{{business}}: कर्ज़ {{loan_number}} के Rs {{amount}} {{date}} से बाकी।",
        },
    },
    TEMPLATE_RECEIPT: {
        "whatsapp": {
            "en": (
                "Namaste {{recipient_name}}. {{business}} received Rs {{amount}} for loan "
                "{{loan_number}} on {{date}} (receipt {{receipt_number}}). {{left_line}} "
                "Thank you."
            ),
            "hi": (
                "नमस्ते {{recipient_name}}। {{business}} को कर्ज़ {{loan_number}} के लिए {{date}} "
                "को Rs {{amount}} मिले (रसीद {{receipt_number}})। {{left_line}} धन्यवाद।"
            ),
        },
        "sms": {
            "en": "{{business}}: received Rs {{amount}} for loan {{loan_number}} on {{date}}.",
            "hi": "{{business}}: कर्ज़ {{loan_number}} के Rs {{amount}} {{date}} को मिले।",
        },
    },
}

#: The receipt's last line: what is still to pay, or that the loan is paid.
LEFT = {
    "en": {"some": "Still to pay: Rs {left}.", "none": "The loan is fully paid."},
    "hi": {"some": "बाकी: Rs {left}।", "none": "कर्ज़ पूरा चुका दिया गया है।"},
}


# ── Small helpers (lending does not import the library's: verticals never
#    import each other, so the shared shape is copied, not shared) ────────────


def _locale(tenant: Any) -> str:
    from apps.notifications.services.whatsapp_text import message_locale

    return message_locale(tenant)


def _business(tenant: Any) -> str:
    from apps.notifications.services.whatsapp_text import shop_name

    return shop_name(tenant)


def _rs(amount: Decimal) -> str:
    from apps.notifications.services.templates import format_rs

    return format_rs(amount)


def _day(day: dt.date | None) -> str:
    return day.strftime("%d/%m/%Y") if day else "-"


def _today(tenant: Any) -> dt.date:
    """The policy's clock, so a test that moves the window's hands moves the
    lists with them."""
    from apps.ledger.services.reminder_seam import today

    return today(tenant)


def _local_iso(tenant: Any, at: dt.datetime | None) -> str | None:
    """An instant in the lender's own time, so "sent at 10:14" is read off the
    string the same on any device, whatever its own clock's zone."""
    from django.utils import timezone

    from apps.common.dates import tenant_timezone

    return timezone.localtime(at, tenant_timezone(tenant)).isoformat() if at else None


def _channel(raw: Any) -> str:
    from apps.ledger.services.reminders import SOURCE_CHANNELS

    if raw not in SOURCE_CHANNELS:
        raise ValidationFailed({"channel": ["Choose WhatsApp, SMS or Call."]})
    return raw


def _loans(tenant: Any) -> Any:
    return LendingLoan.objects.filter(tenant=tenant, status=LoanStatus.ACTIVE).select_related(
        "party", "borrower", "route"
    )


def _loan(tenant: Any, loan_id: Any) -> LendingLoan:
    loan = (
        LendingLoan.objects.filter(tenant=tenant, pk=loan_id)
        .select_related("party", "borrower", "route")
        .first()
    )
    if loan is None:
        raise NotFound()
    return loan


def _not_active(loan: LendingLoan) -> BusinessRuleViolation:
    return BusinessRuleViolation(
        "loan_not_active",
        "This loan is not running, so no reminder is sent for it.",
        details={"status": loan.status},
    )


# ── The three buckets (FR-1) ────────────────────────────────────────────────


def bucket_of(f: dict, on: dt.date) -> str | None:
    """Which reminder a loan's figures call for on `on`, from `loans.figures`."""
    if Decimal(f["arrears"]) > ZERO:
        return TEMPLATE_OVERDUE
    if Decimal(f["due_today"]) > ZERO:
        return TEMPLATE_DUE_TODAY
    if f["next_due_on"] == (on + dt.timedelta(days=1)).isoformat():
        return TEMPLATE_DUE_TOMORROW
    return None


def _reminder(loan: LendingLoan, on: dt.date) -> dict | None:
    """The candidate for `loan` on `on`, or None when nothing is due (FR-7: a loan
    that is not running never has one)."""
    from apps.dues.models import DuesDue
    from apps.lending.services.loans import figures

    if loan.status != LoanStatus.ACTIVE:
        return None
    f = figures(loan, on)
    template = bucket_of(f, on)
    if template is None:
        return None
    if template == TEMPLATE_OVERDUE:
        amount = Decimal(f["arrears"]) + Decimal(f["due_today"])
        since = on - dt.timedelta(days=f["days_past_due"])
        date, label = since, f"Overdue since {_day(since)} · {loan.number}"
    elif template == TEMPLATE_DUE_TODAY:
        amount, date = Decimal(f["due_today"]), on
        label = f"Due today · {loan.number}"
    else:
        amount, date = Decimal(f["next_due_amount"]), on + dt.timedelta(days=1)
        label = f"Due tomorrow · {loan.number}"
    seq = (
        DuesDue.objects.filter(schedule_id=loan.schedule_id, due_on=date)
        .exclude(status__in=["cancelled", "skipped"])
        .order_by("seq")
        .values_list("seq", flat=True)
        .first()
    )
    if template == TEMPLATE_DUE_TOMORROW and seq is not None:
        label = f"Instalment {seq} of {loan.number}"
    return {
        "party_id": loan.party_id,
        "source_type": SOURCE_LOAN,
        "source_id": loan.id,
        "due_on": on,
        "amount": amount,
        "subject_label": label[:120],
        "template_key": template,
        "recipient_party_id": None,
        "params": {
            "business": _business(loan.tenant),
            "loan_number": loan.number,
            "seq": str(seq or ""),
            "amount": _rs(amount),
            "date": _day(date),
        },
    }


def loan_candidates(tenant: Any, on: dt.date) -> list[dict]:
    """Every running loan with an instalment due tomorrow or today, or late."""
    out = []
    for loan in _loans(tenant).order_by("number"):
        found = _reminder(loan, on)
        if found is not None:
            out.append(found)
    return out


def loan_lookup(tenant: Any, loan_id: Any, on: dt.date) -> dict | None:
    loan = _loans(tenant).filter(pk=loan_id).first()
    return _reminder(loan, on) if loan is not None else None


def message_candidates(tenant: Any, on: dt.date) -> list[dict]:
    """A receipt is prepared on demand after a collection; nothing lists it."""
    return []


def message_lookup(tenant: Any, source_id: Any, on: dt.date) -> dict | None:
    return None


# ── The receipt ─────────────────────────────────────────────────────────────


def _collection(loan: LendingLoan, collection_id: Any) -> LendingCollection:
    rows = loan.collections.filter(voided_at__isnull=True)
    if collection_id:
        row = rows.filter(pk=collection_id).first()
    else:
        row = rows.order_by("-collected_on", "-created_at").first()
    if row is None:
        raise ValidationFailed({"collection": ["No collection to send a receipt for."]})
    return row


def _receipt(loan: LendingLoan, collection_id: Any) -> tuple[dict, dict]:
    from apps.lending.services.collections import remaining
    from apps.payments.models import Payment

    row = _collection(loan, collection_id)
    payment = Payment.objects.filter(pk=row.payment_id).first()
    number = payment.number if payment is not None else ""
    left = remaining(loan)
    words = LEFT.get(_locale(loan.tenant), LEFT["en"])
    params = {
        "business": _business(loan.tenant),
        "loan_number": loan.number,
        "amount": _rs(row.amount),
        "date": _day(row.collected_on),
        "receipt_number": number,
        "left_line": words["some"].format(left=_rs(left)) if left > ZERO else words["none"],
    }
    source = {
        "source_type": SOURCE_MESSAGE,
        "source_id": row.payment_id,
        "subject_label": f"Receipt {number} · {loan.number}",
        "amount": None,
        "due_on": row.collected_on,
    }
    return params, source


# ── Preparing and recording ─────────────────────────────────────────────────


def _prepare(loan: LendingLoan, kind: str, collection_id: Any) -> tuple[str, dict, dict]:
    """(template, params, source) for `kind` in reminder | receipt."""
    if kind == KIND_REMINDER:
        if loan.status != LoanStatus.ACTIVE:
            raise _not_active(loan)
        found = _reminder(loan, _today(loan.tenant))
        if found is None:
            raise BusinessRuleViolation(
                "lending_nothing_due",
                "Nothing is due on this loan today or tomorrow.",
                details={"loan_id": str(loan.id)},
            )
        source = {
            "source_type": SOURCE_LOAN,
            "source_id": loan.id,
            "subject_label": found["subject_label"],
            "amount": found["amount"],
            "due_on": found["due_on"],
        }
        return found["template_key"], found["params"], source
    if kind == KIND_RECEIPT:
        params, source = _receipt(loan, collection_id)
        return TEMPLATE_RECEIPT, params, source
    raise ValidationFailed({"kind": ["Choose reminder or receipt."]})


def _compose(loan: LendingLoan, template: str, params: dict) -> Any:
    from apps.ledger.services.messaging import compose_source_reminder

    return compose_source_reminder(
        tenant=loan.tenant,
        template_key=template,
        params={**params, "recipient_name": loan.party.name},
        mobile=loan.party.mobile,
    )


def _last_today(loan: LendingLoan, source_id: Any) -> dict | None:
    from apps.ledger.models import Reminder
    from apps.ledger.services.reminder_seam import _day_bounds

    start, end = _day_bounds(loan.tenant, _today(loan.tenant))
    row = (
        Reminder.objects.for_tenant(loan.tenant)
        .filter(module=MODULE, source_id=source_id, sent_at__gte=start, sent_at__lt=end)
        .order_by("-sent_at")
        .first()
    )
    return {"at": _local_iso(loan.tenant, row.sent_at), "channel": row.channel} if row else None


#: A sheet that says "go" must still be right when the tap lands. The link is
#: a real anchor (in-app browsers and installed web apps block `window.open`),
#: so WhatsApp opens on the tap itself; the record follows. So the preview asks
#: the policy about now AND about a minute from now, and tells the sheet when
#: its answer changes, so the sheet turns itself off at 18:59 and on at 08:00.
TAP_MARGIN = dt.timedelta(seconds=60)


def _refused_at(loan: LendingLoan, source_id: Any, at: dt.datetime) -> Any:
    from apps.ledger.services.reminder_seam import check_reminder_allowed

    try:
        check_reminder_allowed(
            tenant=loan.tenant, module=MODULE, party_id=loan.party_id, source_id=source_id, at=at
        )
    except BusinessRuleViolation as refused:
        return refused
    return None


def _guard(loan: LendingLoan, source_id: Any) -> dict:
    """`allowed`, and when not, the policy's own reason and next time (§8: a
    disabled button always says why and when); `changes_in_seconds` is when
    that answer next changes, so the open sheet can ask again then."""
    from django.utils import timezone

    from apps.common.dates import tenant_timezone
    from apps.ledger.services.reminder_seam import effective_policy, now

    moment = now()
    refused = _refused_at(loan, source_id, moment) or _refused_at(
        loan, source_id, moment + TAP_MARGIN
    )
    if refused is None:
        window = effective_policy(loan.tenant, MODULE).get("window")
        changes = None
        if window is not None:
            zone = tenant_timezone(loan.tenant)
            local = timezone.localtime(moment, zone)
            closes = dt.datetime.combine(local.date(), window[1], tzinfo=zone) - TAP_MARGIN
            changes = max(0, math.ceil((closes - moment).total_seconds()))
        return {"allowed": True, "refusal": None, "changes_in_seconds": changes}
    upcoming = refused.details.get("next_allowed_at")
    changes = (
        max(0, math.ceil((dt.datetime.fromisoformat(upcoming) - moment).total_seconds()))
        if upcoming
        else None
    )
    return {
        "allowed": False,
        "refusal": {
            "code": refused.code,
            "message": refused.message,
            "next_allowed_at": upcoming,
            "window_start": refused.details.get("window_start"),
            "window_end": refused.details.get("window_end"),
        },
        "changes_in_seconds": changes,
    }


def _recipient_json(loan: LendingLoan) -> dict:
    return {
        "id": str(loan.party_id),
        "name": loan.party.name,
        "has_mobile": bool(loan.party.mobile),
    }


def preview(*, ctx: Any, loan_id: Any, kind: str, collection_id: Any = None) -> dict:
    """The text and the links, and whether it may go now; records nothing."""
    loan = _loan(ctx.tenant, loan_id)
    template, params, source = _prepare(loan, kind, collection_id)
    composed = _compose(loan, template, params)
    return {
        "kind": kind,
        "bucket": BUCKET.get(template),
        "template": template,
        "text": composed.text,
        "sms_text": composed.sms_text,
        "wa_url": composed.wa_url,
        "sms_url": composed.sms_url,
        "tel_url": composed.tel_url,
        "recipient": _recipient_json(loan),
        "last_today": _last_today(loan, source["source_id"]),
        **_guard(loan, source["source_id"]),
    }


@transaction.atomic
def send(*, ctx: Any, loan_id: Any, kind: str, data: Any) -> dict:
    """The tap that opens WhatsApp, the SMS app or the dialler: recorded like a
    reminder, and refused by the policy the same way a preview warned (EC-1:
    the sheet opened at 18:58 and tapped at 19:01 is refused here)."""
    from apps.ledger.services.reminder_seam import record_source_reminders
    from apps.parties.models import Party

    data = data or {}
    channel = _channel(data.get("channel", "whatsapp_manual"))
    loan = _loan(ctx.tenant, loan_id)
    # Two taps on one borrower queue behind each other, so the cap sees the first.
    Party.objects.for_tenant(ctx.tenant).select_for_update().filter(pk=loan.party_id).first()
    template, params, source = _prepare(loan, kind, data.get("collection"))
    if not loan.party.mobile:
        raise BusinessRuleViolation(
            "reminder_not_sendable",
            f"No mobile number for {loan.party.name}.",
            details={"party_id": str(loan.party_id)},
        )
    composed = _compose(loan, template, params)
    rows = record_source_reminders(
        ctx=ctx,
        party_id=loan.party_id,
        recipient_party_id=None,
        module=MODULE,
        kind="due" if source["amount"] is not None else "notice",
        channel=channel,
        sources=[source],
        text=composed.sms_text if channel == "sms_manual" else composed.text,
    )
    write_audit(
        ctx=ctx,
        action="lending.reminder.prepared",
        entity_type="lending_loan",
        entity_id=loan.id,
        metadata={"recipient": "borrower", "channel": channel, "template_key": template},
    )
    link = {
        "call": composed.tel_url,
        "sms_manual": composed.sms_url,
    }.get(channel, composed.wa_url)
    return {"reminder_id": str(rows[0].id), "channel": channel, "deep_link": link}


# ── Lists ───────────────────────────────────────────────────────────────────


def due_list(tenant: Any) -> list[dict]:
    """`GET /lending/reminders` — today's reminders, tomorrow's first instalments
    included, with who has been told today."""
    from apps.ledger.models import Reminder
    from apps.ledger.services.reminder_seam import _day_bounds

    on = _today(tenant)
    candidates = loan_candidates(tenant, on)
    start, end = _day_bounds(tenant, on)
    told = {
        r["source_id"]: r
        for r in Reminder.objects.for_tenant(tenant)
        .filter(
            module=MODULE,
            source_type=SOURCE_LOAN,
            source_id__in=[c["source_id"] for c in candidates],
            sent_at__gte=start,
            sent_at__lt=end,
        )
        .order_by("sent_at")
        .values("source_id", "sent_at", "channel")
    }
    loans = {
        loan.id: loan
        for loan in _loans(tenant).filter(pk__in=list(told) + [c["source_id"] for c in candidates])
    }
    rows = []
    for c in candidates:
        loan = loans[c["source_id"]]
        sent = told.get(loan.id)
        rows.append(
            {
                "loan_id": str(loan.id),
                "number": loan.number,
                "name": loan.party.name,
                "area": loan.borrower.area,
                "route": loan.route.name if loan.route_id else None,
                "bucket": BUCKET[c["template_key"]],
                "amount": f"{c['amount']:.2f}",
                "date": c["params"]["date"],
                "has_mobile": bool(loan.party.mobile),
                "sent_today": (
                    {"at": _local_iso(tenant, sent["sent_at"]), "channel": sent["channel"]}
                    if sent
                    else None
                ),
            }
        )
    order = {"overdue": 0, "due_today": 1, "due_tomorrow": 2}
    rows.sort(key=lambda r: (order[r["bucket"]], r["number"]))
    return rows


def loan_messages(loan: LendingLoan) -> list[dict]:
    """The loan's Activity: every reminder and receipt recorded for it."""
    from apps.ledger.models import Reminder

    payments = list(loan.collections.values_list("payment_id", flat=True))
    rows = (
        Reminder.objects.for_tenant(loan.tenant)
        .filter(module=MODULE, source_id__in=[loan.id, *payments])
        .order_by("-sent_at")[:50]
    )
    return [
        {
            "id": str(r.id),
            "kind": KIND_RECEIPT if r.source_type == SOURCE_MESSAGE else KIND_REMINDER,
            "subject": r.subject_label,
            "channel": r.channel,
            "at": _local_iso(loan.tenant, r.sent_at),
        }
        for r in rows
    ]


def register() -> None:
    """From `LendingConfig.ready()`: the policy, the two sources and the texts."""
    from apps.ledger.services.reminder_seam import (
        register_reminder_policy,
        register_reminder_source,
    )
    from apps.notifications.services.templates import register_default_templates

    register_reminder_policy(MODULE, POLICY)  # type: ignore[arg-type]
    register_reminder_source(
        SOURCE_LOAN, module=MODULE, candidates=loan_candidates, lookup=loan_lookup
    )
    register_reminder_source(
        SOURCE_MESSAGE, module=MODULE, candidates=message_candidates, lookup=message_lookup
    )
    register_default_templates(TEMPLATES)
