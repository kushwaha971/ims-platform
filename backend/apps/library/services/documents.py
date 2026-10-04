"""What leaves the library in a member's hand: card, overdue notice, no-dues certificate (LIB-13).

These are the PAYLOADS; the sheets are printed by the browser (ADR-021: no server
PDF). Every payload names the library — the tenant's own name — and nothing
else: no product name, no domain, and a card's QR carries the member number
only, never a URL (BR-1, BR-2).
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.db import transaction

from apps.common.audit import AuditAction, write_audit
from apps.common.dates import tenant_today
from apps.common.exceptions import NotFound, ValidationFailed
from apps.common.qr import encode, matrix_rows
from apps.library.models import LibraryMembership
from apps.library.services import no_dues
from apps.library.services.fields import uuid_or_none

CARDS_MAX = 50
#: BR-3 — "Please return by" is the seventh open day after today.
RETURN_BY_OPEN_DAYS = 7


def business(tenant: Any) -> dict:
    """The receipt's header band (`PaymentSerializer.get_business`), without the VPA."""
    return {
        "name": tenant.name,
        "legal_name": tenant.legal_name,
        "phone": tenant.phone,
        "address": dict(tenant.address or {}),
    }


def _member(tenant: Any, membership_id: Any) -> LibraryMembership:
    member = (
        LibraryMembership.objects.filter(tenant=tenant, pk=uuid_or_none(membership_id))
        .select_related("party", "membership_type")
        .first()
    )
    if member is None:
        raise NotFound("No such member.")
    return member


def _guardian_names(tenant: Any, party_ids: list) -> dict:
    """Any active guardian — the card names them whether or not they take messages."""
    from apps.parties.constants import RelationKind
    from apps.parties.models import PartyRelation
    from apps.parties.services.relations import active_relation_q

    found: dict = {}
    for relation in (
        PartyRelation.objects.for_tenant(tenant)
        .filter(active_relation_q(tenant_today(tenant)))
        .filter(party_id__in=party_ids, kind=RelationKind.GUARDIAN)
        .select_related("related_party")
        .order_by("from_on", "id")
    ):
        found.setdefault(relation.party_id, relation.related_party.name)
    return found


def _card(member: LibraryMembership, guardian: str | None) -> dict:
    return {
        "membership_id": str(member.id),
        "member": {
            "name": member.party.name,
            "member_number": member.member_number,
            "type": member.membership_type.name,
            "valid_until": member.valid_until.isoformat() if member.valid_until else None,
            "group_label": member.group_label,
            "guardian_name": guardian,
        },
        # BR-1 — exactly the member number: the counter's lookup reads it from a 2D wedge.
        "qr": {"modules": matrix_rows(encode(member.member_number))},
        "card_issued_on": member.card_issued_on.isoformat() if member.card_issued_on else None,
    }


def card(tenant: Any, membership_id: Any) -> dict:
    member = _member(tenant, membership_id)
    guardian = _guardian_names(tenant, [member.party_id]).get(member.party_id)
    return {"business": business(tenant), **_card(member, guardian)}


def cards(tenant: Any, params: Any) -> dict:
    """A sheet of cards for a class or a batch: `?ids=a,b,c` or `?group=9-B`, ≤ 50."""
    from apps.common.exceptions import BusinessRuleViolation

    qs = LibraryMembership.objects.filter(tenant=tenant).exclude(status="closed")
    group = (params.get("group") or "").strip()
    raw = (params.get("ids") or "").strip()
    if group:
        qs = qs.filter(group_label__iexact=group)
    elif raw:
        wanted = [uuid_or_none(part.strip()) for part in raw.split(",") if part.strip()]
        if None in wanted:
            raise ValidationFailed({"ids": ["Not a valid id."]})
        if len(wanted) > CARDS_MAX:
            raise BusinessRuleViolation(
                "too_many_ids",
                f"Print up to {CARDS_MAX} cards at a time.",
                details={"max": CARDS_MAX, "count": len(wanted)},
            )
        qs = qs.filter(pk__in=wanted)
    else:
        raise ValidationFailed({"ids": ["Choose members or a group."]})
    members = list(
        qs.select_related("party", "membership_type").order_by("member_number_sort", "id")
    )
    if len(members) > CARDS_MAX:
        raise BusinessRuleViolation(
            "too_many_ids",
            f"Print up to {CARDS_MAX} cards at a time.",
            details={"max": CARDS_MAX, "count": len(members)},
        )
    guardians = _guardian_names(tenant, [m.party_id for m in members])
    return {
        "business": business(tenant),
        "cards": [_card(m, guardians.get(m.party_id)) for m in members],
    }


@transaction.atomic
def card_printed(*, ctx: Any, membership_id: Any) -> dict:
    """The first print sets `card_issued_on`; every print is audited."""
    member = _member(ctx.tenant, membership_id)
    first = member.card_issued_on is None
    if first:
        LibraryMembership.objects.filter(pk=member.pk, card_issued_on__isnull=True).update(
            card_issued_on=tenant_today(ctx.tenant)
        )
        member.refresh_from_db(fields=["card_issued_on"])
    write_audit(
        ctx=ctx,
        action=AuditAction.LIBRARY_CARD_PRINTED,
        entity_type="library_membership",
        entity_id=member.id,
        metadata={"first": first},
    )
    return {"card_issued_on": member.card_issued_on.isoformat()}


def return_by(tenant: Any, today: dt.date) -> dt.date:
    from apps.platform_app.services.calendar import next_open_day

    day = today
    for _ in range(RETURN_BY_OPEN_DAYS):
        day = next_open_day(tenant, day + dt.timedelta(days=1), module="library")
    return day


def overdue_notice(tenant: Any, membership_id: Any) -> dict:
    """FR-2 — the A5 letter; its text twin is LIB-09's WhatsApp message."""
    from apps.library.services import reminders

    member = _member(tenant, membership_id)
    today = tenant_today(tenant)
    loans = reminders.overdue_loans_of(member, today)
    if not loans:
        raise reminders._nothing_overdue(member)
    guardian = reminders.guardians(tenant, [member.party_id]).get(member.party_id)
    recipient = guardian or member.party
    rows = []
    total = reminders.ZERO
    for loan in loans:
        fine = reminders._fine_so_far(loan, today)
        total += fine
        rows.append(
            {
                "loan_id": str(loan.id),
                "title": loan.copy.title.title,
                "accession_number": loan.copy.accession_number,
                "due_on": loan.due_on.isoformat(),
                "days_late": (today - loan.due_on).days,
                "fine_so_far": f"{fine:.2f}",
            }
        )
    return {
        "business": business(tenant),
        "date": today.isoformat(),
        "recipient": {"name": recipient.name, "is_guardian": guardian is not None},
        "member": {
            "name": member.party.name,
            "member_number": member.member_number,
            "group_label": member.group_label,
        },
        "loans": rows,
        "fine_so_far_total": f"{total:.2f}",
        "return_by": return_by(tenant, today).isoformat(),
    }


def _reference(member: LibraryMembership, on: dt.date) -> str:
    """BR-5 — deterministic, so a same-day reprint carries the same reference."""
    return f"NDC-{member.member_number}-{on:%Y%m%d}"


def _no_dues_json(tenant: Any, member: LibraryMembership, result: dict, today: dt.date) -> dict:
    from apps.library.services.members import deposit_for

    deposit = deposit_for(member)
    held = deposit.held_amount if deposit is not None else None
    return {
        "membership_id": str(member.id),
        "clear": result["clear"],
        "as_on": today.isoformat(),
        "reference": _reference(member, today) if result["clear"] else None,
        "member": {
            "name": member.party.name,
            "member_number": member.member_number,
            "group_label": member.group_label,
        },
        "reasons": result.get("reasons", []),
        "deposit_held": f"{held:.2f}" if held else None,
    }


def no_dues_certificate(*, ctx: Any, membership_id: Any, issue: bool) -> dict:
    """FR-3 — a certificate only when clear; otherwise the reasons and no certificate."""
    member = _member(ctx.tenant, membership_id)
    today = tenant_today(ctx.tenant)
    result = no_dues.evaluate(member)
    body = {"business": business(ctx.tenant), **_no_dues_json(ctx.tenant, member, result, today)}
    if issue and result["clear"]:
        write_audit(
            ctx=ctx,
            action=AuditAction.LIBRARY_NO_DUES_ISSUED,
            entity_type="library_membership",
            entity_id=member.id,
            metadata={"reference": body["reference"]},
        )
    return body


def no_dues_group(tenant: Any, group: str) -> dict:
    group = (group or "").strip()
    if not group:
        raise ValidationFailed({"group": ["Choose a group."]})
    members = list(
        LibraryMembership.objects.filter(tenant=tenant, group_label__iexact=group)
        .select_related("party")
        .order_by("member_number_sort", "id")
    )
    today = tenant_today(tenant)
    results = no_dues.evaluate_many(tenant, members)
    return {
        "business": business(tenant),
        "as_on": today.isoformat(),
        "members": [
            {
                **_no_dues_json(tenant, member, result, today),
                "books_out": result["books_out"],
                "lost_unpaid": result["lost_unpaid"],
                "dues": f"{result['dues']:.2f}",
            }
            for member, result in zip(members, results, strict=True)
        ],
    }
