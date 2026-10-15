"""Member reads (LIB-04 §6 `GET /library/members`; task B07). Read-only (rule D8).

`status` filters by the EFFECTIVE status (BR-1), computed in SQL from the same
rule `services.members.effective_status` applies in Python, so a list filtered
"expired" and a member page saying "expired" can never disagree.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.db.models import Count, DecimalField, OuterRef, Q, QuerySet, Subquery, Sum, Value
from django.db.models.functions import Coalesce, Lower, Upper

from apps.common.exceptions import ValidationFailed
from apps.library.constants import MembershipStatus
from apps.library.models import LibraryCharge, LibraryMembership
from apps.library.services import codes
from apps.library.services.fields import uuid_or_none

ORDERINGS = {
    "name": (Lower("party__name").asc(), "id"),
    "member_number": ("member_number_sort", "id"),
    "valid_until": ("valid_until", "member_number_sort", "id"),
    "-dues": ("-dues", "member_number_sort", "id"),
    "seat": ("seat__label_sort", "member_number_sort", "id"),
}


def _status_q(status: str, today: dt.date) -> Q:
    suspended_now = Q(status=MembershipStatus.SUSPENDED) & (
        Q(suspended_until__isnull=True) | Q(suspended_until__gte=today)
    )
    expired = ~Q(status=MembershipStatus.CLOSED) & ~suspended_now & Q(valid_until__lt=today)
    if status == "closed":
        return Q(status=MembershipStatus.CLOSED)
    if status == "suspended":
        return suspended_now
    if status == "expired":
        return expired
    # active: neither closed, nor suspended now, nor expired
    return ~Q(status=MembershipStatus.CLOSED) & ~suspended_now & ~Q(valid_until__lt=today)


def list_members(tenant: Any, params: Any, today: dt.date) -> QuerySet:
    errors: dict[str, list[str]] = {}
    dues = Subquery(
        LibraryCharge.objects.filter(membership=OuterRef("pk"))
        .open()
        .values("membership")
        .annotate(total=Sum("amount_due"))
        .values("total"),
        output_field=DecimalField(max_digits=14, decimal_places=2),
    )
    qs = (
        LibraryMembership.objects.filter(tenant=tenant)
        .select_related("party", "membership_type", "shift", "seat")
        .annotate(dues=Coalesce(dues, Value(0), output_field=DecimalField()))
    )
    status = params.get("status")
    if status:
        if status == "expiring":
            within = params.get("expiring_within") or "7"
            try:
                days = int(within)
            except ValueError:
                errors["expiring_within"] = ["Enter a whole number of days."]
                days = 7
            qs = qs.filter(_status_q("active", today)).filter(
                valid_until__gte=today, valid_until__lte=today + dt.timedelta(days=days)
            )
        elif status in ("active", "expired", "suspended", "closed"):
            qs = qs.filter(_status_q(status, today))
        else:
            errors["status"] = ["Choose active, expiring, expired, suspended or closed."]
    kind = params.get("type")
    if kind:
        pk = uuid_or_none(kind)
        if pk is None:
            errors["type"] = ["Not a valid id."]
        else:
            qs = qs.filter(membership_type_id=pk)
    if params.get("party"):
        # F04 — the khata's library panel asks for the one member a party is.
        party = uuid_or_none(params.get("party"))
        if party is None:
            errors["party"] = ["Not a valid id."]
        else:
            qs = qs.filter(party_id=party)
    for field in ("shift", "seat"):
        # W02 — "who is in the Morning shift", "who sits at A-12".
        raw = params.get(field)
        if raw:
            pk = uuid_or_none(raw)
            if pk is None:
                errors[field] = ["Not a valid id."]
            else:
                qs = qs.filter(**{f"{field}_id": pk})
    if params.get("unseated") in ("true", "1"):
        qs = qs.filter(seat__isnull=True).exclude(status=MembershipStatus.CLOSED)
    group = (params.get("group") or "").strip()
    if group:
        qs = qs.filter(group_label__iexact=group)
    if params.get("has_dues") in ("true", "1"):
        qs = qs.filter(dues__gt=0)
    term = (params.get("q") or "").strip()
    if term:
        key = codes.number_key(term)
        qs = qs.filter(
            Q(party__name__icontains=term)
            | Q(party__mobile__contains=term)
            | Q(
                pk__in=LibraryMembership.objects.annotate(k=Upper("member_number"))
                .filter(tenant=tenant, k=key)
                .values("pk")
            )
        )
    ordering = params.get("ordering") or "name"
    if ordering not in ORDERINGS:
        errors["ordering"] = ["Choose name, member_number, valid_until, -dues or seat."]
    if errors:
        raise ValidationFailed(errors)
    return qs.order_by(*ORDERINGS[ordering])


def member_by_number(tenant: Any, key: str) -> LibraryMembership | None:
    """BR-8's third arm: an exact member number."""
    return (
        LibraryMembership.objects.annotate(k=Upper("member_number"))
        .filter(tenant=tenant, k=key)
        .select_related("party", "membership_type")
        .first()
    )


def member_status_counts(qs: QuerySet, today: dt.date) -> dict[str, int]:
    """Count effective states across the filtered set, not just its current page."""
    return qs.aggregate(
        active=Count("pk", filter=_status_q("active", today)),
        expired=Count("pk", filter=_status_q("expired", today)),
    )
