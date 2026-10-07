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

Texts are `Rs`, never `₹` (NTF-02), signed with the library's own name, never
the product's.
"""

from __future__ import annotations

import datetime as dt
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


def _prepare(m: LibraryMembership, kind: str, today: dt.date) -> tuple[str, dict, dict]:
    """(template, params, source) for `kind` in fee | welcome | receipt."""
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
    raise ValidationFailed({"kind": ["Choose fee, welcome or receipt."]})


def preview(*, ctx: Any, membership_id: Any, kind: str) -> dict:
    """The text and the WhatsApp link; records nothing (the reminder seam's rule)."""
    m = _membership(ctx.tenant, membership_id)
    m = LibraryMembership.objects.select_related("party", "membership_type", "shift", "seat").get(
        pk=m.pk
    )
    template, params, _source = _prepare(m, kind, tenant_today(ctx.tenant))
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
    """The tap that opens WhatsApp: records the message like a reminder."""
    from apps.ledger.services.reminder_seam import record_source_reminders

    data = data or {}
    channel = _channel(data.get("channel", "whatsapp_manual"))
    m = _membership(ctx.tenant, membership_id)
    _lock_party(ctx.tenant, m.party_id)
    m = LibraryMembership.objects.select_related("party", "membership_type", "shift", "seat").get(
        pk=m.pk
    )
    template, params, source = _prepare(m, kind, tenant_today(ctx.tenant))
    recipient, guardian = _recipient(m)
    if not recipient.mobile:
        raise ValidationFailed({"recipient": [f"No mobile for {recipient.name}."]})
    composed = _compose(ctx.tenant, template, _addressed(m, params, recipient), recipient)
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
    )
    return {
        "reminders": [reminder_json(row) for row in rows],
        **sent,
        "recipient": _recipient_json(m.party, recipient),
    }


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
