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
    happened. The `invited` membership the invitation created goes with it, so
    an expired link and a revoked one leave the team in the same state.

    **Idempotent for the person who accepted.** The token is single-use
    (BR-5), but "use" means *grant*: the same signed-in person presenting a
    token they already redeemed gets their membership back with 200, and
    nothing is written. The accept screen fires on mount, so a refresh, a
    remount or a retry after a lost response used to spend the link and then
    tell the new member "This invitation cannot be used" about a business they
    had just joined. Anybody else presenting it — and the same person after
    being suspended or removed — still gets 400: replay returns an ACTIVE
    membership or nothing, so it can never restore access.

    **An invitation never lifts a suspension.** A suspended member holding an
    old link is refused; reactivating is a manager's decision (FR-7), not
    something a URL in a chat thread can do.

    **An already-active member keeps their role.** A stale invitation closes
    as accepted, but the role on it was decided before whatever decision put
    them on the team since, and applying it would be a role change nobody made.
    """
    from apps.platform_app.models import Invitation, Membership
    from apps.platform_app.tokens import hash_token

    token_hash = hash_token(token)
    invitation = Invitation.objects.filter(token_hash=token_hash).first()
    if invitation is None:
        raise InvitationInvalid()
    if invitation.status == InvitationStatus.ACCEPTED:
        replay = _accepted_replay(invitation=invitation, user=user)
        if replay is not None:
            return replay
        raise InvitationInvalid()
    if invitation.status != InvitationStatus.PENDING:
        raise InvitationInvalid()
    if invitation.expires_at <= timezone.now():
        _expire(invitation)
        raise InvitationInvalid("This invitation has expired.")
    # DEC-010 / `CR-140`: the invitation names an *email address*, because that
    # is the identity the product issues. Matching on `mobile` made acceptance
    # unreachable for every account the sign-up screen can create, since none of
    # them has one.
    if not invitation.email or normalise_email_or_none(invitation.email) != (user.email or ""):
        raise InvitationInvalid("This invitation is not for your email address.")

    with transaction.atomic():
        locked_invitation = (
            Invitation.objects.select_for_update(of=("self",))
            .select_related("tenant", "role")
            .filter(token_hash=token_hash, status=InvitationStatus.PENDING)
            .first()
        )
        if locked_invitation is None:
            # Taken between the passes. If it was taken by THIS person (a
            # double-fired request), that is the replay case, not a failure.
            again = Invitation.objects.filter(token_hash=token_hash).first()
            if again is not None and again.status == InvitationStatus.ACCEPTED:
                replay = _accepted_replay(invitation=again, user=user)
                if replay is not None:
                    return replay
            raise InvitationInvalid()
        invitation = locked_invitation

        tenant = entitlements.lock_tenant_for_write(invitation.tenant)
        membership = (
            Membership.objects.select_for_update(of=("self",))
            .select_related("role")
            .filter(user=user, tenant=tenant)
            .first()
        )
        if membership is not None and membership.status == MembershipStatus.SUSPENDED:
            raise InvitationInvalid(
                "Your access to this business is suspended. Ask the owner to restore it."
            )
        already_active = membership is not None and membership.status == MembershipStatus.ACTIVE
        before_status = membership.status if membership is not None else None

        if not already_active:
            # "Everybody else, plus me": this person's own promised seat — the
            # `invited` row, or this very invitation when they had no account
            # at invite time — is already in the count and is being converted,
            # not bought a second time.
            entitlements.assert_can_add_member(
                tenant=tenant,
                adding=1,
                endpoint="invitations.accept",
                excluding_email=normalise_email_or_none(invitation.email),
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
        elif not already_active:
            membership.status = MembershipStatus.ACTIVE
            membership.role = invitation.role
            membership.joined_at = membership.joined_at or timezone.now()
            membership.is_default = not _has_default(user)
            membership.permissions_version += 1
            membership.save(
                update_fields=[
                    "status",
                    "role",
                    "joined_at",
                    "is_default",
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
            before={"status": before_status} if before_status else None,
            after={"status": membership.status, "role": membership.role.code},
            # The invitation's id, never its token: the raw token is not on the
            # row, and the hash is not something a reader of this log needs.
            metadata={"invitation_id": str(invitation.id)},
        )
    return membership


def _accepted_replay(*, invitation: Any, user: Any) -> Any:
    """The membership an already-accepted invitation gave THIS user, if still live.

    `None` for anybody else, and for the acceptor once they are no longer an
    active member — a replay returns what exists, it never re-creates it.
    """
    from apps.platform_app.models import Membership

    if invitation.accepted_user_id is None or invitation.accepted_user_id != user.id:
        return None
    return (
        Membership.objects.select_related("tenant", "role")
        .filter(user=user, tenant_id=invitation.tenant_id, status=MembershipStatus.ACTIVE)
        .first()
    )


def _expire(invitation: Any) -> None:
    """Mark a lapsed invitation `expired` and cancel the seat it was holding.

    Its own small transaction, committed before the caller raises — see
    `accept_invitation`.
    """
    from apps.platform_app.models import Invitation

    with transaction.atomic():
        changed = Invitation.objects.filter(
            pk=invitation.pk, status=InvitationStatus.PENDING
        ).update(status=InvitationStatus.EXPIRED, updated_at=timezone.now())
        if changed:
            _cancel_invited_membership(tenant_id=invitation.tenant_id, email=invitation.email)


def _cancel_invited_membership(*, tenant_id: Any, email: str) -> Any:
    """Close the `invited` membership an invitation opened, if nothing else holds it.

    PLT-05 FR-8: "Removing an `invited` membership revokes the invitation" —
    and the converse, which the FRD leaves implicit: revoking the invitation
    removes the membership, or the team screen goes on listing somebody who can
    no longer join and the seat stays spent. `removed` rather than deleted, per
    BR-7: a later invitation returns this same row to `invited`
    (`U(user_id, tenant_id)`).

    Left alone while another live invitation for the address exists (a resend
    supersedes by revoking the old row, and the new one still needs the seat).
    Only ever touches an `invited` row — an active member is never removed by
    anything that happens to an invitation.
    """
    from apps.platform_app.models import Invitation, Membership

    normalised = normalise_email_or_none(email)
    if not normalised:
        return None
    if Invitation.objects.filter(
        tenant_id=tenant_id, email=normalised, status=InvitationStatus.PENDING
    ).exists():
        return None
    membership = (
        Membership.objects.select_for_update(of=("self",))
        .filter(tenant_id=tenant_id, user__email=normalised, status=MembershipStatus.INVITED)
        .first()
    )
    if membership is None:
        return None
    membership.status = MembershipStatus.REMOVED
    membership.is_default = False
    membership.permissions_version += 1
    membership.save(update_fields=["status", "is_default", "permissions_version", "updated_at"])
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

    **An address that already has an account gets an `invited` membership**
    (FR-2, BR-7), so the business appears under "Invitations" in that person's
    own switcher (PLT-04 FR-1/FR-8) and on this team's list as Invited. It
    grants nothing: every door into a tenant — `tenancy`, `switch_tenant`,
    login's default, refresh, `permissions_for` — admits `active` only, and
    `accept_invitation` is the one thing that flips it. A removed member's row
    is reused (`U(user_id, tenant_id)`), which is BR-7's "returns to invited".
    An address with no account yet has no user to hang a membership on
    (`user_id` is NOT NULL); its invitation holds the seat on its own, and
    `count_members` counts it (PLT-05 FR-12).

    **A suspended member cannot be invited back** (§10: "no active|suspended
    membership"). Otherwise an invitation would be a second, unaudited way to
    lift a suspension.
    """
    import datetime as dt

    from django.conf import settings

    from apps.platform_app.models import Invitation, Membership, User
    from apps.platform_app.tokens import hash_token

    normalised = normalise_email_or_none(email)
    if not normalised:
        raise BusinessRuleViolation("validation_error", "An invitation needs an email address.")

    with transaction.atomic():
        locked = entitlements.lock_tenant_for_write(tenant)
        now = timezone.now()

        existing_member = (
            Membership.objects.select_for_update(of=("self",))
            .filter(user__email=normalised, tenant=locked)
            .first()
        )
        if existing_member and existing_member.status == MembershipStatus.ACTIVE:
            raise BusinessRuleViolation("validation_error", "That person is already on this team.")
        if existing_member and existing_member.status == MembershipStatus.SUSPENDED:
            raise BusinessRuleViolation(
                "validation_error",
                "That person is suspended from this business. Restore their access "
                "instead of inviting them again.",
            )

        # A seat already promised to this address — an `invited` membership, or
        # a live invitation (a resend) — is not bought a second time.
        superseded = Invitation.objects.select_for_update(of=("self",)).filter(
            tenant=locked, email=normalised, status=InvitationStatus.PENDING
        )
        holds_a_seat = (
            existing_member is not None and existing_member.status == MembershipStatus.INVITED
        ) or superseded.filter(expires_at__gt=now).exists()
        if not holds_a_seat:
            entitlements.assert_can_add_member(
                tenant=locked, adding=1, endpoint="invitations.create"
            )

        superseded_count = superseded.update(status=InvitationStatus.REVOKED, updated_at=now)

        raw_token = secrets.token_urlsafe(32)
        invitation = Invitation.objects.create(
            tenant=locked,
            email=normalised,
            mobile=mobile or None,
            role=role,
            token_hash=hash_token(raw_token),
            status=InvitationStatus.PENDING,
            expires_at=now + dt.timedelta(days=settings.UB_INVITATION_DAYS),
            invited_by=actor,
        )

        membership = None
        if existing_member is not None:
            # `invited` (a resend, perhaps with a new role) or `removed` (BR-7).
            existing_member.status = MembershipStatus.INVITED
            existing_member.role = role
            existing_member.is_default = False
            existing_member.joined_at = None  # stamped afresh on acceptance
            existing_member.permissions_version += 1
            existing_member.save(
                update_fields=[
                    "status",
                    "role",
                    "is_default",
                    "joined_at",
                    "permissions_version",
                    "updated_at",
                ]
            )
            membership = existing_member
        else:
            invitee = User.objects.filter(email=normalised).first()
            if invitee is not None:
                membership = Membership.objects.create(
                    user=invitee,
                    tenant=locked,
                    role=role,
                    status=MembershipStatus.INVITED,
                    is_default=False,
                    joined_at=None,
                )

        write_audit(
            ctx=ctx,
            action=AuditAction.MEMBER_INVITED,
            entity_type="invitation",
            entity_id=invitation.id,
            after={"email": normalised, "role": role.code, "expires_at": invitation.expires_at},
            # The raw token is deliberately NOT audited: an audit row a support
            # engineer can read is an audit row that hands them a live seat.
            metadata={
                "superseded": superseded_count,
                "membership_id": str(membership.id) if membership is not None else None,
            },
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
            # wanted it not to work, and it does not. An ACCEPTED invitation in
            # particular never reaches the membership below — revoking a link
            # somebody already used is not how a member is removed.
            return Invitation.objects.get(pk=invitation.pk)

        # FR-8's converse: the `invited` membership this invitation opened goes
        # with it, in the same transaction, so the seat frees and the person's
        # switcher stops listing a business they can no longer join.
        cancelled = _cancel_invited_membership(
            tenant_id=invitation.tenant_id, email=invitation.email
        )

        write_audit(
            ctx=ctx,
            action=AuditAction.MEMBER_INVITE_REVOKED,
            entity_type="invitation",
            entity_id=invitation.pk,
            before={"status": InvitationStatus.PENDING},
            after={"status": InvitationStatus.REVOKED},
            metadata={"membership_id": str(cancelled.id) if cancelled is not None else None},
        )
    return Invitation.objects.get(pk=invitation.pk)


# ── A13 ── module roles (ADR-052, FRD 00 PLT-X12) ────────────────────────────


def role_module(role: Any) -> str | None:
    """The vertical a system role belongs to, or None for canon and custom roles."""
    from apps.common.permissions_registry import module_role

    if role is None or not getattr(role, "is_system", False):
        return None
    spec = module_role(role.code)
    return spec.module if spec is not None else None


def role_label_id(role: Any) -> str:
    """The catalogue key a role is named with: `tenant.role.<code>` for the
    canon four (and custom roles), the registered `label_id` for a module role."""
    from apps.common.permissions_registry import module_role

    spec = module_role(role.code) if getattr(role, "is_system", False) else None
    return spec.label_id if spec is not None else f"tenant.role.{role.code}"


def role_assignment_error(*, tenant: Any, role: Any) -> str | None:
    """Why `role` may not be given to a member of `tenant` right now, or None.

    A module role is assignable only while its module is effective (FRD §6):
    the team screen never offers it otherwise, and a hand-made request is
    refused with the same words. A system role code that is neither canon nor
    registered (its module's app is gone) is refused too — it would grant
    nothing, and a member who can do nothing is a support call.
    """
    from apps.common.permissions_registry import ROLE_PERMISSIONS, module_role

    if role is None or not role.is_system or role.code in ROLE_PERMISSIONS:
        return None
    spec = module_role(role.code)
    if spec is None or spec.module not in entitlements.effective_modules(tenant):
        return "This role belongs to a feature that is off."
    return None


def roles_payload(tenant: Any) -> list[dict]:
    """`GET /roles` — the canon four, then the module roles of effective modules.

    `label_id` is the catalogue key the client draws the name with: canon roles
    use the existing `tenant.role.<code>`, module roles their registered label
    (and, by convention, `<label_id>.caption` for "what this role cannot see").
    `assignable` is false for `owner`, which is transferred, never granted.
    """
    from apps.common.constants import RoleCode
    from apps.common.permissions_registry import module_roles

    rows: list[dict] = [
        {
            "code": code.value,
            "module": None,
            "label_id": f"tenant.role.{code.value}",
            "assignable": code != RoleCode.OWNER,
            "is_module_role": False,
        }
        for code in RoleCode
    ]
    effective = entitlements.effective_modules(tenant)
    rows.extend(
        {
            "code": spec.code,
            "module": spec.module,
            "label_id": spec.label_id,
            "assignable": True,
            "is_module_role": True,
        }
        for spec in module_roles()
        if spec.module in effective
    )
    return rows


def module_role_migration(code: str, *, name: str, codenames: Any) -> tuple[Any, Any]:
    """`(forwards, backwards)` for a vertical's data migration writing its role row.

    Usage in `apps/<vertical>/migrations/00NN_role.py`::

        forwards, backwards = module_role_migration(
            "gym_trainer", name="Trainer", codenames=GYM_TRAINER_CODENAMES
        )
        operations = [migrations.RunPython(forwards, backwards)]

    Upserts by `code` where `tenant IS NULL` (idempotent), writes the codename
    set so `GET /roles` and the drift test agree with the registry, and the
    reverse deletes the row only while no membership uses it (RESTRICT would
    refuse anyway; this says why). `apps.get_model` only, never a model import.
    """
    permissions = sorted(codenames)

    def forwards(apps: Any, schema_editor: Any) -> None:
        Role = apps.get_model("platform", "Role")
        Role.objects.update_or_create(
            tenant=None,
            code=code,
            defaults={"name": name, "is_system": True, "permissions": permissions},
        )

    def backwards(apps: Any, schema_editor: Any) -> None:
        Role = apps.get_model("platform", "Role")
        Membership = apps.get_model("platform", "Membership")
        if Membership.objects.filter(role__tenant=None, role__code=code).exists():
            raise RuntimeError(f"Role {code!r} is still held by a member; reassign them first.")
        Role.objects.filter(tenant=None, code=code).delete()

    return forwards, backwards
