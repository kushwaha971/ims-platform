"""Switching, defaulting, leaving and accepting (PLT-04, PLT-05 FR-10, PLT-15 FR-3).

The tenant a request runs in comes from the `tid` claim and from nowhere else.
`X-Tenant-Id` is never read (canon §22.1, PLT-04 BR-1), so the only way to
change business is to get a new token — which is what `switch_tenant` mints.
"""

from __future__ import annotations

import secrets
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation, PermissionDenied
from apps.platform_app.constants import InvitationStatus, MembershipStatus, TenantStatus
from apps.platform_app.selectors.memberships import active_membership, owner_count
from apps.platform_app.services import entitlements, sessions


class LastOwner(BusinessRuleViolation):
    """409 — PLT-04 FR-7: a business is never left without an owner."""

    def __init__(self) -> None:
        super().__init__("last_owner", "You are the only owner. Make somebody else an owner first.")


class InvitationInvalid(BusinessRuleViolation):
    """400 — PLT-05 §10: expired, revoked, already used, or not for this mobile."""

    def __init__(self, message: str = "This invitation is not valid.") -> None:
        super().__init__("invitation_invalid", message)


def switch_tenant(
    *,
    user: Any,
    tenant_id: Any,
    current_claims: dict | None = None,
    device_label: str | None = None,
    user_agent: str | None = None,
    ip: str | None = None,
    request_id: str | None = None,
) -> tuple[Any, Any]:
    """`POST /auth/switch-tenant` (FR-2). Returns `(membership, IssuedTokens)`.

    403 `permission_denied` — not 404 — when the caller has no **active**
    membership, because §10 is explicit that the resource being addressed is the
    caller's own membership list, and a 404 there would be a lie about a list
    the caller owns. A suspended membership is the same answer as no membership.

    BR-2 settles the family question against the obvious answer: the new session
    is a **new family**, and the old session is revoked, so no refresh chain can
    ever carry two tenants over its lifetime.
    """
    membership = active_membership(user=user, tenant_id=tenant_id)
    if membership is None or membership.tenant.status == TenantStatus.DELETED:
        raise PermissionDenied("You do not have access to this business.")

    previous = sessions.session_for_claims(user=user, claims=current_claims or {})

    with transaction.atomic():
        issued = sessions.issue(
            user=user,
            tenant=membership.tenant,
            membership=membership,
            device_label=device_label or (previous.device_label if previous else None),
            user_agent=user_agent,
            ip=ip,
        )
        if previous is not None:
            sessions.revoke(session=previous)
        write_audit(
            ctx=Ctx(
                tenant=membership.tenant,
                actor=user,
                actor_type="user",
                request_id=request_id or "",
                ip=ip,
                user_agent=user_agent,
            ),
            action=AuditAction.TENANT_SWITCHED,
            entity_type="platform_tenant",
            entity_id=membership.tenant_id,
            metadata={
                "from_tenant_id": (
                    str(previous.tenant_id) if previous is not None and previous.tenant_id else None
                ),
                "from_session_id": str(previous.id) if previous is not None else None,
                "to_session_id": str(issued.session.id),
            },
        )
    return membership, issued


def set_default(*, user: Any, membership: Any, request_id: str | None = None) -> Any:
    """FR-5 / BR-3: exactly one `is_default=true` membership per user.

    The server clears the others rather than trusting the client to send two
    requests; two defaults is a state no code reads correctly.
    """
    from apps.platform_app.models import Membership

    if membership.user_id != user.id:
        raise PermissionDenied("You may only change your own membership.")
    if membership.status != MembershipStatus.ACTIVE:
        raise PermissionDenied("You are not an active member of this business.")

    with transaction.atomic():
        Membership.objects.filter(user=user, is_default=True).exclude(pk=membership.pk).update(
            is_default=False
        )
        if not membership.is_default:
            membership.is_default = True
            membership.save(update_fields=["is_default", "updated_at"])
        write_audit(
            ctx=Ctx(
                tenant=membership.tenant,
                actor=user,
                actor_type="user",
                request_id=request_id or "",
            ),
            action=AuditAction.MEMBER_DEFAULT_CHANGED,
            entity_type="platform_membership",
            entity_id=membership.id,
            after={"is_default": True},
        )
    return membership


def leave(
    *, user: Any, membership: Any, request_id: str | None = None, ip: str | None = None
) -> Any:
    """FR-7: `DELETE /memberships/{id}` on self → `removed`. 409 for the last owner.

    Every session bound to that tenant is revoked in the same transaction: a
    membership that no longer exists must not survive in a token for fifteen
    minutes (Part 27 §27.4.3).
    """
    from apps.platform_app.models import Membership, Session

    if membership.user_id != user.id:
        raise PermissionDenied("You may only leave a business yourself.")
    if membership.status != MembershipStatus.ACTIVE:
        raise PermissionDenied("You are not an active member of this business.")
    if membership.role.code == "owner" and owner_count(tenant=membership.tenant) <= 1:
        raise LastOwner()

    with transaction.atomic():
        before_status = membership.status
        membership.status = MembershipStatus.REMOVED
        membership.is_default = False
        membership.permissions_version += 1
        membership.save(update_fields=["status", "is_default", "permissions_version", "updated_at"])
        revoked = Session.objects.filter(
            user=user, tenant=membership.tenant, revoked_at__isnull=True
        ).update(revoked_at=timezone.now())
        _promote_default(user=user)
        write_audit(
            ctx=Ctx(
                tenant=membership.tenant,
                actor=user,
                actor_type="user",
                request_id=request_id or "",
                ip=ip,
            ),
            action=AuditAction.MEMBER_LEFT,
            entity_type="platform_membership",
            entity_id=membership.id,
            before={"status": before_status},
            after={"status": membership.status},
            metadata={"sessions_revoked": revoked},
        )
        _ = Membership  # keeps the import honest for readers of the query above
    return membership


def normalise_email_or_none(raw: Any) -> str:
    """Lower-case and strip an address for comparison; `""` when it is not one.

    Invitation rows predate `DEC-010` and a legacy row may carry no address at
    all; `""` never equals a real `platform_user.email`, so such a row is
    refused rather than matched by accident.
    """
    from apps.platform_app.email import InvalidEmail, normalise_email

    try:
        return normalise_email(raw)
    except InvalidEmail:
        return ""


def accept_invitation(
    *,
    user: Any,
    token: str,
    request_id: str | None = None,
    ip: str | None = None,
) -> Any:
    """`POST /invitations/{token}/accept` (PLT-05 FR-10) — the seat-consuming path.

    PLT-15 FR-3 names invitation accept as one of the three `max_users`
    enforcement points, which is why it lives in Sprint 1 alongside `PLT-04`
    FR-8 rather than waiting for the rest of `PLT-05`. The tenant row is locked
    for the duration (PLT-15 BR-7, EC-1) so two invitees cannot both take the
    last seat.

    Expiry is handled in its own pass, before the work transaction opens:
    PLT-05 FR-11 wants the row marked `expired`, and a status change written
    inside the transaction that then raises is a status change that never
    happened.
    """
    from apps.platform_app.models import Invitation, Membership
    from apps.platform_app.tokens import hash_token

    token_hash = hash_token(token)
    invitation = Invitation.objects.filter(token_hash=token_hash).first()
    if invitation is None or invitation.status != InvitationStatus.PENDING:
        raise InvitationInvalid()
    if invitation.expires_at <= timezone.now():
        Invitation.objects.filter(pk=invitation.pk, status=InvitationStatus.PENDING).update(
            status=InvitationStatus.EXPIRED, updated_at=timezone.now()
        )
        raise InvitationInvalid("This invitation has expired.")
    # DEC-010 / `CR-140`: the invitation names an *email address*, because that
    # is the identity the product issues. Matching on `mobile` made acceptance
    # unreachable for every account the sign-up screen can create, since none of
    # them has one.
    if not invitation.email or normalise_email_or_none(invitation.email) != (user.email or ""):
        raise InvitationInvalid("This invitation is not for your email address.")

    with transaction.atomic():
        invitation = (
            Invitation.objects.select_for_update(of=("self",))
            .select_related("tenant", "role")
            .filter(token_hash=token_hash, status=InvitationStatus.PENDING)
            .first()
        )
        if invitation is None:  # taken by a concurrent accept between the passes
            raise InvitationInvalid()

        tenant = entitlements.lock_tenant_for_write(invitation.tenant)
        membership = Membership.objects.filter(user=user, tenant=tenant).first()
        if membership is None or membership.status != MembershipStatus.ACTIVE:
            # An `invited` row already counts toward `max_users`; only a seat
            # that does not yet exist has to be bought.
            adding = 0 if (membership and membership.status == MembershipStatus.INVITED) else 1
            entitlements.assert_can_add_member(
                tenant=tenant, adding=adding, endpoint="invitations.accept"
            )

        if membership is None:
            membership = Membership.objects.create(
                user=user,
                tenant=tenant,
                role=invitation.role,
                status=MembershipStatus.ACTIVE,
                joined_at=timezone.now(),
                is_default=not _has_default(user),
            )
        else:
            membership.status = MembershipStatus.ACTIVE
            membership.role = invitation.role
            membership.joined_at = membership.joined_at or timezone.now()
            membership.permissions_version += 1
            membership.save(
                update_fields=[
                    "status",
                    "role",
                    "joined_at",
                    "permissions_version",
                    "updated_at",
                ]
            )

        invitation.status = InvitationStatus.ACCEPTED
        invitation.accepted_user = user
        invitation.save(update_fields=["status", "accepted_user", "updated_at"])

        write_audit(
            ctx=Ctx(
                tenant=tenant,
                actor=user,
                actor_type="user",
                request_id=request_id or "",
                ip=ip,
            ),
            action=AuditAction.MEMBER_ACCEPTED,
            entity_type="platform_membership",
            entity_id=membership.id,
            after={"status": membership.status, "role": membership.role.code},
            metadata={"invitation_id": str(invitation.id)},
        )
    return membership


def activate_membership(*, membership: Any, actor: Any, request_id: str | None = None) -> Any:
    """`PATCH /memberships/{id} {status: active}` — the third `max_users` gate.

    The membership-management endpoint itself is `PLT-05`; this service is the
    seat check that endpoint must call, and it is exercised here so the gate
    exists and is tested before the endpoint that uses it lands.
    """
    with transaction.atomic():
        tenant = entitlements.lock_tenant_for_write(membership.tenant)
        if membership.status != MembershipStatus.ACTIVE:
            entitlements.assert_can_add_member(
                tenant=tenant, adding=1, endpoint="memberships.activate"
            )
            membership.status = MembershipStatus.ACTIVE
            membership.joined_at = membership.joined_at or timezone.now()
            membership.permissions_version += 1
            membership.save(
                update_fields=["status", "joined_at", "permissions_version", "updated_at"]
            )
            write_audit(
                ctx=Ctx(
                    tenant=tenant,
                    actor=actor,
                    actor_type="user",
                    request_id=request_id or "",
                ),
                action=AuditAction.MEMBER_ROLE_CHANGED,
                entity_type="platform_membership",
                entity_id=membership.id,
                after={"status": membership.status},
            )
    return membership


def _has_default(user: Any) -> bool:
    from apps.platform_app.models import Membership

    return Membership.objects.filter(
        user=user, is_default=True, status=MembershipStatus.ACTIVE
    ).exists()


def _promote_default(*, user: Any) -> None:
    """BR-3: when the default goes away, it moves to the oldest active membership."""
    from apps.platform_app.models import Membership

    if _has_default(user):
        return
    replacement = (
        Membership.objects.filter(user=user, status=MembershipStatus.ACTIVE)
        .order_by("created_at", "id")
        .first()
    )
    if replacement is not None:
        replacement.is_default = True
        replacement.save(update_fields=["is_default", "updated_at"])


def invite(
    *,
    tenant: Any,
    role: Any,
    email: str,
    actor: Any,
    ctx: Ctx,
    mobile: str | None = None,
) -> tuple[Any, str]:
    """`POST /invitations` (PLT-05 FR-9) — the half that did not exist.

    `accept_invitation` above has been here since Sprint 1, and nothing could
    ever create the row it accepts: there was no service, no endpoint, and no
    caller. The lifecycle was modelled correctly — `pending / accepted / expired
    / revoked`, a hashed token, an expiry, `invited_by` — and then had no way in.

    Returns the invitation AND the raw token, in that order and exactly once.
    Only the sha256 is stored (`token_hash`, like every other token in this
    product), so this return value is the only moment the raw token exists; if
    the caller drops it, the invitation can only be revoked and reissued. That is
    the intended property, not an inconvenience.

    **Seats are checked here as well as on accept.** `assert_can_add_member`
    already runs on accept, which is the moment a seat is truly consumed, but
    checking only there means an admin can send ten invitations against three
    seats and seven people discover the problem when they click the link. The
    tenant is locked for the check (PLT-15 BR-7) so two admins cannot both spend
    the last seat.

    **Re-inviting the same address replaces rather than duplicates.** Two live
    invitations for one email would both be acceptable, and whichever arrived
    second would look to the recipient like the only one — so the earlier row is
    revoked in the same transaction. This is also how a genuine resend works:
    the admin sends again, the old link stops working, the new one is the only
    one that does.
    """
    import datetime as dt

    from django.conf import settings

    from apps.platform_app.models import Invitation, Membership
    from apps.platform_app.tokens import hash_token

    normalised = normalise_email_or_none(email)
    if not normalised:
        raise BusinessRuleViolation("validation_error", "An invitation needs an email address.")

    with transaction.atomic():
        locked = entitlements.lock_tenant_for_write(tenant)

        existing_member = Membership.objects.filter(user__email=normalised, tenant=locked).first()
        if existing_member and existing_member.status == MembershipStatus.ACTIVE:
            raise BusinessRuleViolation("validation_error", "That person is already on this team.")

        # An `invited` membership or a pending invitation already holds a seat,
        # so only a genuinely new person has to buy one.
        superseded = Invitation.objects.select_for_update(of=("self",)).filter(
            tenant=locked, email=normalised, status=InvitationStatus.PENDING
        )
        holds_a_seat = bool(existing_member) or superseded.exists()
        if not holds_a_seat:
            entitlements.assert_can_add_member(tenant=locked, adding=1)

        superseded_count = superseded.update(
            status=InvitationStatus.REVOKED, updated_at=timezone.now()
        )

        raw_token = secrets.token_urlsafe(32)
        invitation = Invitation.objects.create(
            tenant=locked,
            email=normalised,
            mobile=mobile or None,
            role=role,
            token_hash=hash_token(raw_token),
            status=InvitationStatus.PENDING,
            expires_at=timezone.now() + dt.timedelta(days=settings.UB_INVITATION_DAYS),
            invited_by=actor,
        )

        write_audit(
            ctx=ctx,
            action=AuditAction.MEMBER_INVITED,
            entity_type="invitation",
            entity_id=invitation.id,
            after={"email": normalised, "role": role.code, "expires_at": invitation.expires_at},
            # The raw token is deliberately NOT audited: an audit row a support
            # engineer can read is an audit row that hands them a live seat.
            metadata={"superseded": superseded_count},
        )

    return invitation, raw_token


def revoke_invitation(*, invitation: Any, ctx: Ctx) -> Any:
    """Stop a pending invitation working, without deleting the history of it.

    Revoked rather than removed: "who invited this person, and what happened to
    it" is exactly the question an audit answers, and a deleted row answers
    nothing. `accept_invitation` already refuses anything whose status is not
    `pending`, so revoking is sufficient to close the link.
    """
    from apps.platform_app.models import Invitation

    with transaction.atomic():
        changed = Invitation.objects.filter(
            pk=invitation.pk, status=InvitationStatus.PENDING
        ).update(status=InvitationStatus.REVOKED, updated_at=timezone.now())
        if not changed:
            # Already accepted, expired or revoked. Not an error: the caller
            # wanted it not to work, and it does not.
            return Invitation.objects.get(pk=invitation.pk)

        write_audit(
            ctx=ctx,
            action=AuditAction.MEMBER_INVITE_REVOKED,
            entity_type="invitation",
            entity_id=invitation.pk,
            before={"status": InvitationStatus.PENDING},
            after={"status": InvitationStatus.REVOKED},
        )
    return Invitation.objects.get(pk=invitation.pk)
