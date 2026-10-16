"""A reading room's WhatsApp messages, handled like reminders (W06; owner, 4 Oct 2026).

The owner's words: every WhatsApp message should work the way Reminders do —
prepared, listed when due, sent by hand from the library's own phone
(DEC-012: the product sends nothing) and recorded, so the desk can see who was
told and when. So these ride the reminder seam the loans already use
(`apps.ledger.services.reminder_seam`):

* **Fee due** — the plan ends in 7, 3 or 1 day(s): source `library_fee`, kind
  `due` with the fee as the amount, listed on the day it falls due.
* **Fee overdue** — the plan ended 1, 3 or 7 days ago and was not renewed.
* **Fee unpaid** — a fee is charged and not paid (any day, from the student page).
* **Welcome** and **receipt** — prepared on demand from the student page and
  recorded as notices under `library_message`, about the admission and about
  the payment respectively, so the daily cap of one message per source never stops a
  receipt because a reminder went out the same morning.

QA F4 / B51 (12 Oct 2026) added the messages a desk sends to ANY student, paid or
not: **plan ending** ("your plan ends on 31/10"), **renewal thanks**, and a
**custom** message in the desk's own words with `{name}`, `{amount}`, `{due_date}`
and `{upi_link}` filled in per student — one at a time from the student page, or
prepared for a group (`bulk_prepare`) and opened one by one. Preparing records
nothing; each tap re-reads the student, so a fee paid between the two is never
asked for again. Every send is in the student's message log (`member_log`).

Texts are `Rs`, never `₹` (NTF-02), signed with the library's own name, never
the product's.
"""

from __future__ import annotations

import datetime as dt
import re
import uuid
from decimal import Decimal
from typing import Any

from django.db import transaction

from apps.common.dates import tenant_today
from apps.common.exceptions import BusinessRuleViolation, ValidationFailed
from apps.library.constants import MembershipStatus
from apps.library.models import LibraryMembership
from apps.library.services.reminders import (
    _channel,
    _compose,
    _library,
    _lock_party,
    _membership,
    _recipient_json,
    _sent,
    first_name,
    guardians,
    reminder_json,
)

SOURCE_FEE = "library_fee"
SOURCE_MESSAGE = "library_message"
TEMPLATE_FEE_DUE = "library_fee_due"
TEMPLATE_FEE_OVERDUE = "library_fee_overdue"
TEMPLATE_FEE_UNPAID = "library_fee_unpaid"
TEMPLATE_WELCOME = "library_welcome"
TEMPLATE_RECEIPT = "library_receipt"
TEMPLATE_PLAN_END = "library_plan_end"
TEMPLATE_THANKS = "library_renewal_thanks"
TEMPLATE_CUSTOM = "library_custom"
#: What the desk can send one student (`/members/<id>/message/<kind>`).
KINDS = ("fee", "plan_end", "thanks", "welcome", "receipt", "custom")
#: What can go to a group, and to whom (`bulk_prepare`).
BULK_KINDS = ("fee", "plan_end", "custom")
AUDIENCES = ("unpaid", "ending", "shift", "all")
#: A custom message: long enough for a notice, short enough for one WhatsApp screen.
CUSTOM_MAX = 700
#: A group is prepared in one request; past this the desk narrows the filter.
BULK_MAX = 300
#: "Plan ending" as a group: plans that end within this many days (or have ended).
ENDING_WITHIN = 7
#: The per-student words a custom message may carry. Single pass: a value can
#: never introduce another token, and anything else in braces stays as typed.
PERSONAL = re.compile(r"\{(name|amount|due_date|upi_link)\}")
#: Days BEFORE the plan ends that a "fee due" reminder is listed (T-7, T-3, T-1).
DUE_BEFORE = (7, 3, 1)
#: Days AFTER it ended that an "overdue" reminder is listed.
OVERDUE_AFTER = (1, 3, 7)

TEMPLATES: dict[str, dict[str, dict[str, str]]] = {
    TEMPLATE_FEE_DUE: {
        "whatsapp": {
            "en": (
                "Hello {{recipient_name}}, {{whose}} {{plan}} plan at {{library}} "
                "ends on {{ends_on}}. The fee is Rs {{amount}}. Please renew to keep the seat."
                "{{pay_line}}\n— {{library}}"
            ),
            "hi": (
                "नमस्ते {{recipient_name}} जी, {{library}} में {{whose}} {{plan}} प्लान "
                "{{ends_on}} को ख़त्म हो रहा है। फ़ीस Rs {{amount}} है। सीट बनाए रखने के लिए "
                "कृपया नवीनीकरण करें।{{pay_line}}\n— {{library}}"
            ),
        },
        "sms": {
            "en": "{{library}}: {{member_first}}'s plan ends {{ends_on}}. Fee Rs {{amount}}.",
            "hi": "{{library}}: {{member_first}} का प्लान {{ends_on}} को ख़त्म। फ़ीस Rs {{amount}}।",
        },
    },
    TEMPLATE_FEE_OVERDUE: {
        "whatsapp": {
            "en": (
                "Hello {{recipient_name}}, {{whose}} {{plan}} plan at {{library}} "
                "ended on {{ends_on}}. The fee of Rs {{amount}} is due. Please pay to keep "
                "the seat.{{pay_line}}\n— {{library}}"
            ),
            "hi": (
                "नमस्ते {{recipient_name}} जी, {{library}} में {{whose}} {{plan}} प्लान "
                "{{ends_on}} को ख़त्म हो गया। Rs {{amount}} फ़ीस बाकी है। सीट बनाए रखने के लिए "
                "कृपया भुगतान करें।{{pay_line}}\n— {{library}}"
            ),
        },
        "sms": {
            "en": "{{library}}: {{member_first}}'s plan ended {{ends_on}}. Fee due Rs {{amount}}.",
            "hi": "{{library}}: {{member_first}} का प्लान {{ends_on}} को ख़त्म। बाकी Rs {{amount}}।",
        },
    },
    TEMPLATE_FEE_UNPAID: {
        "whatsapp": {
            "en": (
                "Hello {{recipient_name}}, Rs {{amount}} is pending{{for_whom}} at "
                "{{library}}. Please pay at the desk or by UPI.{{pay_line}}\n— {{library}}"
            ),
            "hi": (
                "नमस्ते {{recipient_name}} जी, {{library}} में {{whose_fee}} Rs {{amount}} "
                "फ़ीस बाकी है। कृपया काउंटर पर या UPI से भुगतान करें।{{pay_line}}\n— {{library}}"
            ),
        },
    },
    TEMPLATE_WELCOME: {
        "whatsapp": {
            "en": (
                "Welcome to {{library}}, {{member_first}}! Your student number is "
                "{{member_number}}. {{place_line}}Plan: {{plan}}, till {{ends_on}}.\n— {{library}}"
            ),
            "hi": (
                "{{library}} में आपका स्वागत है, {{member_first}}! आपका विद्यार्थी नंबर "
                "{{member_number}} है। {{place_line}}प्लान: {{plan}}, {{ends_on}} तक।\n— {{library}}"
            ),
        },
    },
    TEMPLATE_RECEIPT: {
        "whatsapp": {
            "en": (
                "Received Rs {{amount}} from {{member_first}} on {{paid_on}} (receipt "
                "{{receipt_number}}). Plan till {{ends_on}}. Thank you.\n— {{library}}"
            ),
            "hi": (
                "{{member_first}} से {{paid_on}} को Rs {{amount}} मिले (रसीद {{receipt_number}})। "
                "प्लान {{ends_on}} तक। धन्यवाद।\n— {{library}}"
            ),
        },
    },
    TEMPLATE_PLAN_END: {
        "whatsapp": {
            "en": (
                "Hello {{recipient_name}}, {{whose}} {{plan}} plan at {{library}} ends on "
                "{{ends_on}}. Please renew at the desk to keep the seat.\n— {{library}}"
            ),
            "hi": (
                "नमस्ते {{recipient_name}} जी, {{library}} में {{whose}} {{plan}} प्लान "
                "{{ends_on}} को ख़त्म होगा। सीट बनाए रखने के लिए कृपया काउंटर पर नवीनीकरण "
                "करें।\n— {{library}}"
            ),
        },
    },
    TEMPLATE_THANKS: {
        "whatsapp": {
            "en": (
                "Hello {{recipient_name}}, thank you for renewing. {{member_first}}'s "
                "{{plan}} plan now runs till {{ends_on}}.\n— {{library}}"
            ),
            "hi": (
                "नमस्ते {{recipient_name}} जी, नवीनीकरण के लिए धन्यवाद। {{member_first}} का "
                "{{plan}} प्लान अब {{ends_on}} तक है।\n— {{library}}"
            ),
        },
    },
    # The desk's own words, signed with the library's name (never the product's).
    TEMPLATE_CUSTOM: {
        "whatsapp": {"en": "{{body}}\n— {{library}}", "hi": "{{body}}\n— {{library}}"},
    },
}

#: Who the plan belongs to, as the RECIPIENT reads it. Found by looking: the
#: student messaged about their own plan read "Hello Rahul Sharma, Rahul's
#: Monthly plan"; a guardian reads "Rahul's", the student reads "your".
WHOSE = {
    "en": {"self": "your", "other": "{first}'s"},
    "hi": {"self": "आपका", "other": "{first} का"},
}
WHOSE_FEE = {"hi": {"self": "आपकी", "other": "{first} की"}, "en": {"self": "", "other": ""}}
FOR_WHOM = {"en": {"self": "", "other": " for {first}"}, "hi": {"self": "", "other": ""}}

PLACE = {"en": "Seat {seat}, {shift}. ", "hi": "सीट {seat}, {shift}। "}
SEAT_ONLY = {"en": "Seat {seat}. ", "hi": "सीट {seat}। "}


def _rs(amount: Decimal) -> str:
    return f"{Decimal(amount):,.2f}"


def _day(day: dt.date | None) -> str:
    return day.strftime("%d/%m/%Y") if day else "-"


def _dues(m: LibraryMembership) -> Decimal:
    from apps.library.services.members import dues_amount

    return dues_amount(m)


def _members(tenant: Any) -> Any:
    return (
        LibraryMembership.objects.filter(tenant=tenant)
        .exclude(status=MembershipStatus.CLOSED)
        .select_related("party", "membership_type", "shift", "seat")
    )


def _kind_on(m: LibraryMembership, on: dt.date, dues: Decimal) -> str | None:
    """Which fee message `m` is owed on `on` from the schedule, if any."""
    if m.valid_until is None:
        return None
    if m.valid_until in {on + dt.timedelta(days=d) for d in DUE_BEFORE}:
        return TEMPLATE_FEE_DUE
    if m.valid_until in {on - dt.timedelta(days=d) for d in OVERDUE_AFTER}:
        return TEMPLATE_FEE_OVERDUE
    return None


def _kind_any(m: LibraryMembership, on: dt.date, dues: Decimal) -> str | None:
    """From the student page: whatever the fee says today, schedule or not."""
    if m.valid_until is not None and m.valid_until < on:
        return TEMPLATE_FEE_OVERDUE
    if dues > 0:
        return TEMPLATE_FEE_UNPAID
    if m.valid_until is not None and m.valid_until <= on + dt.timedelta(days=max(DUE_BEFORE)):
        return TEMPLATE_FEE_DUE
    return None


def fee_params(m: LibraryMembership, dues: Decimal) -> dict[str, str]:
    amount = dues if dues > 0 else Decimal(m.membership_type.fee_amount)
    return {
        "library": _library(m.tenant),
        "member_first": first_name(m.party.name),
        "member_number": m.member_number,
        "plan": m.membership_type.name,
        "ends_on": _day(m.valid_until),
        "amount": _rs(amount),
        # Shop P0 — the pay page (UPI QR) for this fee, or "".
        "pay_line": _pay_line(m, amount),
    }


def _pay_line(m: LibraryMembership, amount: Decimal) -> str:
    from apps.notifications.services.whatsapp_text import pay_fragment

    return pay_fragment(tenant=m.tenant, amount=amount, reference=m.member_number)


def _candidate(m: LibraryMembership, on: dt.date, template: str, guardian: Any) -> dict:
    dues = _dues(m)
    params = fee_params(m, dues)
    return {
        "party_id": m.party_id,
        "source_type": SOURCE_FEE,
        "source_id": m.id,
        "due_on": on,
        "amount": Decimal(params["amount"].replace(",", "")),
        "subject_label": f"{m.membership_type.name} fee · {m.member_number}"[:120],
        "template_key": template,
        "recipient_party_id": guardian.id if guardian is not None else None,
        "params": params,
    }


def fee_candidates(tenant: Any, on: dt.date) -> list[dict]:
    """Students whose plan ends in 7, 3 or 1 days, or ended 1, 3 or 7 days ago."""
    days = [on + dt.timedelta(days=d) for d in DUE_BEFORE] + [
        on - dt.timedelta(days=d) for d in OVERDUE_AFTER
    ]
    members = list(_members(tenant).filter(valid_until__in=days).order_by("valid_until", "id"))
    found = guardians(tenant, [m.party_id for m in members])
    out = []
    for m in members:
        template = _kind_on(m, on, Decimal(0))
        if template is not None:
            out.append(_candidate(m, on, template, found.get(m.party_id)))
    return out


def fee_lookup(tenant: Any, membership_id: Any, on: dt.date) -> dict | None:
    m = _members(tenant).filter(pk=membership_id).first()
    if m is None:
        return None
    template = _kind_any(m, on, _dues(m))
    if template is None:
        return None
    return _candidate(m, on, template, guardians(tenant, [m.party_id]).get(m.party_id))


def message_lookup(tenant: Any, source_id: Any, on: dt.date) -> dict | None:
    """Welcome and receipt are prepared on demand; nothing lists them."""
    return None


def message_candidates(tenant: Any, on: dt.date) -> list[dict]:
    return []


# ── Preparing and recording ─────────────────────────────────────────────────


def _addressed(m: LibraryMembership, params: dict, recipient: Any) -> dict:
    """`whose`, `whose_fee` and `for_whom`, decided by who will read the text."""
    from apps.library.services.reminders import _locale

    locale = _locale(m.tenant)
    who = "self" if recipient.pk == m.party_id else "other"
    first = first_name(m.party.name)

    def pick(table: dict) -> str:
        return table.get(locale, table["en"])[who].format(first=first)

    return {
        **params,
        "whose": pick(WHOSE),
        "whose_fee": pick(WHOSE_FEE),
        "for_whom": pick(FOR_WHOM),
    }


def _recipient(m: LibraryMembership) -> tuple[Any, Any]:
    guardian = guardians(m.tenant, [m.party_id]).get(m.party_id)
    return (guardian or m.party), guardian


def _welcome_params(m: LibraryMembership) -> dict[str, str]:
    from apps.library.services.reminders import _locale

    locale = _locale(m.tenant)
    if m.seat_id and m.shift_id:
        place = PLACE.get(locale, PLACE["en"]).format(seat=m.seat.label, shift=m.shift.name)
    elif m.seat_id:
        place = SEAT_ONLY.get(locale, SEAT_ONLY["en"]).format(seat=m.seat.label)
    else:
        place = ""
    return {**fee_params(m, Decimal(0)), "place_line": place}


def _latest_payment(m: LibraryMembership) -> Any:
    from apps.library.services.charges import CHARGE_KIND
    from apps.payments.models import Allocation

    alloc = (
        Allocation.objects.filter(
            tenant=m.tenant,
            document_type=CHARGE_KIND,
            document_id__in=m.charges.values("id"),
            payment__status="recorded",
        )
        .select_related("payment")
        .order_by("-payment__payment_date", "-payment__created_at")
        .first()
    )
    return alloc.payment if alloc is not None else None


def _message_source(m: LibraryMembership, key: str, label: str, today: dt.date) -> dict:
    """A notice about `m`. `key` decides what the daily cap of one counts as "the same
    message": a plan's end and its thanks are one per plan date, while a custom
    message passes `key=""` and is never the same as another."""
    source_id = uuid.uuid5(m.id, key) if key else uuid.uuid4()
    return {
        "source_type": SOURCE_MESSAGE,
        "source_id": source_id,
        "subject_label": f"{label} · {m.member_number}",
        "amount": None,
        "due_on": today,
    }


def custom_body(m: LibraryMembership, text: str) -> str:
    """The desk's text with this student's {name}, {amount}, {due_date}, {upi_link}."""
    from apps.notifications.services.whatsapp_text import upi_link

    words = (text or "").strip()
    if not words:
        raise ValidationFailed({"text": ["Write the message."]})
    if len(words) > CUSTOM_MAX:
        raise ValidationFailed({"text": [f"Keep it under {CUSTOM_MAX} letters."]})
    dues = _dues(m)
    values = {
        "name": first_name(m.party.name),
        "amount": f"Rs {_rs(dues)}",
        "due_date": _day(m.valid_until),
        "upi_link": (upi_link(tenant=m.tenant, amount=dues, reference=m.member_number) or "")
        if dues > 0
        else "",
    }
    return PERSONAL.sub(lambda match: values[match.group(1)], words)


def _prepare(
    m: LibraryMembership, kind: str, today: dt.date, text: str = ""
) -> tuple[str, dict, dict]:
    """(template, params, source) for one of `KINDS`."""
    if kind == "plan_end":
        if m.valid_until is None:
            raise ValidationFailed({"kind": ["This student's plan has no end date."]})
        source = _message_source(m, f"plan_end:{m.valid_until}", "Plan ends", today)
        return TEMPLATE_PLAN_END, fee_params(m, Decimal(0)), source
    if kind == "thanks":
        if m.valid_until is None:
            raise ValidationFailed({"kind": ["This student's plan has no end date."]})
        source = _message_source(m, f"thanks:{m.valid_until}", "Thanks", today)
        return TEMPLATE_THANKS, fee_params(m, Decimal(0)), source
    if kind == "custom":
        params = {"library": _library(m.tenant), "body": custom_body(m, text)}
        return TEMPLATE_CUSTOM, params, _message_source(m, "", "Message", today)
    if kind == "fee":
        dues = _dues(m)
        template = _kind_any(m, today, dues)
        if template is None:
            raise BusinessRuleViolation(
                "library_nothing_overdue",
                "This student's fee is paid and the plan is not ending this week.",
                details={"membership_id": str(m.id)},
            )
        params = fee_params(m, dues)
        source = {
            "source_type": SOURCE_FEE,
            "source_id": m.id,
            "subject_label": f"{m.membership_type.name} fee · {m.member_number}",
            "amount": Decimal(params["amount"].replace(",", "")),
            "due_on": today,
        }
        return template, params, source
    if kind == "welcome":
        # About the admission itself (its enrol period), so the daily cap of one
        # message per source never stops a fee reminder sent the same day.
        admission = m.periods.order_by("created_at").first()
        source = {
            "source_type": SOURCE_MESSAGE,
            "source_id": admission.id if admission is not None else m.id,
            "subject_label": f"Welcome · {m.member_number}",
            "amount": None,
            "due_on": today,
        }
        return TEMPLATE_WELCOME, _welcome_params(m), source
    if kind == "receipt":
        payment = _latest_payment(m)
        if payment is None:
            raise ValidationFailed({"kind": ["No fee has been paid yet."]})
        params = {
            **fee_params(m, Decimal(0)),
            "amount": _rs(payment.amount),
            "paid_on": _day(payment.payment_date),
            "receipt_number": payment.number,
        }
        source = {
            "source_type": SOURCE_MESSAGE,
            "source_id": payment.id,
            "subject_label": f"Receipt {payment.number}",
            "amount": None,
            "due_on": today,
        }
        return TEMPLATE_RECEIPT, params, source
    raise ValidationFailed({"kind": ["Choose a message."]})


def preview(*, ctx: Any, membership_id: Any, kind: str, text: str = "") -> dict:
    """The text and the WhatsApp link; records nothing (the reminder seam's rule)."""
    m = _membership(ctx.tenant, membership_id)
    m = LibraryMembership.objects.select_related("party", "membership_type", "shift", "seat").get(
        pk=m.pk
    )
    template, params, _source = _prepare(m, kind, tenant_today(ctx.tenant), text)
    recipient, _guardian = _recipient(m)
    composed = _compose(ctx.tenant, template, _addressed(m, params, recipient), recipient)
    return {
        "kind": kind,
        "template": template,
        "text": composed.text,
        "wa_url": composed.wa_url,
        "recipient": _recipient_json(m.party, recipient),
    }


@transaction.atomic
def send(*, ctx: Any, membership_id: Any, kind: str, data: Any) -> dict:
    """The tap that opens WhatsApp: records the message like a reminder.

    `final_text` is the message as the desk sent it after any edit (WP-04);
    without it the prepared words are recorded, as before.
    """
    from apps.ledger.services.reminder_seam import record_source_reminders
    from apps.notifications.services.whatsapp_text import with_final_text

    data = data or {}
    channel = _channel(data.get("channel", "whatsapp_manual"))
    m = _membership(ctx.tenant, membership_id)
    _lock_party(ctx.tenant, m.party_id)
    m = LibraryMembership.objects.select_related("party", "membership_type", "shift", "seat").get(
        pk=m.pk
    )
    template, params, source = _prepare(
        m, kind, tenant_today(ctx.tenant), str(data.get("text") or "")
    )
    recipient, guardian = _recipient(m)
    if not recipient.mobile:
        raise ValidationFailed({"recipient": [f"No mobile for {recipient.name}."]})
    composed = _compose(ctx.tenant, template, _addressed(m, params, recipient), recipient)
    if channel != "call":
        # WP-04 MSG-10 — the desk's edited words, when it changed them: the
        # link carries them and the log keeps them; the kind keeps its meaning.
        composed = with_final_text(composed, data.get("final_text"))
    sent = _sent(channel, composed)
    rows = record_source_reminders(
        ctx=ctx,
        party_id=m.party_id,
        recipient_party_id=guardian.id if guardian is not None else None,
        module="library",
        kind="due" if source["amount"] is not None else "notice",
        channel=channel,
        sources=[source],
        text=sent.get("text") or composed.text,
        metadata={"message_kind": kind},
    )
    return {
        "reminders": [reminder_json(row) for row in rows],
        **sent,
        "recipient": _recipient_json(m.party, recipient),
    }


# ── A group, and the log (QA F4 / B51) ──────────────────────────────────────


def _audience(tenant: Any, audience: str, shift_id: Any) -> list[LibraryMembership]:
    from apps.library.services.fields import uuid_or_none

    if audience not in AUDIENCES:
        raise ValidationFailed({"audience": ["Choose who gets it."]})
    rows = _members(tenant).order_by("party__name", "id")
    if audience == "shift":
        shift = uuid_or_none(shift_id)
        if shift is None:
            raise ValidationFailed({"shift_id": ["Choose a shift."]})
        rows = rows.filter(shift_id=shift)
    elif audience == "ending":
        rows = rows.filter(valid_until__lte=tenant_today(tenant) + dt.timedelta(days=ENDING_WITHIN))
    members = list(rows[: BULK_MAX + 1] if audience != "unpaid" else rows)
    if audience == "unpaid":
        members = [m for m in members if _dues(m) > 0]
    return members


def bulk_prepare(
    *, ctx: Any, kind: str, audience: str, shift_id: Any = None, text: str = ""
) -> list:
    """One prepared message per student in `audience`; records nothing.

    Each row carries its own text and WhatsApp link, built exactly as the single
    send builds it, and the desk opens them one by one (DEC-012: the product sends
    nothing). A student the message does not fit today — a fee reminder for a fee
    since paid, a plan with no end — is left out rather than sent something untrue.
    """
    if kind not in BULK_KINDS:
        raise ValidationFailed({"kind": ["Choose fee, plan ending or your own message."]})
    members = _audience(ctx.tenant, audience, shift_id)
    if kind == "custom" and not (text or "").strip():
        raise ValidationFailed({"text": ["Write the message."]})
    if len(members) > BULK_MAX:
        raise ValidationFailed(
            {"audience": [f"That is more than {BULK_MAX} students. Choose a smaller group."]}
        )
    today = tenant_today(ctx.tenant)
    found = guardians(ctx.tenant, [m.party_id for m in members])
    out = []
    for m in members:
        try:
            template, params, _source = _prepare(m, kind, today, text)
        except (BusinessRuleViolation, ValidationFailed):
            continue
        recipient = found.get(m.party_id) or m.party
        composed = _compose(ctx.tenant, template, _addressed(m, params, recipient), recipient)
        out.append(
            {
                "membership_id": str(m.id),
                "name": m.party.name,
                "member_number": m.member_number,
                "kind": kind,
                "text": composed.text,
                "wa_url": composed.wa_url,
                "recipient": _recipient_json(m.party, recipient),
            }
        )
    return out


def _logged_kind(source_type: str | None, metadata: dict) -> str:
    """Rows from before F4 carry no `message_kind`; their source still says enough."""
    kind = metadata.get("message_kind")
    if kind:
        return str(kind)
    return "fee" if source_type == SOURCE_FEE else "message"


def member_log(*, tenant: Any, membership_id: Any, limit: int = 50) -> list[dict]:
    """Every message recorded for this student (or their guardian), newest first."""
    from apps.ledger.models import Reminder
    from apps.platform_app.models import AuditLog

    m = _membership(tenant, membership_id)
    rows = list(
        Reminder.objects.filter(tenant=tenant, module="library", party_id=m.party_id)
        .select_related("recipient_party")
        .order_by("-sent_at", "-created_at")[:limit]
    )
    audits = {
        a.entity_id: a.metadata or {}
        for a in AuditLog.objects.filter(
            tenant=tenant, entity_type="ledger_reminder", entity_id__in=[r.id for r in rows]
        )
    }
    out = []
    for r in rows:
        meta = audits.get(r.id, {})
        out.append(
            {
                "id": str(r.id),
                "kind": _logged_kind(r.source_type, meta),
                "subject": r.subject_label,
                "channel": r.channel,
                "sent_at": r.sent_at.isoformat() if r.sent_at else None,
                "to": r.recipient_party.name if r.recipient_party_id else m.party.name,
                "text": str(meta.get("text") or ""),
            }
        )
    return out


def due_today(tenant: Any) -> list[dict]:
    """`GET /library/fee-reminders` — today's scheduled fee messages, for the desk."""
    from apps.ledger.models import Reminder

    on = tenant_today(tenant)
    candidates = fee_candidates(tenant, on)
    # The business's day, not the database's: `sent_at__date` is the UTC date,
    # so from midnight to 05:30 in India a message sent minutes ago read as
    # "not sent today" and was offered again (found by the suite at 00:42 IST).
    from apps.ledger.services.reminder_seam import _day_bounds

    start, end = _day_bounds(tenant, on)
    told = set(
        Reminder.objects.filter(
            tenant=tenant,
            module="library",
            source_type=SOURCE_FEE,
            source_id__in=[c["source_id"] for c in candidates],
            sent_at__gte=start,
            sent_at__lt=end,
        ).values_list("source_id", flat=True)
    )
    members = {
        m.id: m for m in _members(tenant).filter(pk__in=[c["source_id"] for c in candidates])
    }
    rows = []
    for c in candidates:
        m = members[c["source_id"]]
        rows.append(
            {
                "membership_id": str(m.id),
                "name": m.party.name,
                "member_number": m.member_number,
                "seat": m.seat.label if m.seat_id else None,
                "kind": "due" if c["template_key"] == TEMPLATE_FEE_DUE else "overdue",
                "ends_on": m.valid_until.isoformat() if m.valid_until else None,
                "amount": f"{c['amount']:.2f}",
                "has_mobile": bool(m.party.mobile),
                "sent_today": m.id in told,
            }
        )
    return rows


def register() -> None:
    """From `LibraryConfig.ready()`: the two sources and the templates."""
    from apps.ledger.services.reminder_seam import register_reminder_source
    from apps.notifications.services.templates import register_default_templates

    register_reminder_source(
        SOURCE_FEE, module="library", candidates=fee_candidates, lookup=fee_lookup
    )
    register_reminder_source(
        SOURCE_MESSAGE, module="library", candidates=message_candidates, lookup=message_lookup
    )
    register_default_templates(TEMPLATES)
