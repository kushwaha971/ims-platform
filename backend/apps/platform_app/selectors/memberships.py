"""Membership and session reads (PLT-04, Part 26 §26.5).

Every selector here takes the user or the tenant explicitly and scopes on it
first, so a `None` argument yields the empty set rather than every row
(canon §0.11 rule 2). No writes, no transactions (rule D8).
"""

from __future__ import annotations

from typing import Any

from django.db.models import QuerySet

from apps.platform_app.models import Membership, MembershipStatus, Session, Tenant, TenantStatus

# PLT-04 FR-1: the switcher lists `active` and `invited` memberships, and nothing
# else. A `suspended` or `removed` membership is not a business the user has.
SWITCHER_STATUSES = (MembershipStatus.ACTIVE, MembershipStatus.INVITED)


def memberships_of(*, user: Any, statuses: tuple[str, ...] = SWITCHER_STATUSES) -> QuerySet:
    """The user's businesses, newest default first, for `tenants[]` on `/auth/me`."""
    if user is None or not getattr(user, "is_authenticated", False):
        return Membership.objects.none()
    return (
        Membership.objects.select_related("tenant", "role")
        .filter(user=user, status__in=statuses)
        .exclude(tenant__status=TenantStatus.DELETED)
        .order_by("-is_default", "created_at", "id")
    )


def active_membership(*, user: Any, tenant_id: Any) -> Membership | None:
    """The caller's live membership in one tenant, or `None`.

    `None` is what `POST /auth/switch-tenant` turns into 403 `permission_denied`
    (PLT-04 §10: the resource is the caller's own membership list, so a 404
    would be a lie about a list the caller owns).
    """
    if user is None or not tenant_id:
        return None
    return (
        Membership.objects.select_related("tenant", "tenant__plan", "tenant__partner", "role")
        .filter(user=user, tenant_id=tenant_id, status=MembershipStatus.ACTIVE)
        .first()
    )


def membership_of_user(*, user: Any, membership_id: Any) -> Membership | None:
    """One of the caller's own memberships, by id. Never another user's."""
    if user is None or not membership_id:
        return None
    return (
        Membership.objects.select_related("tenant", "role")
        .filter(user=user, pk=membership_id)
        .first()
    )


def default_membership(*, user: Any) -> Membership | None:
    """PLT-04 FR-9: the tenant login opens.

    Exactly one active membership → that one. Several with a default → the
    default. Several without → `None`, and the client shows the chooser.
    """
    active = list(
        Membership.objects.select_related("tenant", "role")
        .filter(user=user, status=MembershipStatus.ACTIVE)
        .exclude(tenant__status=TenantStatus.DELETED)
        .order_by("created_at", "id")
    )
    if not active:
        return None
    flagged = [m for m in active if m.is_default]
    if flagged:
        return flagged[0]
    if len(active) == 1:
        return active[0]
    return None


def owner_count(*, tenant: Any) -> int:
    """Live owners of a tenant — PLT-04 FR-7's `last_owner` guard."""
    return Membership.objects.filter(
        tenant=tenant, status=MembershipStatus.ACTIVE, role__code="owner"
    ).count()


def live_sessions_of(*, user: Any) -> QuerySet:
    """Part 27 §27.4.3: `/auth/me` shows the merchant "3 devices"."""
    if user is None:
        return Session.objects.none()
    return Session.objects.filter(user=user, revoked_at__isnull=True).order_by("-created_at", "-id")


def tenant_by_id(*, tenant_id: Any) -> Tenant | None:
    return Tenant.objects.select_related("plan", "partner").filter(pk=tenant_id).first()
