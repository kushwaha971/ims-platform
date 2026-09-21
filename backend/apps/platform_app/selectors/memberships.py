"""Membership and session reads (PLT-04, Part 26 §26.5).

Every selector here takes the user or the tenant explicitly and scopes on it
first, so a `None` argument yields the empty set rather than every row
(canon §0.11 rule 2). No writes, no transactions (rule D8).
"""

from __future__ import annotations

from typing import Any

from django.db.models import F, Q, QuerySet

from apps.platform_app.models import (
    Invitation,
    InvitationStatus,
    Membership,
    MembershipStatus,
    Role,
    Session,
    Tenant,
    TenantStatus,
)

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


def invitations_of(*, tenant: Any, status: str | None = InvitationStatus.PENDING) -> QuerySet:
    """`GET /invitations` — one tenant's invitations, newest first.

    `status=None` means every status; the endpoint's default is `pending`,
    because "who is still waiting" is the question the team screen asks and a
    tenant that has invited the same person four times should not have to read
    past three revoked rows to see the live one.

    Scoped on the tenant first, so a `None` tenant yields nothing rather than
    every business's invitations (canon §0.11 rule 2).
    """
    if tenant is None:
        return Invitation.objects.none()
    queryset = Invitation.objects.select_related("role", "invited_by").filter(tenant=tenant)
    if status is not None:
        queryset = queryset.filter(status=status)
    return queryset.order_by("-created_at", "-id")


def invitation_of_tenant(*, tenant: Any, invitation_id: Any) -> Invitation | None:
    """One invitation of this tenant, by id. Never another tenant's.

    The id is matched *inside* the tenant filter rather than fetched and then
    compared, so a cross-tenant id is indistinguishable from an id that does not
    exist — which is what lets the endpoint answer 404 and not 403 (canon §0.11
    rule 2). A 403 would confirm the row exists.
    """
    if tenant is None or not invitation_id:
        return None
    return (
        Invitation.objects.select_related("role", "invited_by")
        .filter(tenant=tenant, pk=invitation_id)
        .first()
    )


def role_by_code(*, tenant: Any, code: Any) -> Role | None:
    """Resolve a role *code* to the row it names for this tenant, or `None`.

    The wire carries `"staff"`; every service takes a `Role`. Custom roles are
    P3 but the column already allows them, so a tenant's own role of that code
    wins over the system role of the same code — `uq_role_tenant_code` and
    `uq_role_system_code` together guarantee at most one of each, so the
    ordering below is total rather than a tie-break on a UUID.

    `None` rather than an exception: the caller turns an unknown code into a
    `validation_error` on the `role` field, which is what a typo in a client is.
    A `Role.DoesNotExist` escaping a view is a 500 for a bad request body.
    """
    if tenant is None or not code or not isinstance(code, str):
        return None
    return (
        Role.objects.filter(code=code)
        .filter(Q(tenant=tenant) | Q(tenant__isnull=True))
        .order_by(F("tenant_id").desc(nulls_last=True))
        .first()
    )
