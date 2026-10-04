"""Overdue reminders, hold-ready notices and the issue slip (LIB-09; task B12).

The library chases books, not money: both sources are kind `notice` and every
candidate carries `amount = None` (C3) — the fine so far is a line of the text,
never a figure the reminders pipeline records as owed. The product sends
nothing (DEC-012): "recorded" means the librarian was handed the text and
tapped the button that opens WhatsApp, exactly as LED-06 records a manual
reminder (`apps/ledger/services/reminders.py`).

── One text, several loans ───────────────────────────────────────────────────
A member with three overdue books gets ONE message naming all three, and each
loan's history shows it: `record_source_reminders` writes a row per loan that
share a `message_group_id`. The core's own per-record send (`POST
/ledger/reminders` with a `source_type`) still works for a single loan or a
hold, which is why every candidate carries the full set of template parameters
rather than leaving them to this module's compose.

── `due_on` is the run date ──────────────────────────────────────────────────
For a library candidate `due_on` is the date of the reminder, not the loan's
due date (FRD §5): the day-1 and the day-7 notice about one loan are two rows,
and the widened unique index keeps a second run of the same day harmless.

── Who is told ────────────────────────────────────────────────────────────────
A member with an active guardian relation that `receives_messages` is reached
through the guardian (D22); otherwise the member. The guardian is a preference
read at compose time, never a copy kept on the membership.
"""

from __future__ import annotations

import datetime as dt
from collections.abc import Iterable
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.db.models import Max, Q

from apps.common.dates import tenant_today
from apps.common.exceptions import BusinessRuleViolation, NotFound, ValidationFailed
from apps.common.money import ZERO
from apps.library.constants import HoldStatus, LoanStatus
from apps.library.models import LibraryHold, LibraryLoan, LibraryMembership
from apps.library.services.fields import uuid_or_none

SOURCE_LOAN = "library_loan"
SOURCE_HOLD = "library_hold"
TEMPLATE_OVERDUE = "library_overdue"
TEMPLATE_HOLD_READY = "library_hold_ready"
TEMPLATE_ISSUE_SLIP = "library_issue_slip"
NOTICE_OVERDUE_TODAY = "library.overdue_today"
NOTICE_HOLD_READY = "library.hold_ready"
#: BR-4 — beyond five books the list becomes "and 3 more", before the fine line
#: or the signature is ever touched.
BOOK_LINES_MAX = 5
DAYS_MIN_CHOICES = (1, 7, 14, 30)

#: FRD §5, verbatim apart from `member_line`, whose words live in FRAGMENTS. The FRD
#: gives no Hindi SMS or slip; NTF-02 requires every template in both languages.
#: `Rs`, never `₹` (NTF-02); the signature is the business name, never the product.
TEMPLATES: dict[str, dict[str, dict[str, str]]] = {
    TEMPLATE_OVERDUE: {
        "whatsapp": {
            "en": (
                "Hello {{recipient_name}}, {{member_line}}these {{library}} books are overdue:\n"
                "{{book_lines}}{{fine_line}}Please return them soon.\n— {{library}}"
            ),
            "hi": (
                "नमस्ते {{recipient_name}} जी, {{member_line}}{{library}} की ये किताबें लौटानी "
                "बाकी हैं:\n{{book_lines}}{{fine_line}}कृपया जल्दी लौटाएँ।\n— {{library}}"
            ),
        },
        "sms": {
            "en": (
                "{{library}}: {{count}} book(s) overdue for {{member_number}}. "
                "Fine so far Rs {{fine_so_far}}. Please return soon."
            ),
            "hi": (
                "{{library}}: {{member_number}} की {{count}} किताब(ें) लौटानी बाकी। "
                "अब तक जुर्माना Rs {{fine_so_far}}। कृपया जल्दी लौटाएँ।"
            ),
        },
    },
    TEMPLATE_HOLD_READY: {
        "whatsapp": {
            "en": (
                "Hello {{recipient_name}}, {{title}} is kept for {{member_first}} at {{library}} "
                "until {{collect_by}}.\n— {{library}}"
            ),
            "hi": (
                "नमस्ते {{recipient_name}} जी, {{title}} {{member_first}} के लिए {{collect_by}} "
                "तक {{library}} में रखी है।\n— {{library}}"
            ),
        },
    },
    TEMPLATE_ISSUE_SLIP: {
        "whatsapp": {
            "en": "{{member_first}}, you have borrowed from {{library}}:\n{{book_lines}}— {{library}}",
            "hi": "{{member_first}}, आपने {{library}} से ये किताबें ली हैं:\n{{book_lines}}— {{library}}",
        },
    },
}

#: The optional lines, per language (the NTF-03 rule: a template is a sentence
#: with holes in it and the decisions stay in Python).
FRAGMENTS: dict[str, dict[str, str]] = {
    "en": {
        "member_line": "for {first} ({number}), ",
        "overdue_book": "• {title} ({number}), due {due}, {late}\n",
        "late_one": "1 day late",
        "late_many": "{days} days late",
        "due_tomorrow": "due tomorrow",
        "slip_book": "• {title} ({number}), due {due}\n",
        "more": "• and {count} more\n",
        "fine_line": "Fine so far: Rs {amount}.\n",
    },
    "hi": {
        "member_line": "{first} ({number}) के लिए ",
        "overdue_book": "• {title} ({number}), {due} तक, {late}\n",
        "late_one": "1 दिन देर",
        "late_many": "{days} दिन देर",
        "due_tomorrow": "कल लौटानी है",
        "slip_book": "• {title} ({number}), {due} तक\n",
        "more": "• और {count}\n",
        "fine_line": "अब तक जुर्माना: Rs {amount}।\n",
    },
}


# ── small words ─────────────────────────────────────────────────────────────


def _locale(tenant: Any) -> str:
    from apps.notifications.services.whatsapp_text import message_locale

    return message_locale(tenant)


def _library(tenant: Any) -> str:
    from apps.notifications.services.whatsapp_text import shop_name

    return shop_name(tenant)


def _day(day: dt.date, locale: str, *, weekday: bool = False) -> str:
    if locale != "en":
        return day.strftime("%d/%m")
    text = f"{day.day} {day:%b}"
    return f"{day:%a} {text}" if weekday else text


def first_name(name: str) -> str:
    return (name or "").strip().split(" ")[0] if (name or "").strip() else ""


def _rs(amount: Decimal) -> str:
    from apps.notifications.services.templates import format_rs

    return format_rs(amount)


def _book_lines(lines: list[str], locale: str) -> str:
    if len(lines) <= BOOK_LINES_MAX:
        return "".join(lines)
    shown = lines[: BOOK_LINES_MAX - 1]
    more = FRAGMENTS[locale]["more"].format(count=len(lines) - len(shown))
    return "".join(shown) + more


def _overdue_line(loan: LibraryLoan, today: dt.date, locale: str) -> str:
    words = FRAGMENTS[locale]
    days = (today - loan.due_on).days
    if days <= 0:
        late = words["due_tomorrow"]
    else:
        late = words["late_one"] if days == 1 else words["late_many"].format(days=days)
    return words["overdue_book"].format(
        title=loan.copy.title.title,
        number=loan.copy.accession_number,
        due=_day(loan.due_on, locale),
        late=late,
    )


def _fine_so_far(loan: LibraryLoan, today: dt.date) -> Decimal:
    """BR-1 — LIB-07's fine to today, computed at read time and never stored."""
    from apps.library.services.loans import fine_for

    if loan.status != LoanStatus.OPEN or today <= loan.due_on:
        return ZERO
    return fine_for(loan, today).amount


def subject_label(loan: LibraryLoan) -> str:
    return f"{loan.copy.title.title} ({loan.copy.accession_number})"[:120]


# ── who is told (D22) ───────────────────────────────────────────────────────


def guardians(tenant: Any, party_ids: Iterable[Any]) -> dict[Any, Any]:
    """`{member party id: guardian Party}` for active guardians who receive messages."""
    from apps.parties.constants import PartyStatus, RelationKind
    from apps.parties.models import PartyRelation
    from apps.parties.services.relations import active_relation_q

    ids = list(dict.fromkeys(party_ids))
    if not ids:
        return {}
    found: dict[Any, Any] = {}
    rows = (
        PartyRelation.objects.for_tenant(tenant)
        .filter(active_relation_q(tenant_today(tenant)))
        .filter(party_id__in=ids, kind=RelationKind.GUARDIAN, receives_messages=True)
        .filter(related_party__status=PartyStatus.ACTIVE, related_party__deleted_at__isnull=True)
        .select_related("related_party")
        .order_by("from_on", "id")
    )
    for relation in rows:
        found.setdefault(relation.party_id, relation.related_party)
    return found


def _member_line(member: Any, guardian: Any, locale: str) -> str:
    if guardian is None:
        return ""
    return FRAGMENTS[locale]["member_line"].format(
        first=first_name(member.party.name), number=member.member_number
    )


# ── the parameters of one overdue text ──────────────────────────────────────


def overdue_params(
    tenant: Any,
    member: LibraryMembership,
    loans: list[LibraryLoan],
    today: dt.date,
    guardian: Any,
) -> dict[str, str]:
    """Every placeholder of `library_overdue` except `recipient_name` (the core's)."""
    locale = _locale(tenant)
    fine = sum((_fine_so_far(loan, today) for loan in loans), ZERO)
    return {
        "library": _library(tenant),
        "member_line": _member_line(member, guardian, locale),
        "member_first": first_name(member.party.name),
        "member_number": member.member_number,
        "book_lines": _book_lines([_overdue_line(loan, today, locale) for loan in loans], locale),
        "fine_line": FRAGMENTS[locale]["fine_line"].format(amount=_rs(fine)) if fine > 0 else "",
        "fine_so_far": _rs(fine),
        "count": str(len(loans)),
    }


def hold_params(tenant: Any, hold: LibraryHold) -> dict[str, str]:
    locale = _locale(tenant)
    return {
        "library": _library(tenant),
        "title": hold.title.title,
        "member_first": first_name(hold.membership.party.name),
        "collect_by": _day(hold.collect_by, locale, weekday=True) if hold.collect_by else "",
    }


# ── the two reminder sources (FR-1, FR-2) ───────────────────────────────────


def _loans(tenant: Any) -> Any:
    return LibraryLoan.objects.filter(tenant=tenant, status=LoanStatus.OPEN).select_related(
        "copy", "copy__title", "membership", "membership__party"
    )


def _loan_candidate(loan: LibraryLoan, on: dt.date, guardian: Any) -> dict:
    return {
        "party_id": loan.party_id,
        "source_type": SOURCE_LOAN,
        "source_id": loan.id,
        "due_on": on,
        "amount": None,
        "subject_label": subject_label(loan),
        "template_key": TEMPLATE_OVERDUE,
        "recipient_party_id": guardian.id if guardian is not None else None,
        "params": overdue_params(loan.tenant, loan.membership, [loan], on, guardian),
    }


def loan_candidates(tenant: Any, on: dt.date) -> list[dict]:
    """Open loans exactly 1, 7, 14 or 30 calendar days overdue on `on` (D21) — a
    holiday never skips a reminder — and, with `remind_day_before`, loans due tomorrow."""
    from apps.library.models import LibrarySettings

    settings = LibrarySettings.objects.filter(tenant=tenant).first()
    if settings is None:
        return []
    due_dates = [on - dt.timedelta(days=days) for days in settings.overdue_reminder_days]
    if settings.remind_day_before:
        due_dates.append(on + dt.timedelta(days=1))
    loans = list(_loans(tenant).filter(due_on__in=due_dates).order_by("due_on", "id"))
    found = guardians(tenant, [loan.party_id for loan in loans])
    return [_loan_candidate(loan, on, found.get(loan.party_id)) for loan in loans]


def loan_lookup(tenant: Any, loan_id: Any, on: dt.date) -> dict | None:
    """Any overdue open loan may be reminded about — the list shows every one (FR-4)."""
    from apps.library.models import LibrarySettings

    loan = _loans(tenant).filter(pk=loan_id).first()
    if loan is None:
        return None
    settings = LibrarySettings.objects.filter(tenant=tenant).first()
    tomorrow = on + dt.timedelta(days=1)
    if not (
        loan.due_on < on
        or (settings is not None and settings.remind_day_before and loan.due_on == tomorrow)
    ):
        return None
    return _loan_candidate(loan, on, guardians(tenant, [loan.party_id]).get(loan.party_id))


def _holds(tenant: Any) -> Any:
    return LibraryHold.objects.filter(tenant=tenant, status=HoldStatus.READY).select_related(
        "title", "membership", "membership__party"
    )


def _hold_candidate(hold: LibraryHold, on: dt.date, guardian: Any) -> dict:
    return {
        "party_id": hold.party_id,
        "source_type": SOURCE_HOLD,
        "source_id": hold.id,
        "due_on": on,
        "amount": None,
        "subject_label": hold.title.title[:120],
        "template_key": TEMPLATE_HOLD_READY,
        "recipient_party_id": guardian.id if guardian is not None else None,
        "params": hold_params(hold.tenant, hold),
    }


def hold_candidates(tenant: Any, on: dt.date) -> list[dict]:
    """Holds that became ready on `on`."""
    holds = list(_holds(tenant).filter(ready_on=on).order_by("id"))
    found = guardians(tenant, [hold.party_id for hold in holds])
    return [_hold_candidate(hold, on, found.get(hold.party_id)) for hold in holds]


def hold_lookup(tenant: Any, hold_id: Any, on: dt.date) -> dict | None:
    hold = _holds(tenant).filter(pk=hold_id).first()
    if hold is None:
        return None
    return _hold_candidate(hold, on, guardians(tenant, [hold.party_id]).get(hold.party_id))


# ── composing (FR-5, BR-4) ──────────────────────────────────────────────────


def _compose(tenant: Any, template: str, params: dict, recipient: Any) -> Any:
    from apps.ledger.services.messaging import compose_source_reminder

    return compose_source_reminder(
        tenant=tenant,
        template_key=template,
        params={**params, "recipient_name": recipient.name},
        mobile=recipient.mobile,
    )


def _recipient_json(member_party: Any, recipient: Any) -> dict:
    return {
        "id": str(recipient.id),
        "name": recipient.name,
        "is_guardian": recipient.pk != member_party.pk,
        "has_mobile": bool(recipient.mobile),
    }


def _message_json(composed: Any, member_party: Any, recipient: Any) -> dict:
    return {
        "text": composed.text,
        "sms_text": composed.sms_text,
        "wa_url": composed.wa_url,
        "sms_url": composed.sms_url,
        "tel_url": composed.tel_url,
        "recipient": _recipient_json(member_party, recipient),
    }


def _membership(tenant: Any, membership_id: Any) -> LibraryMembership:
    member = (
        LibraryMembership.objects.filter(tenant=tenant, pk=uuid_or_none(membership_id))
        .select_related("party", "membership_type")
        .first()
    )
    if member is None:
        raise NotFound("No such member.")
    return member


def overdue_loans_of(member: LibraryMembership, today: dt.date, loan_ids: Any = None) -> list:
    """The member's overdue loans, narrowed to `loan_ids` when given (BR-3: a loan
    returned between the preview and the tap simply drops out)."""
    qs = _loans(member.tenant).filter(membership=member, due_on__lt=today)
    if loan_ids is not None:
        if not isinstance(loan_ids, list):
            raise ValidationFailed({"loan_ids": ["Send a list of loan ids."]})
        wanted = [uuid_or_none(value) for value in loan_ids]
        if None in wanted:
            raise ValidationFailed({"loan_ids": ["Not a valid id."]})
        qs = qs.filter(pk__in=wanted)
    return list(qs.order_by("due_on", "id"))


def _nothing_overdue(member: LibraryMembership) -> BusinessRuleViolation:
    return BusinessRuleViolation(
        "library_nothing_overdue",
        "Nothing is overdue for this member.",
        details={"membership_id": str(member.id)},
    )


def _overdue_message(member: LibraryMembership, loans: list, today: dt.date) -> tuple:
    guardian = guardians(member.tenant, [member.party_id]).get(member.party_id)
    recipient = guardian or member.party
    params = overdue_params(member.tenant, member, loans, today, guardian)
    return _compose(member.tenant, TEMPLATE_OVERDUE, params, recipient), recipient, guardian


def preview_overdue(*, ctx: Any, membership_id: Any, data: Any = None) -> dict:
    """The exact text, server-composed; writes nothing."""
    member = _membership(ctx.tenant, membership_id)
    today = tenant_today(ctx.tenant)
    loans = overdue_loans_of(member, today, (data or {}).get("loan_ids"))
    if not loans:
        raise _nothing_overdue(member)
    composed, recipient, _guardian = _overdue_message(member, loans, today)
    return {
        **_message_json(composed, member.party, recipient),
        "loan_ids": [str(loan.id) for loan in loans],
    }


def _channel(raw: Any) -> str:
    from apps.ledger.services.reminders import SOURCE_CHANNELS

    if raw not in SOURCE_CHANNELS:
        raise ValidationFailed({"channel": ["Choose WhatsApp, SMS or Call."]})
    return raw


def _sent(channel: str, composed: Any) -> dict:
    if channel == "call":
        return {"tel_url": composed.tel_url, "text": ""}
    if channel == "sms_manual":
        return {"sms_url": composed.sms_url, "text": composed.sms_text}
    return {"wa_url": composed.wa_url, "text": composed.text}


def reminder_json(row: Any) -> dict:
    return {
        "id": str(row.id),
        "source_type": row.source_type,
        "source_id": str(row.source_id),
        "subject_label": row.subject_label,
        "channel": row.channel,
        "kind": row.kind,
        "sent_at": row.sent_at.isoformat() if row.sent_at else None,
        "message_group_id": str(row.message_group_id) if row.message_group_id else None,
    }


def _lock_party(tenant: Any, party_id: Any) -> None:
    """BR-3 — the only lock this takes: two taps on one member queue behind each other,
    so the per-loan daily cap sees the first tap's rows."""
    from apps.parties.models import Party

    Party.objects.for_tenant(tenant).select_for_update().filter(pk=party_id).first()


@transaction.atomic
def remind_overdue(*, ctx: Any, membership_id: Any, data: Any) -> dict:
    """FR-5 — the tap that opens the app records one reminder per loan, one message."""
    from apps.ledger.services.reminder_seam import record_source_reminders

    data = data or {}
    channel = _channel(data.get("channel"))
    member = _membership(ctx.tenant, membership_id)
    _lock_party(ctx.tenant, member.party_id)
    today = tenant_today(ctx.tenant)
    loans = overdue_loans_of(member, today, data.get("loan_ids"))
    if not loans:
        raise _nothing_overdue(member)
    composed, recipient, guardian = _overdue_message(member, loans, today)
    if not recipient.mobile:
        raise ValidationFailed({"recipient": [f"No mobile for {recipient.name}."]})
    sent = _sent(channel, composed)
    rows = record_source_reminders(
        ctx=ctx,
        party_id=member.party_id,
        recipient_party_id=guardian.id if guardian is not None else None,
        module="library",
        kind="notice",
        channel=channel,
        sources=[
            {
                "source_type": SOURCE_LOAN,
                "source_id": loan.id,
                "subject_label": subject_label(loan),
                "amount": None,
                "due_on": today,
            }
            for loan in loans
        ],
        text=sent["text"] or composed.text,
    )
    return {
        "reminders": [reminder_json(row) for row in rows],
        **sent,
        "recipient": _recipient_json(member.party, recipient),
    }


@transaction.atomic
def remind_hold(*, ctx: Any, hold_id: Any, data: Any) -> dict:
    """FR-7 — the Ready tab's Remind: "Wings of Fire is kept for you until Tue 20 Oct"."""
    from apps.ledger.services.reminder_seam import record_source_reminders

    data = data or {}
    channel = _channel(data.get("channel"))
    hold = (
        LibraryHold.objects.filter(tenant=ctx.tenant, pk=uuid_or_none(hold_id))
        .select_related("title", "membership", "membership__party")
        .first()
    )
    if hold is None:
        raise NotFound("No such hold.")
    if hold.status != HoldStatus.READY:
        raise BusinessRuleViolation(
            "library_hold_not_open",
            "This book is not kept aside any more.",
            details={"status": hold.status},
        )
    _lock_party(ctx.tenant, hold.party_id)
    guardian = guardians(ctx.tenant, [hold.party_id]).get(hold.party_id)
    member_party = hold.membership.party
    recipient = guardian or member_party
    if not recipient.mobile:
        raise ValidationFailed({"recipient": [f"No mobile for {recipient.name}."]})
    composed = _compose(ctx.tenant, TEMPLATE_HOLD_READY, hold_params(ctx.tenant, hold), recipient)
    sent = _sent(channel, composed)
    rows = record_source_reminders(
        ctx=ctx,
        party_id=hold.party_id,
        recipient_party_id=guardian.id if guardian is not None else None,
        module="library",
        kind="notice",
        channel=channel,
        sources=[
            {
                "source_type": SOURCE_HOLD,
                "source_id": hold.id,
                "subject_label": hold.title.title[:120],
                "amount": None,
                "due_on": tenant_today(ctx.tenant),
            }
        ],
        text=sent["text"] or composed.text,
    )
    return {
        "reminders": [reminder_json(row) for row in rows],
        **sent,
        "recipient": _recipient_json(member_party, recipient),
    }


def _too_many(count: int) -> BusinessRuleViolation:
    from apps.ledger.constants import BULK_REMINDER_MAX

    return BusinessRuleViolation(
        "too_many_ids",
        f"Select up to {BULK_REMINDER_MAX} members at a time.",
        details={"max": BULK_REMINDER_MAX, "count": count},
    )


def bulk_prepare(*, ctx: Any, data: Any) -> dict:
    """FR-6 — one prepared text per member, up to 100; writes nothing. Each tap in the
    sequential sender then records through `remind_overdue`."""
    from apps.ledger.constants import BULK_REMINDER_MAX

    data = data or {}
    ids, group = data.get("membership_ids"), (data.get("group") or "").strip()
    today = tenant_today(ctx.tenant)
    if group:
        members = list(
            LibraryMembership.objects.filter(
                tenant=ctx.tenant,
                group_label__iexact=group,
                pk__in=_loans(ctx.tenant).filter(due_on__lt=today).values("membership_id"),
            )
            .select_related("party")
            .order_by("member_number_sort", "id")
        )
    else:
        if not isinstance(ids, list) or not ids:
            raise ValidationFailed({"membership_ids": ["Select at least one member."]})
        if len(ids) > BULK_REMINDER_MAX:
            raise _too_many(len(ids))
        wanted = [uuid_or_none(value) for value in ids]
        if None in wanted:
            raise ValidationFailed({"membership_ids": ["Not a valid id."]})
        by_id = {
            m.id: m
            for m in LibraryMembership.objects.filter(
                tenant=ctx.tenant, pk__in=wanted
            ).select_related("party")
        }
        members = [by_id[pk] for pk in dict.fromkeys(wanted) if pk in by_id]
    if len(members) > BULK_REMINDER_MAX:
        raise _too_many(len(members))  # a whole group larger than the ceiling
    items = []
    for member in members:
        item: dict[str, Any] = {"membership_id": str(member.id), "name": member.party.name}
        loans = overdue_loans_of(member, today)
        if not loans:
            items.append({**item, "skip_reason": "nothing_overdue"})
            continue
        composed, recipient, _guardian = _overdue_message(member, loans, today)
        message = _message_json(composed, member.party, recipient)
        item.update(message, loan_ids=[str(loan.id) for loan in loans])
        if not recipient.mobile:
            item["skip_reason"] = "no_mobile"  # BR-5
        items.append(item)
    return {"items": items}


def issue_slip(*, ctx: Any, membership_id: Any, data: Any = None) -> dict:
    """The "you have borrowed" text after an issue: the member's open loans, or the
    ones named. A share, not a reminder — nothing is recorded."""
    member = _membership(ctx.tenant, membership_id)
    data = data or {}
    qs = _loans(ctx.tenant).filter(membership=member)
    if data.get("loan_ids") is not None:
        loan_ids = data["loan_ids"]
        wanted = [uuid_or_none(v) for v in loan_ids] if isinstance(loan_ids, list) else [None]
        if None in wanted:
            raise ValidationFailed({"loan_ids": ["Not a valid id."]})
        qs = qs.filter(pk__in=wanted)
    loans = list(qs.order_by("due_on", "id"))
    if not loans:
        raise ValidationFailed({"loan_ids": ["This member has no books out."]})
    locale = _locale(ctx.tenant)
    lines = [
        FRAGMENTS[locale]["slip_book"].format(
            title=loan.copy.title.title,
            number=loan.copy.accession_number,
            due=_day(loan.due_on, locale),
        )
        for loan in loans
    ]
    params = {
        "library": _library(ctx.tenant),
        "member_first": first_name(member.party.name),
        "book_lines": _book_lines(lines, locale),
    }
    composed = _compose(ctx.tenant, TEMPLATE_ISSUE_SLIP, params, member.party)
    return {
        **_message_json(composed, member.party, member.party),
        "loan_ids": [str(loan.id) for loan in loans],
    }


# ── the overdue list (FR-4) ─────────────────────────────────────────────────


def overdue_list(tenant: Any, params: Any) -> tuple[list[dict], dict]:
    """Every member with an overdue book, grouped by member; the totals are over the
    filtered set. Fine so far is computed per loan at read time (BR-1)."""
    from apps.ledger.models import Reminder

    today = tenant_today(tenant)
    errors: dict[str, list[str]] = {}
    qs = _loans(tenant).filter(due_on__lt=today).select_related("membership__membership_type")
    group = (params.get("group") or "").strip()
    if group:
        qs = qs.filter(membership__group_label__iexact=group)
    raw_days = params.get("days_min")
    if raw_days:
        if not str(raw_days).isdigit() or int(raw_days) not in DAYS_MIN_CHOICES:
            errors["days_min"] = ["Choose 1, 7, 14 or 30."]
        else:
            qs = qs.filter(due_on__lte=today - dt.timedelta(days=int(raw_days)))
    if params.get("type"):
        type_id = uuid_or_none(params.get("type"))
        if type_id is None:
            errors["type"] = ["Not a valid id."]
        qs = qs.filter(membership__membership_type_id=type_id)
    query = (params.get("q") or "").strip()
    if query:
        qs = qs.filter(
            Q(membership__party__name__icontains=query)
            | Q(membership__member_number__iexact=query)
            | Q(membership__group_label__iexact=query)
        )
    quiet_days = params.get("not_reminded_days")
    if quiet_days and not str(quiet_days).isdigit():
        errors["not_reminded_days"] = ["Send a number of days."]
    if errors:
        raise ValidationFailed(errors)

    loans = list(qs.order_by("membership__member_number_sort", "due_on", "id"))
    party_ids = list(dict.fromkeys(loan.party_id for loan in loans))
    last = dict(
        Reminder.objects.filter(
            tenant=tenant, module="library", source_type=SOURCE_LOAN, party_id__in=party_ids
        )
        .exclude(status="cancelled")
        .values("party_id")
        .annotate(at=Max("sent_at"))
        .values_list("party_id", "at")
    )
    found = guardians(tenant, party_ids)
    rows: dict[Any, dict] = {}
    for loan in loans:
        member = loan.membership
        row = rows.get(member.id)
        if row is None:
            recipient = found.get(member.party_id) or member.party
            row = rows[member.id] = {
                "membership": {
                    "id": str(member.id),
                    "member_number": member.member_number,
                    "group_label": member.group_label,
                    "party": {"id": str(member.party_id), "name": member.party.name},
                    "membership_type": {
                        "id": str(member.membership_type_id),
                        "name": member.membership_type.name,
                    },
                },
                "recipient": _recipient_json(member.party, recipient),
                "loans": [],
                "fine_so_far_total": ZERO,
                "last_reminded_at": last.get(member.party_id),
            }
        fine = _fine_so_far(loan, today)
        row["loans"].append(
            {
                "loan_id": str(loan.id),
                "title": loan.copy.title.title,
                "accession_number": loan.copy.accession_number,
                "due_on": loan.due_on.isoformat(),
                "days_late": (today - loan.due_on).days,
                "fine_so_far": f"{fine:.2f}",
            }
        )
        row["fine_so_far_total"] += fine
    result = list(rows.values())
    if quiet_days:
        since = today - dt.timedelta(days=int(quiet_days))
        result = [
            row
            for row in result
            if row["last_reminded_at"] is None
            or row["last_reminded_at"].astimezone(_tz(tenant)).date() <= since
        ]
    totals = {
        "members": len(result),
        "loans": sum(len(row["loans"]) for row in result),
        "fine_so_far": f"{sum((row['fine_so_far_total'] for row in result), ZERO):.2f}",
    }
    for row in result:
        row["fine_so_far_total"] = f"{row['fine_so_far_total']:.2f}"
        at = row["last_reminded_at"]
        row["last_reminded_at"] = at.isoformat() if at else None
    return result, totals


def _tz(tenant: Any) -> Any:
    from zoneinfo import ZoneInfo

    return ZoneInfo(getattr(tenant, "timezone", None) or "Asia/Kolkata")


# ── the bell (FR-8) ─────────────────────────────────────────────────────────


def notify_hold_ready(tenant: Any, hold: LibraryHold, today: dt.date) -> None:
    """ "3 books kept aside today" — one row per day, coalescing each new hold."""
    from apps.notifications.services.notify import notify

    notify(
        tenant,
        NOTICE_HOLD_READY,
        params={"date": today.isoformat()},
        group_key=f"{NOTICE_HOLD_READY}:{today.isoformat()}",
        ids=[str(hold.id)],
    )


def notify_overdue_today(tenant: Any, today: dt.date) -> int:
    """ "12 books became overdue today": loans due yesterday, still out."""
    from apps.notifications.services.notify import notify

    ids = [
        str(pk)
        for pk in LibraryLoan.objects.filter(
            tenant=tenant, status=LoanStatus.OPEN, due_on=today - dt.timedelta(days=1)
        ).values_list("id", flat=True)
    ]
    if ids:
        notify(
            tenant,
            NOTICE_OVERDUE_TODAY,
            params={"date": today.isoformat()},
            group_key=f"{NOTICE_OVERDUE_TODAY}:{today.isoformat()}",
            ids=ids,
        )
    return len(ids)


def register() -> None:
    """Called from `LibraryConfig.ready()`: sources, policy, templates, bell types."""
    from apps.ledger.services.reminder_seam import (
        register_reminder_policy,
        register_reminder_source,
    )
    from apps.notifications.constants import NotificationCategory, NotificationSeverity
    from apps.notifications.services.notify import NotificationType, register_notification_type
    from apps.notifications.services.templates import register_default_templates

    register_reminder_source(
        SOURCE_LOAN, module="library", candidates=loan_candidates, lookup=loan_lookup
    )
    register_reminder_source(
        SOURCE_HOLD, module="library", candidates=hold_candidates, lookup=hold_lookup
    )
    # FR-10 — the same book is not reminded twice in a day; no time window.
    register_reminder_policy("library", {"daily_cap_per_source": 1})
    register_default_templates(TEMPLATES)
    register_notification_type(
        NOTICE_OVERDUE_TODAY,
        NotificationType(
            code=NOTICE_OVERDUE_TODAY,
            category=NotificationCategory.REMINDERS,
            severity=NotificationSeverity.WARNING,
            required_permission="library.loan.read",
            title_en="{count} books became overdue today",
            body_en="Tap to see who to remind",
            group_window=24 * 60,
            route=lambda _p: "/library/overdue?days=1",
        ),
    )
    register_notification_type(
        NOTICE_HOLD_READY,
        NotificationType(
            code=NOTICE_HOLD_READY,
            category=NotificationCategory.REMINDERS,
            severity=NotificationSeverity.INFO,
            required_permission="library.loan.read",
            title_en="{count} books kept aside today",
            body_en="Let the members know they can collect them",
            group_window=24 * 60,
            route=lambda _p: "/library/holds?tab=ready",
        ),
    )
