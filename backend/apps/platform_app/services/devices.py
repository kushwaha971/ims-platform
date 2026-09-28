"""PLT-09 — renaming and revoking devices (CR-013).

**What revocation reaches, and when.** A session is a refresh-token family.
Revoking it stops the next `/auth/refresh` (401 `session_revoked`), and with a
fifteen-minute access token that is where a device is thrown out. Two cases
are made immediate on top of that, each by a mechanism the product already
has rather than a new per-request read:

* **Log out everywhere** bumps `platform_user.token_epoch`, which the
  authentication class compares on every request — every access token the
  person holds dies at once, on every device, in every business.
* **A manager's revoke** bumps the member's `permissions_version` in this
  tenant, which `HasPermission` compares against the token's `ver` claim —
  the member's next request here answers `token_stale`, the client refreshes,
  and the refresh of a revoked family is refused. Their sessions in OTHER
  businesses are untouched (EC-5), because the membership row is per tenant.

Revoking ONE of your own other devices is the case left to the access token's
natural end (≤ 15 minutes): there is no per-session claim the server checks on
each request, and adding a session read to every authenticated request would
raise the query floor of every endpoint in the product. `CR-LOG` records it.
"""

from __future__ import annotations

from typing import Any

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation


class CurrentSession(BusinessRuleViolation):
    def __init__(self) -> None:
        super().__init__(
            "current_session",
            "This is the device you are using. Use Log out instead.",
        )


def _ctx(*, actor: Any, tenant: Any = None, request_id: str | None, ip: str | None) -> Ctx:
    return Ctx(tenant=tenant, actor=actor, actor_type="user", request_id=request_id or "", ip=ip)


def rename(
    *, session: Any, actor: Any, label: str, request_id: str | None = None, ip: str | None = None
) -> Any:
    """FR-7. Cosmetic, so audited without a snapshot (§16)."""
    session.device_label = label.strip()[:120]
    session.save(update_fields=["device_label", "updated_at"])
    write_audit(
        ctx=_ctx(actor=actor, request_id=request_id, ip=ip),
        action=AuditAction.SESSION_RENAMED,
        entity_type="platform_session",
        entity_id=session.id,
    )
    return session


def revoke_own(
    *,
    session: Any,
    actor: Any,
    current_session_id: Any,
    request_id: str | None = None,
    ip: str | None = None,
) -> int:
    """FR-2: revoke one family. The current device's family is refused 409.

    By family (BR-2), so an attacker holding an older, already-rotated refresh
    token of the same device is cut off along with the live one.
    """
    from apps.platform_app.models import Session

    current = (
        Session.objects.filter(pk=current_session_id).values_list("family_id", flat=True).first()
        if current_session_id
        else None
    )
    if str(session.id) == str(current_session_id) or (
        current is not None and current == session.family_id
    ):
        raise CurrentSession()
    with transaction.atomic():
        revoked = Session.objects.filter(
            family_id=session.family_id, revoked_at__isnull=True
        ).update(revoked_at=timezone.now())
        write_audit(
            ctx=_ctx(actor=actor, request_id=request_id, ip=ip),
            action=AuditAction.SESSION_REVOKED,
            entity_type="platform_session",
            entity_id=session.id,
            metadata={"by": "self", "family_id": str(session.family_id), "revoked": revoked},
        )
    return revoked


def revoke_member_sessions(*, membership: Any, ctx: Ctx) -> int:
    """FR-4: a manager logs a member out of THIS business on every device.

    The member stays a member (AC-2). Only sessions whose `tenant_id` is the
    current tenant are revoked (EC-5), and `permissions_version` is bumped so
    their access tokens here stop working on the next request rather than in
    fifteen minutes.
    """
    from apps.platform_app.models import Membership, Session

    with transaction.atomic():
        revoked = Session.objects.filter(
            user_id=membership.user_id, tenant_id=membership.tenant_id, revoked_at__isnull=True
        ).update(revoked_at=timezone.now())
        Membership.objects.filter(pk=membership.pk).update(
            permissions_version=F("permissions_version") + 1
        )
        write_audit(
            ctx=ctx,
            action=AuditAction.SESSION_REVOKED,
            entity_type="platform_membership",
            entity_id=membership.id,
            metadata={
                "by": "manager",
                "user_id": str(membership.user_id),
                "revoked": revoked,
            },
        )
    return revoked


def bump_token_epoch(*, user: Any) -> None:
    """Kill every access token this person holds, now (Part 21 §21.3.1 `token_epoch`)."""
    from apps.platform_app.models import User

    User.objects.filter(pk=user.pk).update(token_epoch=F("token_epoch") + 1)
