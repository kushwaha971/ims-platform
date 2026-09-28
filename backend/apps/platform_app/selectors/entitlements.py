"""Entitlement counters (PLT-15 §5, §20 — one indexed COUNT per hooked write).

Read-only, no transaction, tenant taken explicitly (rule D8).
"""

from __future__ import annotations

from typing import Any

from django.db.models import Count, Exists, IntegerField, OuterRef, Subquery
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.platform_app.models import Invitation, InvitationStatus, Membership, MembershipStatus

COUNTED_MEMBER_STATUSES = (MembershipStatus.ACTIVE, MembershipStatus.INVITED)


def count_members(*, tenant: Any, excluding_email: str | None = None) -> int:
    """`max_users` usage: every person holding or promised a seat (FR-3, PLT-05 FR-12).

    Two sources, counted once per person:

    * memberships with `status ∈ {active, invited}` — the literal FR-3 rule;
    * live invitations (`pending`, not past `expires_at`) addressed to somebody
      who has no such membership here.

    The second is not an embellishment. `platform_membership.user_id` is NOT
    NULL, so an `invited` membership can exist only for an address that already
    has an account; an invitation to somebody who has not signed up yet has no
    membership row to count. Counting memberships alone is what let an admin
    send ten invitations against three seats — `invite()`'s own docstring said
    that was refused, and it was not, because every one of the ten checked a
    count the previous nine had not moved (CR-LOG `CR-2026-09-23-B`).

    An invitation past its `expires_at` stops holding a seat even before any
    code has marked it `expired`: there is no scheduler yet (FR-11), and a seat
    held by a link that can no longer be used is a seat nobody can have. An
    `invited` membership is different — it is a row the owner can see on the
    team screen and revoke — so it counts until it is accepted or revoked.

    `excluding_email` is the "everybody else" count a conversion needs: when an
    invitation is accepted, or an owner creates the login for somebody already
    invited, the person's own promised seat must not be charged a second time.

    Uses `IX(tenant_id, status)` on both tables (Part 21 §21.3.1), and runs as
    ONE statement — two scalar subqueries on the tenant row — because `/auth/me`
    reads this on every cold load and its query budget has one slot for it
    (`tests/performance/test_query_budgets.py`).
    """
    if tenant is None:
        return 0
    from apps.platform_app.models import Tenant

    members = Membership.objects.filter(tenant=tenant, status__in=COUNTED_MEMBER_STATUSES)
    held = Membership.objects.filter(
        tenant=tenant, status__in=COUNTED_MEMBER_STATUSES, user__email=OuterRef("email")
    )
    invitations = Invitation.objects.filter(
        tenant=tenant, status=InvitationStatus.PENDING, expires_at__gt=timezone.now()
    ).exclude(Exists(held))
    if excluding_email:
        members = members.exclude(status=MembershipStatus.INVITED, user__email=excluding_email)
        invitations = invitations.exclude(email=excluding_email)

    member_count = members.order_by().values("tenant_id").annotate(n=Count("id")).values("n")
    invitation_count = (
        invitations.order_by()
        .values("tenant_id")
        .annotate(n=Count("email", distinct=True))
        .values("n")
    )
    row = (
        Tenant.objects.filter(pk=tenant.pk)
        .annotate(
            members=Coalesce(Subquery(member_count, output_field=IntegerField()), 0),
            promised=Coalesce(Subquery(invitation_count, output_field=IntegerField()), 0),
        )
        .values_list("members", "promised")
        .first()
    )
    return sum(row) if row else 0
