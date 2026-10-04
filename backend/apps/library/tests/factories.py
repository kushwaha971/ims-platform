"""Library rows for tests that need a member before B07's services exist (B10; the contract suite)."""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal
from typing import Any

from apps.common.context import Ctx
from apps.library.models import LibraryMembership, LibraryMembershipType


def member(tenant: Any, party: Any, *, status: str = "active") -> LibraryMembership:
    """The party's membership (one per party, ADR-046), created on first use."""
    existing = LibraryMembership.objects.filter(tenant=tenant, party=party).first()
    if existing is not None:
        return existing
    kind = LibraryMembershipType.objects.filter(tenant=tenant).first() or (
        LibraryMembershipType.objects.create(tenant=tenant, name=f"Type {uuid.uuid4().hex[:6]}")
    )
    number = f"M-{uuid.uuid4().hex[:6]}"
    return LibraryMembership.objects.create(
        tenant=tenant,
        party=party,
        member_number=number,
        member_number_sort=number.upper(),
        membership_type=kind,
        starts_on=dt.date(2026, 1, 1),
        status=status,
        closed_on=dt.date(2026, 2, 1) if status == "closed" else None,
    )


def charge(
    tenant: Any,
    membership: LibraryMembership,
    amount: str = "50.00",
    *,
    day: dt.date | None = None,
    kind: str = "overdue_fine",
) -> Any:
    """A posted charge, through the real service (its number, its ledger line)."""
    from django.db import transaction

    from apps.library.services.charges import create_charge
    from apps.parties.services.balance import lock_party

    with transaction.atomic():
        lock_party(tenant=tenant, party_id=membership.party_id)
        return create_charge(
            ctx=Ctx.system(tenant),
            membership=membership,
            kind=kind,
            amount=Decimal(amount),
            description=f"Fine {uuid.uuid4().hex[:4]}",
            charge_date=day,
        )


def loans_issued(tenant: Any, copy: Any, count: int, on: dt.date) -> None:
    """`count` returned loans of `copy` issued on `on`, in one insert (B13's loss ratio)."""
    from django.utils import timezone

    from apps.library.models import LibraryLoan
    from tests.factories.parties import PartyFactory

    membership = member(tenant, PartyFactory(tenant=tenant))
    moment = timezone.now()
    LibraryLoan.objects.bulk_create(
        LibraryLoan(
            tenant=tenant,
            copy=copy,
            membership=membership,
            party_id=membership.party_id,
            issued_on=on,
            issued_at=moment,
            due_on=on,
            returned_on=on,
            returned_at=moment,
            status="returned",
            loan_days=14,
            grace_days=0,
            max_renewals=1,
            fine_per_day=Decimal("2.00"),
        )
        for _ in range(count)
    )
