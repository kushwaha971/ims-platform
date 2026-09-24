"""PLT-14 FR-5/FR-6 — consented support access and impersonation.

The flow, and the one rule it exists for — **an operator can never enter a
business without an owner of that business having said yes, recently**:

1. An operator asks, with a reason (`request_access`). Owners are notified.
2. An owner allows or denies (`allow` / `deny`). Allowing makes the request's id
   a consent token valid for 24 h; an owner may revoke it early (`revoke`).
3. The operator presents that id (`start`). A sixty-minute support token is
   minted; only the sha256 of its `jti` is stored. The owner is told.
4. Every request carrying that token is re-checked against the database
   (`resolve`): the session must be live, the consent still granted and
   unexpired, and the jti must match. Ending, revoking or expiring any of them
   cuts the token immediately.
5. Every audit row written under the token says `actor_type='super_admin'` and
   `metadata.impersonation=true` (`Ctx.from_request`), and those rows live in
   the tenant's own activity log, where the owner can read them.

Every operator action here writes an audit row with `actor_type='super_admin'`.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.common.audit import write_audit
from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation, NotFound, PermissionDenied
from apps.platform_app import tokens
from apps.platform_app.constants import TenantStatus
from apps.platform_app.models.support import SupportAccessStatus

CONSENT_TTL = dt.timedelta(hours=24)
SESSION_TTL = dt.timedelta(minutes=60)

LIVE = (SupportAccessStatus.REQUESTED, SupportAccessStatus.GRANTED)


def admin_ctx(*, admin: Any, tenant: Any, meta: dict | None = None) -> Ctx:
    """The context an operator acts in: their own identity, the target tenant."""
    meta = meta or {}
    return Ctx(
        tenant=tenant,
        actor=admin,
        actor_type="super_admin",
        request_id=meta.get("request_id") or Ctx.system(tenant).request_id,
        ip=meta.get("ip"),
        user_agent=meta.get("user_agent"),
    )


def refresh_status(access: Any, *, now: dt.datetime | None = None) -> Any:
    """Lapse a request or consent whose 24 h have passed. Idempotent."""
    now = now or timezone.now()
    if access.status in LIVE and access.expires_at <= now:
        type(access).objects.filter(pk=access.pk, status=access.status).update(
            status=SupportAccessStatus.EXPIRED, updated_at=now
        )
        access.status = SupportAccessStatus.EXPIRED
    return access


def request_access(*, admin: Any, tenant: Any, reason: str, meta: dict | None = None) -> Any:
    from apps.platform_app.models import SupportAccess

    with transaction.atomic():
        for existing in SupportAccess.objects.select_for_update().filter(
            tenant=tenant, status__in=LIVE
        ):
            if refresh_status(existing).status in LIVE:
                raise BusinessRuleViolation(
                    "precondition_failed",
                    "There is already an open access request for this business.",
                    details={"access_id": str(existing.id), "status": existing.status},
                )
        access = SupportAccess.objects.create(
            tenant=tenant,
            requested_by=admin,
            reason=reason,
            expires_at=timezone.now() + CONSENT_TTL,
        )
        write_audit(
            ctx=admin_ctx(admin=admin, tenant=tenant, meta=meta),
            action="admin.access_requested",
            entity_type="platform_support_access",
            entity_id=access.id,
            metadata={"reason": reason},
        )
        _notify(tenant, "support_access_request", {"admin": admin.full_name, "reason": reason})
    return access


def accesses_for(tenant: Any, *, limit: int = 10) -> list[Any]:
    from apps.platform_app.models import SupportAccess

    rows = list(
        SupportAccess.objects.filter(tenant=tenant)
        .select_related("requested_by", "decided_by")
        .order_by("-created_at")[:limit]
    )
    return [refresh_status(row) for row in rows]


def _owned(ctx: Ctx, access_id: Any) -> Any:
    from apps.platform_app.models import SupportAccess

    access = (
        SupportAccess.objects.select_for_update().filter(pk=access_id, tenant=ctx.tenant).first()
    )
    if access is None:
        raise NotFound("No such access request.")
    return refresh_status(access)


def allow(*, ctx: Ctx, access_id: Any) -> Any:
    """The owner's consent. The id of this row IS the consent token (FR-5)."""
    with transaction.atomic():
        access = _owned(ctx, access_id)
        if access.status != SupportAccessStatus.REQUESTED:
            raise BusinessRuleViolation(
                "precondition_failed", "This request is no longer waiting for an answer."
            )
        now = timezone.now()
        access.status = SupportAccessStatus.GRANTED
        access.decided_by = ctx.actor
        access.decided_at = now
        access.expires_at = now + CONSENT_TTL
        access.save(
            update_fields=["status", "decided_by", "decided_at", "expires_at", "updated_at"]
        )
        write_audit(
            ctx=ctx,
            action="tenant.support_access_granted",
            entity_type="platform_support_access",
            entity_id=access.id,
            metadata={"consent_id": str(access.id), "expires_at": access.expires_at.isoformat()},
        )
    return access


def deny(*, ctx: Ctx, access_id: Any) -> Any:
    with transaction.atomic():
        access = _owned(ctx, access_id)
        if access.status != SupportAccessStatus.REQUESTED:
            raise BusinessRuleViolation(
                "precondition_failed", "This request is no longer waiting for an answer."
            )
        access.status = SupportAccessStatus.DENIED
        access.decided_by = ctx.actor
        access.decided_at = timezone.now()
        access.save(update_fields=["status", "decided_by", "decided_at", "updated_at"])
        write_audit(
            ctx=ctx,
            action="tenant.support_access_denied",
            entity_type="platform_support_access",
            entity_id=access.id,
        )
    return access


def revoke(*, ctx: Ctx, access_id: Any) -> Any:
    """The owner withdraws consent early. Any live support session ends at once."""
    from apps.platform_app.models import ImpersonationSession

    with transaction.atomic():
        access = _owned(ctx, access_id)
        if access.status != SupportAccessStatus.GRANTED:
            raise BusinessRuleViolation("precondition_failed", "This access is not active.")
        now = timezone.now()
        access.status = SupportAccessStatus.REVOKED
        access.decided_at = now
        access.save(update_fields=["status", "decided_at", "updated_at"])
        ended = ImpersonationSession.objects.filter(access=access, ended_at__isnull=True).update(
            ended_at=now, end_reason="consent_revoked", updated_at=now
        )
        write_audit(
            ctx=ctx,
            action="tenant.support_access_revoked",
            entity_type="platform_support_access",
            entity_id=access.id,
            metadata={"sessions_ended": ended},
        )
    return access


def live_session_of(access: Any) -> Any:
    from apps.platform_app.models import ImpersonationSession

    return (
        ImpersonationSession.objects.filter(
            access=access, ended_at__isnull=True, expires_at__gt=timezone.now()
        )
        .order_by("-created_at")
        .first()
    )


# ── The support session ─────────────────────────────────────────────────────


def start(
    *,
    admin: Any,
    admin_session_id: Any,
    tenant: Any,
    consent_id: Any,
    reason: str,
    meta: dict | None = None,
) -> tuple[Any, str]:
    """Mint a support token. 403 `impersonation_not_consented` without a live consent."""
    from apps.platform_app.models import ImpersonationSession, SupportAccess

    refused = BusinessRuleViolation(
        "impersonation_not_consented",
        "The owner has not allowed support access, or the permission has expired.",
    )
    if tenant.status not in (TenantStatus.ACTIVE, TenantStatus.PENDING_DELETION):
        raise refused
    with transaction.atomic():
        access = (
            SupportAccess.objects.select_for_update().filter(pk=consent_id, tenant=tenant).first()
            if consent_id
            else None
        )
        if access is None or refresh_status(access).status != SupportAccessStatus.GRANTED:
            raise refused
        now = timezone.now()
        expires_at = min(now + SESSION_TTL, access.expires_at)
        session = ImpersonationSession(
            access=access,
            tenant=tenant,
            admin=admin,
            session_id=admin_session_id,
            reason=reason,
            expires_at=expires_at,
            jti_hash="",
        )
        token, jti = tokens.mint_impersonation_access(
            user=admin,
            session_id=admin_session_id,
            tenant_id=tenant.id,
            impersonation_id=session.id,
            lifetime=expires_at - now,
        )
        session.jti_hash = tokens.hash_token(jti)
        session.save()
        write_audit(
            ctx=admin_ctx(admin=admin, tenant=tenant, meta=meta),
            action="admin.impersonation_started",
            entity_type="platform_impersonation_session",
            entity_id=session.id,
            metadata={
                "consent_id": str(access.id),
                "reason": reason,
                "expires_at": expires_at.isoformat(),
                "minutes_after_consent": int(
                    (now - (access.decided_at or now)).total_seconds() // 60
                ),
            },
        )
        _notify(tenant, "support_session_started", {"admin": admin.full_name})
    return session, token


def end(*, session: Any, reason: str = "ended", meta: dict | None = None) -> Any:
    from apps.platform_app.models import ImpersonationSession

    with transaction.atomic():
        now = timezone.now()
        changed = ImpersonationSession.objects.filter(pk=session.pk, ended_at__isnull=True).update(
            ended_at=now, end_reason=reason, updated_at=now
        )
        if changed:
            write_audit(
                ctx=admin_ctx(admin=session.admin, tenant=session.tenant, meta=meta),
                action="admin.impersonation_ended",
                entity_type="platform_impersonation_session",
                entity_id=session.id,
                metadata={"consent_id": str(session.access_id), "reason": reason},
            )
    return session


def resolve(*, user: Any, claims: dict) -> Any:
    """The tenancy hook: the live support session a token names, or None (fail closed)."""
    from apps.platform_app.models import ImpersonationSession

    imp = claims.get("imp")
    jti = claims.get("jti")
    if not imp or not jti:
        return None
    now = timezone.now()
    session = (
        ImpersonationSession.objects.select_related(
            "tenant", "tenant__plan", "tenant__partner", "access", "admin"
        )
        .filter(pk=imp, admin=user, ended_at__isnull=True, expires_at__gt=now)
        .first()
    )
    if session is None or session.jti_hash != tokens.hash_token(str(jti)):
        return None
    if session.access.status != SupportAccessStatus.GRANTED or session.access.expires_at <= now:
        return None
    if session.tenant.status not in (TenantStatus.ACTIVE, TenantStatus.PENDING_DELETION):
        return None
    return session


def synthetic_membership(*, session: Any) -> Any:
    """An UNSAVED owner membership, so the permission layer needs no special case.

    FR-5: the token carries `rol='owner'`. Deletion, ownership, bank details,
    consent decisions and the console itself are refused separately by
    `authentication._assert_impersonation_scope` — this object is never written.
    """
    from apps.platform_app.models import Membership, Role

    role = Role.objects.filter(tenant__isnull=True, code="owner").first()
    if role is None:
        raise PermissionDenied("The owner role is missing.")
    return Membership(
        user=session.admin,
        tenant=session.tenant,
        role=role,
        status="active",
        permissions_override={},
        permissions_version=0,
    )


def _notify(tenant: Any, code: str, params: dict) -> None:
    from apps.notifications.services.notify import notify

    notify(tenant, code, params=params)
