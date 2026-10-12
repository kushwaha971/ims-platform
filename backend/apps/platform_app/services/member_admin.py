"""Managing somebody ELSE's membership — edit, block, unblock, remove (owner, 12 Oct 2026).

`memberships.py` next door is the self-service half (switch, default, leave)
plus invitations; this is the manager's half, which PLT-05 promised and the
team screen never had. The owner asked for it in SaaS terms: an owner or admin
can correct a member's name and role, lock them out without losing them, let
them back in, and take them off the team.

── The standing rules, and why each exists ─────────────────────────────────

* **Only the owner or an admin acts here**, whatever codenames a custom role
  holds. The view checks `OwnerOrAdmin` and this module checks it again from
  the actor's own membership, because a rule about who may act on PEOPLE is not
  something a shop can delegate by ticking `platform.members.manage` on a
  custom role (`apps.common.permissions.MANAGER_ROLES`).
* **Nobody acts on themselves.** Blocking yourself is a lock-out with no key;
  changing your own role is either a no-op or an escalation. Leaving has its
  own honest endpoint (`DELETE /memberships/{id}`).
* **Nobody acts on the owner.** A business has exactly one and ownership is
  transferred, never edited away (canon §0.7).
* **An admin cannot act on another admin**, and cannot MAKE an admin. Two
  admins who can block each other is a race to lock the other out; the owner
  is the tiebreak, as `set_app_grants` already says for granting admin.

Every change bumps `permissions_version`, so a token minted before it answers
`token_stale` on its next request instead of living out its fifteen minutes.
Blocking and removing also revoke every refresh session the member holds IN
THIS BUSINESS — not their sessions elsewhere, which are another owner's call.
"""

from __future__ import annotations

from typing import Any

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.exceptions import (
    BusinessRuleViolation,
    NotFound,
    PermissionDenied,
    ValidationFailed,
)
from apps.common.permissions import is_owner_or_admin
from apps.platform_app.constants import MembershipStatus
from apps.platform_app.services import entitlements

OWNER = "owner"
ADMIN = "admin"


class SelfChangeForbidden(BusinessRuleViolation):
    """403 `self_change_forbidden` — the registered code for exactly this case."""

    def __init__(self) -> None:
        super().__init__(
            "self_change_forbidden",
            "You cannot change your own access here. Ask the owner, or leave the business.",
        )


def _actor_membership(*, tenant: Any, actor: Any) -> Any:
    from apps.platform_app.models import Membership

    if actor is None:
        return None
    return (
        Membership.objects.select_related("role")
        .filter(tenant=tenant, user=actor, status=MembershipStatus.ACTIVE)
        .first()
    )


def _locked_target(*, tenant: Any, membership_id: Any) -> Any:
    """The target row, locked, inside this tenant — 404 for anybody else's.

    `REMOVED` is a 404 too: a removed member is not on the team, and the only
    way back is to add them again (which is a seat decision, made on purpose).
    """
    from apps.platform_app.models import Membership

    target = (
        Membership.objects.select_related("role", "user", "tenant")
        .select_for_update(of=("self",))
        .filter(tenant=tenant, pk=membership_id)
        .exclude(status=MembershipStatus.REMOVED)
        .first()
    )
    if target is None:
        raise NotFound()
    return target


def _authorise(*, tenant: Any, actor: Any, target: Any) -> Any:
    """Apply the four standing rules; return the actor's membership."""
    actor_membership = _actor_membership(tenant=tenant, actor=actor)
    if not is_owner_or_admin(actor_membership):
        raise PermissionDenied("Only the owner or an admin can manage the team.")
    if target.user_id == actor.id:
        raise SelfChangeForbidden()
    if target.role.code == OWNER:
        raise PermissionDenied("Nobody can change the owner of the business.")
    if target.role.code == ADMIN and actor_membership.role.code != OWNER:
        raise PermissionDenied("Only the owner can change another admin.")
    return actor_membership


def _refuse_invited(target: Any) -> None:
    """An `invited` row is somebody who has not said yes yet.

    There is nothing to block and no profile of theirs this business may edit
    (`MemberReadSerializer.INVITED_REDACTED`); cancelling the invitation is the
    one act that applies, and it has its own endpoint.
    """
    if target.status == MembershipStatus.INVITED:
        raise ValidationFailed(
            {"membership": ["This person has not joined yet. Cancel the invitation instead."]}
        )


def _revoke_sessions_here(target: Any) -> int:
    from apps.platform_app.models import Session

    return Session.objects.filter(
        user_id=target.user_id, tenant_id=target.tenant_id, revoked_at__isnull=True
    ).update(revoked_at=timezone.now())


def _bump_version(target: Any) -> None:
    from apps.platform_app.models import Membership

    Membership.objects.filter(pk=target.pk).update(permissions_version=F("permissions_version") + 1)
    target.refresh_from_db(fields=["permissions_version"])


def _name_is_ours_to_edit(target: Any) -> bool:
    """May THIS business rename the person?

    `full_name` lives on `platform_user`, which is the person's identity across
    every business they work at. Usually the owner typed it when adding them
    (DEC-013) and nobody else has an opinion — but somebody who is also on
    another team, or who owns a business of their own, has a name another owner
    reads too, and one shop correcting a typo must not rename them everywhere.
    """
    from apps.platform_app.models import Membership

    return (
        not Membership.objects.filter(user_id=target.user_id)
        .exclude(tenant_id=target.tenant_id)
        .exclude(status=MembershipStatus.REMOVED)
        .exists()
    )


@transaction.atomic
def update_member(
    *,
    tenant: Any,
    membership_id: Any,
    actor: Any,
    ctx: Ctx,
    full_name: str | None = None,
    role_code: str | None = None,
) -> Any:
    """`PATCH /members/{id}` — the name and the role. Either may be omitted."""
    from apps.platform_app.selectors.memberships import role_by_code
    from apps.platform_app.services.memberships import role_assignment_error

    target = _locked_target(tenant=tenant, membership_id=membership_id)
    actor_membership = _authorise(tenant=tenant, actor=actor, target=target)
    _refuse_invited(target)

    before: dict[str, Any] = {}
    after: dict[str, Any] = {}

    if role_code is not None and role_code != target.role.code:
        role = role_by_code(tenant=tenant, code=role_code)
        if role is None:
            raise ValidationFailed({"role": ["That is not a role in this business."]})
        if role.code == OWNER:
            raise ValidationFailed({"role": ["Ownership is transferred, not assigned."]})
        if role.code == ADMIN and actor_membership.role.code != OWNER:
            raise ValidationFailed({"role": ["Only the owner makes someone an admin."]})
        refusal = role_assignment_error(tenant=tenant, role=role)
        if refusal:
            raise ValidationFailed({"role": [refusal]})
        before["role"], after["role"] = target.role.code, role.code
        target.role = role
        target.save(update_fields=["role", "updated_at"])

    name = (full_name or "").strip() if full_name is not None else None
    if name is not None and name != (target.user.full_name or ""):
        if not name:
            raise ValidationFailed({"full_name": ["Enter their name."]})
        if not _name_is_ours_to_edit(target):
            raise ValidationFailed(
                {
                    "full_name": [
                        "This person is on another team too, so only they can rename themselves."
                    ]
                }
            )
        before["full_name"], after["full_name"] = target.user.full_name, name
        target.user.full_name = name
        target.user.save(update_fields=["full_name", "updated_at"])

    if not after:
        return target  # nothing changed: no audit row, no stale tokens

    if "role" in after:
        # A role IS a permission set. The old token's `rol`/`ver` claims are
        # now false, and `token_stale` is how the client learns to refresh.
        _bump_version(target)
    write_audit(
        ctx=ctx,
        action=AuditAction.MEMBER_ROLE_CHANGED if "role" in after else AuditAction.MEMBER_UPDATED,
        entity_type="platform_membership",
        entity_id=target.id,
        before=before,
        after=after,
    )
    return target


@transaction.atomic
def block_member(*, tenant: Any, membership_id: Any, actor: Any, ctx: Ctx) -> Any:
    """`POST /members/{id}/block` — `suspended`, signed out everywhere here.

    Blocking rather than removing keeps the person on the team — their role,
    their app grants, their name on every entry they wrote — so unblocking is
    one tap and changes nothing else. A repeat is a no-op, not an error: the
    merchant who tapped twice on a slow link wanted exactly this state.
    """
    target = _locked_target(tenant=tenant, membership_id=membership_id)
    _authorise(tenant=tenant, actor=actor, target=target)
    _refuse_invited(target)
    if target.status == MembershipStatus.SUSPENDED:
        return target
    before = target.status
    target.status = MembershipStatus.SUSPENDED
    target.save(update_fields=["status", "updated_at"])
    revoked = _revoke_sessions_here(target)
    _bump_version(target)
    write_audit(
        ctx=ctx,
        action=AuditAction.MEMBER_BLOCKED,
        entity_type="platform_membership",
        entity_id=target.id,
        before={"status": before},
        after={"status": target.status},
        metadata={"sessions_revoked": revoked},
    )
    return target


@transaction.atomic
def unblock_member(*, tenant: Any, membership_id: Any, actor: Any, ctx: Ctx) -> Any:
    """`POST /members/{id}/unblock` — `active` again.

    A suspended membership holds no seat (`member_usage` counts active and
    invited), so letting somebody back in CONSUMES one, and is checked under
    the tenant lock exactly as accepting an invitation is (PLT-15 BR-7).
    """
    locked_tenant = entitlements.lock_tenant_for_write(tenant)
    target = _locked_target(tenant=locked_tenant, membership_id=membership_id)
    _authorise(tenant=locked_tenant, actor=actor, target=target)
    _refuse_invited(target)
    if target.status == MembershipStatus.ACTIVE:
        return target
    entitlements.assert_can_add_member(tenant=locked_tenant, adding=1, endpoint="members.unblock")
    target.status = MembershipStatus.ACTIVE
    target.save(update_fields=["status", "updated_at"])
    _bump_version(target)
    write_audit(
        ctx=ctx,
        action=AuditAction.MEMBER_UNBLOCKED,
        entity_type="platform_membership",
        entity_id=target.id,
        before={"status": MembershipStatus.SUSPENDED},
        after={"status": target.status},
    )
    return target


@transaction.atomic
def remove_member(*, tenant: Any, membership_id: Any, actor: Any, ctx: Ctx) -> Any:
    """`POST /members/{id}/remove` — off the team, the row kept for the record.

    `removed`, never deleted: the audit trail and every entry they posted still
    name them (`members_of`'s docstring). Their default business moves to
    another active one, as when somebody leaves (PLT-04 BR-3).
    """
    from apps.platform_app.services.memberships import _promote_default

    target = _locked_target(tenant=tenant, membership_id=membership_id)
    _authorise(tenant=tenant, actor=actor, target=target)
    _refuse_invited(target)
    before = target.status
    target.status = MembershipStatus.REMOVED
    target.is_default = False
    target.save(update_fields=["status", "is_default", "updated_at"])
    revoked = _revoke_sessions_here(target)
    _bump_version(target)
    _promote_default(user=target.user)
    write_audit(
        ctx=ctx,
        action=AuditAction.MEMBER_REMOVED,
        entity_type="platform_membership",
        entity_id=target.id,
        before={"status": before},
        after={"status": target.status},
        metadata={"sessions_revoked": revoked},
    )
    return target
